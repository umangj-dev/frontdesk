// Simple, real auth for the admin side. The customer-facing storefront (chat,
// booking, webhooks) stays public; everything else (dashboard + management APIs)
// requires your password. First login sets the password.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { randomUUID, createHash } from "crypto";
import { DATA_DIR } from "./paths.js";

const FILE = join(DATA_DIR, "_auth.json");

function read() { try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return {}; } }
function write(o) { if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true }); writeFileSync(FILE, JSON.stringify(o, null, 2)); }
function hash(pw, salt) { return createHash("sha256").update(salt + ":" + pw).digest("hex"); }

export function isConfigured() { return !!read().passwordHash; }

export function setPassword(pw) {
  const salt = randomUUID();
  const secret = randomUUID();
  write({ salt, passwordHash: hash(pw, salt), secret });
  return secret;
}

export function verify(pw) {
  const a = read();
  if (!a.passwordHash) return null;
  return hash(pw, a.salt) === a.passwordHash ? a.secret : null;
}

export function checkSecret(secret) {
  const a = read();
  return !!a.secret && secret === a.secret;
}

// Which requests are public (no login). Everything else is gated.
export function isPublic(path) {
  const pages = ["/", "/index.html", "/book.html", "/sample-site.html", "/embed.js", "/login.html", "/favicon.ico"];
  if (pages.includes(path)) return true;
  if (path === "/api/login" || path === "/api/auth/state") return true;
  if (path.startsWith("/api/ticket/")) return true;
  // customer-facing tenant endpoints
  if (/^\/api\/[^/]+\/(config|chat|slots|book|sms|instagram|missed-call)$/.test(path)) return true;
  return false;
}

export function getCookie(req, name) {
  const c = req.headers.cookie || "";
  const m = c.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
