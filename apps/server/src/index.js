import http from "node:http";
import { pipeline } from "node:stream/promises";
import { loadEnvFile } from "@web-drive/shared/env-file";
import { applySecurityHeaders, isCrossOriginMutation, json, notFound, readJson } from "@web-drive/shared/http-utils";
import { serveStaticWeb } from "@web-drive/shared/static-web";
import { loadConfig } from "./config.js";
import { currentSession, createSession, destroySession, requireSession } from "./session.js";
import { basename, contentTypeFor, encodeContentDisposition, joinDrivePath, normalizeDrivePath, previewContentTypeFor } from "./path-utils.js";
import { completeUpload, cancelUpload, createUpload, prepareUploadTemp, writeChunk } from "./uploads.js";
import { createFileReadStream, listDirectory, mkdir, remove, rename, statPath, verifyLogin } from "./smb.js";
import { createShare, getShare } from "./shares.js";
import { clearLoginFailures, loginLimitStatus, recordLoginFailure } from "./login-rate-limit.js";

loadEnvFile(".env");
loadEnvFile(".env.server");

const config = loadConfig();
await prepareUploadTemp(config);

function sendError(res, error, statusCode = 400) {
  json(res, statusCode, { ok: false, error: error.message || String(error) });
}

function sessionPayload(req) {
  const session = currentSession(req, config);
  return session ? { username: session.username } : null;
}

function publicConfig() {
  return {
    baseUrl: config.baseUrl,
    uploadChunkSize: config.uploadChunkSize,
    uploadMaxFileBytes: config.uploadMaxFileBytes
  };
}

async function login(req, res) {
  let username = "";
  try {
    const body = await readJson(req, 1024 * 32);
    username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!username || !password) return sendError(res, new Error("请输入 SMB 用户名和密码"), 400);
    const limit = loginLimitStatus(req, username, config);
    if (!limit.allowed) {
      res.setHeader("retry-after", limit.retryAfterSeconds);
      return sendError(res, new Error("登录尝试过于频繁，请稍后再试"), 429);
    }
    await verifyLogin(config, { username, password });
    clearLoginFailures(req, username, config);
    const session = createSession(res, { username, password }, config);
    json(res, 200, { ok: true, user: { username }, auth: { expiresAt: new Date(session.expiresAt).toISOString() } });
  } catch {
    if (username) recordLoginFailure(req, username, config);
    sendError(res, new Error("SMB 登录失败，请检查账号、密码或共享配置"), 401);
  }
}

function logout(req, res) {
  destroySession(req, res, config);
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
    const body = await readJson(req, 1024 * 32);
    const filePath = normalizeDrivePath(body.path || "/");
    const info = await statPath(config, session, filePath);
    if (info.type !== "file") throw new Error("only files can be shared");
    const share = createShare(config, session, { ...body, path: filePath });
    json(res, 200, { ok: true, share });
  } catch (error) {
    sendError(res, error);
  }
}

function parseRange(rangeHeader, size) {
  const range = String(rangeHeader || "").trim();
  if (!range) return null;
  if (!range.startsWith("bytes=") || range.includes(",")) return { unsatisfiable: true };
  if (size <= 0) return { unsatisfiable: true };

  const [startRaw, endRaw] = range.slice(6).split("-");
  if (startRaw === "" && endRaw === "") return { unsatisfiable: true };

  let start;
  let end;
  if (startRaw === "") {
    const suffix = Number(endRaw);
    if (!Number.isInteger(suffix) || suffix <= 0) return { unsatisfiable: true };
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === "" ? size - 1 : Number(endRaw);
    if (!Number.isInteger(start) || !Number.isInteger(end)) return { unsatisfiable: true };
  }

  if (start < 0 || end < start || start >= size) return { unsatisfiable: true };
  return { start, end: Math.min(end, size - 1) };
}

async function sendDownload(req, res, credentials, filePath, inline = false) {
  try {
    const info = await statPath(config, credentials, filePath);
    if (info.type !== "file") throw new Error("file not found");
    const filename = basename(filePath);
    const range = parseRange(req.headers.range, info.size);
    if (range?.unsatisfiable) {
      res.writeHead(416, {
        "accept-ranges": "bytes",
        "content-range": `bytes */${info.size}`,
        "content-length": 0
      });
      res.end();
      return;
    }

    const start = range ? range.start : 0;
    const end = range ? range.end : Math.max(info.size - 1, 0);
    const contentLength = info.size ? end - start + 1 : 0;
    const headers = {
      "accept-ranges": "bytes",
      "content-type": inline ? previewContentTypeFor(filename) : contentTypeFor(filename),
      "content-disposition": inline ? `inline; filename*=UTF-8''${encodeURIComponent(filename)}` : encodeContentDisposition(filename),
      "content-length": contentLength
    };
    if (range) {
      headers["content-range"] = `bytes ${start}-${end}/${info.size}`;
    }
    res.writeHead(range ? 206 : 200, headers);

    if (!contentLength) {
      res.end();
      return;
    }

    const stream = await createFileReadStream(config, credentials, filePath, { start, end });
    await pipeline(stream, res);
  } catch (error) {
    if (error?.code === "ERR_STREAM_PREMATURE_CLOSE") return;
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    sendError(res, error, 404);
  }
}

async function route(req, res) {
  const url = new URL(req.url, "http://localhost");

  if (isCrossOriginMutation(req)) return sendError(res, new Error("cross-origin request rejected"), 403);

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

  const session = requireSession(req, res, config);
  if (!session) return;

  if (url.pathname === "/api/auth/me") return json(res, 200, { ok: true, user: { username: session.username }, config: publicConfig() });
  if (url.pathname === "/api/files" && req.method === "GET") return listFiles(req, res, session, url);
  if (url.pathname === "/api/folders" && req.method === "POST") return createFolder(req, res, session);
  if (url.pathname === "/api/files/delete" && req.method === "POST") return deleteItems(req, res, session);
  if (url.pathname === "/api/files/rename" && req.method === "POST") return renameItem(req, res, session);
  if (url.pathname === "/api/files/move" && req.method === "POST") return moveItem(req, res, session);
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
  applySecurityHeaders(req, res, { hsts: config.authCookieSecure });
  route(req, res).catch((error) => sendError(res, error, 500));
});

server.requestTimeout = config.httpRequestTimeoutMs;
server.headersTimeout = 30_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 100;
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`WebDrive is already running or port ${config.port} is occupied.`);
  } else {
    console.error("WebDrive failed to start:", error.message || error);
  }
  process.exitCode = 1;
});

server.listen(config.port, config.host, () => {
  console.log(`WebDrive listening on http://${config.host}:${config.port}`);
  console.log(`SMB backend configured: ${Boolean(config.smbShare)}`);
});
