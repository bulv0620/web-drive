export function parseCookies(header = "") {
  const output = {};
  for (const item of header.split(";")) {
    const index = item.indexOf("=");
    if (index === -1) continue;
    output[item.slice(0, index).trim()] = decodeURIComponent(item.slice(index + 1).trim());
  }
  return output;
}

export function readBody(stream, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    stream.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error(`body is larger than ${maxBytes} bytes`));
        stream.destroy();
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export async function readJson(req, maxBytes) {
  const body = await readBody(req, maxBytes);
  if (!body.length) return {};
  return JSON.parse(body.toString());
}

export function applySecurityHeaders(req, res, options = {}) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  res.setHeader(
    "content-security-policy",
    "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:"
  );
  if (options.hsts) res.setHeader("strict-transport-security", "max-age=31536000");
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname.startsWith("/api/") || pathname.startsWith("/share/")) {
    res.setHeader("cache-control", "no-store");
    res.setHeader("pragma", "no-cache");
  }
}

export function isCrossOriginMutation(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method || "GET")) return false;
  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite === "cross-site") return true;
  // Sec-Fetch-Site describes the browser-visible request relationship and is
  // not rewritten when a reverse proxy changes Host to an internal upstream.
  if (fetchSite === "same-origin" || fetchSite === "none") return false;
  const origin = String(req.headers.origin || "").trim();
  if (!origin) return false;
  try {
    return new URL(origin).host !== String(req.headers.host || "");
  } catch {
    return true;
  }
}

export function json(res, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length
  });
  res.end(body);
}

export function notFound(res) {
  json(res, 404, { ok: false, error: "not found" });
}
