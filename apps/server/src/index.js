import http from "node:http";
import fs from "node:fs";
import { loadEnvFile } from "@web-drive/shared/env-file";
import { json, notFound, readJson } from "@web-drive/shared/http-utils";
import { serveStaticWeb } from "@web-drive/shared/static-web";
import { loadConfig } from "./config.js";
import { currentSession, createSession, destroySession, requireSession } from "./session.js";
import { basename, contentTypeFor, encodeContentDisposition, joinDrivePath, normalizeDrivePath } from "./path-utils.js";
import { completeUpload, cancelUpload, createUpload, writeChunk } from "./uploads.js";
import { copyFile, listDirectory, mkdir, remove, rename, statPath, streamFile, verifyLogin } from "./smb.js";
import { createShare, getShare } from "./shares.js";

loadEnvFile(".env");
loadEnvFile(".env.server");

const config = loadConfig();
await fs.promises.mkdir(config.uploadTempDir, { recursive: true });

function sendError(res, error, statusCode = 400) {
  json(res, statusCode, { ok: false, error: error.message || String(error) });
}

function sessionPayload(req) {
  const session = currentSession(req);
  return session ? { username: session.username } : null;
}

function publicConfig() {
  return {
    baseUrl: config.baseUrl,
    smbShare: config.smbShare,
    smbRoot: config.smbRoot,
    smbDomain: config.smbDomain,
    uploadChunkSize: config.uploadChunkSize,
    uploadTempDir: config.uploadTempDir
  };
}

async function login(req, res) {
  try {
    const body = await readJson(req, 1024 * 32);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!username || !password) return sendError(res, new Error("请输入 SMB 用户名和密码"), 400);
    await verifyLogin(config, { username, password });
    createSession(res, { username, password });
    json(res, 200, { ok: true, user: { username } });
  } catch {
    sendError(res, new Error("SMB 登录失败，请检查账号、密码或共享配置"), 401);
  }
}

function logout(req, res) {
  destroySession(req, res);
  json(res, 200, { ok: true });
}

async function listFiles(req, res, session, url) {
  try {
    const currentPath = normalizeDrivePath(url.searchParams.get("path") || "/");
    const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
    const sort = url.searchParams.get("sort") || "name";
    const order = url.searchParams.get("order") === "desc" ? -1 : 1;
    let items = await listDirectory(config, session, currentPath);
    if (query) items = items.filter((item) => item.name.toLowerCase().includes(query));
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      const av = sort === "size" ? a.size : sort === "modifiedAt" ? a.modifiedAt : a.name.toLowerCase();
      const bv = sort === "size" ? b.size : sort === "modifiedAt" ? b.modifiedAt : b.name.toLowerCase();
      return av > bv ? order : av < bv ? -order : 0;
    });
    json(res, 200, { ok: true, path: currentPath, items, config: publicConfig() });
  } catch (error) {
    sendError(res, error);
  }
}

async function createFolder(req, res, session) {
  try {
    const body = await readJson(req, 1024 * 32);
    const target = joinDrivePath(body.parent || "/", body.name || "");
    await mkdir(config, session, target);
    json(res, 200, { ok: true, path: target });
  } catch (error) {
    sendError(res, error);
  }
}

async function deleteItems(req, res, session) {
  try {
    const body = await readJson(req, 1024 * 128);
    const paths = Array.isArray(body.paths) ? body.paths.map(normalizeDrivePath) : [normalizeDrivePath(body.path || "/")];
    for (const itemPath of paths) await remove(config, session, itemPath);
    json(res, 200, { ok: true, deleted: paths.length });
  } catch (error) {
    sendError(res, error);
  }
}

async function renameItem(req, res, session) {
  try {
    const body = await readJson(req, 1024 * 32);
    const from = normalizeDrivePath(body.path || "/");
    const to = body.target ? normalizeDrivePath(body.target) : joinDrivePath(from.split("/").slice(0, -1).join("/") || "/", body.name || "");
    await rename(config, session, from, to);
    json(res, 200, { ok: true, path: to });
  } catch (error) {
    sendError(res, error);
  }
}

async function copyItem(req, res, session) {
  try {
    const body = await readJson(req, 1024 * 32);
    await copyFile(config, session, normalizeDrivePath(body.path || "/"), normalizeDrivePath(body.target || "/"));
    json(res, 200, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}

async function moveItem(req, res, session) {
  try {
    const body = await readJson(req, 1024 * 32);
    await rename(config, session, normalizeDrivePath(body.path || "/"), normalizeDrivePath(body.target || "/"));
    json(res, 200, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}

async function initUpload(req, res, session) {
  try {
    const task = await createUpload(config, session, await readJson(req, 1024 * 64));
    json(res, 200, { ok: true, task });
  } catch (error) {
    sendError(res, error);
  }
}

async function uploadChunk(req, res, session, url) {
  try {
    const result = await writeChunk(config, session, req, url.searchParams.get("uploadId"), url.searchParams.get("index"));
    json(res, 200, { ok: true, chunk: result });
  } catch (error) {
    sendError(res, error);
  }
}

async function finishUpload(req, res, session) {
  try {
    const body = await readJson(req, 1024 * 32);
    const file = await completeUpload(config, session, body.uploadId);
    json(res, 200, { ok: true, file });
  } catch (error) {
    sendError(res, error);
  }
}

async function abortUpload(req, res, session) {
  try {
    const body = await readJson(req, 1024 * 32);
    await cancelUpload(config, session, body.uploadId);
    json(res, 200, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}

async function shareFile(req, res, session) {
  try {
    const share = createShare(config, session, await readJson(req, 1024 * 32));
    json(res, 200, { ok: true, share });
  } catch (error) {
    sendError(res, error);
  }
}

async function sendDownload(req, res, credentials, filePath, inline = false) {
  try {
    const info = await statPath(config, credentials, filePath);
    const filename = basename(filePath);
    const range = req.headers.range || "";
    const headers = {
      "accept-ranges": "bytes",
      "content-type": contentTypeFor(filename),
      "content-disposition": inline ? `inline; filename*=UTF-8''${encodeURIComponent(filename)}` : encodeContentDisposition(filename)
    };
    let options = {};
    let status = 200;
    let size = info.size;
    if (range.startsWith("bytes=")) {
      const [startRaw, endRaw] = range.slice(6).split("-");
      const start = Number(startRaw);
      const end = endRaw ? Number(endRaw) : info.size - 1;
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end) {
        options = { start, end };
        status = 206;
        size = end - start + 1;
        headers["content-range"] = `bytes ${start}-${end}/${info.size}`;
      }
    }
    headers["content-length"] = size;
    res.writeHead(status, headers);
    streamFile(config, credentials, filePath, options).pipe(res);
  } catch (error) {
    sendError(res, error, 404);
  }
}

async function route(req, res) {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/healthz") return json(res, 200, { ok: true, app: "web-drive" });
  if (url.pathname === "/api/app") return json(res, 200, { ok: true, app: "web-drive", user: sessionPayload(req), config: publicConfig() });
  if (url.pathname === "/api/auth/login" && req.method === "POST") return login(req, res);
  if (url.pathname === "/api/auth/logout" && req.method === "POST") return logout(req, res);

  if (url.pathname.startsWith("/share/") && req.method === "GET") {
    const share = getShare(url.pathname.split("/").pop());
    if (!share) return sendError(res, new Error("分享链接不存在或已过期"), 404);
    return sendDownload(req, res, share, share.path);
  }

  if (!url.pathname.startsWith("/api/")) {
    if (serveStaticWeb(req, res)) return;
    return notFound(res);
  }

  const session = requireSession(req, res);
  if (!session) return;

  if (url.pathname === "/api/auth/me") return json(res, 200, { ok: true, user: { username: session.username }, config: publicConfig() });
  if (url.pathname === "/api/files" && req.method === "GET") return listFiles(req, res, session, url);
  if (url.pathname === "/api/folders" && req.method === "POST") return createFolder(req, res, session);
  if (url.pathname === "/api/files/delete" && req.method === "POST") return deleteItems(req, res, session);
  if (url.pathname === "/api/files/rename" && req.method === "POST") return renameItem(req, res, session);
  if (url.pathname === "/api/files/move" && req.method === "POST") return moveItem(req, res, session);
  if (url.pathname === "/api/files/copy" && req.method === "POST") return copyItem(req, res, session);
  if (url.pathname === "/api/files/download" && req.method === "GET") return sendDownload(req, res, session, normalizeDrivePath(url.searchParams.get("path") || "/"));
  if (url.pathname === "/api/files/preview" && req.method === "GET") return sendDownload(req, res, session, normalizeDrivePath(url.searchParams.get("path") || "/"), true);
  if (url.pathname === "/api/share" && req.method === "POST") return shareFile(req, res, session);
  if (url.pathname === "/api/upload/init" && req.method === "POST") return initUpload(req, res, session);
  if (url.pathname === "/api/upload/chunk" && req.method === "PUT") return uploadChunk(req, res, session, url);
  if (url.pathname === "/api/upload/complete" && req.method === "POST") return finishUpload(req, res, session);
  if (url.pathname === "/api/upload/cancel" && req.method === "POST") return abortUpload(req, res, session);

  return notFound(res);
}

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => sendError(res, error, 500));
});

server.listen(config.port, config.host, () => {
  console.log(`WebDrive listening on http://${config.host}:${config.port}`);
  console.log(`SMB share: ${config.smbShare || "(not configured)"}, root: ${config.smbRoot}`);
  console.log(`Upload temp dir: ${config.uploadTempDir}`);
});
