// Single source of truth for where data lives.
// Locally: ./data and ./clients (unchanged).
// On Railway: set FRONTDESK_DATA=/data (a persistent Volume) → everything lives
// on the volume and survives every redeploy. One env var, bulletproof.
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.FRONTDESK_DATA || join(__dirname, "..");

export const DATA_DIR = join(ROOT, "data");
export const CLIENTS_DIR = join(ROOT, "clients");

export function ensureDirs() {
  for (const d of [DATA_DIR, CLIENTS_DIR]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}
ensureDirs();
