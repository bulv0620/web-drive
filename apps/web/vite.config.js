import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const apiTarget = process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:12601";
const webRoot = path.dirname(fileURLToPath(import.meta.url));
const pdfJsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.resolve("pdfjs-dist/build/pdf.mjs"))), "..");
const pdfJsAssetDirectories = ["cmaps", "standard_fonts", "wasm", "iccs"];
const pdfJsMimeTypes = {
  ".bcmap": "application/octet-stream",
  ".icc": "application/octet-stream",
  ".js": "text/javascript; charset=utf-8",
  ".pfb": "application/octet-stream",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm"
};

function pdfJsAssets() {
  return {
    name: "web-drive-pdfjs-assets",
    closeBundle() {
      for (const directory of pdfJsAssetDirectories) {
        fs.cpSync(path.join(pdfJsRoot, directory), path.join(webRoot, "dist", "pdfjs", directory), { recursive: true });
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url || "/", "http://localhost").pathname;
        if (!pathname.startsWith("/pdfjs/")) return next();

        let relativePath;
        try {
          relativePath = decodeURIComponent(pathname.slice("/pdfjs/".length));
        } catch {
          return next();
        }

        const filePath = path.resolve(pdfJsRoot, relativePath);
        if (!filePath.startsWith(`${pdfJsRoot}${path.sep}`)) return next();
        fs.stat(filePath, (error, stats) => {
          if (error || !stats.isFile()) return next();
          response.statusCode = 200;
          response.setHeader("content-type", pdfJsMimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream");
          response.setHeader("cache-control", "no-cache");
          fs.createReadStream(filePath).pipe(response);
        });
      });
    }
  };
}

export default defineConfig({
  plugins: [vue(), pdfJsAssets()],
  server: {
    proxy: {
      "/api": apiTarget,
      "/share": apiTarget
    }
  }
});
