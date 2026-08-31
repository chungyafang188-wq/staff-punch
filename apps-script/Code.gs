const PUNCH_SHEET = "打卡";
const STATS_FILE = "員工出勤統計表";
// 試算表網址：https://docs.google.com/spreadsheets/d/這一串/edit
// 若腳本是從試算表「擴充功能」打開的可留空。獨立專案一定要填。
const SPREADSHEET_ID = "1vOQs4YooIQN70WfLaR4uwON4nr9urKKLRq-hqBBTLVI";
const TZ = "Asia/Taipei";
const PUNCH_HEADERS = ["日期", "時間", "員工", "類型", "區域", "來源", "狀態", "午休"];
const MAKEUP_LOG_HEADERS = ["登錄時間", "員工", "日期", "類型", "時間", "區域", "午休"];
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

function sheetHeaderRow(sh) {
  const cols = Math.max(1, Math.min(sh.getLastColumn() || 1, 16));
  return sh.getRange(1, 1, 1, cols).getDisplayValues()[0].map(function (h) {
    return String(h || "").trim();
  });
}

function isMakeupLogSheet(sh) {
  return sh.getName() === "補打登錄";
}

function headerLooksLikePunch(header) {
  const joined = header.join("|");
  if (joined.indexOf("登錄時間") >= 0) return false;
  function has(name) {
    for (let i = 0; i < header.length; i++) {
      if (String(header[i] || "").trim() === name) return true;
    }
    return false;
  }
  return has("日期") && (has("員工") || has("姓名"));
}

function allPunchSheets(ss) {
  const sheets = ss.getSheets();
  const out = [];
  for (let i = 0; i < sheets.length; i++) {
    const sh = sheets[i];
    if (isMakeupLogSheet(sh)) continue;
    if (sh.getName() === "工時明細" || sh.getName() === "人別時數") continue;
    if (headerLooksLikePunch(sheetHeaderRow(sh))) out.push(sh);
  }
  out.sort(function (a, b) {
    return b.getLastRow() - a.getLastRow();
  });
  return out;
}

function punchSheet() {
  const ss = punchBook();
  const log = ss.getSheetByName("補打登錄");
  if (log) {
    log.getRange(1, 1, 1, MAKEUP_LOG_HEADERS.length).setValues([MAKEUP_LOG_HEADERS]);
  }
  const candidates = allPunchSheets(ss).filter(function (sh) {
    return sh.getLastRow() > 1;
  });
  if (candidates.length) {
    ensurePunchHeaders(candidates[0]);
    return candidates[0];
  }
  let sh = ss.getSheetByName(PUNCH_SHEET);
  if (!sh) sh = ss.insertSheet(PUNCH_SHEET);
  ensurePunchHeaders(sh);
  return sh;
}

function parseRowRef(id) {
  const s = String(id || "");
  const m = s.match(/^(.*):(\d+)$/);
  if (m) return { name: m[1], row: Number(m[2]) };
  return { name: "", row: Number(s) };
}

function sheetByNameOrPunch(name) {
  const ss = punchBook();
  if (name) {
    const sh = ss.getSheetByName(name);
    if (sh) return sh;
  }
  return punchSheet();
}

function ensurePunchHeaders(sh) {
  if (isMakeupLogSheet(sh)) return;
  let header = sheetHeaderRow(sh);
  if (!headerLooksLikePunch(header)) {
    if (sh.getLastRow() > 1) return;
    sh.getRange(1, 1, 1, PUNCH_HEADERS.length).setValues([PUNCH_HEADERS]);
    sh.getRange("A:B").setNumberFormat("@");
    return;
  }
  ["來源", "狀態", "午休"].forEach(function (name) {
    header = sheetHeaderRow(sh);
    if (colIndex(header, name) >= 0) return;
    sh.getRange(1, sh.getLastColumn() + 1).setValue(name);
  });
}

function areaKey(area) {
  const a = String(area || "").trim();
  if (a === "田區") return "田間";
  return a;
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

function parseBody(raw) {
  let body = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (typeof body === "string") body = JSON.parse(body);
  return body || {};
}

function dispatch(body) {
  const action = String((body && (body.action || body.cmd)) || "").trim();
  if (action === "punch") return handlePunch(body);
  if (action === "stats") return handleStats(body);
  if (action === "listPunches") return handleListPunches(body);
  if (action === "voidPunch") return handleVoidPunch(body);
  if (action === "setLunch" || action === "setlunch" || action === "confirm") {
    return handleSetLunch(body);
  }
  if (action === "ping") return json({ ok: true, version: "setLunch-20260831" });
  return json({
    ok: false,
    error:
      "未知動作：" +
      (action || "空") +
      "。請把完整 Code.gs 貼上後，對「網頁應用程式」按新版本（不要用程式庫網址）",
  });
}

function doGet(e) {
  try {
    const raw = e && e.parameter && e.parameter.payload;
    if (!raw) return json({ ok: false, error: "缺少資料" });
    return dispatch(parseBody(raw));
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw && e && e.parameter && e.parameter.payload) {
      return dispatch(parseBody(e.parameter.payload));
    }
    if (!raw) return json({ ok: false, error: "缺少資料" });
    return dispatch(parseBody(raw));
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
  if (!isNaN(parsed.getTime())) return parsed;
  const dm = d.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  const tm = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!dm || !tm) return null;
  return new Date(
    Number(dm[1]),
    Number(dm[2]) - 1,
    Number(dm[3]),
    Number(tm[1]),
    Number(tm[2]),
    Number(tm[3] || 0),
  );
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
  writePunchCells(sh, formatDate(when), formatTime(when), name, type, area, source, lunchHours);
}

function writePunchCells(sh, dateText, timeText, name, type, area, source, lunchHours) {
  ensurePunchHeaders(sh);
  const header = sheetHeaderRow(sh);
  const src = source || "員工打卡";
  const lunchText = type === "上班" && lunchHours != null ? lunchLabel(lunchHours) : "";
  const width = Math.max(sh.getLastColumn(), PUNCH_HEADERS.length);
  const line = [];
  for (let i = 0; i < width; i++) line.push("");
  function put(colName, value, fallback) {
    let i = colIndex(header, colName);
    if (i < 0) i = fallback;
    if (i < 0) return;
    while (line.length <= i) line.push("");
    line[i] = value;
  }
  put("日期", dateText, 0);
  put("時間", timeText, 1);
  put("員工", name, 2);
  if (colIndex(header, "員工") < 0) put("姓名", name, 2);
  put("類型", type, 3);
  put("區域", areaKey(area), 4);
  put("來源", src, 5);
  put("狀態", punchStatusForSource(src), 6);
  put("午休", lunchText, 7);
  sh.appendRow(line);
}

function parseDayKeyFromText(text) {
  const s = String(text || "")
    .trim()
    .replace(/-/g, "/");
  let m = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return m[1] + "-" + pad2(Number(m[2])) + "-" + pad2(Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + "-" + pad2(Number(m[1])) + "-" + pad2(Number(m[2]));
  return "";
}

function cellDayKey(dateCell, displayText) {
  const fromDisplay = parseDayKeyFromText(displayText);
  if (fromDisplay) return fromDisplay;
  if (dateCell instanceof Date) {
    return Utilities.formatDate(dateCell, TZ, "yyyy-MM-dd");
  }
  if (typeof dateCell === "number" && dateCell > 20000 && dateCell < 80000) {
    const utc = new Date(Math.round((dateCell - 25569) * 86400 * 1000));
    return Utilities.formatDate(utc, "UTC", "yyyy-MM-dd");
  }
  return parseDayKeyFromText(dateCell);
}

function cellTimeText(timeCell) {
  if (timeCell instanceof Date) return formatTime(timeCell);
  let t = String(timeCell || "").trim();
  if (/^\d{1,2}:\d{2}$/.test(t)) t += ":00";
  return t || "00:00:00";
}

function slashFromDayKey(dayKey) {
  return String(dayKey || "").replace(/-/g, "/");
}

function minuteKey(timeText) {
  const t = cellTimeText(timeText);
  return t.slice(0, 5);
}

function loadExistingClockKeys(sh) {
  const keys = {};
  const range = sh.getDataRange();
  const values = range.getValues();
  const displays = range.getDisplayValues();
  if (values.length < 2) return keys;
  const header = (displays[0] || []).map(function (h) {
    return String(h || "").trim();
  });
  const iDate = colIndex(header, "日期");
  const iTime = colIndex(header, "時間");
  const iName = colIndex(header, "員工") >= 0 ? colIndex(header, "員工") : colIndex(header, "姓名");
  const iType = colIndex(header, "類型");
  const iArea = colIndex(header, "區域");
  const iStatus = colIndex(header, "狀態");
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const type = String(row[iType >= 0 ? iType : 2] || "").trim();
    if (type === "無上班") continue;
    const st = iStatus >= 0 ? String(row[iStatus] || "").trim() : "";
    if (st === "作廢") continue;
    const who = String(row[iName >= 0 ? iName : 1] || "").trim();
    const dateIdx = iDate >= 0 ? iDate : 0;
    const day = cellDayKey(row[dateIdx], displays[i] ? displays[i][dateIdx] : "");
    const timeIdx = iTime >= 0 ? iTime : 1;
    const mk = minuteKey(row[timeIdx]);
    if (!who || !day || !mk) continue;
    const area = areaKey(row[iArea >= 0 ? iArea : 3]);
    keys[who + "|" + day + "|" + area + "|" + type + "|" + mk] = true;
    keys[who + "|" + day + "|" + area + "|*" + "|" + mk] = true;
  }
  return keys;
}

function clockDupError(keys, batch, name, dateText, area, type, timeText) {
  if (type === "無上班") return "";
  const day = cellDayKey(dateText, dateText) || parseDayKeyFromText(dateText);
  const mk = minuteKey(timeText);
  const who = String(name || "").trim();
  const ar = areaKey(area);
  if (!who || !day || !mk) return "";
  const typeKey = who + "|" + day + "|" + ar + "|" + type + "|" + mk;
  const anyKey = who + "|" + day + "|" + ar + "|*" + "|" + mk;
  if (keys[typeKey] || batch[typeKey]) {
    return who + " " + slashFromDayKey(day) + " " + (ar === "田間" ? "田區" : ar) + " " + type + " " + mk + " 已打過，同一時間不能重複計時";
  }
  if (keys[anyKey] || batch[anyKey]) {
    return who + " " + slashFromDayKey(day) + " " + (ar === "田間" ? "田區" : ar) + " " + mk + " 已有打卡，同一時間不能再打一筆";
  }
  batch[typeKey] = true;
  batch[anyKey] = true;
  return "";
}

function handlePunch(body) {
  const source = String(body.source || "員工打卡").trim();
  const sh = punchSheet();
  const names = Array.isArray(body.names) && body.names.length ? body.names.map(String) : [String(body.name || "").trim()];
  const dayEntries = Array.isArray(body.dayEntries) ? body.dayEntries : null;
  let wrote = 0;

  if (dayEntries && dayEntries.length) {
    const keys = loadExistingClockKeys(sh);
    const batch = {};
    for (let d = 0; d < dayEntries.length; d++) {
      const day = dayEntries[d];
      const dateText = String(day.date || "").trim();
      const entries = Array.isArray(day.entries) ? day.entries : [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const type = String(entry.type || "").trim();
        const area = String(entry.area || body.area || (type === "無上班" ? "－" : "")).trim();
        const timeText = String(entry.time || "").trim();
        for (let n = 0; n < names.length; n++) {
          const who = String(names[n] || "").trim();
          if (!who) continue;
          const dup = clockDupError(keys, batch, who, dateText, area, type, timeText);
          if (dup) return json({ ok: false, error: dup });
        }
      }
    }
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
        if (!type) continue;
        if (type !== "無上班" && !area) continue;
        const timeText = String(entry.time || (when ? formatTime(when) : "00:00:00")).trim();
        const dateOut = dateText.replace(/-/g, "/");
        if (!dateOut) continue;
        for (let n = 0; n < names.length; n++) {
          const who = String(names[n] || "").trim();
          if (!who) continue;
          writePunchCells(sh, dateOut, timeText, who, type, area, source, lunchHours);
          wrote++;
        }
      }
    }
    if (source === "會計補打卡") logMakeupToStats(names, dayEntries);
    return json({
      ok: true,
      count: wrote,
      sheetName: sh.getName(),
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
  const dateText = String(body.date || "").trim().replace(/-/g, "/");
  const timeText = String(body.time || "").trim();
  if (dateText && timeText) {
    const keys = loadExistingClockKeys(sh);
    const dup = clockDupError(keys, {}, name, dateText, area, type, timeText);
    if (dup) return json({ ok: false, error: dup });
    writePunchCells(sh, dateText, /^\d{1,2}:\d{2}$/.test(timeText) ? timeText + ":00" : timeText, name, type, area, source);
  } else {
    const when = body.at ? new Date(body.at) : new Date();
    const keys = loadExistingClockKeys(sh);
    const dup = clockDupError(keys, {}, name, formatDate(when), area, type, formatTime(when));
    if (dup) return json({ ok: false, error: dup });
    writePunchRow(sh, when, name, type, area, source);
  }
  return json({ ok: true, count: 1, sheetName: sh.getName(), spreadsheetUrl: punchBook().getUrl() });
}

function makeupLogSheet() {
  const ss = statsSpreadsheet();
  let sh = ss.getSheetByName("補打登錄");
  if (!sh) sh = ss.insertSheet("補打登錄");
  sh.getRange(1, 1, 1, MAKEUP_LOG_HEADERS.length).setValues([MAKEUP_LOG_HEADERS]);
  return sh;
}

function logMakeupToStats(names, dayEntries) {
  const sh = makeupLogSheet();
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

function collectPunchRowsFromSheet(sh, fromKey, toKey, nameSet) {
  const range = sh.getDataRange();
  const values = range.getValues();
  const displays = range.getDisplayValues();
  const header = (displays[0] || []).map(function (h) {
    return String(h || "").trim();
  });
  const iStatus = colIndex(header, "狀態");
  const iName = colIndex(header, "員工") >= 0 ? colIndex(header, "員工") : colIndex(header, "姓名");
  const iDate = colIndex(header, "日期");
  const iTime = colIndex(header, "時間");
  const iType = colIndex(header, "類型");
  const iArea = colIndex(header, "區域");
  const iSource = colIndex(header, "來源");
  const iLunch = colIndex(header, "午休");
  const rows = [];
  const sheetName = sh.getName();
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const who = String(row[iName >= 0 ? iName : 1] || "").trim();
    if (nameSet && !nameSet[who]) continue;
    const dateIdx = iDate >= 0 ? iDate : 0;
    const dayKey = cellDayKey(row[dateIdx], displays[i] ? displays[i][dateIdx] : "");
    if (!dayKey) continue;
    if (dayKey < fromKey || dayKey > toKey) continue;
    const timeCell = iTime >= 0 ? row[iTime] : "";
    const timeDisplay = iTime >= 0 && displays[i] ? displays[i][iTime] : "";
    rows.push({
      id: sheetName + ":" + (i + 1),
      date: slashFromDayKey(dayKey),
      time: cellTimeText(timeCell) || cellTimeText(timeDisplay),
      name: who,
      type: String(row[iType >= 0 ? iType : 2] || "").trim(),
      area: areaKey(String(row[iArea >= 0 ? iArea : 3] || "")),
      source: iSource >= 0 ? String(row[iSource] || "") : "",
      status: iStatus >= 0 ? String(row[iStatus] || "") : "",
      lunch: iLunch >= 0 ? String(row[iLunch] || "") : "",
      sheetName: sheetName,
    });
  }
  return { rows: rows, scanned: Math.max(0, values.length - 1), sheetName: sheetName };
}

function handleListPunches(body) {
  if (!body.from || !body.to) {
    return json({ ok: false, error: "請提供起迄日期" });
  }
  const names = Array.isArray(body.names) ? body.names.map(String) : [];
  const fromKey = String(body.from);
  const toKey = String(body.to);
  const nameSet = {};
  names.forEach(function (n) {
    nameSet[n] = true;
  });
  let sheets = allPunchSheets(punchBook()).filter(function (sh) {
    return sh.getLastRow() > 1;
  });
  if (!sheets.length) sheets = [punchSheet()];
  const rows = [];
  const sheetNames = [];
  let scanned = 0;
  for (let s = 0; s < sheets.length; s++) {
    const got = collectPunchRowsFromSheet(sheets[s], fromKey, toKey, names.length ? nameSet : null);
    sheetNames.push(got.sheetName);
    scanned += got.scanned;
    for (let r = 0; r < got.rows.length; r++) rows.push(got.rows[r]);
  }
  return json({
    ok: true,
    rows: rows,
    sheetName: sheetNames.join("、"),
    scanned: scanned,
    spreadsheetUrl: punchBook().getUrl(),
  });
}

function handleVoidPunch(body) {
  const ids = Array.isArray(body.ids) ? body.ids : [];
  let count = 0;
  for (let i = 0; i < ids.length; i++) {
    const ref = parseRowRef(ids[i]);
    if (!ref.row || ref.row < 2) continue;
    const sh = sheetByNameOrPunch(ref.name);
    const header = sheetHeaderRow(sh);
    const iStatus = colIndex(header, "狀態");
    const statusCol = iStatus >= 0 ? iStatus + 1 : 7;
    sh.getRange(ref.row, statusCol).setValue("作廢");
    sh.getRange(ref.row, 1, 1, Math.max(8, sh.getLastColumn()))
      .setFontColor("#cc0000")
      .setFontLine("line-through");
    count++;
  }
  return json({ ok: true, count: count, spreadsheetUrl: punchBook().getUrl() });
}

function confirmSheetRows(sh, items) {
  if (isMakeupLogSheet(sh)) return 0;
  ensurePunchHeaders(sh);
  const header = sheetHeaderRow(sh);
  const iLunch = colIndex(header, "午休");
  const iStatus = colIndex(header, "狀態");
  const iDate = colIndex(header, "日期");
  const iName = colIndex(header, "員工") >= 0 ? colIndex(header, "員工") : colIndex(header, "姓名");
  const iArea = colIndex(header, "區域");
  const iType = colIndex(header, "類型");
  const lunchCol = iLunch >= 0 ? iLunch + 1 : 8;
  const statusCol = iStatus >= 0 ? iStatus + 1 : 7;
  let count = 0;
  const confirmedRows = [];
  for (let i = 0; i < items.length; i++) {
    const row = items[i].row;
    if (!row || row < 2) continue;
    const current = String(sh.getRange(row, statusCol).getValue() || "").trim();
    if (current === "作廢") continue;
    if (Object.prototype.hasOwnProperty.call(items[i], "lunchHours")) {
      const label = lunchLabel(parseLunchChoice(items[i].lunchHours));
      sh.getRange(row, lunchCol).setValue(label === "" ? "無" : label);
    }
    sh.getRange(row, statusCol).setValue("已確認");
    confirmedRows.push(row);
    count++;
  }
  if (confirmedRows.length && iDate >= 0 && iName >= 0 && iArea >= 0 && iType >= 0) {
    const values = sh.getDataRange().getValues();
    const displays = sh.getDataRange().getDisplayValues();
    const keys = {};
    confirmedRows.forEach(function (r) {
      const row = values[r - 1];
      if (!row) return;
      const day = cellDayKey(row[iDate], displays[r - 1] ? displays[r - 1][iDate] : "");
      keys[day + "|" + String(row[iName] || "").trim() + "|" + areaKey(row[iArea])] = true;
    });
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const type = String(row[iType] || "").trim();
      if (type !== "上班" && type !== "下班") continue;
      const st = String(iStatus >= 0 ? row[iStatus] || "" : "").trim();
      if (st === "作廢" || st === "已確認") continue;
      const day = cellDayKey(row[iDate], displays[i] ? displays[i][iDate] : "");
      const key = day + "|" + String(row[iName] || "").trim() + "|" + areaKey(row[iArea]);
      if (!keys[key]) continue;
      sh.getRange(i + 1, statusCol).setValue("已確認");
      count++;
    }
  }
  return count;
}

function handleSetLunch(body) {
  const items = Array.isArray(body.items) ? body.items : [];
  const bySheet = {};
  for (let i = 0; i < items.length; i++) {
    const ref = parseRowRef(items[i].id);
    if (!ref.row || ref.row < 2) continue;
    const key = ref.name || PUNCH_SHEET;
    if (!bySheet[key]) bySheet[key] = [];
    const packed = { row: ref.row };
    if (Object.prototype.hasOwnProperty.call(items[i], "lunchHours")) {
      packed.lunchHours = items[i].lunchHours;
    }
    bySheet[key].push(packed);
  }
  let count = 0;
  const names = Object.keys(bySheet);
  for (let i = 0; i < names.length; i++) {
    count += confirmSheetRows(sheetByNameOrPunch(names[i]), bySheet[names[i]]);
  }
  return json({ ok: true, count: count, spreadsheetUrl: punchBook().getUrl() });
}
