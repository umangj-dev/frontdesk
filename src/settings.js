// Real, dashboard-driven settings store.
// - Global settings (the Anthropic API key that powers the live AI brain)
// - Per-client credentials (Twilio for SMS, Instagram/Meta for DMs, booking)
// Everything is entered FROM the dashboard and persisted to disk — no .env edits,
// no code changes. The moment real credentials are saved, the matching
// integration goes live.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "./paths.js";

const GLOBAL = join(DATA_DIR, "_settings.json");

function ensure() { if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true }); }
function readJSON(p, fallback) {
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fallback; }
}

// ---- Global settings -------------------------------------------------------
export function getGlobal() {
  // Env var wins (for power users); otherwise the dashboard-saved value.
  const saved = readJSON(GLOBAL, {});
  return {
    anthropicKey: process.env.ANTHROPIC_API_KEY || saved.anthropicKey || "",
    model: saved.model || process.env.FRONTDESK_MODEL || "claude-haiku-4-5",
  };
}
export function setGlobal(patch) {
  ensure();
  const cur = readJSON(GLOBAL, {});
  const next = { ...cur, ...patch };
  writeFileSync(GLOBAL, JSON.stringify(next, null, 2));
  return getGlobal();
}

// ---- Per-client credentials ------------------------------------------------
function credFile(id) { return join(DATA_DIR, `${id}.creds.json`); }

export function getCreds(id) {
  const c = readJSON(credFile(id), {});
  return {
    twilio: c.twilio || {},       // { sid, token, from }
    instagram: c.instagram || {}, // { token, pageId }
    booking: c.booking || {},     // { calendarUrl } (optional external calendar)
    embedInstalled: !!c.embedInstalled,
    bookingShared: !!c.bookingShared,
  };
}
export function setCreds(id, patch) {
  ensure();
  const cur = readJSON(credFile(id), {});
  const next = { ...cur, ...patch };
  writeFileSync(credFile(id), JSON.stringify(next, null, 2));
  return getCreds(id);
}

// Convenience flags used across the app.
export function twilioReady(id) {
  const t = getCreds(id).twilio;
  return !!(t.sid && t.token && t.from);
}
export function instagramReady(id) {
  const i = getCreds(id).instagram;
  return !!(i.token && i.pageId);
}
export function brainReady() { return !!getGlobal().anthropicKey; }

// ---- SMS opt-outs (STOP) — compliance: never text someone who opted out ----
const digits = (p) => String(p || "").replace(/\D/g, "");
export function isOptedOut(id, phone) {
  return (readJSON(credFile(id), {}).optOuts || []).includes(digits(phone));
}
export function addOptOut(id, phone) {
  const cur = readJSON(credFile(id), {});
  const set = new Set([...(cur.optOuts || []), digits(phone)]);
  setCreds(id, { optOuts: [...set] });
}
export function removeOptOut(id, phone) {
  const cur = readJSON(credFile(id), {});
  setCreds(id, { optOuts: (cur.optOuts || []).filter((d) => d !== digits(phone)) });
}
