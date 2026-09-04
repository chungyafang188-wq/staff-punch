const LUNCH_START = "12:00:00";
const LUNCH_END = "13:00:00";

function pad2(n) {
  return (n < 10 ? "0" : "") + n;
}

function areaKey(area) {
  const a = String(area || "").trim();
  if (a === "田區") return "田間";
  if (a === "家鑫") return "家鑫調工";
  return a;
}

function parseDayKeyFromText(text) {
  const s = String(text || "")
    .trim()
    .replace(/-/g, "/");
  let m = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return m[1] + "-" + pad2(Number(m[2])) + "-" + pad2(Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + "-" + pad2(Number(m[1])) + "-" + pad2(Number(m[2]));
  m = String(text || "")
    .trim()
    .match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + "-" + pad2(Number(m[2])) + "-" + pad2(Number(m[3]));
  return "";
}

function slashFromDayKey(dayKey) {
  return String(dayKey || "").replace(/-/g, "/");
}

function cellTimeText(timeCell) {
  let t = String(timeCell || "").trim();
  if (/^\d{1,2}:\d{2}$/.test(t)) t += ":00";
  if (t.length > 8) t = t.slice(0, 8);
  return t || "00:00:00";
}

function minuteKey(timeText) {
  return cellTimeText(timeText).slice(0, 5);
}

function taipeiNow() {
  const now = new Date();
  const date = now.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }).replace(/-/g, "/");
  const time = now.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return { date, time };
}

function parseWhen(dateText, timeText) {
  const day = parseDayKeyFromText(dateText);
  const t = cellTimeText(timeText);
  if (!day) return null;
  const when = new Date(day + "T" + t + "+08:00");
  if (isNaN(when.getTime())) return null;
  return when;
}

function formatDate(when) {
  return when.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }).replace(/-/g, "/");
}

function formatTime(when) {
  return when.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatStamp(when) {
  return formatDate(when) + " " + formatTime(when);
}

function roundToHalfHour(when) {
  const datePart = formatDate(when);
  let h = Number(formatTime(when).slice(0, 2));
  const m = Number(formatTime(when).slice(3, 5));
  let nextDay = false;
  let minutes = 0;
  if (m < 15) minutes = 0;
  else if (m < 45) minutes = 30;
  else {
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
    const next = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + 1));
    dateText = next.toISOString().slice(0, 10).replace(/-/g, "/");
  }
  return parseWhen(dateText, pad2(h) + ":" + pad2(minutes) + ":00");
}

function roundHours(value) {
  return Math.round(Number(value) * 100) / 100;
}

function hoursBetween(start, end) {
  const ms = end.getTime() - start.getTime();
  if (!(ms > 0)) return 0;
  return roundHours(ms / 3600000);
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

function clockDupError(keys, batch, name, dateText, area, type, timeText) {
  if (type === "無上班") return "";
  const day = parseDayKeyFromText(dateText);
  const mk = minuteKey(timeText);
  const who = String(name || "").trim();
  const ar = areaKey(area);
  if (!who || !day || !mk) return "";
  const typeKey = who + "|" + day + "|" + ar + "|" + type + "|" + mk;
  const anyKey = who + "|" + day + "|" + ar + "|*" + "|" + mk;
  if (keys[typeKey] || batch[typeKey]) {
    return (
      who +
      " " +
      slashFromDayKey(day) +
      " " +
      (ar === "田間" ? "田區" : ar) +
      " " +
      type +
      " " +
      mk +
      " 已打過，同一時間不能重複計時"
    );
  }
  if (keys[anyKey] || batch[anyKey]) {
    return (
      who +
      " " +
      slashFromDayKey(day) +
      " " +
      (ar === "田間" ? "田區" : ar) +
      " " +
      mk +
      " 已有打卡，同一時間不能再打一筆"
    );
  }
  batch[typeKey] = true;
  batch[anyKey] = true;
  return "";
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
    jiaxinHours: 0,
    days: 0,
    present: false,
  };
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
      if (e.type === "上班") queue.push(e);
      else if (e.type === "下班") {
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

function buildStats(fromKey, toKey, names, events) {
  const from = new Date(String(fromKey) + "T00:00:00+08:00");
  const to = new Date(String(toKey) + "T23:59:59+08:00");
  const inRange = events.filter(function (e) {
    return e.when >= from && e.when <= to;
  });
  const segments = pairSegments(inRange);
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
    const a = areaKey(seg.area);
    if (a === "工廠") row.factoryHours = roundHours(row.factoryHours + seg.hours);
    else if (a === "家鑫調工") row.jiaxinHours = roundHours(row.jiaxinHours + seg.hours);
    else row.fieldHours = roundHours(row.fieldHours + seg.hours);
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
  return {
    people: people,
    lunchStart: LUNCH_START,
    lunchEnd: LUNCH_END,
    rows: rows,
    segments: segments,
  };
}

module.exports = {
  areaKey,
  parseDayKeyFromText,
  slashFromDayKey,
  cellTimeText,
  minuteKey,
  taipeiNow,
  parseWhen,
  formatDate,
  formatTime,
  parseLunchChoice,
  lunchLabel,
  punchStatusForSource,
  clockDupError,
  buildStats,
};
