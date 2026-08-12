import crypto from "node:crypto";
import path from "node:path";

const processAuthTokenSecret = crypto.randomBytes(32).toString("hex");

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function booleanEnv(name, fallback = false) {
  const value = String(process.env[name] || "").trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function normalizeShare(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.startsWith("//")) return `\\\\${value.slice(2).replaceAll("/", "\\")}`;
  return value.replaceAll("/", "\\");
}

export function loadConfig() {
  return {
    host: process.env.HOST || "127.0.0.1",
    port: numberEnv("PORT", 12600),
    baseUrl: process.env.BASE_URL || "/",
    smbShare: normalizeShare(process.env.SMB_SHARE || ""),
    smbDomain: process.env.SMB_DOMAIN || "",
    smbRoot: process.env.SMB_ROOT || "/",
    uploadTempDir: path.resolve(process.env.UPLOAD_TEMP_DIR || path.resolve("uploads-temp")),
    uploadChunkSize: numberEnv("UPLOAD_CHUNK_SIZE", 8 * 1024 * 1024),
    uploadMaxBodyBytes: numberEnv("UPLOAD_MAX_BODY_BYTES", 16 * 1024 * 1024),
    uploadMaxFileBytes: numberEnv("UPLOAD_MAX_FILE_BYTES", 100 * 1024 * 1024 * 1024),
    uploadMaxTempBytes: numberEnv("UPLOAD_MAX_TEMP_BYTES", 200 * 1024 * 1024 * 1024),
    uploadMaxTasksPerSession: numberEnv("UPLOAD_MAX_TASKS_PER_SESSION", 20),
    uploadTaskTtlSeconds: numberEnv("UPLOAD_TASK_TTL_SECONDS", 7 * 24 * 60 * 60),
    httpRequestTimeoutMs: numberEnv("HTTP_REQUEST_TIMEOUT_MS", 30 * 60 * 1000),
    shareTokenTtlSeconds: numberEnv("SHARE_TOKEN_TTL_SECONDS", 24 * 60 * 60),
    shareTokenMaxTtlSeconds: numberEnv("SHARE_TOKEN_MAX_TTL_SECONDS", 7 * 24 * 60 * 60),
    shareMaxActivePerUser: numberEnv("SHARE_MAX_ACTIVE_PER_USER", 100),
    authTokenTtlSeconds: numberEnv("AUTH_TOKEN_TTL_SECONDS", 7 * 24 * 60 * 60),
    authTokenSecret: process.env.AUTH_TOKEN_SECRET || processAuthTokenSecret,
    authCookieSecure: booleanEnv("AUTH_COOKIE_SECURE", process.env.NODE_ENV === "production"),
    trustProxy: booleanEnv("TRUST_PROXY", false),
    authMaxSessions: numberEnv("AUTH_MAX_SESSIONS", 1000),
    authMaxSessionsPerUser: numberEnv("AUTH_MAX_SESSIONS_PER_USER", 10),
    loginRateLimitAttempts: numberEnv("LOGIN_RATE_LIMIT_ATTEMPTS", 10),
    loginRateLimitWindowSeconds: numberEnv("LOGIN_RATE_LIMIT_WINDOW_SECONDS", 5 * 60),
    loginRateLimitBlockSeconds: numberEnv("LOGIN_RATE_LIMIT_BLOCK_SECONDS", 15 * 60)
  };
}
