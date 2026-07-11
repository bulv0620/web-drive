import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import test from "node:test";
import { applySecurityHeaders, isCrossOriginMutation } from "@web-drive/shared/http-utils";
import { serveStaticWeb } from "@web-drive/shared/static-web";
import { previewContentTypeFor } from "../src/path-utils.js";
import { createSession } from "../src/session.js";
import { createShare } from "../src/shares.js";
import { pipeToSmbFile } from "../src/smb.js";
import { assembleChunks, cancelUpload, createUpload, prepareUploadTemp } from "../src/uploads.js";

function uploadConfig(uploadTempDir) {
  return {
    uploadTempDir,
    uploadChunkSize: 8,
    uploadMaxBodyBytes: 16,
    uploadMaxFileBytes: 1024,
    uploadMaxTempBytes: 4096,
    uploadMaxTasksPerSession: 5,
    uploadTaskTtlSeconds: 3600
  };
}

test("upload cancellation rejects traversal and enforces session ownership", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "webdrive-security-"));
  const outside = path.join(root, "outside.txt");
  const uploadTempDir = path.join(root, "uploads");
  await fs.promises.writeFile(outside, "keep");
  const config = uploadConfig(uploadTempDir);

  try {
    await prepareUploadTemp(config);
    await assert.rejects(cancelUpload(config, { id: "session-a", username: "alice" }, "../../outside.txt"), /invalid upload id/);
    assert.equal(await fs.promises.readFile(outside, "utf8"), "keep");

    const task = await createUpload(config, { id: "session-a", username: "alice" }, { name: "safe.txt", size: 0, chunkSize: 8 });
    assert.match(task.uploadId, /^[a-f0-9]{64}$/);
    assert.equal("ownerId" in task, false);
    assert.equal((await fs.promises.stat(path.join(uploadTempDir, task.uploadId))).mode & 0o777, 0o700);
    await assert.rejects(cancelUpload(config, { id: "session-b", username: "alice" }, task.uploadId), /another session/);
    await cancelUpload(config, { id: "session-a", username: "alice" }, task.uploadId);
    await assert.rejects(fs.promises.stat(path.join(uploadTempDir, task.uploadId)), { code: "ENOENT" });
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test("writable NAS mounts can start when chmod is not permitted", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "webdrive-nas-mount-"));
  const originalChmod = fs.promises.chmod;
  fs.promises.chmod = async () => {
    const error = new Error("operation not permitted");
    error.code = "EPERM";
    throw error;
  };
  try {
    await prepareUploadTemp(uploadConfig(root));
    assert.deepEqual(await fs.promises.readdir(root), []);
  } finally {
    fs.promises.chmod = originalChmod;
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test("upload file names cannot smuggle drive paths", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "webdrive-name-"));
  try {
    const config = uploadConfig(root);
    await assert.rejects(createUpload(config, { id: "session-c", username: "alice" }, { name: "../escape.txt", size: 0 }), /invalid file name/);
    await assert.rejects(createUpload(config, { id: "session-c", username: "alice" }, { name: "folder\\escape.txt", size: 0 }), /invalid file name/);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test("chunk assembly preserves order and private permissions", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "webdrive-assemble-"));
  const assembled = path.join(root, "assembled.bin");
  try {
    await fs.promises.writeFile(path.join(root, "0.part"), "first-");
    await fs.promises.writeFile(path.join(root, "1.part"), "second");
    await assembleChunks(root, 2, assembled);
    assert.equal(await fs.promises.readFile(assembled, "utf8"), "first-second");
    assert.equal((await fs.promises.stat(assembled)).mode & 0o777, 0o600);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test("SMB upload closes the remote file handle exactly once", async () => {
  const calls = { close: 0, options: null, content: "" };
  const file = { FileId: Buffer.alloc(16) };
  const client = {
    async open(target, flags) {
      assert.equal(target, "folder\\upload.txt");
      assert.equal(flags, "w");
      return file;
    },
    async createWriteStream(target, options) {
      assert.equal(target, "folder\\upload.txt");
      calls.options = options;
      return new Writable({
        write(chunk, encoding, callback) {
          calls.content += chunk.toString();
          callback();
        }
      });
    },
    async close(openFile) {
      assert.equal(openFile, file);
      calls.close += 1;
      if (calls.close > 1) {
        const error = new Error("file object had already been closed");
        error.code = "STATUS_FILE_CLOSED";
        throw error;
      }
    }
  };

  await pipeToSmbFile(client, "folder\\upload.txt", fs.createReadStream(new URL("security.test.js", import.meta.url)));

  assert.equal(calls.options.fd, file);
  assert.equal(calls.options.autoClose, false);
  assert.match(calls.content, /SMB upload closes the remote file handle exactly once/);
  assert.equal(calls.close, 1);
});

test("active document formats are served as plain text in preview", () => {
  assert.equal(previewContentTypeFor("attack.html"), "text/plain; charset=utf-8");
  assert.equal(previewContentTypeFor("attack.svg"), "text/plain; charset=utf-8");
  assert.equal(previewContentTypeFor("photo.png"), "image/png");
  assert.equal(previewContentTypeFor("movie.mp4"), "video/mp4");
});

test("browser cross-origin mutations are rejected", () => {
  assert.equal(isCrossOriginMutation({ method: "POST", headers: { host: "drive.example", origin: "https://evil.example" } }), true);
  assert.equal(isCrossOriginMutation({ method: "POST", headers: { host: "drive.example", origin: "https://drive.example" } }), false);
  assert.equal(isCrossOriginMutation({ method: "POST", headers: { host: "drive.example", "sec-fetch-site": "cross-site" } }), true);
  assert.equal(isCrossOriginMutation({
    method: "POST",
    headers: {
      host: "127.0.0.1:12600",
      origin: "https://drive.example",
      "sec-fetch-site": "same-origin"
    }
  }), false);
  assert.equal(isCrossOriginMutation({ method: "GET", headers: { host: "drive.example", origin: "https://evil.example" } }), false);
});

test("security policy allows Shiki WebAssembly without enabling JavaScript eval", () => {
  const headers = new Map();
  const res = { setHeader: (name, value) => headers.set(name, value) };
  applySecurityHeaders({ url: "/", method: "GET", headers: {} }, res);
  const policy = headers.get("content-security-policy");
  assert.match(policy, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.doesNotMatch(policy, /(?:^|\s)'unsafe-eval'(?:\s|;|$)/);
});

test("static server containment rejects encoded sibling traversal", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "webdrive-static-"));
  const dist = path.join(root, "dist");
  const sibling = path.join(root, "dist-secret");
  await fs.promises.mkdir(dist);
  await fs.promises.mkdir(sibling);
  await fs.promises.writeFile(path.join(dist, "index.html"), "safe index");
  await fs.promises.writeFile(path.join(sibling, "secret.txt"), "must not leak");
  const server = http.createServer((req, res) => serveStaticWeb(req, res, dist));

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/..%2fdist-secret%2fsecret.txt`);
    assert.equal(await response.text(), "safe index");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test("secure session cookies use strict same-site policy", () => {
  const headers = new Map();
  const res = { setHeader: (name, value) => headers.set(name, value) };
  createSession(res, { username: "alice", password: "secret" }, {
    authTokenTtlSeconds: 600,
    authTokenSecret: "test-secret-that-is-long-enough",
    authCookieSecure: true,
    authMaxSessions: 100,
    authMaxSessionsPerUser: 5
  });
  assert.match(headers.get("set-cookie"), /HttpOnly/);
  assert.match(headers.get("set-cookie"), /SameSite=Strict/);
  assert.match(headers.get("set-cookie"), /Secure/);
});

test("share expiration and active share count are bounded", () => {
  const config = {
    shareTokenTtlSeconds: 3600,
    shareTokenMaxTtlSeconds: 7200,
    shareMaxActivePerUser: 1
  };
  const session = { username: `share-user-${Date.now()}`, password: "secret" };
  assert.throws(() => createShare(config, session, { path: "/file.txt", ttlSeconds: 7201 }), /invalid share expiration/);
  const share = createShare(config, session, { path: "/file.txt", ttlSeconds: 60 });
  assert.match(share.token, /^[a-f0-9]{48}$/);
  assert.throws(() => createShare(config, session, { path: "/other.txt", ttlSeconds: 60 }), /too many active share links/);
});
