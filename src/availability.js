// Real bookable time-slots, generated from each client's opening hours and
// blocked out by existing bookings. No external calendar needed to work —
// upgrades to Google/Calendly later by swapping this one module.
import { listBookings } from "./bookings.js";

const DAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Turn a tenant.hours entry into [openHour, closeHour] or null if closed.
function parseHours(hours, dayKey) {
  // hours keys can be "mon-fri", "sat", "sun", etc.
  for (const [k, v] of Object.entries(hours)) {
    if (/closed/i.test(v)) {
      if (rangeIncludes(k, dayKey)) return null;
      continue;
    }
    if (rangeIncludes(k, dayKey)) {
      const m = v.match(/(\d+):?(\d*)\s*(AM|PM).*?(\d+):?(\d*)\s*(AM|PM)/i);
      if (!m) return null;
      const to24 = (h, ap) => (ap.toUpperCase() === "PM" ? (h % 12) + 12 : h % 12);
      return [to24(+m[1], m[3]), to24(+m[4], m[6])];
    }
  }
  return null;
}

function rangeIncludes(key, dayKey) {
  const days = DAY.indexOf(dayKey);
  if (key.includes("-")) {
    const [a, b] = key.split("-").map((d) => DAY.indexOf(d.slice(0, 3)));
    return days >= a && days <= b;
  }
  return key.slice(0, 3) === dayKey;
}

// Next `count` open 30-min slots starting tomorrow, minus booked ones.
export function openSlots(tenant, count = 6) {
  const booked = new Set(listBookings(tenant.id).map((b) => b.slot).filter(Boolean));
  const out = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() + 1); // start tomorrow
  let guard = 0;
  while (out.length < count && guard < 30) {
    guard++;
    const dayKey = DAY[cursor.getDay()];
    const hrs = parseHours(tenant.hours, dayKey);
    if (hrs) {
      for (let h = hrs[0]; h < hrs[1] && out.length < count; h++) {
        for (const min of [0, 30]) {
          const slot = new Date(cursor);
          slot.setHours(h, min, 0, 0);
          const iso = slot.toISOString();
          if (booked.has(iso)) continue;
          out.push({
            iso,
            label: slot.toLocaleString("en-US", {
              weekday: "short", month: "short", day: "numeric",
              hour: "numeric", minute: "2-digit",
            }),
          });
          if (out.length >= count) break;
        }
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
