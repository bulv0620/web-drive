import crypto from "node:crypto";
import { normalizeDrivePath } from "./path-utils.js";

const shares = new Map();

export function createShare(config, session, payload) {
  const filePath = normalizeDrivePath(payload.path || "/");
  const ttlSeconds = Number(payload.ttlSeconds || config.shareTokenTtlSeconds);
  const expiresAt = Date.now() + Math.max(60, ttlSeconds) * 1000;
  const token = crypto.randomBytes(24).toString("hex");
  shares.set(token, {
    token,
    path: filePath,
    username: session.username,
    password: session.password,
    expiresAt
  });
  return { token, path: filePath, expiresAt: new Date(expiresAt).toISOString(), url: `/share/${token}` };
}

export function getShare(token) {
  const share = shares.get(token);
  if (!share) return null;
  if (Date.now() > share.expiresAt) {
    shares.delete(token);
    return null;
  }
  return share;
}
