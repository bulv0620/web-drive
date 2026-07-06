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
