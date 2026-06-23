// The "Claude-in-the-chat" bridge.
// When the brain is YOU (Claude in the chat session), incoming visitor messages
// wait here until you read them and post an answer. No API key, no cost —
// the intelligence is the assistant in the chat, woken up on demand.
import {
  appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync,
} from "fs";
import { join } from "path";
import { DATA_DIR } from "./paths.js";

const QUEUE = join(DATA_DIR, "queue.json");

function load() {
  if (!existsSync(QUEUE)) return { tickets: [] };
  return JSON.parse(readFileSync(QUEUE, "utf8"));
}
function save(q) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(QUEUE, JSON.stringify(q, null, 2));
}

// Visitor sends a message → create a ticket awaiting Claude's reply.
export function enqueue(tenantId, history, id) {
  const q = load();
  q.tickets.push({
    id, tenantId, history,
    status: "pending", reply: null, booking: null,
  });
  save(q);
  return id;
}

// What the chat assistant reads to see who's waiting.
export function pending() {
  return load().tickets.filter((t) => t.status === "pending");
}

// The chat assistant posts an answer back into a ticket.
export function answer(id, replyText, booking) {
  const q = load();
  const t = q.tickets.find((x) => x.id === id);
  if (!t) return null;
  t.reply = replyText;
  t.booking = booking || null;
  t.status = "answered";
  save(q);
  return t;
}

// The widget polls this to pick up the reply once it exists.
export function get(id) {
  return load().tickets.find((t) => t.id === id) || null;
}
