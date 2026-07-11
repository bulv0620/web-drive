import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import SMB2 from "@marsaud/smb2";
import { basename, contentTypeFor, normalizeDrivePath, splitDrivePath } from "./path-utils.js";

function smbPath(config, drivePath = "/") {
  const root = splitDrivePath(config.smbRoot);
  const target = splitDrivePath(normalizeDrivePath(drivePath));
  return [...root, ...target].join("\\");
}

function closeClient(client) {
  client.disconnect?.();
}

function normalizeError(error, fallback = "SMB operation failed") {
  if (!error) return new Error(fallback);
  if (error.message) return error;
  return new Error(String(error || fallback));
}

function isNotFound(error) {
  return ["STATUS_OBJECT_NAME_NOT_FOUND", "STATUS_OBJECT_PATH_NOT_FOUND", "STATUS_NO_SUCH_FILE", "ENOENT"].includes(error?.code);
}

function isTransientDeleteError(error) {
  return ["STATUS_DELETE_PENDING", "STATUS_DIRECTORY_NOT_EMPTY"].includes(error?.code);
}

function toItem(name, stats, parentPath) {
  const isFolder = stats.isDirectory();
  return {
    name,
    path: normalizeDrivePath(`${parentPath}/${name}`),
    type: isFolder ? "folder" : "file",
    size: isFolder ? 0 : Number(stats.size || 0),
    modifiedAt: stats.mtime instanceof Date ? stats.mtime.toISOString() : "",
    mime: isFolder ? "" : contentTypeFor(name)
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function destroyStream(stream) {
  if (!stream || stream.destroyed) return Promise.resolve();
  return new Promise((resolve) => {
    stream.once("close", resolve);
    stream.destroy();
  });
}

async function pathExists(client, config, drivePath) {
  try {
    await client.stat(smbPath(config, drivePath));
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    return false;
  }
}

async function ensureDirectory(client, config, drivePath) {
  let current = "/";
  for (const part of splitDrivePath(drivePath)) {
    current = normalizeDrivePath(`${current}/${part}`);
    try {
      const stats = await client.stat(smbPath(config, current));
      if (!stats.isDirectory()) throw new Error(`${current} is not a folder`);
    } catch (error) {
      if (!isNotFound(error)) throw error;
      await client.mkdir(smbPath(config, current));
    }
  }
}

async function removeWithClient(client, config, drivePath) {
  const normalized = normalizeDrivePath(drivePath);
  if (normalized === "/") throw new Error("root path is not writable");

  let stats;
  try {
    stats = await client.stat(smbPath(config, normalized));
  } catch (error) {
    if (isNotFound(error) || error.code === "STATUS_DELETE_PENDING") return;
    throw error;
  }
  if (!stats.isDirectory()) {
    await client.unlink(smbPath(config, normalized)).catch((error) => {
      if (error.code !== "STATUS_DELETE_PENDING" && !isNotFound(error)) throw error;
    });
    return;
  }

  const entries = await client.readdir(smbPath(config, normalized), { stats: true }).catch((error) => {
    if (error.code === "STATUS_DELETE_PENDING" || isNotFound(error)) return [];
    throw error;
  });
  for (const entry of entries) {
    await removeWithClient(client, config, normalizeDrivePath(`${normalized}/${entry.name}`));
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await client.rmdir(smbPath(config, normalized));
      return;
    } catch (error) {
      if (!isTransientDeleteError(error) || attempt === 2) throw error;
      const remaining = await client.readdir(smbPath(config, normalized), { stats: true }).catch(() => []);
      for (const entry of remaining) {
        await removeWithClient(client, config, normalizeDrivePath(`${normalized}/${entry.name}`));
      }
      await delay(500);
    }
  }
}

async function copyPathWithClient(client, config, from, to) {
  const source = normalizeDrivePath(from);
  const target = normalizeDrivePath(to);
  if (source === "/" || target === "/") throw new Error("root path is not writable");
  if (target === source || target.startsWith(`${source}/`)) throw new Error("cannot copy a folder into itself");
  if (await pathExists(client, config, target)) throw new Error("target already exists");

  const stats = await client.stat(smbPath(config, source));
  if (!stats.isDirectory()) {
    const parent = target.split("/").slice(0, -1).join("/") || "/";
    const parentStats = await client.stat(smbPath(config, parent));
    if (!parentStats.isDirectory()) throw new Error("parent folder not found");
    await copyFileWithClient(client, config, source, target);
    return;
  }

  await client.mkdir(smbPath(config, target));
  const entries = await client.readdir(smbPath(config, source), { stats: true });
  for (const entry of entries) {
    await copyPathWithClient(client, config, normalizeDrivePath(`${source}/${entry.name}`), normalizeDrivePath(`${target}/${entry.name}`));
  }
}

async function copyFileWithClient(client, config, source, target) {
  let input = null;
  let output = null;
  try {
    output = await client.createWriteStream(smbPath(config, target));
    input = await client.createReadStream(smbPath(config, source));
    await pipeline(input, output);
  } catch (error) {
    await Promise.all([destroyStream(input), destroyStream(output)]);
    await client.unlink(smbPath(config, target)).catch(() => {});
    throw error;
  }
}

export async function pipeToSmbFile(client, targetPath, input) {
  let file = null;
  let transferError = null;
  try {
    file = await client.open(targetPath, "w");
    // @marsaud/smb2 closes path-based write streams in both _final and _destroy
    // on modern Node.js. Own the handle here so the NAS receives one close only.
    const output = await client.createWriteStream(targetPath, { fd: file, autoClose: false });
    await pipeline(input, output);
  } catch (error) {
    transferError = error;
  }

  if (file) {
    try {
      await client.close(file);
    } catch (error) {
      if (!transferError) transferError = error;
    }
  }

  if (transferError) throw transferError;
}

export function createClient(config, credentials) {
  if (!config.smbShare) {
    throw new Error("SMB_SHARE is required");
  }
  return new SMB2({
    share: config.smbShare,
    domain: config.smbDomain || "",
    username: credentials.username,
    password: credentials.password,
    autoCloseTimeout: 0
  });
}

export async function verifyLogin(config, credentials) {
  const client = createClient(config, credentials);
  try {
    await client.readdir(smbPath(config, "/"));
  } finally {
    closeClient(client);
  }
}

export async function listDirectory(config, credentials, drivePath = "/") {
  const client = createClient(config, credentials);
  try {
    const normalized = normalizeDrivePath(drivePath);
    const entries = await client.readdir(smbPath(config, normalized), { stats: true });
    return entries.map((entry) => toItem(entry.name, entry, normalized));
  } catch (error) {
    throw normalizeError(error);
  } finally {
    closeClient(client);
  }
}

export async function statPath(config, credentials, drivePath) {
  const client = createClient(config, credentials);
  try {
    const normalized = normalizeDrivePath(drivePath);
    if (normalized === "/") {
      return { name: "/", path: "/", type: "folder", size: 0, modifiedAt: "", mime: "" };
    }
    const stats = await client.stat(smbPath(config, normalized));
    return toItem(basename(normalized), stats, normalized.split("/").slice(0, -1).join("/") || "/");
  } catch (error) {
    if (isNotFound(error)) throw new Error("path not found");
    throw normalizeError(error);
  } finally {
    closeClient(client);
  }
}

export async function mkdir(config, credentials, drivePath) {
  const client = createClient(config, credentials);
  try {
    const normalized = normalizeDrivePath(drivePath);
    if (normalized === "/") throw new Error("folder name is required");
    const parent = normalized.split("/").slice(0, -1).join("/") || "/";
    const parentStats = await client.stat(smbPath(config, parent));
    if (!parentStats.isDirectory()) throw new Error("parent folder not found");
    if (await pathExists(client, config, normalized)) throw new Error("path already exists");
    await client.mkdir(smbPath(config, normalized));
  } finally {
    closeClient(client);
  }
}

export async function remove(config, credentials, drivePath) {
  let lastError = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const client = createClient(config, credentials);
    try {
      await removeWithClient(client, config, drivePath);
      if (!(await pathExists(client, config, drivePath))) return;
      lastError = new Error("delete is still pending");
    } catch (error) {
      if (!isTransientDeleteError(error)) throw error;
      lastError = error;
    } finally {
      closeClient(client);
    }
    await delay(500);
  }
  throw lastError || new Error("delete did not complete");
}

export async function rename(config, credentials, from, to) {
  const client = createClient(config, credentials);
  try {
    const source = normalizeDrivePath(from);
    const target = normalizeDrivePath(to);
    if (source === "/" || target === "/") throw new Error("root path is not writable");
    await client.stat(smbPath(config, source));
    if (await pathExists(client, config, target)) throw new Error("target already exists");
    await client.rename(smbPath(config, source), smbPath(config, target));
  } finally {
    closeClient(client);
  }
}

export async function copyPath(config, credentials, from, to) {
  const client = createClient(config, credentials);
  try {
    await copyPathWithClient(client, config, from, to);
  } finally {
    closeClient(client);
  }
}

export async function createFileReadStream(config, credentials, drivePath, options = {}) {
  const client = createClient(config, credentials);
  try {
    const stream = await client.createReadStream(smbPath(config, drivePath), options);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      closeClient(client);
    };
    stream.once("close", close);
    stream.once("end", close);
    stream.once("error", close);
    return stream;
  } catch (error) {
    closeClient(client);
    throw normalizeError(error);
  }
}

export async function writeLocalFile(config, credentials, localPath, drivePath) {
  const client = createClient(config, credentials);
  try {
    const parent = normalizeDrivePath(drivePath).split("/").slice(0, -1).join("/") || "/";
    await ensureDirectory(client, config, parent);
    await pipeToSmbFile(client, smbPath(config, drivePath), fs.createReadStream(localPath));
  } finally {
    closeClient(client);
  }
}
