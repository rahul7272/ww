/**
 * In-Memory Sliding-Window Rate Limiter Middleware
 * Protects ingress endpoints against traffic spikes without external dependencies.
 */
export function createRateLimiter({
  windowMs = 60 * 1000, // 1 minute default window
  max = 100, // max requests per window
  message = "Too many requests. Please try again shortly.",
  keyGenerator = (req) => req.ip || req.headers["x-forwarded-for"] || "global",
} = {}) {
  const hits = new Map();

  // Periodic cleanup of expired window buckets every 2 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(key);
      }
    }
  }, 2 * 60 * 1000);
  if (typeof cleanupInterval.unref === "function") cleanupInterval.unref();

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();

    let record = hits.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      hits.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", resetSeconds);

    if (record.count > max) {
      res.setHeader("Retry-After", resetSeconds);
      return res.status(429).json({
        success: false,
        code: "RATE_LIMIT_EXCEEDED",
        error: message,
        retryAfter: resetSeconds,
      });
    }

    next();
  };
}
