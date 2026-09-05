const logic = require("./logic");
const store = require("./store");
const google = require("./google");
const backup = require("./backup");

const STAFF = ["武", "定", "好", "青", "山", "香", "阿猜", "阿萍"];

function ok(extra) {
  return { ok: true, ...extra };
}

function fail(error) {
  return { ok: false, error: String(error || "失敗") };
}

async function existingKeys(fromKey, toKey, names) {
  const rows = await store.listRange(fromKey, toKey, names);
  const keys = {};
  rows.forEach((row) => {
    if (String(row.type) === "無上班") return;
    if (String(row.status) === "作廢") return;
    const day = logic.parseDayKeyFromText(row.date);
    const mk = logic.minuteKey(row.time);
    const who = row.name;
    const ar = logic.areaKey(row.area);
    const type = row.type;
    if (!who || !day || !mk) return;
    keys[who + "|" + day + "|" + ar + "|" + type + "|" + mk] = true;
    keys[who + "|" + day + "|" + ar + "|*" + "|" + mk] = true;
  });
  return keys;
}

async function addPunch(name, type, area, dateText, timeText, source, lunchHours) {
  const who = String(name || "").trim();
  const kind = String(type || "").trim();
  const zone = logic.areaKey(area);
  const src = String(source || "員工打卡").trim();
  if (!who || !kind || (kind !== "無上班" && !zone)) {
    return fail("缺少姓名、類型或區域");
  }
  const now = logic.taipeiNow();
  const dateOut = String(dateText || now.date).replace(/-/g, "/");
  let timeOut = String(timeText || now.time).trim();
  if (/^\d{1,2}:\d{2}$/.test(timeOut)) timeOut += ":00";
  const dayKey = logic.parseDayKeyFromText(dateOut);
  const keys = await existingKeys(dayKey, dayKey, [who]);
  const dup = logic.clockDupError(keys, {}, who, dateOut, zone, kind, timeOut);
  if (dup) return fail(dup);
  const lunch = kind === "上班" && lunchHours != null ? logic.lunchLabel(logic.parseLunchChoice(lunchHours)) : "";
  const row = await store.insertPunch({
    date: dateOut,
    time: timeOut,
    name: who,
    type: kind,
    area: zone,
    source: src,
    status: logic.punchStatusForSource(src),
    lunch,
  });
  google.backupPunch(row);
  return row;
}

async function handlePunch(body) {
  const source = String(body.source || "員工打卡").trim();
  const names =
    Array.isArray(body.names) && body.names.length
      ? body.names.map(String)
      : [String(body.name || "").trim()].filter(Boolean);
  const dayEntries = Array.isArray(body.dayEntries) ? body.dayEntries : null;
  const saved = [];
  if (dayEntries && dayEntries.length) {
    for (const day of dayEntries) {
      const dateText = String(day.date || "").trim();
      const entries = Array.isArray(day.entries) ? day.entries : [];
      for (const entry of entries) {
        const type = String(entry.type || "").trim();
        const area = String(entry.area || body.area || (type === "無上班" ? "－" : "")).trim();
        const timeText = String(entry.time || "").trim();
        for (const who of names) {
          if (!who) continue;
          const result = await addPunch(who, type, area, dateText, timeText, source, entry.lunchHours);
          if (result && result.ok === false) return result;
          saved.push(result);
        }
      }
    }
    return ok({ count: saved.length });
  }
  const result = await addPunch(body.name, body.type, body.area, body.date, body.time, source);
  if (result && result.ok === false) return result;
  return ok({ count: 1 });
}

async function handleListPunches(body) {
  if (!body.from || !body.to) return fail("請提供起迄日期");
  const names = Array.isArray(body.names) ? body.names.map(String) : [];
  const rows = await store.listRange(body.from, body.to, names.length ? names : null);
  return ok({
    rows,
    sheetName: "Node",
    scanned: rows.length,
  });
}

async function handleVoidPunch(body) {
  const ids = Array.isArray(body.ids) ? body.ids : [];
  let count = 0;
  for (const id of ids) {
    const row = await store.getById(id);
    if (!row) continue;
    await store.updateById(id, { status: "作廢" });
    google.backupVoid(row);
    count++;
  }
  return ok({ count });
}

async function handleSetLunch(body) {
  const items = Array.isArray(body.items) ? body.items : [];
  let count = 0;
  const confirmed = [];
  for (const item of items) {
    const row = await store.getById(item.id);
    if (!row || row.status === "作廢") continue;
    const patch = { status: "已確認" };
    if (Object.prototype.hasOwnProperty.call(item, "lunchHours")) {
      const label = logic.lunchLabel(logic.parseLunchChoice(item.lunchHours));
      patch.lunch = label === "" ? "無" : label;
    }
    const updated = await store.updateById(item.id, patch);
    google.backupLunch(updated || row, item.lunchHours);
    confirmed.push(updated || row);
    count++;
  }
  if (confirmed.length) {
    const all = await store.listAll();
    for (const row of confirmed) {
      const day = logic.parseDayKeyFromText(row.date);
      const who = row.name;
      const area = logic.areaKey(row.area);
      for (const other of all) {
        if (other.id === row.id) continue;
        if (other.name !== who) continue;
        if (logic.parseDayKeyFromText(other.date) !== day) continue;
        if (logic.areaKey(other.area) !== area) continue;
        const type = String(other.type || "").trim();
        if (type !== "上班" && type !== "下班") continue;
        if (other.status === "作廢" || other.status === "已確認") continue;
        await store.updateById(other.id, { status: "已確認" });
        google.backupLunch(other, null);
        count++;
      }
    }
  }
  return ok({ count });
}

function toEvent(row) {
  const when = logic.parseWhen(row.date, row.time);
  if (!when) return null;
  const type = String(row.type || "").trim();
  if (type === "無上班") return null;
  const st = String(row.status || "").trim();
  if (st === "作廢" || st === "待確認") return null;
  const src = String(row.source || "").trim();
  if (st === "" && src !== "會計補打卡") return null;
  return {
    when,
    date: logic.formatDate(when),
    time: logic.formatTime(when),
    name: row.name,
    type,
    area: logic.areaKey(row.area),
    source: src,
    status: st,
    lunchHours: logic.parseLunchChoice(row.lunch),
  };
}

async function handleStats(body) {
  if (!body.from || !body.to) return fail("請提供起迄日期");
  const names = Array.isArray(body.names) ? body.names.map(String) : [];
  if (!names.length) return fail("請選擇員工");
  const rows = await store.listRange(body.from, body.to, names);
  const events = rows.map(toEvent).filter(Boolean);
  const stats = logic.buildStats(body.from, body.to, names, events);
  return ok(stats);
}

async function dispatch(body) {
  const action = String((body && (body.action || body.cmd)) || "").trim();
  if (action === "punch") return handlePunch(body);
  if (action === "stats") return handleStats(body);
  if (action === "listPunches") return handleListPunches(body);
  if (action === "voidPunch") return handleVoidPunch(body);
  if (action === "setLunch" || action === "setlunch" || action === "confirm") return handleSetLunch(body);
  if (action === "backup" || action === "backupDrive") return backup.runBackup(true);
  if (action === "ping") {
    return ok({
      version: "node-20260906-backup",
      store: process.env.DATABASE_URL ? "postgres" : "file",
      lastBackup: backup.status(),
    });
  }
  return fail("未知動作：" + (action || "空"));
}

module.exports = { dispatch, STAFF };
