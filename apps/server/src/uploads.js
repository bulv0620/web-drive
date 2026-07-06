import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readBody } from "@web-drive/shared/http-utils";
import { joinDrivePath, normalizeDrivePath } from "./path-utils.js";
import { writeLocalFile } from "./smb.js";

const tasks = new Map();

function taskDir(config, uploadId) {
  return path.join(config.uploadTempDir, uploadId);
}

async function existingChunks(config, uploadId) {
  try {
    const names = await fs.promises.readdir(taskDir(config, uploadId));
    return names.filter((name) => /^\d+\.part$/.test(name)).map((name) => Number.parseInt(name, 10));
  } catch {
    return [];
  }
}

export async function createUpload(config, session, payload) {
  const name = String(payload.name || "").trim();
  const totalSize = Number(payload.size || 0);
  const chunkSize = Number(payload.chunkSize || config.uploadChunkSize);
  if (!name || !Number.isFinite(totalSize) || totalSize < 0) throw new Error("invalid upload metadata");
  if (!Number.isFinite(chunkSize) || chunkSize <= 0 || chunkSize > config.uploadMaxBodyBytes) throw new Error("invalid chunk size");

  const directory = normalizeDrivePath(payload.directory || "/");
  const uploadId = crypto.createHash("sha256").update(`${session.username}:${directory}:${name}:${totalSize}:${chunkSize}`).digest("hex");
  const totalChunks = Math.max(1, Math.ceil(totalSize / chunkSize));
  const task = {
    uploadId,
    username: session.username,
    directory,
    name,
    targetPath: joinDrivePath(directory, name),
    size: totalSize,
    chunkSize,
    totalChunks,
    createdAt: new Date().toISOString()
  };
  tasks.set(uploadId, task);
  await fs.promises.mkdir(taskDir(config, uploadId), { recursive: true });
  const uploadedChunks = await existingChunks(config, uploadId);
  return { ...task, uploadedChunks };
}

export async function writeChunk(config, session, req, uploadId, index) {
  const task = tasks.get(uploadId);
  if (!task) throw new Error("upload task not found");
  if (task.username !== session.username) throw new Error("upload task belongs to another user");
  const chunkIndex = Number(index);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= task.totalChunks) throw new Error("invalid chunk index");
  const body = await readBody(req, config.uploadMaxBodyBytes);
  const filePath = path.join(taskDir(config, uploadId), `${chunkIndex}.part`);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, body);
  return { uploadId, index: chunkIndex, size: body.length };
}

export async function completeUpload(config, session, uploadId) {
  const task = tasks.get(uploadId);
  if (!task) throw new Error("upload task not found");
  if (task.username !== session.username) throw new Error("upload task belongs to another user");

  const dir = taskDir(config, uploadId);
  const uploadedChunks = await existingChunks(config, uploadId);
  if (uploadedChunks.length !== task.totalChunks) throw new Error("upload is missing chunks");

  const assembled = path.join(dir, "assembled.bin");
  const output = fs.createWriteStream(assembled);
  try {
    for (let index = 0; index < task.totalChunks; index += 1) {
      const chunkPath = path.join(dir, `${index}.part`);
      await new Promise((resolve, reject) => {
        const input = fs.createReadStream(chunkPath);
        input.on("error", reject);
        input.on("end", resolve);
        input.pipe(output, { end: false });
      });
    }
    await new Promise((resolve, reject) => {
      output.end((error) => (error ? reject(error) : resolve()));
    });
    const stat = await fs.promises.stat(assembled);
    if (stat.size !== task.size) throw new Error("merged file size mismatch");
    await writeLocalFile(config, session, assembled, task.targetPath);
    await fs.promises.rm(dir, { recursive: true, force: true });
    tasks.delete(uploadId);
    return { path: task.targetPath, name: task.name, size: task.size };
  } catch (error) {
    output.destroy();
    throw error;
  }
}

export async function cancelUpload(config, session, uploadId) {
  const task = tasks.get(uploadId);
  if (task && task.username !== session.username) throw new Error("upload task belongs to another user");
  tasks.delete(uploadId);
  await fs.promises.rm(taskDir(config, uploadId), { recursive: true, force: true });
}
