import path from "node:path";

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeShare(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.startsWith("//")) return `\\\\${value.slice(2).replaceAll("/", "\\")}`;
  return value.replaceAll("/", "\\");
}

export function loadConfig() {
  return {
    host: process.env.HOST || "0.0.0.0",
    port: numberEnv("PORT", 12600),
    baseUrl: process.env.BASE_URL || "/",
    smbShare: normalizeShare(process.env.SMB_SHARE || ""),
    smbDomain: process.env.SMB_DOMAIN || "",
    smbRoot: process.env.SMB_ROOT || "/",
    uploadTempDir: path.resolve(process.env.UPLOAD_TEMP_DIR || path.resolve("uploads-temp")),
    uploadChunkSize: numberEnv("UPLOAD_CHUNK_SIZE", 8 * 1024 * 1024),
    uploadMaxBodyBytes: numberEnv("UPLOAD_MAX_BODY_BYTES", 16 * 1024 * 1024),
    shareTokenTtlSeconds: numberEnv("SHARE_TOKEN_TTL_SECONDS", 24 * 60 * 60)
  };
}
