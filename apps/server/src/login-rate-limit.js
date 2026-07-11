const attempts = new Map();
const maximumTrackedKeys = 10_000;

function clientAddress(req, config) {
  if (config.trustProxy) {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",", 1)[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket?.remoteAddress || "unknown";
}

function keysFor(req, username, config) {
  return [`ip:${clientAddress(req, config)}`, `user:${String(username).trim().toLowerCase()}`];
}

function prune(now = Date.now()) {
  for (const [key, entry] of attempts) {
    if (now >= Math.max(entry.windowStartedAt + entry.windowMs, entry.blockedUntil || 0)) attempts.delete(key);
  }
  while (attempts.size > maximumTrackedKeys) attempts.delete(attempts.keys().next().value);
}

export function loginLimitStatus(req, username, config, now = Date.now()) {
  prune(now);
  let retryAfterSeconds = 0;
  for (const key of keysFor(req, username, config)) {
    const entry = attempts.get(key);
    if (entry?.blockedUntil > now) retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil((entry.blockedUntil - now) / 1000));
  }
  return { allowed: retryAfterSeconds === 0, retryAfterSeconds };
}

export function recordLoginFailure(req, username, config, now = Date.now()) {
  const windowMs = config.loginRateLimitWindowSeconds * 1000;
  const blockMs = config.loginRateLimitBlockSeconds * 1000;
  for (const key of keysFor(req, username, config)) {
    let entry = attempts.get(key);
    if (!entry || now >= entry.windowStartedAt + windowMs) {
      entry = { count: 0, windowStartedAt: now, windowMs, blockedUntil: 0 };
    }
    entry.count += 1;
    if (entry.count >= config.loginRateLimitAttempts) entry.blockedUntil = now + blockMs;
    attempts.set(key, entry);
  }
  prune(now);
}

export function clearLoginFailures(req, username, config) {
  for (const key of keysFor(req, username, config)) attempts.delete(key);
}
