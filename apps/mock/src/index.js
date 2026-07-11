import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";
import { json, notFound, parseCookies, readBody, readJson } from "@web-drive/shared/http-utils";

const processAuthTokenSecret = crypto.randomBytes(32).toString("hex");

const config = {
  host: process.env.MOCK_HOST || process.env.HOST || "0.0.0.0",
  port: Number(process.env.MOCK_PORT || process.env.PORT || 12601),
  baseUrl: "/",
  smbShare: "//mock.local/web-drive",
  smbDomain: "MOCK",
  smbRoot: "/",
  uploadChunkSize: Number(process.env.MOCK_UPLOAD_CHUNK_SIZE || 1024 * 1024),
  uploadTempDir: "memory://uploads",
  uploadMaxBodyBytes: Number(process.env.MOCK_UPLOAD_MAX_BODY_BYTES || 16 * 1024 * 1024),
  shareTokenTtlSeconds: Number(process.env.MOCK_SHARE_TOKEN_TTL_SECONDS || 24 * 60 * 60),
  authTokenTtlSeconds: Number(process.env.MOCK_AUTH_TOKEN_TTL_SECONDS || process.env.AUTH_TOKEN_TTL_SECONDS || 7 * 24 * 60 * 60),
  authTokenSecret: process.env.MOCK_AUTH_TOKEN_SECRET || process.env.AUTH_TOKEN_SECRET || processAuthTokenSecret
};

const sessions = new Map();
const shares = new Map();
const uploads = new Map();
const root = folder("", {
  Documents: folder("Documents", {
    "Project plan.md": file("Project plan.md", "# WebDrive mock\n\nThis file lives in the mock SMB drive.\n", "text/markdown; charset=utf-8"),
    "Budget.json": file("Budget.json", JSON.stringify({ storage: "mock", users: 3 }, null, 2), "application/json; charset=utf-8")
  }),
  Photos: folder("Photos", {
    "welcome.svg": file(
      "welcome.svg",
      `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="#f4f7fb"/><circle cx="720" cy="170" r="92" fill="#dbeafe"/><rect x="150" y="170" width="420" height="220" rx="28" fill="#ffffff" stroke="#93c5fd" stroke-width="6"/><path d="M210 245h300M210 300h220M210 355h270" stroke="#2563eb" stroke-width="24" stroke-linecap="round"/><text x="150" y="460" font-family="Arial, sans-serif" font-size="42" fill="#1e3a8a">Mock WebDrive</text></svg>`,
      "image/svg+xml"
    )
  }),
  "Readme.txt": file("Readme.txt", "Use any non-empty username and password to sign in.\n", "text/plain; charset=utf-8"),
  ...testFolders(200)
});

function folder(name, children = {}) {
  return { type: "folder", name, children: new Map(Object.entries(children)), modifiedAt: new Date().toISOString() };
}

function testFolders(count) {
  const entries = {};
  const now = Date.now();
  for (let index = 1; index <= count; index += 1) {
    const name = `Test Folder ${String(index).padStart(3, "0")}`;
    const node = folder(name);
    node.modifiedAt = new Date(now - index * 60 * 1000).toISOString();
    entries[name] = node;
  }
  return entries;
}

function file(name, content, mime = contentTypeFor(name)) {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(String(content));
  return { type: "file", name, body, mime, modifiedAt: new Date().toISOString() };
}

function sendError(res, error, statusCode = 400) {
  json(res, statusCode, { ok: false, error: error.message || String(error) });
}

function splitDrivePath(input = "/") {
  return String(input || "/")
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean);
}

function normalizeDrivePath(input = "/") {
  const segments = [];
  for (const segment of splitDrivePath(input)) {
    if (segment === "." || !segment) continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return `/${segments.join("/")}`;
}

function joinDrivePath(parent = "/", name = "") {
  return normalizeDrivePath(`${normalizeDrivePath(parent)}/${name}`);
}

function basename(input = "/") {
  return path.posix.basename(normalizeDrivePath(input)) || "download";
}

function contentTypeFor(filename) {
  const ext = path.posix.extname(filename).toLowerCase();
  return {
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav"
  }[ext] || "application/octet-stream";
}

function encodeContentDisposition(filename) {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "'");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
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

function sessionPayload(req) {
  const session = currentSession(req);
  return session ? { username: session.username } : null;
}

function toBase64UrlJson(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function fromBase64UrlJson(input) {
  return JSON.parse(Buffer.from(input, "base64url").toString("utf8"));
}

function sign(value) {
  return crypto.createHmac("sha256", config.authTokenSecret).update(value).digest("base64url");
}

function signaturesMatch(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function createAuthToken(sid, expiresAt) {
  const body = toBase64UrlJson({
    sid,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(expiresAt / 1000)
  });
  return `${body}.${sign(body)}`;
}

function verifyAuthToken(token) {
  if (!token) return null;
  const [body, signature, extra] = String(token).split(".");
  if (!body || !signature || extra !== undefined) return null;
  if (!signaturesMatch(signature, sign(body))) return null;

  try {
    const payload = fromBase64UrlJson(body);
    const expiresAt = Number(payload.exp) * 1000;
    if (!payload.sid || !Number.isFinite(expiresAt) || Date.now() >= expiresAt) return null;
    return { sid: String(payload.sid), expiresAt };
  } catch {
    return null;
  }
}

function pruneExpiredSessions(now = Date.now()) {
  for (const [sid, session] of sessions) {
    if (now >= session.expiresAt) sessions.delete(sid);
  }
}

function currentSession(req) {
  pruneExpiredSessions();
  const payload = verifyAuthToken(parseCookies(req.headers.cookie).sid);
  if (!payload) return null;
  return sessions.get(payload.sid) || null;
}

function createSession(res, user) {
  pruneExpiredSessions();
  const sid = crypto.randomBytes(24).toString("hex");
  const ttlSeconds = Math.max(60, Number.isFinite(config.authTokenTtlSeconds) ? config.authTokenTtlSeconds : 60);
  const createdAt = Date.now();
  const expiresAt = createdAt + ttlSeconds * 1000;
  const token = createAuthToken(sid, expiresAt);
  sessions.set(sid, { ...user, createdAt, expiresAt });
  res.setHeader(
    "set-cookie",
    `sid=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${ttlSeconds}; Expires=${new Date(expiresAt).toUTCString()}`
  );
  return { expiresAt };
}

function destroySession(req, res) {
  const payload = verifyAuthToken(parseCookies(req.headers.cookie).sid);
  if (payload) sessions.delete(payload.sid);
  res.setHeader("set-cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function requireSession(req, res) {
  const session = currentSession(req);
  if (session) return session;
  res.setHeader("set-cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  sendError(res, new Error("unauthorized"), 401);
  return null;
}

function itemPath(parentPath, name) {
  return normalizeDrivePath(`${parentPath}/${name}`);
}

function toItem(node, parentPath) {
  const isFolder = node.type === "folder";
  return {
    name: node.name,
    path: itemPath(parentPath, node.name),
    type: node.type,
    size: isFolder ? 0 : node.body.length,
    modifiedAt: node.modifiedAt,
    mime: isFolder ? "" : node.mime
  };
}

function getNode(drivePath = "/") {
  const parts = splitDrivePath(drivePath);
  let node = root;
  for (const part of parts) {
    if (node.type !== "folder") return null;
    node = node.children.get(part);
    if (!node) return null;
  }
  return node;
}

function getParent(drivePath) {
  const normalized = normalizeDrivePath(drivePath);
  if (normalized === "/") throw new Error("root path is not writable");
  const parts = splitDrivePath(normalized);
  const name = parts.pop();
  const parentPath = `/${parts.join("/")}`;
  const parent = getNode(parentPath);
  if (!parent || parent.type !== "folder") throw new Error("parent folder not found");
  return { parent, parentPath: normalizeDrivePath(parentPath), name };
}

function ensureFolder(drivePath) {
  let node = root;
  let currentPath = "/";
  for (const part of splitDrivePath(drivePath)) {
    let next = node.children.get(part);
    if (!next) {
      next = folder(part);
      node.children.set(part, next);
      node.modifiedAt = new Date().toISOString();
    }
    if (next.type !== "folder") throw new Error(`${currentPath}${part} is not a folder`);
    node = next;
    currentPath = joinDrivePath(currentPath, part);
  }
  return node;
}

function writeFile(drivePath, body, mime = contentTypeFor(drivePath)) {
  const { parent, name } = getParent(drivePath);
  parent.children.set(name, file(name, body, mime));
  parent.modifiedAt = new Date().toISOString();
}

async function login(req, res) {
  const body = await readJson(req, 1024 * 32);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) return sendError(res, new Error("Please enter a mock username and password"), 400);
  const session = createSession(res, { username, password });
  json(res, 200, { ok: true, user: { username }, auth: { expiresAt: new Date(session.expiresAt).toISOString() } });
}

async function listFiles(req, res, url) {
  const currentPath = normalizeDrivePath(url.searchParams.get("path") || "/");
  const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const sort = url.searchParams.get("sort") || "name";
  const order = url.searchParams.get("order") === "desc" ? -1 : 1;
  const node = getNode(currentPath);
  if (!node || node.type !== "folder") throw new Error("folder not found");
  let items = [...node.children.values()].map((child) => toItem(child, currentPath));
  if (query) items = items.filter((item) => item.name.toLowerCase().includes(query));
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    const av = sort === "size" ? a.size : sort === "modifiedAt" ? a.modifiedAt : a.name.toLowerCase();
    const bv = sort === "size" ? b.size : sort === "modifiedAt" ? b.modifiedAt : b.name.toLowerCase();
    return av > bv ? order : av < bv ? -order : 0;
  });
  json(res, 200, { ok: true, path: currentPath, items, config: publicConfig() });
}

async function createFolder(req, res) {
  const body = await readJson(req, 1024 * 32);
  const target = joinDrivePath(body.parent || "/", body.name || "");
  const { parent, name } = getParent(target);
  if (!name) throw new Error("folder name is required");
  if (parent.children.has(name)) throw new Error("path already exists");
  parent.children.set(name, folder(name));
  parent.modifiedAt = new Date().toISOString();
  json(res, 200, { ok: true, path: target });
}

async function deleteItems(req, res) {
  const body = await readJson(req, 1024 * 128);
  const paths = Array.isArray(body.paths) ? body.paths.map(normalizeDrivePath) : [normalizeDrivePath(body.path || "/")];
  for (const drivePath of paths) {
    const { parent, name } = getParent(drivePath);
    if (!parent.children.delete(name)) throw new Error("path not found");
    parent.modifiedAt = new Date().toISOString();
  }
  json(res, 200, { ok: true, deleted: paths.length });
}

async function renameItem(req, res) {
  const body = await readJson(req, 1024 * 32);
  const from = normalizeDrivePath(body.path || "/");
  const to = body.target ? normalizeDrivePath(body.target) : joinDrivePath(from.split("/").slice(0, -1).join("/") || "/", body.name || "");
  const { parent: fromParent, name: fromName } = getParent(from);
  const node = fromParent.children.get(fromName);
  if (!node) throw new Error("path not found");
  const { parent: toParent, name: toName } = getParent(to);
  if (toParent.children.has(toName)) throw new Error("target already exists");
  fromParent.children.delete(fromName);
  node.name = toName;
  node.modifiedAt = new Date().toISOString();
  toParent.children.set(toName, node);
  fromParent.modifiedAt = new Date().toISOString();
  toParent.modifiedAt = new Date().toISOString();
  json(res, 200, { ok: true, path: to });
}

async function initUpload(req, res, session) {
  const body = await readJson(req, 1024 * 64);
  const name = String(body.name || "").trim();
  const size = Number(body.size || 0);
  const chunkSize = Number(body.chunkSize || config.uploadChunkSize);
  if (!name || !Number.isFinite(size) || size < 0) throw new Error("invalid upload metadata");
  const directory = normalizeDrivePath(body.directory || "/");
  ensureFolder(directory);
  const uploadId = crypto.randomBytes(16).toString("hex");
  const task = {
    uploadId,
    username: session.username,
    directory,
    name,
    targetPath: joinDrivePath(directory, name),
    size,
    chunkSize,
    totalChunks: Math.max(1, Math.ceil(size / chunkSize)),
    chunks: new Map(),
    createdAt: new Date().toISOString()
  };
  uploads.set(uploadId, task);
  json(res, 200, { ok: true, task: { ...task, chunks: undefined, uploadedChunks: [] } });
}

async function uploadChunk(req, res, session, url) {
  const uploadId = url.searchParams.get("uploadId");
  const task = uploads.get(uploadId);
  if (!task) throw new Error("upload task not found");
  if (task.username !== session.username) throw new Error("upload task belongs to another user");
  const index = Number(url.searchParams.get("index"));
  if (!Number.isInteger(index) || index < 0 || index >= task.totalChunks) throw new Error("invalid chunk index");
  const body = await readBody(req, config.uploadMaxBodyBytes);
  task.chunks.set(index, body);
  json(res, 200, { ok: true, chunk: { uploadId, index, size: body.length } });
}

async function completeUpload(req, res, session) {
  const body = await readJson(req, 1024 * 32);
  const task = uploads.get(body.uploadId);
  if (!task) throw new Error("upload task not found");
  if (task.username !== session.username) throw new Error("upload task belongs to another user");
  if (task.chunks.size !== task.totalChunks) throw new Error("upload is missing chunks");
  const content = Buffer.concat([...Array(task.totalChunks)].map((_, index) => task.chunks.get(index)));
  if (content.length !== task.size) throw new Error("merged file size mismatch");
  ensureFolder(task.directory);
  writeFile(task.targetPath, content);
  uploads.delete(task.uploadId);
  json(res, 200, { ok: true, file: { path: task.targetPath, name: task.name, size: task.size } });
}

async function cancelUpload(req, res, session) {
  const body = await readJson(req, 1024 * 32);
  const task = uploads.get(body.uploadId);
  if (task && task.username !== session.username) throw new Error("upload task belongs to another user");
  uploads.delete(body.uploadId);
  json(res, 200, { ok: true });
}

async function shareFile(req, res, session) {
  const body = await readJson(req, 1024 * 32);
  const filePath = normalizeDrivePath(body.path || "/");
  if (!getNode(filePath)) throw new Error("path not found");
  const ttlSeconds = Number(body.ttlSeconds || config.shareTokenTtlSeconds);
  const expiresAt = Date.now() + Math.max(60, ttlSeconds) * 1000;
  const token = crypto.randomBytes(16).toString("hex");
  shares.set(token, { token, path: filePath, username: session.username, expiresAt });
  json(res, 200, { ok: true, share: { token, path: filePath, expiresAt: new Date(expiresAt).toISOString(), url: `/share/${token}` } });
}

function getShare(token) {
  const share = shares.get(token);
  if (!share) return null;
  if (Date.now() > share.expiresAt) {
    shares.delete(token);
    return null;
  }
  return share;
}

function sendDownload(req, res, drivePath, inline = false) {
  const node = getNode(drivePath);
  if (!node || node.type !== "file") return sendError(res, new Error("file not found"), 404);
  const filename = basename(drivePath);
  const range = req.headers.range || "";
  let status = 200;
  let start = 0;
  let end = node.body.length - 1;
  const headers = {
    "accept-ranges": "bytes",
    "content-type": node.mime,
    "content-disposition": inline ? `inline; filename*=UTF-8''${encodeURIComponent(filename)}` : encodeContentDisposition(filename)
  };
  if (range.startsWith("bytes=")) {
    const [startRaw, endRaw] = range.slice(6).split("-");
    const requestedStart = Number(startRaw);
    const requestedEnd = endRaw ? Number(endRaw) : node.body.length - 1;
    if (Number.isFinite(requestedStart) && Number.isFinite(requestedEnd) && requestedStart <= requestedEnd) {
      status = 206;
      start = Math.max(0, requestedStart);
      end = Math.min(node.body.length - 1, requestedEnd);
      headers["content-range"] = `bytes ${start}-${end}/${node.body.length}`;
    }
  }
  const body = node.body.subarray(start, end + 1);
  headers["content-length"] = body.length;
  res.writeHead(status, headers);
  res.end(body);
}

async function route(req, res) {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/healthz") return json(res, 200, { ok: true, app: "web-drive-mock" });
  if (url.pathname === "/api/app") return json(res, 200, { ok: true, app: "web-drive-mock", user: sessionPayload(req), config: publicConfig() });
  if (url.pathname === "/api/auth/login" && req.method === "POST") return login(req, res);
  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    destroySession(req, res);
    return json(res, 200, { ok: true });
  }

  if (url.pathname.startsWith("/share/") && req.method === "GET") {
    const share = getShare(url.pathname.split("/").pop());
    if (!share) return sendError(res, new Error("share link does not exist or has expired"), 404);
    return sendDownload(req, res, share.path);
  }

  if (!url.pathname.startsWith("/api/")) return notFound(res);

  const session = requireSession(req, res);
  if (!session) return;

  if (url.pathname === "/api/auth/me") return json(res, 200, { ok: true, user: { username: session.username }, config: publicConfig() });
  if (url.pathname === "/api/files" && req.method === "GET") return listFiles(req, res, url);
  if (url.pathname === "/api/folders" && req.method === "POST") return createFolder(req, res);
  if (url.pathname === "/api/files/delete" && req.method === "POST") return deleteItems(req, res);
  if (url.pathname === "/api/files/rename" && req.method === "POST") return renameItem(req, res);
  if (url.pathname === "/api/files/move" && req.method === "POST") return renameItem(req, res);
  if (url.pathname === "/api/files/download" && req.method === "GET") return sendDownload(req, res, normalizeDrivePath(url.searchParams.get("path") || "/"));
  if (url.pathname === "/api/files/preview" && req.method === "GET") return sendDownload(req, res, normalizeDrivePath(url.searchParams.get("path") || "/"), true);
  if (url.pathname === "/api/share" && req.method === "POST") return shareFile(req, res, session);
  if (url.pathname === "/api/upload/init" && req.method === "POST") return initUpload(req, res, session);
  if (url.pathname === "/api/upload/chunk" && req.method === "PUT") return uploadChunk(req, res, session, url);
  if (url.pathname === "/api/upload/complete" && req.method === "POST") return completeUpload(req, res, session);
  if (url.pathname === "/api/upload/cancel" && req.method === "POST") return cancelUpload(req, res, session);

  return notFound(res);
}

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => sendError(res, error, 500));
});

server.listen(config.port, config.host, () => {
  console.log(`WebDrive mock listening on http://${config.host}:${config.port}`);
  console.log("Use any non-empty username and password to log in.");
});
