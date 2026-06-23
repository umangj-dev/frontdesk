// Captured leads/bookings, stored per tenant as simple JSON lines.
// This is the "recovered revenue" the monthly report is built from.
import { appendFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "./paths.js";

function file(tenantId) {
  const safe = String(tenantId).replace(/[^a-z0-9-_]/gi, "");
  return join(DATA_DIR, `${safe}.bookings.jsonl`);
}

export function saveBooking(tenantId, booking, isoTime) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const row = { ...booking, capturedAt: isoTime };
  appendFileSync(file(tenantId), JSON.stringify(row) + "\n");
  return row;
}

export function listBookings(tenantId) {
  const f = file(tenantId);
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}
