const PUNCH_SHEET = "打卡";
const STATS_FILE = "員工出勤統計表";
// 試算表網址：https://docs.google.com/spreadsheets/d/這一串/edit
// 若腳本是從試算表「擴充功能」打開的可留空。獨立專案一定要填。
const SPREADSHEET_ID = "";
const TZ = "Asia/Taipei";
const PUNCH_HEADERS = ["日期", "時間", "員工", "類型", "區域", "來源", "狀態", "午休"];
// 一筆連續上下班若跨過這段時間，重疊部分當午休扣除。中午有打下班再打上班則不會扣。
const LUNCH_START = "12:00:00";
const LUNCH_END = "13:00:00";

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function punchBook() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  const ss = SpreadsheetApp.getActive();
  if (!ss) {
    throw new Error("請在 Code.gs 把 SPREADSHEET_ID 填成試算表網址 /d/ 與 /edit 中間那一串");
  }
  return ss;
}

function punchSheet() {
  const ss = punchBook();
  let sh = ss.getSheetByName(PUNCH_SHEET);
  if (!sh) {
    sh = ss.getSheets()[0];
    sh.setName(PUNCH_SHEET);
  }
  sh.getRange(1, 1, 1, PUNCH_HEADERS.length).setValues([PUNCH_HEADERS]);
  sh.getRange("A:B").setNumberFormat("@");
  return sh;
}

function statsSpreadsheet() {
  const files = DriveApp.getFilesByName(STATS_FILE);
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }
  return SpreadsheetApp.create(STATS_FILE);
}

function statsSheet(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  return sh;
}

function doGet(e) {
  try {
    const raw = e && e.parameter && e.parameter.payload;
    if (!raw) return json({ ok: false, error: "缺少資料" });
    const body = JSON.parse(raw);
    if (body.action === "punch") return handlePunch(body);
    if (body.action === "stats") return handleStats(body);
    if (body.action === "listPunches") return handleListPunches(body);
    if (body.action === "voidPunch") return handleVoidPunch(body);
    if (body.action === "setLunch") return handleSetLunch(body);
    return json({ ok: false, error: "未知動作" });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === "punch") return handlePunch(body);
    if (body.action === "stats") return handleStats(body);
    if (body.action === "listPunches") return handleListPunches(body);
    if (body.action === "voidPunch") return handleVoidPunch(body);
    if (body.action === "setLunch") return handleSetLunch(body);
    return json({ ok: false, error: "未知動作" });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function formatDate(when) {
  return Utilities.formatDate(when, TZ, "yyyy/MM/dd");
}

function formatTime(when) {
  return Utilities.formatDate(when, TZ, "HH:mm:ss");
}

function pad2(n) {
  return (n < 10 ? "0" : "") + n;
}

// 分鐘 0–14 → 整點；15–44 → 30 分；45–59 → 下一整點。時數以 30 分鐘為單位。
function roundToHalfHour(when) {
  const datePart = formatDate(when);
  let h = Number(Utilities.formatDate(when, TZ, "HH"));
  const m = Number(Utilities.formatDate(when, TZ, "mm"));
  let nextDay = false;
  let minutes = 0;
  if (m < 15) {
    minutes = 0;
  } else if (m < 45) {
    minutes = 30;
  } else {
    minutes = 0;
    h += 1;
    if (h >= 24) {
      h = 0;
      nextDay = true;
    }
  }
  let dateText = datePart;
  if (nextDay) {
    const p = String(datePart).split("/");
    const next = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + 1);
    dateText = Utilities.formatDate(next, TZ, "yyyy/MM/dd");
  }
  return parseWhen(dateText, pad2(h) + ":" + pad2(minutes) + ":00");
}

function formatStamp(when) {
  return Utilities.formatDate(when, TZ, "yyyy/MM/dd HH:mm:ss");
}

function parseWhen(dateText, timeText) {
  const d = String(dateText || "")
    .trim()
    .replace(/-/g, "/");
  let t = String(timeText || "00:00:00").trim();
  if (/^\d{1,2}:\d{2}$/.test(t)) t += ":00";
  const parsed = new Date(d + " " + t);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

function hoursBetween(start, end) {
  const ms = end.getTime() - start.getTime();
  if (!(ms > 0)) return 0;
  return roundHours(ms / 3600000);
}

function roundHours(value) {
  return Math.round(Number(value) * 100) / 100;
}

function lunchOverlapHours(start, end) {
  const lunchFrom = parseWhen(formatDate(start), LUNCH_START);
  const lunchTo = parseWhen(formatDate(start), LUNCH_END);
  if (!lunchFrom || !lunchTo) return 0;
  const overlapStart = Math.max(start.getTime(), lunchFrom.getTime());
  const overlapEnd = Math.min(end.getTime(), lunchTo.getTime());
  if (overlapEnd <= overlapStart) return 0;
  return hoursBetween(new Date(overlapStart), new Date(overlapEnd));
}

function parseLunchChoice(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (s === "" || s === "自動") return null;
  if (s === "無") return 0;
  const n = Number(s);
  if (n === 0 || n === 0.5 || n === 1) return n;
  return null;
}

function lunchLabel(hours) {
  if (hours === 0) return "無";
  if (hours === 0.5) return "0.5";
  if (hours === 1) return "1";
  return "";
}

function punchStatusForSource(source) {
  return source === "會計補打卡" ? "已確認" : "待確認";
}

function writePunchRow(sh, when, name, type, area, source, lunchHours) {
  const src = source || "員工打卡";
  const lunchText = type === "上班" && lunchHours != null ? lunchLabel(lunchHours) : "";
  sh.appendRow([
    formatDate(when),
    formatTime(when),
    name,
    type,
    area,
    src,
    punchStatusForSource(src),
    lunchText,
  ]);
}

function handlePunch(body) {
  const source = String(body.source || "員工打卡").trim();
  const sh = punchSheet();
  const names = Array.isArray(body.names) && body.names.length ? body.names.map(String) : [String(body.name || "").trim()];
  const dayEntries = Array.isArray(body.dayEntries) ? body.dayEntries : null;
  let wrote = 0;

  if (dayEntries && dayEntries.length) {
    for (let d = 0; d < dayEntries.length; d++) {
      const day = dayEntries[d];
      const dateText = String(day.date || "").trim();
      const entries = Array.isArray(day.entries) ? day.entries : [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const when = parseWhen(dateText, entry.time);
        const type = String(entry.type || "").trim();
        const area = String(entry.area || body.area || (type === "無上班" ? "－" : "")).trim();
        const lunchHours = parseLunchChoice(entry.lunchHours);
        if (!when || !type) continue;
        if (type !== "無上班" && !area) continue;
        for (let n = 0; n < names.length; n++) {
          const who = String(names[n] || "").trim();
          if (!who) continue;
          writePunchRow(sh, when, who, type, area, source, lunchHours);
          wrote++;
        }
      }
    }
    if (source === "會計補打卡") logMakeupToStats(names, dayEntries);
    return json({
      ok: true,
      count: wrote,
      spreadsheetUrl: punchBook().getUrl(),
      statsSpreadsheetUrl: statsSpreadsheet().getUrl(),
    });
  }

  const name = String(body.name || "").trim();
  const type = String(body.type || "").trim();
  const area = String(body.area || (type === "無上班" ? "－" : "")).trim();
  if (!name || !type || (type !== "無上班" && !area)) {
    return json({ ok: false, error: "缺少姓名、類型或區域" });
  }
  const when = body.at ? new Date(body.at) : new Date();
  writePunchRow(sh, when, name, type, area, source);
  return json({ ok: true, count: 1, spreadsheetUrl: punchBook().getUrl() });
}

function logMakeupToStats(names, dayEntries) {
  const ss = statsSpreadsheet();
  let sh = ss.getSheetByName("補打登錄");
  if (!sh) sh = ss.insertSheet("補打登錄");
  if (sh.getLastRow() === 0) {
    sh.appendRow(["登錄時間", "員工", "日期", "類型", "時間", "區域", "午休"]);
  }
  const now = formatStamp(new Date());
  for (let d = 0; d < dayEntries.length; d++) {
    const day = dayEntries[d];
    const entries = Array.isArray(day.entries) ? day.entries : [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      for (let n = 0; n < names.length; n++) {
        sh.appendRow([
          now,
          names[n],
          day.date,
          entry.type,
          entry.time,
          entry.area || "",
          entry.type === "上班" ? lunchLabel(parseLunchChoice(entry.lunchHours)) : "",
        ]);
      }
    }
  }
}

function colIndex(header, name) {
  for (let i = 0; i < header.length; i++) {
    if (String(header[i]).trim() === name) return i;
  }
  return -1;
}

function readPunchEvents(from, to, names) {
  const values = punchSheet().getDataRange().getValues();
  if (values.length < 2) return [];
  const header = values[0].map(function (h) {
    return String(h || "").trim();
  });
  const iDate = colIndex(header, "日期");
  const iTime = colIndex(header, "時間");
  const iName = colIndex(header, "員工") >= 0 ? colIndex(header, "員工") : 1;
  const iType = colIndex(header, "類型") >= 0 ? colIndex(header, "類型") : 2;
  const iArea = colIndex(header, "區域") >= 0 ? colIndex(header, "區域") : 3;
  const iSource = colIndex(header, "來源");
  const iStatus = colIndex(header, "狀態");
  const iLunch = colIndex(header, "午休");
  const nameSet = {};
  names.forEach(function (n) {
    nameSet[n] = true;
  });
  const events = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const typeText = String(row[iType] || "").trim();
    if (typeText === "無上班") continue;
    if (iStatus >= 0) {
      const st = String(row[iStatus] || "").trim();
      if (st === "作廢" || st === "待確認") continue;
      const src = iSource >= 0 ? String(row[iSource] || "").trim() : "";
      if (st === "" && src !== "會計補打卡") continue;
    }
    const who = String(row[iName] || "").trim();
    if (!nameSet[who]) continue;
    let when = null;
    if (iDate >= 0 && iTime >= 0) {
      const dateCell = row[iDate];
      const timeCell = row[iTime];
      if (dateCell instanceof Date && timeCell instanceof Date) {
        when = parseWhen(formatDate(dateCell), formatTime(timeCell));
      } else if (dateCell instanceof Date && !(timeCell instanceof Date)) {
        when = parseWhen(formatDate(dateCell), String(timeCell || ""));
      } else {
        when = parseWhen(dateCell, timeCell);
      }
    } else if (row[0] instanceof Date) {
      when = row[0];
    }
    if (!when) continue;
    if (when < from || when > to) continue;
    events.push({
      rowIndex: i + 1,
      when: when,
      date: formatDate(when),
      time: formatTime(when),
      name: who,
      type: String(row[iType] || "").trim(),
      area: String(row[iArea] || "").trim(),
      source: iSource >= 0 ? String(row[iSource] || "").trim() : "",
      status: iStatus >= 0 ? String(row[iStatus] || "").trim() : "",
      lunchHours: iLunch >= 0 ? parseLunchChoice(row[iLunch]) : null,
    });
  }
  events.sort(function (a, b) {
    return a.when.getTime() - b.when.getTime();
  });
  return events;
}

function pairSegments(events) {
  const byName = {};
  events.forEach(function (e) {
    if (!byName[e.name]) byName[e.name] = [];
    byName[e.name].push(e);
  });
  const segs = [];
  Object.keys(byName).forEach(function (name) {
    const list = byName[name];
    const queue = [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.type === "上班") {
        queue.push(e);
      } else if (e.type === "下班") {
        const open = queue.shift();
        if (!open) continue;
        const payIn = roundToHalfHour(open.when);
        const payOut = roundToHalfHour(e.when);
        const gross = hoursBetween(payIn, payOut);
        const lunch =
          open.lunchHours == null ? lunchOverlapHours(payIn, payOut) : Number(open.lunchHours);
        const net = roundHours(Math.max(0, gross - lunch));
        segs.push({
          date: open.date,
          name: open.name,
          area: open.area,
          clockInAt: formatStamp(open.when),
          clockOutAt: formatStamp(e.when),
          clockInTime: formatTime(open.when),
          clockOutTime: formatTime(e.when),
          payInTime: formatTime(payIn),
          payOutTime: formatTime(payOut),
          grossHours: gross,
          lunchHours: lunch,
          hours: net,
        });
      }
    }
  });
  return segs;
}

function emptyPerson(name) {
  return {
    name: name,
    clockInAt: "",
    clockOutAt: "",
    hours: 0,
    lunchHours: 0,
    fieldHours: 0,
    factoryHours: 0,
    days: 0,
    present: false,
  };
}

function handleStats(body) {
  if (!body.from || !body.to) {
    return json({ ok: false, error: "請提供起迄日期" });
  }
  const names = Array.isArray(body.names) ? body.names.map(String) : [];
  if (!names.length) {
    return json({ ok: false, error: "請選擇員工" });
  }
  const from = new Date(String(body.from) + "T00:00:00");
  const to = new Date(String(body.to) + "T23:59:59");
  const events = readPunchEvents(from, to, names);
  const segments = pairSegments(events);
  const byName = {};
  names.forEach(function (n) {
    byName[n] = emptyPerson(n);
  });
  const daySet = {};
  segments.forEach(function (seg) {
    const row = byName[seg.name];
    if (!row) return;
    row.hours = roundHours(row.hours + seg.hours);
    row.lunchHours = roundHours(row.lunchHours + (seg.lunchHours || 0));
    if (seg.area === "工廠") {
      row.factoryHours = roundHours(row.factoryHours + seg.hours);
    } else {
      row.fieldHours = roundHours(row.fieldHours + seg.hours);
    }
    if (!row.clockInAt) row.clockInAt = seg.clockInAt;
    row.clockOutAt = seg.clockOutAt;
    const key = seg.name + "|" + seg.date;
    if (!daySet[key]) {
      daySet[key] = true;
      row.days++;
    }
    row.present = true;
  });
  const rows = names.map(function (n) {
    return byName[n];
  });
  const people = rows.filter(function (r) {
    return r.present;
  }).length;

  const ss = statsSpreadsheet();
  const detail = statsSheet(ss, "工時明細");
  detail.appendRow(["期間", body.from, "至", body.to]);
  detail.appendRow(["統計時間", new Date()]);
  detail.appendRow([""]);
  detail.appendRow(["午休", LUNCH_START + "－" + LUNCH_END, "連續上下班跨過此時段才扣除"]);
  detail.appendRow([""]);
  detail.appendRow(["日期", "員工", "區域", "上班時間", "下班時間", "計薪上班", "計薪下班", "毛時數", "午休", "實工時"]);
  segments.forEach(function (seg) {
    detail.appendRow([
      seg.date,
      seg.name,
      seg.area,
      seg.clockInTime,
      seg.clockOutTime,
      seg.payInTime,
      seg.payOutTime,
      seg.grossHours,
      seg.lunchHours,
      seg.hours,
    ]);
  });

  const person = statsSheet(ss, "人別時數");
  person.appendRow(["期間", body.from, "至", body.to]);
  person.appendRow(["出勤人數", people]);
  person.appendRow(["午休", LUNCH_START + "－" + LUNCH_END]);
  person.appendRow([""]);
  person.appendRow(["員工", "上班時間", "下班時間", "田區時數", "工廠時數", "午休", "合計時數", "出勤日數"]);
  rows.forEach(function (r) {
    person.appendRow([
      r.name,
      r.clockInAt,
      r.clockOutAt,
      r.fieldHours,
      r.factoryHours,
      r.lunchHours,
      r.hours,
      r.days,
    ]);
  });

  return json({
    ok: true,
    people: people,
    lunchStart: LUNCH_START,
    lunchEnd: LUNCH_END,
    rows: rows,
    segments: segments,
    spreadsheetUrl: ss.getUrl(),
  });
}

function handleListPunches(body) {
  if (!body.from || !body.to) {
    return json({ ok: false, error: "請提供起迄日期" });
  }
  const names = Array.isArray(body.names) ? body.names.map(String) : [];
  const fromKey = String(body.from);
  const toKey = String(body.to);
  const values = punchSheet().getDataRange().getValues();
  const header = values[0].map(function (h) {
    return String(h || "").trim();
  });
  const iStatus = colIndex(header, "狀態");
  const rows = [];
  const nameSet = {};
  names.forEach(function (n) {
    nameSet[n] = true;
  });
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const who = String(row[colIndex(header, "員工") >= 0 ? colIndex(header, "員工") : 1] || "").trim();
    if (names.length && !nameSet[who]) continue;
    let when = null;
    const iDate = colIndex(header, "日期");
    const iTime = colIndex(header, "時間");
    if (iDate >= 0 && iTime >= 0) {
      const dateCell = row[iDate];
      const timeCell = row[iTime];
      if (dateCell instanceof Date) {
        when = parseWhen(formatDate(dateCell), timeCell instanceof Date ? formatTime(timeCell) : String(timeCell || "00:00:00"));
      } else {
        when = parseWhen(dateCell, timeCell || "00:00:00");
      }
    } else if (row[0] instanceof Date) {
      when = row[0];
    }
    if (!when) continue;
    const dayKey = Utilities.formatDate(when, TZ, "yyyy-MM-dd");
    if (dayKey < fromKey || dayKey > toKey) continue;
    rows.push({
      id: i + 1,
      date: formatDate(when),
      time: formatTime(when),
      name: who,
      type: String(row[colIndex(header, "類型") >= 0 ? colIndex(header, "類型") : 2] || "").trim(),
      area: String(row[colIndex(header, "區域") >= 0 ? colIndex(header, "區域") : 3] || ""),
      source: colIndex(header, "來源") >= 0 ? String(row[colIndex(header, "來源")] || "") : "",
      status: iStatus >= 0 ? String(row[iStatus] || "") : "",
      lunch: colIndex(header, "午休") >= 0 ? String(row[colIndex(header, "午休")] || "") : "",
    });
  }
  return json({ ok: true, rows: rows, spreadsheetUrl: punchBook().getUrl() });
}

function handleVoidPunch(body) {
  const sh = punchSheet();
  const ids = Array.isArray(body.ids) ? body.ids : [];
  let count = 0;
  for (let i = 0; i < ids.length; i++) {
    const row = Number(ids[i]);
    if (!row || row < 2) continue;
    sh.getRange(row, 7).setValue("作廢");
    sh.getRange(row, 1, 1, 8)
      .setFontColor("#cc0000")
      .setFontLine("line-through");
    count++;
  }
  return json({ ok: true, count: count, spreadsheetUrl: punchBook().getUrl() });
}

function handleSetLunch(body) {
  const sh = punchSheet();
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) {
    return String(h || "").trim();
  });
  const iLunch = colIndex(header, "午休");
  const iStatus = colIndex(header, "狀態");
  const lunchCol = iLunch >= 0 ? iLunch + 1 : 8;
  const statusCol = iStatus >= 0 ? iStatus + 1 : 7;
  const items = Array.isArray(body.items) ? body.items : [];
  let count = 0;
  for (let i = 0; i < items.length; i++) {
    const row = Number(items[i].id);
    if (!row || row < 2) continue;
    const current = String(sh.getRange(row, statusCol).getValue() || "").trim();
    if (current === "作廢") continue;
    if (Object.prototype.hasOwnProperty.call(items[i], "lunchHours")) {
      const label = lunchLabel(parseLunchChoice(items[i].lunchHours));
      sh.getRange(row, lunchCol).setValue(label === "" ? "無" : label);
    }
    sh.getRange(row, statusCol).setValue("已確認");
    count++;
  }
  return json({ ok: true, count: count, spreadsheetUrl: punchBook().getUrl() });
}
