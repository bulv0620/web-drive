import path from "node:path";

export function splitDrivePath(input = "/") {
  return String(input || "/")
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean);
}

export function normalizeDrivePath(input = "/") {
  const segments = [];
  for (const segment of splitDrivePath(input)) {
    if (segment === "." || !segment) continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return `/${segments.join("/")}`;
}

export function joinDrivePath(parent = "/", name = "") {
  return normalizeDrivePath(`${normalizeDrivePath(parent)}/${name}`);
}

export function basename(input = "/") {
  return path.posix.basename(normalizeDrivePath(input)) || "download";
}

export function encodeContentDisposition(filename) {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "'");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function contentTypeFor(filename) {
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
