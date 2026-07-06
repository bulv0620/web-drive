import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import SMB2 from "smb2";
import { basename, contentTypeFor, normalizeDrivePath, splitDrivePath } from "./path-utils.js";

const require = createRequire(import.meta.url);
const SMB2Request = require("smb2/lib/tools/smb2-forge").request;
const DIRECTORY_ATTRIBUTE = 0x00000010;

function call(client, method, ...args) {
  return new Promise((resolve, reject) => {
    client[method](...args, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

function smbPath(config, drivePath = "/") {
  const root = splitDrivePath(config.smbRoot);
  const target = splitDrivePath(normalizeDrivePath(drivePath));
  return [...root, ...target].join("\\");
}

function request(client, messageName, params) {
  return new Promise((resolve, reject) => {
    SMB2Request(messageName, params, client, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

function bufferToNumber(buffer) {
  if (!Buffer.isBuffer(buffer)) return Number(buffer || 0);
  if (typeof buffer.readBigUInt64LE === "function") return Number(buffer.readBigUInt64LE(0));
  return buffer.readUInt32LE(0) + buffer.readUInt32LE(4) * 2 ** 32;
}

function fileTimeToIso(buffer) {
  if (!Buffer.isBuffer(buffer)) return "";
  const value = BigInt(bufferToNumber(buffer));
  if (value <= 0n) return "";
  const unixMs = Number(value / 10000n - 11644473600000n);
  if (!Number.isFinite(unixMs) || unixMs <= 0) return "";
  return new Date(unixMs).toISOString();
}

function isDirectoryEntry(entry) {
  return Boolean(Number(entry?.FileAttributes || 0) & DIRECTORY_ATTRIBUTE);
}

function toItem(entry, parentPath) {
  const name = entry.Filename;
  const childPath = normalizeDrivePath(`${parentPath}/${name}`);
  const isDirectory = isDirectoryEntry(entry);
  return {
    name,
    path: childPath,
    type: isDirectory ? "folder" : "file",
    size: isDirectory ? 0 : bufferToNumber(entry.EndofFile),
    modifiedAt: fileTimeToIso(entry.LastWriteTime || entry.ChangeTime),
    mime: isDirectory ? "" : contentTypeFor(name)
  };
}

async function listDirectoryEntries(client, config, drivePath = "/") {
  const file = await request(client, "open_folder", { path: smbPath(config, drivePath) });
  const entries = [];
  try {
    while (true) {
      try {
        const batch = await request(client, "query_directory", file);
        entries.push(...(batch || []));
      } catch (error) {
        if (error.code === "STATUS_NO_MORE_FILES") break;
        throw error;
      }
    }
  } finally {
    await request(client, "close", file).catch(() => {});
  }
  return entries.filter((entry) => entry.Filename !== "." && entry.Filename !== "..");
}

export function createClient(config, credentials) {
  if (!config.smbShare) {
    throw new Error("SMB_SHARE is required");
  }
  return new SMB2({
    share: config.smbShare,
    domain: config.smbDomain,
    username: credentials.username,
    password: credentials.password,
    autoCloseTimeout: 0
  });
}

export async function verifyLogin(config, credentials) {
  const client = createClient(config, credentials);
  try {
    await call(client, "readdir", smbPath(config, "/"));
  } finally {
    client.close?.();
  }
}

export async function listDirectory(config, credentials, drivePath = "/") {
  const client = createClient(config, credentials);
  try {
    const normalized = normalizeDrivePath(drivePath);
    const entries = await listDirectoryEntries(client, config, normalized);
    return entries.map((entry) => toItem(entry, normalized));
  } finally {
    client.close?.();
  }
}

export async function statPath(config, credentials, drivePath) {
  const client = createClient(config, credentials);
  try {
    const normalized = normalizeDrivePath(drivePath);
    if (normalized === "/") {
      return { name: "/", path: "/", type: "folder", size: 0, modifiedAt: "", mime: "" };
    }
    const parent = normalized.split("/").slice(0, -1).join("/") || "/";
    const name = basename(normalized);
    const entries = await listDirectoryEntries(client, config, parent);
    const entry = entries.find((item) => item.Filename === name);
    if (!entry) throw new Error("path not found");
    return toItem(entry, parent);
  } finally {
    client.close?.();
  }
}

export async function mkdir(config, credentials, drivePath) {
  const client = createClient(config, credentials);
  try {
    await ensureDirectory(client, config, drivePath);
  } finally {
    client.close?.();
  }
}

export async function remove(config, credentials, drivePath) {
  const client = createClient(config, credentials);
  try {
    await removeWithClient(client, config, drivePath);
  } finally {
    client.close?.();
  }
}

export async function rename(config, credentials, from, to) {
  const client = createClient(config, credentials);
  try {
    await call(client, "rename", smbPath(config, from), smbPath(config, to));
  } finally {
    client.close?.();
  }
}

export async function copyFile(config, credentials, from, to) {
  const client = createClient(config, credentials);
  try {
    const buffer = await call(client, "readFile", smbPath(config, from));
    await call(client, "writeFile", smbPath(config, to), buffer);
  } finally {
    client.close?.();
  }
}

export function streamFile(config, credentials, drivePath, options = {}) {
  const client = createClient(config, credentials);
  const remote = smbPath(config, drivePath);
  const stream = client.createReadStream(remote, options);
  stream.on("close", () => client.close?.());
  stream.on("error", () => client.close?.());
  return stream;
}

export async function writeLocalFile(config, credentials, localPath, drivePath) {
  const client = createClient(config, credentials);
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
  try {
    const parent = normalizeDrivePath(drivePath).split("/").slice(0, -1).join("/") || "/";
    await ensureDirectory(client, config, parent);
    const read = fs.createReadStream(localPath);
    const write = client.createWriteStream(smbPath(config, drivePath));
    await new Promise((resolve, reject) => {
      read.on("error", done);
      write.on("error", done);
      write.on("finish", resolve);
      read.pipe(write);
      function done(error) {
        reject(error);
      }
    });
  } finally {
    client.close?.();
  }
}

async function ensureDirectory(client, config, drivePath) {
  const parts = splitDrivePath(drivePath);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : `/${part}`;
    const remote = smbPath(config, current);
    try {
      await call(client, "readdir", remote);
    } catch {
      try {
        await call(client, "mkdir", remote);
      } catch {
        await call(client, "readdir", remote);
      }
    }
  }
}

async function removeWithClient(client, config, drivePath) {
  const remote = smbPath(config, drivePath);
  let names;
  try {
    names = await call(client, "readdir", remote);
  } catch {
    await call(client, "unlink", remote);
    return;
  }
  for (const name of names.filter((item) => item !== "." && item !== "..")) {
    await removeWithClient(client, config, normalizeDrivePath(`${drivePath}/${name}`));
  }
  await call(client, "rmdir", remote);
}
