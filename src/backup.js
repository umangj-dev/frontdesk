// Automatic backups — a recoverability net so client data is never lost,
// even from a mistake. Hourly snapshot of clients + data into ./backups,
// keeping the most recent 24. Runs alongside the persistent volume.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { DATA_DIR, CLIENTS_DIR } from "./paths.js";

const ROOT = dirname(DATA_DIR);
const BACKUP_DIR = join(ROOT, "backups");
const KEEP = 24;

export function backupNow() {
  try {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dest = join(BACKUP_DIR, stamp);
    if (existsSync(CLIENTS_DIR)) cpSync(CLIENTS_DIR, join(dest, "clients"), { recursive: true });
    if (existsSync(DATA_DIR)) cpSync(DATA_DIR, join(dest, "data"), { recursive: true });
    // prune to the most recent KEEP snapshots
    const all = readdirSync(BACKUP_DIR).filter((d) => /^\d{4}-/.test(d)).sort();
    while (all.length > KEEP) rmSync(join(BACKUP_DIR, all.shift()), { recursive: true, force: true });
    return { ok: true, at: stamp, kept: Math.min(all.length, KEEP) };
  } catch (e) {
    console.error("[backup] failed:", e.message);
    return { ok: false, error: e.message };
  }
}

export function startBackups() {
  backupNow();
  setInterval(backupNow, 60 * 60 * 1000); // hourly
}
