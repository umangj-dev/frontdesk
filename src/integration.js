// Per-client integration status. Auto-detects what it can (config present,
// brain responding, Twilio/Instagram credentials, hosting) and persists the
// manual steps (embed pasted on site, booking link shared) you toggle by hand.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { twilioReady, instagramReady, brainReady, getCreds } from "./settings.js";
import { DATA_DIR } from "./paths.js";

function manualFile(id) { return join(DATA_DIR, `${id}.integration.json`); }

function loadManual(id) {
  try { return JSON.parse(readFileSync(manualFile(id), "utf8")); }
  catch { return {}; }
}
export function saveManual(id, key, value) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const m = loadManual(id);
  m[key] = value;
  writeFileSync(manualFile(id), JSON.stringify(m, null, 2));
  return m;
}

// Returns the full step list with done/auto/manual status for a client.
export function status(tenant, opts = {}) {
  const creds = getCreds(tenant.id);
  const hosted = opts.host && !/localhost|127\.0\.0\.1/.test(opts.host);
  const brainLive = brainReady();
  const twilio = twilioReady(tenant.id);
  const ig = instagramReady(tenant.id);

  const steps = [
    { key: "config", label: "Client created", auto: true, done: true,
      detail: "Branded front desk is configured and live in the system." },
    { key: "brainLive", label: "AI brain live (24/7)", auto: true, done: brainLive,
      detail: brainLive ? "Anthropic key saved — the AI answers autonomously, 24/7."
        : "Paste an Anthropic API key in this client's workspace to go fully autonomous." },
    { key: "embed", label: "Website chat installed", auto: false,
      done: !!creds.embedInstalled, action: "Paste the embed code on their site, then mark installed.",
      detail: "One script-tag line on the client's website." },
    { key: "booking", label: "Booking link shared", auto: false,
      done: !!creds.bookingShared, action: "Add the link to their IG bio / site / emails, then mark done.",
      detail: "Their booking page link in bio, Google Business, emails." },
    { key: "twilio", label: "Missed-call → text (Twilio)", auto: true, done: twilio,
      detail: twilio ? "Twilio credentials saved — SMS is live."
        : "Enter the client's Twilio SID, token & number in their workspace." },
    { key: "instagram", label: "Instagram DM connected", auto: true, done: ig,
      detail: ig ? "Instagram credentials saved — DM auto-reply is live."
        : "Enter the client's Instagram token & page ID in their workspace." },
    { key: "hosted", label: "Hosted live 24/7", auto: true, done: hosted,
      detail: hosted ? "Running on a public host." : "Deploy to Railway / Render / VPS so it runs 24/7." },
  ];

  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  return { client: tenant.id, name: tenant.name, steps, done, total,
    percent: Math.round((done / total) * 100) };
}
