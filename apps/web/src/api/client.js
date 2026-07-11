let unauthorizedHandler = null;
let sessionCheck = null;

export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

export async function authenticatedFetch(path, options = {}) {
  const { skipUnauthorizedHandler = false, ...fetchOptions } = options;
  const response = await fetch(path, {
    credentials: "include",
    ...fetchOptions
  });
  if (response.status === 401 && !skipUnauthorizedHandler) {
    const error = new Error("authentication required");
    error.status = 401;
    unauthorizedHandler?.(error);
  }
  return response;
}

export function checkSession() {
  if (!sessionCheck) {
    sessionCheck = request("/api/auth/me").finally(() => {
      sessionCheck = null;
    });
  }
  return sessionCheck;
}

async function request(path, options = {}) {
  const headers = options.raw ? options.headers || {} : { "content-type": "application/json", ...(options.headers || {}) };
  const response = await authenticatedFetch(path, {
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
    throw error;
  }
  return data;
}

export const api = {
  app: () => request("/api/app"),
  me: checkSession,
  login: (payload) => request("/api/auth/login", { method: "POST", body: JSON.stringify(payload), skipUnauthorizedHandler: true }),
  logout: () => request("/api/auth/logout", { method: "POST", body: "{}" }),
  files: (params) => request(`/api/files?${new URLSearchParams(params)}`),
  createFolder: (payload) => request("/api/folders", { method: "POST", body: JSON.stringify(payload) }),
  deleteFiles: (payload) => request("/api/files/delete", { method: "POST", body: JSON.stringify(payload) }),
  renameFile: (payload) => request("/api/files/rename", { method: "POST", body: JSON.stringify(payload) }),
  moveFile: (payload) => request("/api/files/move", { method: "POST", body: JSON.stringify(payload) }),
  createShare: (payload) => request("/api/share", { method: "POST", body: JSON.stringify(payload) }),
  initUpload: (payload) => request("/api/upload/init", { method: "POST", body: JSON.stringify(payload) }),
  uploadChunk: (uploadId, index, blob, options = {}) => request(`/api/upload/chunk?${new URLSearchParams({ uploadId, index })}`, {
    method: "PUT",
    body: blob,
    raw: true,
    headers: { "content-type": "application/octet-stream" },
    signal: options.signal
  }),
  completeUpload: (payload) => request("/api/upload/complete", { method: "POST", body: JSON.stringify(payload) }),
  cancelUpload: (payload) => request("/api/upload/cancel", { method: "POST", body: JSON.stringify(payload) })
};
