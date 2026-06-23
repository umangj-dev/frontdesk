// Multi-tenant loader. Every client is one JSON file in /clients.
// Adding a client = dropping in a new config file. No code changes.
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { CLIENTS_DIR } from "./paths.js";

export function listTenants() {
  if (!existsSync(CLIENTS_DIR)) return [];
  return readdirSync(CLIENTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

export function loadTenant(id) {
  const safe = String(id).replace(/[^a-z0-9-_]/gi, "");
  const path = join(CLIENTS_DIR, `${safe}.json`);
  return JSON.parse(readFileSync(path, "utf8"));
}
