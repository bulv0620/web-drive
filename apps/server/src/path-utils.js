import path from "node:path";

const safePreviewImageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".tif", ".tiff", ".heic", ".heif"]);

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
    ".log": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".tsv": "text/tab-separated-values; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".ts": "text/plain; charset=utf-8",
    ".tsx": "text/plain; charset=utf-8",
    ".jsx": "text/plain; charset=utf-8",
    ".vue": "text/plain; charset=utf-8",
    ".yaml": "text/yaml; charset=utf-8",
    ".yml": "text/yaml; charset=utf-8",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".m3u8": "application/vnd.apple.mpegurl",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".aac": "audio/aac",
    ".m4a": "audio/mp4",
    ".flac": "audio/flac",
    ".opus": "audio/opus",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".rtf": "application/rtf",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
    ".odp": "application/vnd.oasis.opendocument.presentation",
    ".epub": "application/epub+zip",
    ".zip": "application/zip",
    ".rar": "application/vnd.rar",
    ".7z": "application/x-7z-compressed",
    ".tar": "application/x-tar",
    ".gz": "application/gzip",
    ".tgz": "application/gzip",
    ".bz2": "application/x-bzip2",
    ".xz": "application/x-xz",
    ".eml": "message/rfc822",
    ".wasm": "application/wasm",
    ".geojson": "application/geo+json",
    ".kml": "application/vnd.google-earth.kml+xml",
    ".gltf": "model/gltf+json",
    ".glb": "model/gltf-binary",
    ".stl": "model/stl",
    ".obj": "model/obj"
  }[ext] || "application/octet-stream";
}

export function previewContentTypeFor(filename) {
  const type = contentTypeFor(filename);
  const extension = path.posix.extname(filename).toLowerCase();
  if (safePreviewImageExtensions.has(extension)) return type;
  if (type.startsWith("video/") || type.startsWith("audio/") || type === "application/pdf") return type;
  return "text/plain; charset=utf-8";
}
