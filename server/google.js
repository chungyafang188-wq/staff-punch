const DEFAULT_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycby4o7nIzUggoJVDsmg7lCD2XZ7f4abKo5qLGEyxLvh5Cff6Sh-nCs8aR9x2t5NrH1uO0g/exec";

function scriptUrl() {
  return (process.env.GOOGLE_SCRIPT_URL || DEFAULT_SCRIPT_URL).trim();
}

async function parseGoogleText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: "Google 備份回傳不是 JSON" };
  }
}

async function googleDispatch(payload) {
  const endpoint = new URL(scriptUrl());
  endpoint.searchParams.set("payload", JSON.stringify(payload));
  const res = await fetch(endpoint.toString(), { method: "GET", redirect: "follow" });
  return parseGoogleText(await res.text());
}

async function googlePost(payload) {
  const res = await fetch(scriptUrl(), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    redirect: "follow",
  });
  return parseGoogleText(await res.text());
}

async function backupSnapshot(rows) {
  return googlePost({
    action: "backupDrive",
    rows: Array.isArray(rows) ? rows : [],
  });
}

function backupLater(payload) {
  setImmediate(() => {
    googleDispatch(payload).catch((err) => {
      console.error("google backup failed", err && err.message ? err.message : err);
    });
  });
}

function minute(timeText) {
  return String(timeText || "").slice(0, 5);
}

function samePunch(a, b) {
  return (
    String(a.name) === String(b.name) &&
    String(a.date).replace(/-/g, "/") === String(b.date).replace(/-/g, "/") &&
    minute(a.time) === minute(b.time) &&
    String(a.type) === String(b.type) &&
    String(a.area || "") === String(b.area || "")
  );
}

function backupPunch(row) {
  backupLater({
    action: "punch",
    name: row.name,
    type: row.type,
    area: row.area,
    source: row.source || "員工打卡",
    date: String(row.date).replace(/-/g, "/"),
    time: row.time,
  });
}

function backupVoid(row) {
  setImmediate(async () => {
    try {
      const day = String(row.date).replace(/\//g, "-").slice(0, 10);
      const iso = day.includes("-") ? day : String(row.date);
      const data = await googleDispatch({
        action: "listPunches",
        from: iso.length === 10 ? iso : iso.replace(/\//g, "-"),
        to: iso.length === 10 ? iso : iso.replace(/\//g, "-"),
        names: [row.name],
      });
      const hit = (data.rows || []).find((r) => samePunch(r, row) && String(r.status) !== "作廢");
      if (hit && hit.id) await googleDispatch({ action: "voidPunch", ids: [hit.id] });
    } catch (err) {
      console.error("google void backup failed", err && err.message ? err.message : err);
    }
  });
}

function backupLunch(row, lunchHours) {
  setImmediate(async () => {
    try {
      const raw = String(row.date).replace(/\//g, "-");
      const iso = raw.match(/\d{4}-\d{2}-\d{2}/) ? raw.slice(0, 10) : raw;
      const data = await googleDispatch({
        action: "listPunches",
        from: iso,
        to: iso,
        names: [row.name],
      });
      const hit = (data.rows || []).find((r) => samePunch(r, row));
      if (!hit || !hit.id) return;
      const item = { id: hit.id };
      if (lunchHours != null) item.lunchHours = lunchHours;
      await googleDispatch({ action: "setLunch", items: [item] });
    } catch (err) {
      console.error("google lunch backup failed", err && err.message ? err.message : err);
    }
  });
}

async function importFromGoogle(staff) {
  const names = Array.isArray(staff) && staff.length ? staff : [];
  const data = await googleDispatch({
    action: "listPunches",
    from: "2024-01-01",
    to: "2030-12-31",
    names: names,
  });
  if (!data || !data.ok) {
    throw new Error((data && data.error) || "無法從 Google 匯入舊打卡");
  }
  return Array.isArray(data.rows) ? data.rows : [];
}

module.exports = {
  scriptUrl,
  googleDispatch,
  googlePost,
  backupPunch,
  backupVoid,
  backupLunch,
  backupSnapshot,
  importFromGoogle,
};
