import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sqlite } from "./db/client";
import { dataDir } from "./paths";
import { sealBackup } from "./backup-crypto";

/**
 * Daily off-site backup to the developer's Telegram, whenever the laptop is
 * online.
 *
 * The one-click backup in «الإعدادات» writes beside the database — it does not
 * survive a stolen laptop, a dead disk or a wiped Windows. This sends a sealed
 * copy (lib/backup-crypto.ts) through a Telegram bot instead, so the records
 * exist somewhere the clinic can not lose them and the developer can restore
 * without visiting.
 *
 * Developer-only by design: no screen, no badge, no error the clinic sees.
 * Offline is the normal case — a failed send is retried on the next hourly
 * check, and the day is not marked done until Telegram answers ok.
 *
 * Config is `cloud-backup.json` beside server.js, written by
 * scripts/stage-app.mjs from .env.local (ZUHA_TG_TOKEN, ZUHA_TG_CHAT,
 * ZUHA_BACKUP_PUBLIC_KEY). No file — dev, tests, e2e, the demo bundle — means
 * this never runs.
 */

type CloudConfig = { token: string; chatId: string; publicKey: string };

const CHECK_EVERY_MS = 60 * 60 * 1000;
const FIRST_CHECK_AFTER_MS = 3 * 60 * 1000;
/** Not 24h: a laptop opened at 9:00 one day and 8:30 the next still sends. */
const SEND_AFTER_MS = 20 * 60 * 60 * 1000;

function readConfig(): CloudConfig | null {
  const file =
    process.env.ZUHA_CLOUD_BACKUP_CONFIG || path.join(process.cwd(), "cloud-backup.json");
  try {
    const c = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<CloudConfig>;
    if (c.token && c.chatId && c.publicKey) return c as CloudConfig;
  } catch {
    /* no config → feature off */
  }
  return null;
}

function statePath(): string {
  return path.join(dataDir(), "cloud-backup-state.json");
}

function lastSentAt(): number {
  try {
    return Number(JSON.parse(fs.readFileSync(statePath(), "utf8")).lastSentAt) || 0;
  } catch {
    return 0;
  }
}

let running = false;

export async function sendCloudBackup(config: CloudConfig, now = Date.now()): Promise<boolean> {
  if (running) return false;
  running = true;
  const tmp = path.join(os.tmpdir(), `zuha-cloud-${process.pid}-${now}.db`);
  try {
    // The online backup API gives a consistent copy while the clinic keeps working.
    await sqlite.backup(tmp);
    const sealed = sealBackup(fs.readFileSync(tmp), config.publicKey);

    const stamp = new Date(now).toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const form = new FormData();
    form.append("chat_id", config.chatId);
    form.append(
      "caption",
      `Zuha backup ${stamp} · v${process.env.ZUHA_APP_VERSION ?? "?"} · ${os.hostname()}`,
    );
    form.append("document", new Blob([new Uint8Array(sealed)]), `zuha-${stamp}.zbak`);

    const res = await fetch(`https://api.telegram.org/bot${config.token}/sendDocument`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
    if (!res.ok || !body.ok) return false;

    fs.writeFileSync(statePath(), JSON.stringify({ lastSentAt: now }));
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(tmp, { force: true });
    running = false;
  }
}

let started = false;

export function startCloudBackup(): void {
  if (started) return;
  started = true;
  const config = readConfig();
  if (!config) return;

  const tick = () => {
    if (Date.now() - lastSentAt() >= SEND_AFTER_MS) void sendCloudBackup(config);
  };
  setTimeout(tick, FIRST_CHECK_AFTER_MS).unref();
  setInterval(tick, CHECK_EVERY_MS).unref();
}
