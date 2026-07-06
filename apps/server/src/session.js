import crypto from "node:crypto";
import { parseCookies } from "@web-drive/shared/http-utils";

const sessions = new Map();

export function createSession(res, user) {
  const sid = crypto.randomBytes(24).toString("hex");
  sessions.set(sid, { ...user, createdAt: Date.now() });
  res.setHeader("set-cookie", `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/`);
  return sid;
}

export function currentSession(req) {
  const sid = parseCookies(req.headers.cookie).sid;
  if (!sid) return null;
  return sessions.get(sid) || null;
}

export function destroySession(req, res) {
  const sid = parseCookies(req.headers.cookie).sid;
  if (sid) sessions.delete(sid);
  res.setHeader("set-cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

export function requireSession(req, res) {
  const session = currentSession(req);
  if (session) return session;
  res.writeHead(401, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
  return null;
}
