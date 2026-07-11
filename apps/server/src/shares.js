import crypto from "node:crypto";
import { normalizeDrivePath } from "./path-utils.js";

const shares = new Map();

function pruneExpiredShares(now = Date.now()) {
  for (const [token, share] of shares) {
    if (now >= share.expiresAt) shares.delete(token);
  }
}

export function createShare(config, session, payload) {
  pruneExpiredShares();
  const filePath = normalizeDrivePath(payload.path || "/");
  const requestedTtl = payload.ttlSeconds === undefined ? config.shareTokenTtlSeconds : Number(payload.ttlSeconds);
  if (!Number.isSafeInteger(requestedTtl) || requestedTtl < 60 || requestedTtl > config.shareTokenMaxTtlSeconds) {
    throw new Error("invalid share expiration");
  }
  const activeShares = [...shares.values()].filter((share) => share.username === session.username).length;
  if (activeShares >= config.shareMaxActivePerUser) throw new Error("too many active share links");
  const expiresAt = Date.now() + requestedTtl * 1000;
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
  pruneExpiredShares();
  const share = shares.get(token);
  if (!share) return null;
  return share;
}
