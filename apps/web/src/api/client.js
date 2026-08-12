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

function uploadRequest(path, blob, options = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", abort);
      callback(value);
    };
    const abort = () => xhr.abort();

    xhr.open("PUT", path);
    xhr.withCredentials = true;
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.upload.onprogress = (event) => options.onProgress?.(event.loaded, event.total || blob.size);
    xhr.onload = () => {
      let data = {};
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        data = { error: xhr.responseText || "request failed" };
      }
      if (xhr.status === 401) {
        const error = new Error(data.error || "authentication required");
        error.status = 401;
        unauthorizedHandler?.(error);
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const error = new Error(data.error || "request failed");
        error.status = xhr.status;
        finish(reject, error);
        return;
      }
      finish(resolve, data);
    };
    xhr.onerror = () => finish(reject, new TypeError("network request failed"));
    xhr.onabort = () => finish(reject, new DOMException("The operation was aborted", "AbortError"));
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) {
      finish(reject, new DOMException("The operation was aborted", "AbortError"));
      return;
    }
    xhr.send(blob);
  });
}

export function isRetryableUploadError(error) {
  if (error?.name === "AbortError") return false;
  if (!Number.isFinite(error?.status)) return true;
  return [408, 425, 429].includes(error.status) || error.status >= 500;
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
  uploadChunk: (uploadId, index, blob, options = {}) => uploadRequest(`/api/upload/chunk?${new URLSearchParams({ uploadId, index })}`, blob, options),
  completeUpload: (payload) => request("/api/upload/complete", { method: "POST", body: JSON.stringify(payload) }),
  cancelUpload: (payload) => request("/api/upload/cancel", { method: "POST", body: JSON.stringify(payload) })
};
