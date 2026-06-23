// Unified channel layer. Web chat, SMS (missed-call-to-text), and Instagram DMs
// all flow through the SAME brain + booking logic. Each channel has a "transport"
// (how a reply is delivered). Transports are SIMULATED locally and go LIVE the
// moment real credentials exist — no code change, just env vars.
import { reply as brainReply, extractBooking, clean } from "./ai.js";
import { saveBooking } from "./bookings.js";
import { getCreds, isOptedOut } from "./settings.js";

const now = () => new Date().toISOString();

// Run any inbound message through the brain, log a booking if one is captured.
export async function handle(tenant, history) {
  const raw = await brainReply(tenant, history);
  const booking = extractBooking(raw);
  let saved = null;
  if (booking && booking.phone) {
    saved = saveBooking(tenant.id, { ...booking, channel: history.channel || "web" }, now());
  }
  return { reply: clean(raw), booking: saved };
}

// ---- Transports ------------------------------------------------------------
// SMS via Twilio, using THIS CLIENT's saved credentials. Real send the moment
// the client's Twilio creds are entered in the dashboard; simulated until then.
export async function sendSMS(tenantId, to, body) {
  // Compliance: never message a number that opted out (replied STOP).
  if (isOptedOut(tenantId, to)) {
    console.log(`  [SMS · blocked · opted-out · ${tenantId}] → ${to}`);
    return { skipped: true, reason: "opted_out" };
  }
  const { sid, token, from } = getCreds(tenantId).twilio || {};
  if (!sid || !token || !from) {
    console.log(`  [SMS · simulated · ${tenantId}] → ${to}: ${body}`);
    return { simulated: true, to, body };
  }
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    }
  );
  const data = await res.json().catch(() => ({}));
  return { simulated: false, ok: res.ok, status: res.status, ...data };
}

// Instagram DM via Meta Graph API, using THIS CLIENT's saved credentials.
export async function sendInstagramDM(tenantId, recipientId, body) {
  const { token, pageId } = getCreds(tenantId).instagram || {};
  if (!token || !pageId) {
    console.log(`  [IG DM · simulated · ${tenantId}] → ${recipientId}: ${body}`);
    return { simulated: true, recipientId, body };
  }
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/messages?access_token=${token}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text: body } }),
    }
  );
  const data = await res.json().catch(() => ({}));
  return { simulated: false, ok: res.ok, status: res.status, ...data };
}
