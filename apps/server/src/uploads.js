import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { readBody } from "@web-drive/shared/http-utils";
import { joinDrivePath, normalizeDrivePath } from "./path-utils.js";
import { writeLocalFile } from "./smb.js";

const tasks = new Map();
const uploadIdPattern = /^[a-f0-9]{64}$/;
let tempMutationQueue = Promise.resolve();
const unsupportedChmodErrors = new Set(["EACCES", "EPERM", "ENOTSUP", "EROFS"]);

function withTempMutationLock(operation) {
  const result = tempMutationQueue.then(operation, operation);
  tempMutationQueue = result.catch(() => {});
  return result;
}

async function chmodIfSupported(target, mode) {
  try {
    await fs.promises.chmod(target, mode);
    return true;
  } catch (error) {
    if (unsupportedChmodErrors.has(error.code)) return false;
    throw error;
  }
}

async function verifyDirectoryWritable(directory) {
  const probe = path.join(directory, `.webdrive-write-test-${process.pid}-${crypto.randomBytes(8).toString("hex")}`);
  try {
    await fs.promises.writeFile(probe, "", { flag: "wx", mode: 0o600 });
  } catch (error) {
    throw new Error(`upload temporary directory is not writable: ${error.message || error}`);
  } finally {
    await fs.promises.rm(probe, { force: true }).catch(() => {});
  }
}

function validateUploadId(uploadId) {
  const value = String(uploadId || "");
  if (!uploadIdPattern.test(value)) throw new Error("invalid upload id");
  return value;
}

function sessionOwner(session) {
  return String(session.id || session.username || "");
}

function taskDir(config, uploadId) {
  const safeId = validateUploadId(uploadId);
  const root = path.resolve(config.uploadTempDir);
  const target = path.resolve(root, safeId);
  if (path.dirname(target) !== root) throw new Error("invalid upload path");
  return target;
}

function validateFileName(input) {
  const name = String(input || "").trim();
  if (!name || name === "." || name === ".." || /[\\/\0]/.test(name)) throw new Error("invalid file name");
  return name;
}

async function directorySize(directory) {
  let total = 0;
  let entries = [];
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directorySize(entryPath);
    else if (entry.isFile()) total += (await fs.promises.stat(entryPath)).size;
  }
  return total;
}

async function existingChunks(config, uploadId) {
  try {
    const names = await fs.promises.readdir(taskDir(config, uploadId));
    return names
      .filter((name) => /^\d+\.part$/.test(name))
      .map((name) => Number.parseInt(name, 10))
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

export async function assembleChunks(directory, totalChunks, assembledPath) {
  async function* chunks() {
    for (let index = 0; index < totalChunks; index += 1) {
      yield* fs.createReadStream(path.join(directory, `${index}.part`));
    }
  }

  await pipeline(chunks(), fs.createWriteStream(assembledPath, { mode: 0o600 }));
}

export async function createUpload(config, session, payload) {
  const name = validateFileName(payload.name);
  const totalSize = Number(payload.size || 0);
  const chunkSize = Number(payload.chunkSize || config.uploadChunkSize);
  if (!name || !Number.isFinite(totalSize) || totalSize < 0) throw new Error("invalid upload metadata");
  if (!Number.isSafeInteger(totalSize) || totalSize > config.uploadMaxFileBytes) throw new Error("file is larger than the upload limit");
  if (!Number.isFinite(chunkSize) || chunkSize <= 0 || chunkSize > config.uploadMaxBodyBytes) throw new Error("invalid chunk size");

  const directory = normalizeDrivePath(payload.directory || "/");
  const ownerId = sessionOwner(session);
  const uploadId = crypto.createHash("sha256").update(`${ownerId}:${directory}:${name}:${totalSize}:${chunkSize}`).digest("hex");
  if (tasks.get(uploadId)?.completing) throw new Error("upload is already being completed");
  const activeTasks = [...tasks.values()].filter((task) => task.ownerId === ownerId && task.uploadId !== uploadId);
  if (activeTasks.length >= config.uploadMaxTasksPerSession) throw new Error("too many active upload tasks");
  const totalChunks = Math.max(1, Math.ceil(totalSize / chunkSize));
  const task = {
    uploadId,
    ownerId,
    username: session.username,
    directory,
    name,
    targetPath: joinDrivePath(directory, name),
    size: totalSize,
    chunkSize,
    totalChunks,
    createdAt: new Date().toISOString()
  };
  await fs.promises.mkdir(taskDir(config, uploadId), { recursive: true, mode: 0o700 });
  await chmodIfSupported(taskDir(config, uploadId), 0o700);
  tasks.set(uploadId, task);
  const uploadedChunks = await existingChunks(config, uploadId);
  return {
    uploadId,
    directory,
    name,
    targetPath: task.targetPath,
    size: totalSize,
    chunkSize,
    totalChunks,
    createdAt: task.createdAt,
    uploadedChunks
  };
}

export async function writeChunk(config, session, req, uploadId, index) {
  const safeId = validateUploadId(uploadId);
  const task = tasks.get(safeId);
  if (!task) throw new Error("upload task not found");
  if (task.ownerId !== sessionOwner(session)) throw new Error("upload task belongs to another session");
  const chunkIndex = Number(index);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= task.totalChunks) throw new Error("invalid chunk index");
  const body = await readBody(req, config.uploadMaxBodyBytes);
  const expectedSize = task.size === 0 ? 0 : Math.min(task.chunkSize, task.size - chunkIndex * task.chunkSize);
  if (body.length !== expectedSize) throw new Error("chunk size does not match upload metadata");
  return withTempMutationLock(async () => {
    if (tasks.get(safeId) !== task || task.completing) throw new Error("upload task is no longer writable");
    const filePath = path.join(taskDir(config, safeId), `${chunkIndex}.part`);
    const existingSize = await fs.promises.stat(filePath).then((stat) => stat.size).catch((error) => {
      if (error.code === "ENOENT") return 0;
      throw error;
    });
    const tempBytes = await directorySize(config.uploadTempDir);
    if (tempBytes - existingSize + body.length > config.uploadMaxTempBytes) throw new Error("upload temporary storage quota exceeded");
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, body, { mode: 0o600 });
    await chmodIfSupported(filePath, 0o600);
    return { uploadId: safeId, index: chunkIndex, size: body.length };
  });
}

export async function completeUpload(config, session, uploadId) {
  const safeId = validateUploadId(uploadId);
  const task = tasks.get(safeId);
  if (!task) throw new Error("upload task not found");
  if (task.ownerId !== sessionOwner(session)) throw new Error("upload task belongs to another session");
  if (task.completing) throw new Error("upload is already being completed");
  const dir = taskDir(config, safeId);
  await withTempMutationLock(async () => {
    if (tasks.get(safeId) !== task) throw new Error("upload task not found");
    task.completing = true;
    const uploadedChunks = await existingChunks(config, safeId);
    if (uploadedChunks.length !== task.totalChunks || !uploadedChunks.every((value, index) => value === index)) {
      task.completing = false;
      throw new Error("upload is missing chunks");
    }
  });

  const assembled = path.join(dir, "assembled.bin");
  try {
    await assembleChunks(dir, task.totalChunks, assembled);
    const stat = await fs.promises.stat(assembled);
    if (stat.size !== task.size) throw new Error("merged file size mismatch");
    await writeLocalFile(config, session, assembled, task.targetPath);
    await fs.promises.rm(dir, { recursive: true, force: true });
    tasks.delete(safeId);
    return { path: task.targetPath, name: task.name, size: task.size };
  } catch (error) {
    task.completing = false;
    throw error;
  }
}

export async function cancelUpload(config, session, uploadId) {
  const safeId = validateUploadId(uploadId);
  const task = tasks.get(safeId);
  if (!task) throw new Error("upload task not found");
  if (task.ownerId !== sessionOwner(session)) throw new Error("upload task belongs to another session");
  if (task.completing) throw new Error("upload is being completed");
  await withTempMutationLock(async () => {
    if (tasks.get(safeId) !== task) throw new Error("upload task not found");
    tasks.delete(safeId);
    await fs.promises.rm(taskDir(config, safeId), { recursive: true, force: true });
  });
}

export async function prepareUploadTemp(config) {
  const root = path.resolve(config.uploadTempDir);
  await fs.promises.mkdir(root, { recursive: true, mode: 0o700 });
  await chmodIfSupported(root, 0o700);
  await verifyDirectoryWritable(root);
  const cutoff = Date.now() - config.uploadTaskTtlSeconds * 1000;
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !uploadIdPattern.test(entry.name)) continue;
    const directory = taskDir(config, entry.name);
    const stat = await fs.promises.stat(directory);
    if (stat.mtimeMs < cutoff) {
      await fs.promises.rm(directory, { recursive: true, force: true });
      continue;
    }
    await chmodIfSupported(directory, 0o700);
    for (const name of await fs.promises.readdir(directory)) {
      const filePath = path.join(directory, name);
      const fileStat = await fs.promises.lstat(filePath);
      if (fileStat.isFile()) await chmodIfSupported(filePath, 0o600);
    }
  }
}
