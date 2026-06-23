// Abuse / runaway-cost protection for the public chat.
// Per-IP limits: a short burst window + a daily cap. Stops bots from spamming
// the AI endpoint and running up your Anthropic bill.
const hits = new Map(); // ip -> array of request timestamps (ms)

function clientIp(req) {
  const fwd = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket?.remoteAddress || "unknown";
}

// Defaults: 15 requests / minute and 300 / day per IP.
export function rateLimit({ perMinute = 15, perDay = 300 } = {}) {
  return (req, res, next) => {
    const ip = clientIp(req);
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => now - t < 24 * 60 * 60 * 1000);
    const inMinute = arr.filter((t) => now - t < 60 * 1000).length;
    if (inMinute >= perMinute || arr.length >= perDay) {
      return res.status(429).json({ error: "Too many messages — please slow down." });
    }
    arr.push(now);
    hits.set(ip, arr);
    next();
  };
}

// Periodically drop stale IP buckets so memory stays bounded.
setInterval(() => {
  const now = Date.now();
  for (const [ip, arr] of hits) {
    const fresh = arr.filter((t) => now - t < 24 * 60 * 60 * 1000);
    if (fresh.length) hits.set(ip, fresh); else hits.delete(ip);
  }
}, 60 * 60 * 1000);
