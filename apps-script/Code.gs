const PUNCH_SHEET = "打卡";
const STATS_FILE = "員工出勤統計表";
// 試算表網址：https://docs.google.com/spreadsheets/d/這一串/edit
// 若腳本是從 script.google.com 獨立新增的，一定要填。從試算表「擴充功能」打開的可留空。
const SPREADSHEET_ID = "";

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
  if (sh.getLastRow() === 0) {
    sh.appendRow(["時間", "員工", "類型", "區域", "現在時間"]);
  } else {
    sh.getRange(1, 5).setValue("現在時間");
  }
  return sh;
}

function statsSpreadsheet() {
  const files = DriveApp.getFilesByName(STATS_FILE);
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }
  const ss = SpreadsheetApp.create(STATS_FILE);
  return ss;
}

function doGet(e) {
  try {
    const raw = e && e.parameter && e.parameter.payload;
    if (!raw) return json({ ok: false, error: "缺少資料" });
    const body = JSON.parse(raw);
    if (body.action === "punch") return handlePunch(body);
    if (body.action === "stats") return handleStats(body);
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
    return json({ ok: false, error: "未知動作" });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function handlePunch(body) {
  const name = String(body.name || "").trim();
  const type = String(body.type || "").trim();
  const area = String(body.area || "").trim();
  if (!name || !type || !area) {
    return json({ ok: false, error: "缺少姓名、類型或區域" });
  }
  const when = body.at ? new Date(body.at) : new Date();
  const nowText = Utilities.formatDate(when, "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
  punchSheet().appendRow([when, name, type, area, nowText]);
  return json({ ok: true, spreadsheetUrl: punchBook().getUrl() });
}

function emptyRow(name) {
  return {
    name: name,
    punches: 0,
    clockIn: 0,
    clockOut: 0,
    field: 0,
    factory: 0,
    present: false,
  };
}

function handleStats(body) {
  const from = new Date(String(body.from) + "T00:00:00");
  const to = new Date(String(body.to) + "T23:59:59");
  const names = Array.isArray(body.names) ? body.names.map(String) : [];
  if (!body.from || !body.to) {
    return json({ ok: false, error: "請提供起迄日期" });
  }
  if (!names.length) {
    return json({ ok: false, error: "請選擇員工" });
  }

  const byName = {};
  names.forEach(function (n) {
    byName[n] = emptyRow(n);
  });

  const values = punchSheet().getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var when = values[i][0];
    var who = String(values[i][1] || "");
    var type = String(values[i][2] || "");
    var area = String(values[i][3] || "");
    if (!(when instanceof Date)) continue;
    if (when < from || when > to) continue;
    if (!byName[who]) continue;
    var row = byName[who];
    row.punches++;
    if (type === "上班") row.clockIn++;
    if (type === "下班") row.clockOut++;
    if (area === "田間") row.field++;
    if (area === "工廠") row.factory++;
    if (row.clockIn > 0 || row.punches > 0) row.present = true;
  }

  const rows = names.map(function (n) {
    return byName[n];
  });
  const people = rows.filter(function (r) {
    return r.present;
  }).length;

  const ss = statsSpreadsheet();
  const sh = ss.getSheets()[0];
  sh.setName("統計");
  sh.clear();
  sh.appendRow(["報表名稱", STATS_FILE]);
  sh.appendRow(["統計時間", new Date()]);
  sh.appendRow(["出勤起", body.from, "出勤迄", body.to]);
  sh.appendRow(["出勤人數", people]);
  sh.appendRow([]);
  sh.appendRow(["員工", "打卡筆數", "上班", "下班", "田間", "工廠", "有出勤"]);
  rows.forEach(function (r) {
    sh.appendRow([
      r.name,
      r.punches,
      r.clockIn,
      r.clockOut,
      r.field,
      r.factory,
      r.present ? "是" : "否",
    ]);
  });

  return json({
    ok: true,
    people: people,
    rows: rows,
    spreadsheetUrl: ss.getUrl(),
  });
}
