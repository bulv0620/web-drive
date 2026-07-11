import crypto from "node:crypto";
import { parseCookies } from "@web-drive/shared/http-utils";

const sessions = new Map();
const cookieName = "sid";
const minimumTokenTtlSeconds = 60;

function toBase64UrlJson(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function fromBase64UrlJson(input) {
  return JSON.parse(Buffer.from(input, "base64url").toString("utf8"));
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function signaturesMatch(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function createToken(sid, expiresAt, secret) {
  const body = toBase64UrlJson({
    sid,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(expiresAt / 1000)
  });
  return `${body}.${sign(body, secret)}`;
}

function verifyToken(token, secret) {
  if (!token) return null;
  const [body, signature, extra] = String(token).split(".");
  if (!body || !signature || extra !== undefined) return null;

  const expectedSignature = sign(body, secret);
  if (!signaturesMatch(signature, expectedSignature)) return null;

  try {
    const payload = fromBase64UrlJson(body);
    const expiresAt = Number(payload.exp) * 1000;
    if (!payload.sid || !Number.isFinite(expiresAt) || Date.now() >= expiresAt) return null;
    return { sid: String(payload.sid), expiresAt };
  } catch {
    return null;
  }
}

function readToken(req) {
  return parseCookies(req.headers.cookie)[cookieName];
}

function cookieSecurity(config) {
  return config.authCookieSecure ? "; Secure" : "";
}

function clearCookie(res, config) {
  res.setHeader("set-cookie", `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cookieSecurity(config)}`);
}

function pruneExpiredSessions(now = Date.now()) {
  for (const [sid, session] of sessions) {
    if (now >= session.expiresAt) sessions.delete(sid);
  }
}

export function createSession(res, user, config) {
  pruneExpiredSessions();
  const sid = crypto.randomBytes(24).toString("hex");
  const configuredTtlSeconds = Number(config.authTokenTtlSeconds);
  const ttlSeconds = Number.isFinite(configuredTtlSeconds) ? Math.max(minimumTokenTtlSeconds, configuredTtlSeconds) : minimumTokenTtlSeconds;
  const createdAt = Date.now();
  const expiresAt = createdAt + ttlSeconds * 1000;
  const token = createToken(sid, expiresAt, config.authTokenSecret);
  const sameUserSessions = [...sessions.entries()]
    .filter(([, session]) => session.username === user.username)
    .sort((a, b) => a[1].createdAt - b[1].createdAt);
  while (sameUserSessions.length >= config.authMaxSessionsPerUser) {
    sessions.delete(sameUserSessions.shift()[0]);
  }
  const allSessions = [...sessions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  while (allSessions.length >= config.authMaxSessions) {
    sessions.delete(allSessions.shift()[0]);
  }
  sessions.set(sid, { ...user, id: sid, createdAt, expiresAt });
  res.setHeader(
    "set-cookie",
    `${cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ttlSeconds}; Expires=${new Date(expiresAt).toUTCString()}${cookieSecurity(config)}`
  );
  return { token, expiresAt };
}

export function currentSession(req, config) {
  pruneExpiredSessions();
  const payload = verifyToken(readToken(req), config.authTokenSecret);
  if (!payload) return null;

  const session = sessions.get(payload.sid);
  if (!session) return null;
  if (Date.now() >= session.expiresAt) {
    sessions.delete(payload.sid);
    return null;
  }
  return session;
}

export function destroySession(req, res, config) {
  const payload = verifyToken(readToken(req), config.authTokenSecret);
  if (payload) sessions.delete(payload.sid);
  clearCookie(res, config);
}

export function requireSession(req, res, config) {
  const session = currentSession(req, config);
  if (session) return session;
  clearCookie(res, config);
  res.writeHead(401, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
  return null;
}
