import { markRaw } from "vue";
import {
  FileArchive,
  FileAudio,
  FileCode,
  FileText,
  FileImage,
  FileQuestion,
  FileSpreadsheet,
  FileType,
  FileVideo,
  Folder
} from "@lucide/vue";

const CODE_LANGUAGE_BY_EXTENSION = {
  astro: "astro",
  bat: "bat",
  blade: "blade",
  c: "c",
  cc: "cpp",
  cjs: "javascript",
  clj: "clojure",
  cljs: "clojure",
  cmake: "cmake",
  coffee: "coffeescript",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  cts: "typescript",
  dart: "dart",
  diff: "diff",
  dockerfile: "dockerfile",
  env: "dotenv",
  fs: "fsharp",
  fsx: "fsharp",
  glsl: "glsl",
  go: "go",
  gql: "graphql",
  graphql: "graphql",
  groovy: "groovy",
  h: "c",
  haml: "haml",
  handlebars: "handlebars",
  hbs: "handlebars",
  hpp: "cpp",
  htm: "html",
  html: "html",
  ini: "ini",
  java: "java",
  jl: "julia",
  js: "javascript",
  json: "json",
  json5: "json5",
  jsonc: "jsonc",
  jsonl: "jsonl",
  jsx: "jsx",
  kt: "kotlin",
  kts: "kotlin",
  less: "less",
  lua: "lua",
  m: "objective-c",
  makefile: "make",
  mjs: "javascript",
  mts: "typescript",
  nginx: "nginx",
  patch: "diff",
  php: "php",
  pl: "perl",
  pm: "perl",
  prisma: "prisma",
  properties: "properties",
  ps1: "powershell",
  pug: "pug",
  py: "python",
  r: "r",
  rb: "ruby",
  rs: "rust",
  sass: "sass",
  scala: "scala",
  scss: "scss",
  sh: "shellscript",
  sql: "sql",
  svelte: "svelte",
  swift: "swift",
  svg: "xml",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  vue: "vue",
  wasm: "wasm",
  wgsl: "wgsl",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zig: "zig",
  zsh: "shellscript"
};

const CODE_LANGUAGE_BY_FILENAME = {
  ".babelrc": "jsonc",
  ".editorconfig": "ini",
  ".env": "dotenv",
  ".eslintignore": "ignore",
  ".eslintrc": "jsonc",
  ".gitignore": "ignore",
  ".npmrc": "ini",
  ".prettierignore": "ignore",
  ".prettierrc": "jsonc",
  "cmakelists.txt": "cmake",
  "dockerfile": "dockerfile",
  "makefile": "make"
};

const TEXT_EXTENSIONS = new Set(["asc", "conf", "csv", "list", "log", "nfo", "rtf", "text", "tsv", "txt"]);

function fileNameParts(item = {}) {
  const name = String(item.name || item.fileName || "").toLowerCase();
  const extension = name.includes(".") ? name.split(".").pop() : "";
  return { name, extension };
}

export function codeLanguageFor(item = {}) {
  const { name, extension } = fileNameParts(item);
  const mime = String(item.mime || "").toLowerCase().split(";", 1)[0];
  if (CODE_LANGUAGE_BY_FILENAME[name]) return CODE_LANGUAGE_BY_FILENAME[name];
  if (CODE_LANGUAGE_BY_EXTENSION[extension]) return CODE_LANGUAGE_BY_EXTENSION[extension];
  if (mime === "application/json" || mime.endsWith("+json")) return "json";
  if (mime === "application/xml" || mime.endsWith("+xml")) return "xml";
  if (mime === "application/yaml" || mime === "text/yaml") return "yaml";
  if (mime === "text/css") return "css";
  if (["application/javascript", "text/javascript"].includes(mime)) return "javascript";
  return "";
}

export function isPlainTextFile(item = {}) {
  const { extension } = fileNameParts(item);
  const mime = String(item.mime || "").toLowerCase().split(";", 1)[0];
  return TEXT_EXTENSIONS.has(extension) || mime.startsWith("text/");
}

export function fileKind(item = {}) {
  if (item.type === "folder") return "folder";
  const name = String(item.name || item.fileName || "");
  const mime = String(item.mime || "").toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  if ((mime.startsWith("image/") && mime !== "image/svg+xml") || ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif"].includes(ext)) return "image";
  if (mime.startsWith("video/") || ["mp4", "webm", "mov", "mkv", "avi", "m4v"].includes(ext)) return "video";
  if (mime.startsWith("audio/") || ["mp3", "wav", "flac", "aac", "ogg", "m4a", "opus"].includes(ext)) return "audio";
  if (["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz"].includes(ext)) return "archive";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (["xls", "xlsx", "csv", "ods", "numbers"].includes(ext)) return "spreadsheet";
  if (name.toLowerCase().endsWith(".md") || mime.startsWith("text/markdown") || codeLanguageFor(item)) return "code";
  if (isPlainTextFile(item)) return "text";
  return "unknown";
}

export const fileIcons = {
  folder: markRaw(Folder),
  image: markRaw(FileImage),
  video: markRaw(FileVideo),
  audio: markRaw(FileAudio),
  archive: markRaw(FileArchive),
  pdf: markRaw(FileType),
  spreadsheet: markRaw(FileSpreadsheet),
  code: markRaw(FileCode),
  text: markRaw(FileText),
  unknown: markRaw(FileQuestion)
};

export function fileIconFor(item = {}) {
  return fileIcons[item.kind || fileKind(item)] || FileQuestion;
}
