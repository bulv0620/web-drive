let unauthorizedHandler = null;

export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

async function request(path, options = {}) {
  const headers = options.raw ? options.headers || {} : { "content-type": "application/json", ...(options.headers || {}) };
  const response = await fetch(path, {
    credentials: "include",
    headers,
    ...options
  });

  if (options.download) return response;

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || "request failed" };
  }

  if (!response.ok) {
    const error = new Error(data.error || "request failed");
    error.status = response.status;
    if (response.status === 401 && !options.skipUnauthorizedHandler) unauthorizedHandler?.(error);
    throw error;
  }
  return data;
}

export const api = {
  app: () => request("/api/app"),
  me: () => request("/api/auth/me"),
  login: (payload) => request("/api/auth/login", { method: "POST", body: JSON.stringify(payload), skipUnauthorizedHandler: true }),
  logout: () => request("/api/auth/logout", { method: "POST", body: "{}" }),
  files: (params) => request(`/api/files?${new URLSearchParams(params)}`),
  createFolder: (payload) => request("/api/folders", { method: "POST", body: JSON.stringify(payload) }),
  deleteFiles: (payload) => request("/api/files/delete", { method: "POST", body: JSON.stringify(payload) }),
  renameFile: (payload) => request("/api/files/rename", { method: "POST", body: JSON.stringify(payload) }),
  moveFile: (payload) => request("/api/files/move", { method: "POST", body: JSON.stringify(payload) }),
  copyFile: (payload) => request("/api/files/copy", { method: "POST", body: JSON.stringify(payload) }),
  createShare: (payload) => request("/api/share", { method: "POST", body: JSON.stringify(payload) }),
  initUpload: (payload) => request("/api/upload/init", { method: "POST", body: JSON.stringify(payload) }),
  uploadChunk: (uploadId, index, blob) => request(`/api/upload/chunk?${new URLSearchParams({ uploadId, index })}`, {
    method: "PUT",
    body: blob,
    raw: true,
    headers: { "content-type": "application/octet-stream" }
  }),
  completeUpload: (payload) => request("/api/upload/complete", { method: "POST", body: JSON.stringify(payload) }),
  cancelUpload: (payload) => request("/api/upload/cancel", { method: "POST", body: JSON.stringify(payload) })
};
