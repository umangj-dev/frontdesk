import { existsSync, writeFileSync, rmSync } from "fs";
// Load .env locally (Node 24 built-in) so you just drop your key in one file.
if (existsSync(new URL("./.env", import.meta.url))) {
  process.loadEnvFile(new URL("./.env", import.meta.url));
}
import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { listTenants, loadTenant } from "./src/tenants.js";
import { reply, extractBooking, clean } from "./src/ai.js";
import { saveBooking, listBookings } from "./src/bookings.js";
import { enqueue, pending, answer, get } from "./src/queue.js";
import { openSlots } from "./src/availability.js";
import { sendSMS, sendInstagramDM } from "./src/channels.js";
import { status, saveManual } from "./src/integration.js";
import { brainLive } from "./src/ai.js";
import { getGlobal, setGlobal, getCreds, setCreds, addOptOut, removeOptOut } from "./src/settings.js";
import * as auth from "./src/auth.js";
import { DATA_DIR, CLIENTS_DIR } from "./src/paths.js";
import { startBackups, backupNow } from "./src/backup.js";
import { rateLimit } from "./src/ratelimit.js";

// Per-sender conversation memory for SMS / Instagram (keyed by channel:sender).
const convos = new Map();
function convo(key) {
  if (!convos.has(key)) convos.set(key, []);
  return convos.get(key);
}

// BRAIN modes: "mock" (free canned), "claude" (API key), "chat" (YOU answer here).
// `BRAIN` is mutable so the dashboard Start/Stop button can flip it at runtime.
const DEFAULT_BRAIN = process.env.ANTHROPIC_API_KEY
  ? "claude"
  : process.env.FRONTDESK_BRAIN || "mock";
let BRAIN = DEFAULT_BRAIN;
let ticketSeq = 0;

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// ---- Auth gate: storefront is public, dashboard is locked to your password --
app.get("/api/auth/state", (req, res) =>
  res.json({ configured: auth.isConfigured(), authed: auth.checkSecret(auth.getCookie(req, "fd_auth")) }));

app.post("/api/login", (req, res) => {
  const pw = (req.body && req.body.password) || "";
  if (pw.length < 4) return res.status(400).json({ error: "Password must be at least 4 characters." });
  let secret;
  if (!auth.isConfigured()) secret = auth.setPassword(pw); // first login sets it
  else { secret = auth.verify(pw); if (!secret) return res.status(401).json({ error: "Wrong password." }); }
  setAuthCookie(req, res, secret);
  res.json({ ok: true });
});
app.post("/api/logout", (_req, res) => {
  res.setHeader("Set-Cookie", "fd_auth=; HttpOnly; Path=/; Max-Age=0");
  res.json({ ok: true });
});
// Change password — requires the CURRENT password. Only you can do this.
app.post("/api/change-password", (req, res) => {
  if (!auth.checkSecret(auth.getCookie(req, "fd_auth")))
    return res.status(401).json({ error: "Login required" });
  const { current, next } = req.body || {};
  if (!auth.verify(current)) return res.status(401).json({ error: "Current password is wrong." });
  if (!next || next.length < 4) return res.status(400).json({ error: "New password must be at least 4 characters." });
  const secret = auth.setPassword(next);
  setAuthCookie(req, res, secret);
  res.json({ ok: true });
});
// Permanent session (10 years) so you never get logged out.
function setAuthCookie(req, res, secret) {
  const isHttps = req.headers["x-forwarded-proto"] === "https";
  res.setHeader("Set-Cookie",
    `fd_auth=${secret}; HttpOnly; Path=/; Max-Age=315360000; SameSite=Lax${isHttps ? "; Secure" : ""}`);
}

// Everything not public requires a valid session cookie.
app.use((req, res, next) => {
  if (auth.isPublic(req.path)) return next();
  if (auth.checkSecret(auth.getCookie(req, "fd_auth"))) return next();
  // HTML pages → send to login; API → 401
  if (req.method === "GET" && (req.path.endsWith(".html") || req.path === "/admin")) {
    return res.redirect("/login.html");
  }
  return res.status(401).json({ error: "Login required" });
});

app.use(express.static(join(__dirname, "public")));

// Tiny ISO clock helper (Date.now is fine in the running server).
const now = () => new Date().toISOString();

// Tenant config (drives branding + the demo widget).
app.get("/api/:tenant/config", (req, res) => {
  try {
    const t = loadTenant(req.params.tenant);
    res.json({
      id: t.id, name: t.name, tagline: t.tagline, brand: t.brand,
      services: t.services, hours: t.hours, phone: t.phone, address: t.address,
      website: t.website || "",
    });
  } catch {
    res.status(404).json({ error: "Unknown client" });
  }
});

// The chat endpoint — the AI front desk itself. Rate-limited against spam/cost.
app.post("/api/:tenant/chat", rateLimit({ perMinute: 15, perDay: 300 }), async (req, res) => {
  let tenant;
  try { tenant = loadTenant(req.params.tenant); }
  catch { return res.status(404).json({ error: "Unknown client" }); }

  // Cap conversation length so a single session can't balloon token cost.
  let history = Array.isArray(req.body.history) ? req.body.history : [];
  if (history.length > 40) history = history.slice(-40);

  // If a real Anthropic key is configured, the AI answers autonomously — always.
  // Only fall back to the manual chat-bridge when there's NO key and the operator
  // explicitly turned it on (the old demo path).
  if (BRAIN === "chat" && !brainLive()) {
    const id = `t${Date.now()}_${++ticketSeq}`;
    enqueue(tenant.id, history, id);
    return res.json({ pending: true, ticketId: id });
  }

  const raw = await reply(tenant, history);
  const booking = extractBooking(raw);
  let saved = null;
  if (booking && booking.phone) saved = saveBooking(tenant.id, booking, now());

  res.json({ reply: clean(raw), booked: !!saved, booking: saved });
});

// ---- Chat-brain bridge endpoints ------------------------------------------
// You (Claude in the chat) read this to see who's waiting.
app.get("/api/inbox", (_req, res) => res.json({ pending: pending() }));

// You post your reply back here. If your reply contains a [BOOK] line,
// the booking is logged automatically — same as the AI path.
app.post("/api/answer", (req, res) => {
  const { id, reply: text } = req.body || {};
  const t = get(id);
  if (!t) return res.status(404).json({ error: "Unknown ticket" });
  const booking = extractBooking(text || "");
  let saved = null;
  if (booking && booking.phone) saved = saveBooking(t.tenantId, booking, now());
  answer(id, clean(text || ""), saved);
  res.json({ ok: true, booked: !!saved });
});

// The widget polls this to pick up your reply.
app.get("/api/ticket/:id", (req, res) => {
  const t = get(req.params.id);
  if (!t) return res.status(404).json({ error: "Unknown ticket" });
  res.json({ status: t.status, reply: t.reply, booked: !!t.booking });
});

// ---- Booking page: real time-slots ----------------------------------------
app.get("/api/:tenant/slots", (req, res) => {
  let tenant;
  try { tenant = loadTenant(req.params.tenant); }
  catch { return res.status(404).json({ error: "Unknown client" }); }
  res.json({ slots: openSlots(tenant, 8) });
});

// Confirm a real booking against a chosen slot.
app.post("/api/:tenant/book", (req, res) => {
  let tenant;
  try { tenant = loadTenant(req.params.tenant); }
  catch { return res.status(404).json({ error: "Unknown client" }); }
  const { name, phone, service, slot, slotLabel } = req.body || {};
  if (!name || !phone || !slot) {
    return res.status(400).json({ error: "name, phone and slot are required" });
  }
  const saved = saveBooking(tenant.id, {
    name, phone, service: service || "Consultation",
    slot, note: `Booked ${slotLabel || slot} via booking page`, channel: "web-booking",
  }, now());
  // Confirmation text (simulated until Twilio creds exist).
  sendSMS(tenant.id, phone, `${tenant.name}: you're booked for ${slotLabel || slot}. Reply here to reschedule. See you soon!\n\nReply STOP to opt out.`);
  res.json({ ok: true, booking: saved });
});

// ---- SMS channel: missed-call-to-text auto-responder -----------------------
// Point a Twilio number's webhook here. Works simulated today.
app.post("/api/:tenant/sms", async (req, res) => {
  let tenant;
  try { tenant = loadTenant(req.params.tenant); }
  catch { return res.status(404).json({ error: "Unknown client" }); }
  const from = req.body.From || req.body.from;
  const body = req.body.Body || req.body.body || "";

  // Compliance: handle STOP / START before anything else.
  const word = body.trim().toLowerCase();
  if (/^(stop|unsubscribe|cancel|end|quit|stopall)$/.test(word)) {
    addOptOut(tenant.id, from);
    return res.json({ reply: `You're unsubscribed from ${tenant.name} and won't get more texts. Reply START to opt back in.`, optedOut: true });
  }
  if (/^(start|unstop|yes)$/.test(word)) {
    removeOptOut(tenant.id, from);
    const t = `You're resubscribed to ${tenant.name}. How can we help?`;
    await sendSMS(tenant.id, from, t);
    return res.json({ reply: t, optedIn: true });
  }

  const key = `sms:${tenant.id}:${from}`;
  const history = convo(key);
  history.push({ role: "user", content: body });
  const raw = await reply(tenant, history);
  const text = clean(raw);
  history.push({ role: "assistant", content: text });
  const booking = extractBooking(raw);
  if (booking && booking.phone) saveBooking(tenant.id, { ...booking, channel: "sms" }, now());
  const delivery = await sendSMS(tenant.id, from, text);
  res.json({ reply: text, delivery });
});

// Simulate a missed call → auto-text the caller first.
app.post("/api/:tenant/missed-call", async (req, res) => {
  let tenant;
  try { tenant = loadTenant(req.params.tenant); }
  catch { return res.status(404).json({ error: "Unknown client" }); }
  const from = req.body.From || req.body.from;
  const text = `Hi! Thanks for calling ${tenant.name} — sorry we missed you. ` +
    `This is our front desk: how can I help? I can answer questions or get you booked in right here.` +
    `\n\n${tenant.name}. Reply STOP to opt out.`;
  convo(`sms:${tenant.id}:${from}`).push({ role: "assistant", content: text });
  const delivery = await sendSMS(tenant.id, from, text);
  res.json({ reply: text, delivery });
});

// ---- Instagram channel: DM auto-reply → booking link -----------------------
// Meta webhook verification handshake.
app.get("/api/:tenant/instagram", (req, res) => {
  const verify = process.env.IG_VERIFY_TOKEN || "frontdesk-verify";
  if (req.query["hub.verify_token"] === verify) return res.send(req.query["hub.challenge"]);
  res.sendStatus(403);
});
// Incoming DM → auto-reply with answer + booking link.
app.post("/api/:tenant/instagram", async (req, res) => {
  let tenant;
  try { tenant = loadTenant(req.params.tenant); }
  catch { return res.status(404).json({ error: "Unknown client" }); }
  const sender = req.body.sender || (req.body.entry?.[0]?.messaging?.[0]?.sender?.id);
  const text = req.body.text || (req.body.entry?.[0]?.messaging?.[0]?.message?.text) || "";
  const key = `ig:${tenant.id}:${sender}`;
  const history = convo(key);
  history.push({ role: "user", content: text });
  const raw = await reply(tenant, history);
  const base = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 5210}`;
  const link = `${base}/book.html?client=${tenant.id}`;
  const out = `${clean(raw)}\n\nBook instantly here: ${link}`;
  history.push({ role: "assistant", content: out });
  const booking = extractBooking(raw);
  if (booking && booking.phone) saveBooking(tenant.id, { ...booking, channel: "instagram" }, now());
  const delivery = await sendInstagramDM(tenant.id, sender, out);
  res.json({ reply: out, delivery });
});

// The "recovered revenue" report — what keeps clients paying.
app.get("/api/:tenant/report", (req, res) => {
  let tenant;
  try { tenant = loadTenant(req.params.tenant); }
  catch { return res.status(404).json({ error: "Unknown client" }); }
  const bookings = listBookings(tenant.id);
  const avg = Math.round(
    tenant.services.reduce((a, s) => a + s.from, 0) /
      Math.max(tenant.services.length, 1)
  );
  const byChannel = {};
  for (const b of bookings) {
    const c = b.channel || "web";
    byChannel[c] = (byChannel[c] || 0) + 1;
  }
  res.json({
    client: tenant.name,
    captured: bookings.length,
    estimatedRecoveredRevenue: bookings.length * avg,
    avgTicket: avg,
    byChannel,
    bookings,
  });
});

app.get("/api/clients", (_req, res) => res.json({ clients: listTenants() }));

// Manual backup (protected — admin only via the auth gate).
app.post("/api/admin/backup", (_req, res) => res.json(backupNow()));

// Delete a client (config + its data files). Real management — your roster, your call.
app.delete("/api/clients/:id", (req, res) => {
  const safe = String(req.params.id).replace(/[^a-z0-9-_]/gi, "");
  const file = join(CLIENTS_DIR, `${safe}.json`);
  if (!existsSync(file)) return res.status(404).json({ error: "Unknown client" });
  try { rmSync(file); } catch {}
  for (const ext of ["bookings.jsonl", "creds.json", "integration.json"]) {
    const f = join(DATA_DIR, `${safe}.${ext}`);
    if (existsSync(f)) { try { rmSync(f); } catch {} }
  }
  res.json({ ok: true });
});
app.get("/api/brain", (_req, res) => res.json({ brain: BRAIN }));

// One-click client creation from the dashboard — no file editing.
app.post("/api/clients", (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: "Clinic name is required" });
  const id = (b.id || b.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (!id) return res.status(400).json({ error: "Could not derive an id from the name" });
  const file = join(CLIENTS_DIR, `${id}.json`);
  if (existsSync(file)) return res.status(409).json({ error: `Client "${id}" already exists` });

  const services = (b.services || "")
    .split("\n").map((l) => l.trim()).filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)[\s,|-]+\$?(\d+)/);
      return m
        ? { name: m[1].trim(), from: Number(m[2]), duration: "30 min" }
        : { name: line, from: 0, duration: "30 min" };
    });

  const cfg = {
    id, name: b.name, tagline: b.tagline || "Clinic",
    brand: { primary: "#0f1115", accent: b.accent || "#19c3a3",
      logoText: (b.name || id).toUpperCase() },
    hours: b.hours || { "mon-fri": "9:00 AM – 6:00 PM", sat: "10:00 AM – 4:00 PM", sun: "Closed" },
    services: services.length ? services : [{ name: "Consultation", from: 0, duration: "20 min" }],
    bookingPolicy: "We confirm every booking by text within 5 minutes.",
    phone: b.phone || "", address: b.address || "", website: (b.website || "").trim(),
    persona: "Warm, polished, concierge-level. Never pushy. Always tries to capture the lead's name + phone and offer a concrete time.",
  };
  writeFileSync(file, JSON.stringify(cfg, null, 2));
  res.json({ ok: true, id, client: cfg });
});

// ---- Live desk control (the Start button) ---------------------------------
// "Start" puts the brain into CHAT mode — Claude (in the chat) answers live.
app.get("/api/system/state", (_req, res) =>
  res.json({ live: BRAIN === "chat", brain: BRAIN, waiting: pending().length }));

app.post("/api/system/start", (_req, res) => {
  BRAIN = "chat";
  res.json({ live: true, brain: BRAIN });
});

app.post("/api/system/stop", (_req, res) => {
  BRAIN = DEFAULT_BRAIN;
  res.json({ live: false, brain: BRAIN });
});

// ---- Settings: real credentials entered from the dashboard ----------------
// Global brain key (activates real autonomous Claude). Key is write-only —
// reads return only whether one is set, never the key itself.
app.get("/api/settings/global", (_req, res) => {
  const g = getGlobal();
  res.json({ hasKey: !!g.anthropicKey, model: g.model, brainLive: !!g.anthropicKey });
});
app.post("/api/settings/global", (req, res) => {
  const { anthropicKey, model } = req.body || {};
  const patch = {};
  if (anthropicKey !== undefined) patch.anthropicKey = anthropicKey.trim();
  if (model) patch.model = model;
  setGlobal(patch);
  const g = getGlobal();
  res.json({ ok: true, hasKey: !!g.anthropicKey, model: g.model });
});

// Per-client credentials (Twilio, Instagram). Secrets are write-only on read.
app.get("/api/:tenant/settings", (req, res) => {
  let tenant;
  try { tenant = loadTenant(req.params.tenant); }
  catch { return res.status(404).json({ error: "Unknown client" }); }
  const c = getCreds(tenant.id);
  res.json({
    twilio: { from: c.twilio.from || "", hasAuth: !!(c.twilio.sid && c.twilio.token) },
    instagram: { pageId: c.instagram.pageId || "", hasToken: !!c.instagram.token },
    booking: { calendarUrl: c.booking.calendarUrl || "" },
    embedInstalled: c.embedInstalled, bookingShared: c.bookingShared,
  });
});
app.post("/api/:tenant/settings", (req, res) => {
  let tenant;
  try { tenant = loadTenant(req.params.tenant); }
  catch { return res.status(404).json({ error: "Unknown client" }); }
  const b = req.body || {};
  const patch = {};
  if (b.twilio) patch.twilio = { ...getCreds(tenant.id).twilio, ...b.twilio };
  if (b.instagram) patch.instagram = { ...getCreds(tenant.id).instagram, ...b.instagram };
  if (b.booking) patch.booking = { ...getCreds(tenant.id).booking, ...b.booking };
  if (b.embedInstalled !== undefined) patch.embedInstalled = !!b.embedInstalled;
  if (b.bookingShared !== undefined) patch.bookingShared = !!b.bookingShared;
  setCreds(tenant.id, patch);
  res.json({ ok: true });
});

// Live connection test for a client's Twilio number (sends a real test SMS).
app.post("/api/:tenant/test-sms", async (req, res) => {
  let tenant;
  try { tenant = loadTenant(req.params.tenant); }
  catch { return res.status(404).json({ error: "Unknown client" }); }
  const to = (req.body && req.body.to) || "";
  if (!to) return res.status(400).json({ error: "Provide a 'to' phone number to test." });
  const r = await sendSMS(tenant.id, to,
    `Test from ${tenant.name}'s AI front desk — your SMS channel is connected ✅`);
  res.json(r);
});

// Per-client integration status — what's done, what's left.
app.get("/api/:tenant/integration", (req, res) => {
  let tenant;
  try { tenant = loadTenant(req.params.tenant); }
  catch { return res.status(404).json({ error: "Unknown client" }); }
  const host = `${req.protocol}://${req.get("host")}`;
  res.json(status(tenant, { host }));
});

// Toggle a manual step (embed installed / booking link shared).
app.post("/api/:tenant/integration", (req, res) => {
  let tenant;
  try { tenant = loadTenant(req.params.tenant); }
  catch { return res.status(404).json({ error: "Unknown client" }); }
  const { key, value } = req.body || {};
  if (!["embed", "booking"].includes(key)) {
    return res.status(400).json({ error: "Only embed/booking are manual steps" });
  }
  saveManual(tenant.id, key, !!value);
  const host = `${req.protocol}://${req.get("host")}`;
  res.json(status(tenant, { host }));
});

// Live test: ping the AI brain to confirm it's actually answering.
app.post("/api/:tenant/integration/test", async (req, res) => {
  let tenant;
  try { tenant = loadTenant(req.params.tenant); }
  catch { return res.status(404).json({ error: "Unknown client" }); }
  if (BRAIN === "chat") return res.json({ ok: true, note: "Chat-brain mode — you answer live." });
  const raw = await reply(tenant, [{ role: "user", content: "what are your hours?" }]);
  res.json({ ok: !!raw, sample: clean(raw).slice(0, 120) });
});

const PORT = process.env.PORT || 5210;
app.listen(PORT, () => {
  console.log(`\n  FrontDesk AI running → http://localhost:${PORT}/?client=demo-clinic`);
  console.log(`  Clients loaded: ${listTenants().join(", ")}`);
  const label = BRAIN === "claude" ? "Claude API (live)"
    : BRAIN === "chat" ? "CHAT — you answer in the Claude chat"
    : "smart mock (free)";
  console.log(`  Brain: ${label}\n`);
  startBackups(); // hourly snapshots of clients + data
});
