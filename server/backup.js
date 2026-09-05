const store = require("./store");
const google = require("./google");
const r2 = require("./r2");

const INTERVAL_MS = Number(process.env.BACKUP_EVERY_MS) || 6 * 60 * 60 * 1000;
const START_DELAY_MS = 45 * 1000;
const MIN_GAP_MS = 10 * 60 * 1000;

let lastAt = 0;
let lastResult = null;
let timer = null;

function taipeiStamp() {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).replace(" ", "T");
}

async function runBackup(force) {
  const now = Date.now();
  if (!force && lastAt && now - lastAt < MIN_GAP_MS) {
    return lastResult || { ok: true, skipped: true, reason: "剛備份過" };
  }
  lastAt = now;
  const rows = await store.listAll();
  const result = {
    ok: true,
    savedAt: taipeiStamp(),
    count: rows.length,
    store: process.env.DATABASE_URL ? "postgres" : "file",
    google: { ok: false },
    r2: { ok: false, skipped: !r2.r2Ready() },
  };
  try {
    const g = await google.backupSnapshot(rows);
    result.google = g && g.ok ? { ok: true, folder: g.folder, file: g.file } : { ok: false, error: (g && g.error) || "Google 備份失敗" };
  } catch (err) {
    result.google = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  if (r2.r2Ready()) {
    try {
      await r2.backupPunches(rows);
      result.r2 = { ok: true };
    } catch (err) {
      result.r2 = { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }
  result.ok = Boolean(result.google.ok || result.r2.ok);
  lastResult = result;
  console.log("backup", JSON.stringify(result));
  return result;
}

function startScheduler() {
  if (timer) return;
  setTimeout(() => {
    runBackup(false).catch((err) => console.error("startup backup", err && err.message ? err.message : err));
  }, START_DELAY_MS);
  timer = setInterval(() => {
    runBackup(false).catch((err) => console.error("scheduled backup", err && err.message ? err.message : err));
  }, INTERVAL_MS);
  if (timer.unref) timer.unref();
}

function status() {
  return lastResult;
}

module.exports = { runBackup, startScheduler, status };
