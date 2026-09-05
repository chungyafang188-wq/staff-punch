const makeupNamesEl = document.getElementById("makeup-names");
const makeupStatusEl = document.getElementById("makeup-status");
const makeupDateEl = document.getElementById("makeup-date");
const makeupFromEl = document.getElementById("makeup-from");
const makeupToEl = document.getElementById("makeup-to");
const makeupRangeWrap = document.getElementById("makeup-range-wrap");
const incompleteWrap = document.getElementById("incomplete-wrap");
const rosterWrap = document.getElementById("roster-wrap");
const makeupWeekEl = document.getElementById("makeup-week");
const dayLabel = document.getElementById("day-label");
const weekLabel = document.getElementById("week-label");
const weekSpan = document.getElementById("week-span");
const weekGridEl = document.getElementById("week-grid");
const dayTimesEl = document.getElementById("day-times");
const shiftListEl = document.getElementById("shift-list");
const makeupLinksEl = document.getElementById("makeup-links");
const scriptInput = document.getElementById("scriptUrl");
const makeupSelected = new Set();
let makeupRange = "day";
let makeupView = "range";
let weekDays = [];
let rosterRows = [];
let rangeRows = [];

const NEED_ITEMS = [
  ["田間", "上班"],
  ["田間", "下班"],
  ["工廠", "上班"],
  ["工廠", "下班"],
  ["家鑫調工", "上班"],
  ["家鑫調工", "下班"],
];
const NOON_SEC = 12 * 3600;

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function todayTaipei() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

function isoFromLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysIso(iso, n) {
  const d = new Date((iso || todayTaipei()) + "T12:00:00");
  d.setDate(d.getDate() + n);
  return isoFromLocalDate(d);
}

function eachIso(from, to) {
  const out = [];
  const start = new Date(from + "T12:00:00");
  const end = new Date(to + "T12:00:00");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(isoFromLocalDate(d));
  }
  return out;
}

function weekDaysFrom(isoDate) {
  const d = new Date(isoDate + "T12:00:00");
  const dow = d.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    days.push({
      iso: isoFromLocalDate(x),
      label: WEEKDAY_LABELS[i],
    });
  }
  return days;
}

function slashDate(iso) {
  return String(iso).replace(/-/g, "/");
}

function renumberShifts(list) {
  const cards = [...list.querySelectorAll(".shift-card")];
  cards.forEach((card, i) => {
    card.querySelector(".shift-label").textContent = `第${i + 1}筆上下班`;
    const remove = card.querySelector(".shift-remove");
    if (remove) remove.hidden = cards.length === 1;
  });
}

function makeShiftCard() {
  const wrap = document.createElement("div");
  wrap.className = "shift-card";
  wrap.innerHTML = `
    <div class="shift-head">
      <span class="shift-label">第1筆上下班</span>
      <button type="button" class="shift-remove">移除</button>
    </div>
    <div class="row">
      <button type="button" class="choice" data-shift-area="田間">田間</button>
      <button type="button" class="choice" data-shift-area="工廠">工廠</button>
    </div>
    <p class="hint">午休</p>
    <div class="row lunch-row">
      <button type="button" class="choice on" data-lunch="0">無</button>
      <button type="button" class="choice" data-lunch="0.5">0.5小時</button>
      <button type="button" class="choice" data-lunch="1">1小時</button>
    </div>
    <div class="field-grid">
      <label>上班
        <input class="shift-in" type="text" autocomplete="off" placeholder="例如 8:00 或 0800" />
      </label>
      <label>下班
        <input class="shift-out" type="text" autocomplete="off" placeholder="例如 17:00 或 1700" />
      </label>
    </div>`;
  wrap.querySelectorAll("[data-shift-area]").forEach((btn) => {
    btn.addEventListener("click", () => {
      wrap.dataset.area = btn.getAttribute("data-shift-area") || "";
      wrap.querySelectorAll("[data-shift-area]").forEach((el) => {
        el.classList.toggle("on", el === btn);
      });
    });
  });
  wrap.dataset.lunch = "0";
  wrap.querySelectorAll("[data-lunch]").forEach((btn) => {
    btn.addEventListener("click", () => {
      wrap.dataset.lunch = btn.getAttribute("data-lunch") || "0";
      wrap.querySelectorAll("[data-lunch]").forEach((el) => {
        el.classList.toggle("on", el === btn);
      });
    });
  });
  wrap.querySelector(".shift-remove").addEventListener("click", () => {
    const list = wrap.parentElement;
    if (list.querySelectorAll(".shift-card").length <= 1) return;
    wrap.remove();
    renumberShifts(list);
  });
  return wrap;
}

function collectCard(card) {
  const area = card.dataset.area || "";
  const inEl = card.querySelector(".shift-in");
  const outEl = card.querySelector(".shift-out");
  const inRaw = inEl.value.trim();
  const outRaw = outEl.value.trim();
  if (!inRaw && !outRaw) return { entries: [] };
  if (!area) return { error: "請選擇這一筆的區域" };
  const clockIn = parseTypedTime(inRaw);
  const clockOut = parseTypedTime(outRaw);
  if (inRaw && !clockIn) return { error: "上班時間請打 8:00 或 0800" };
  if (outRaw && !clockOut) return { error: "下班時間請打 17:00 或 1700" };
  const lunchHours = Number(card.dataset.lunch || 0);
  const entries = [
    clockIn ? { type: "上班", time: clockIn, area, lunchHours } : null,
    clockOut ? { type: "下班", time: clockOut, area } : null,
  ].filter(Boolean);
  return { entries };
}

function collectList(list) {
  const all = [];
  const cards = [...list.querySelectorAll(".shift-card")];
  for (let i = 0; i < cards.length; i++) {
    const parsed = collectCard(cards[i]);
    if (parsed.error) return { error: `第${i + 1}筆：${parsed.error}` };
    all.push(...parsed.entries);
  }
  return { entries: all };
}

function renderWeekGrid() {
  const iso = makeupWeekEl.value || todayTaipei();
  weekDays = weekDaysFrom(iso);
  weekGridEl.innerHTML = "";
  weekDays.forEach((day) => {
    const row = document.createElement("div");
    row.className = "week-day";
    const title = document.createElement("span");
    title.className = "week-day-title";
    title.textContent = `週${day.label} ${slashDate(day.iso)}`;
    const list = document.createElement("div");
    list.className = "day-shifts";
    list.dataset.iso = day.iso;
    list.append(makeShiftCard());
    renumberShifts(list);
    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-shift";
    add.textContent = "再加一筆上下班";
    add.addEventListener("click", () => {
      list.append(makeShiftCard());
      renumberShifts(list);
    });
    row.append(title, list, add);
    weekGridEl.append(row);
  });
  weekSpan.textContent = `本週 ${slashDate(weekDays[0].iso)}－${slashDate(weekDays[6].iso)}。同一天可加第二筆上下班；沒填的天不登錄。`;
}

function ensureDayShifts() {
  if (!shiftListEl.querySelector(".shift-card")) {
    shiftListEl.append(makeShiftCard());
    renumberShifts(shiftListEl);
  }
}

function syncRange() {
  const isWeek = makeupRange === "week";
  weekLabel.hidden = !isWeek;
  weekGridEl.hidden = !isWeek;
  weekSpan.hidden = !isWeek;
  dayTimesEl.hidden = true;
  if (isWeek) renderWeekGrid();
  else ensureDayShifts();
  syncMakeupViewUi();
  if (makeupView === "range") loadIncomplete().catch(() => {});
  else loadRoster().catch(() => {});
}

function rememberedMakeupDate() {
  const saved = (localStorage.getItem("punch-makeup-date") || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(saved)) return saved;
  return todayTaipei();
}

function rememberMakeupDate(iso) {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    localStorage.setItem("punch-makeup-date", iso);
  }
}

makeupDateEl.value = rememberedMakeupDate();
makeupWeekEl.value = makeupDateEl.value || todayTaipei();
if (makeupFromEl) makeupFromEl.value = addDaysIso(makeupDateEl.value || todayTaipei(), -6);
if (makeupToEl) makeupToEl.value = makeupDateEl.value || todayTaipei();
syncRange();
scriptInput.value = scriptUrl();
document.getElementById("saveUrl").addEventListener("click", () => {
  localStorage.setItem("punch-script-url", scriptInput.value.trim());
  setStatus(makeupStatusEl, "已儲存腳本網址", "ok");
});

makeupWeekEl.addEventListener("change", () => {
  renderWeekGrid();
});
makeupDateEl.addEventListener("change", () => {
  rememberMakeupDate(makeupDateEl.value);
  if (makeupView === "day") loadRoster().catch(() => {});
});
if (makeupFromEl) {
  makeupFromEl.addEventListener("change", () => {
    if (!makeupToEl.value || makeupToEl.value < makeupFromEl.value) makeupToEl.value = makeupFromEl.value;
    if (makeupView === "range") loadIncomplete().catch(() => {});
  });
}
if (makeupToEl) {
  makeupToEl.addEventListener("change", () => {
    if (makeupView === "range") loadIncomplete().catch(() => {});
  });
}
document.getElementById("add-shift").addEventListener("click", () => {
  shiftListEl.append(makeShiftCard());
  renumberShifts(shiftListEl);
});

function scrollToInputArea() {
  const target = document.getElementById("makeup-input");
  if (!target) return;
  setTimeout(() => {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 80);
}

STAFF.forEach((person) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "chip";
  btn.textContent = person;
  btn.addEventListener("click", () => {
    if (makeupSelected.has(person)) makeupSelected.delete(person);
    else makeupSelected.add(person);
    if (!makeupDateEl.value) {
      makeupDateEl.value = (makeupToEl && makeupToEl.value) || todayTaipei();
    }
    paintStaffChips();
    if (makeupView === "range") {
      loadIncomplete({ scroll: true }).catch((err) => {
        setStatus(makeupStatusEl, err instanceof Error ? err.message : "無法連線", "err");
      });
      return;
    }
    const who = [...makeupSelected].join("、");
    setStatus(makeupStatusEl, who ? "正在載入 " + who + " 的打卡…" : "請再點選員工");
    loadRoster({ scroll: true }).catch((err) => {
      setStatus(makeupStatusEl, err instanceof Error ? err.message : "無法連線", "err");
    });
  });
  makeupNamesEl.append(btn);
});

const makeupAllBtn = document.createElement("button");
makeupAllBtn.type = "button";
makeupAllBtn.className = "chip";
makeupAllBtn.dataset.staffAll = "1";
makeupAllBtn.textContent = "全選";
makeupAllBtn.addEventListener("click", () => {
  const allOn = makeupSelected.size === STAFF.length;
  makeupSelected.clear();
  if (!allOn) STAFF.forEach((person) => makeupSelected.add(person));
  paintStaffChips();
  if (makeupView === "range") loadIncomplete({ scroll: true }).catch(() => {});
  else loadRoster({ scroll: true }).catch(() => {});
});
makeupNamesEl.prepend(makeupAllBtn);

document.querySelectorAll("[data-makeup-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    makeupView = btn.getAttribute("data-makeup-view") || "day";
    syncMakeupViewUi();
    if (makeupView === "range") loadIncomplete().catch(() => {});
    else loadRoster().catch(() => {});
  });
});

document.querySelectorAll("[data-kind='range']").forEach((btn) => {
  btn.addEventListener("click", () => {
    makeupRange = btn.getAttribute("data-value") || "week";
    document.querySelectorAll("[data-kind='range']").forEach((el) => {
      el.classList.toggle("on", el === btn);
    });
    syncRange();
  });
});

document.getElementById("makeup-submit").addEventListener("click", async () => {
  if (makeupSelected.size === 0) {
    setStatus(makeupStatusEl, "請先點選人名", "err");
    return;
  }

  let dayEntries = [];
  if (makeupRange === "week") {
    for (const day of weekDays) {
      const list = weekGridEl.querySelector(`.day-shifts[data-iso="${day.iso}"]`);
      const parsed = collectList(list);
      if (parsed.error) {
        setStatus(makeupStatusEl, `週${day.label} ${parsed.error}`, "err");
        return;
      }
      if (parsed.entries.length) {
        dayEntries.push({ date: slashDate(day.iso), entries: parsed.entries });
      }
    }
    if (!dayEntries.length) {
      setStatus(makeupStatusEl, "請至少有一天填寫一筆上下班", "err");
      return;
    }
  } else {
    if (!makeupDateEl.value) {
      setStatus(makeupStatusEl, "請填補打日期", "err");
      return;
    }
    const parsed = collectList(shiftListEl);
    if (parsed.error) {
      setStatus(makeupStatusEl, parsed.error, "err");
      return;
    }
    if (!parsed.entries.length) {
      setStatus(makeupStatusEl, "請至少填一筆上班或下班時間", "err");
      return;
    }
    dayEntries = [{ date: slashDate(makeupDateEl.value), entries: parsed.entries }];
  }

  setStatus(makeupStatusEl, "正在寫入 Google 雲端…");
  makeupLinksEl.innerHTML = "";
  try {
    const stamp = taipeiDateTime();
    const names = [...makeupSelected];
    let wrote = 0;
    let lastData = null;
    for (const day of dayEntries) {
      lastData = await postScript({
        action: "punch",
        names,
        name: names[0],
        type: day.entries[0].type,
        area: day.entries[0].area,
        source: "會計補打卡",
        at: stamp.at,
        date: day.date,
        time: day.entries[0].time,
        entries: day.entries,
        dayEntries: [day],
      });
    wrote += Number(lastData && lastData.count) || 0;
    }
    rememberMakeupDate(makeupDateEl.value);
    const who = names.join("、");
    if (!wrote) {
      setStatus(makeupStatusEl, who + " 沒有寫入任何列。請把最新 Code.gs 發新版本後再補登。", "err");
      return;
    }
    setStatus(
      makeupStatusEl,
      lastData && lastData.preview
        ? `${who} 畫面已選好，但尚未連到 Google。`
        : `${who} 已存進「${lastData.sheetName || "打卡"}」共 ${wrote} 筆。`,
      "ok",
    );
    if (lastData && (lastData.spreadsheetUrl || lastData.statsSpreadsheetUrl)) {
      const punch = lastData.spreadsheetUrl
        ? `<p><a href="${lastData.spreadsheetUrl}" target="_blank" rel="noreferrer">開啟打卡試算表</a></p>`
        : "";
      const stats = lastData.statsSpreadsheetUrl
        ? `<p><a href="${lastData.statsSpreadsheetUrl}" target="_blank" rel="noreferrer">開啟員工出勤統計表（補打登錄）</a></p>`
        : "";
      makeupLinksEl.innerHTML = punch + stats;
    }
    makeupView = "day";
    syncMakeupViewUi();
    await loadRoster();
  } catch (err) {
    setStatus(makeupStatusEl, err instanceof Error ? err.message : "送出失敗", "err");
  }
});

const existingWrap = document.getElementById("existing-wrap");
const confirmPayBtn = document.getElementById("confirm-pay");
let existingPairs = [];

function currentDateBounds() {
  if (makeupRange === "week") {
    if (!weekDays.length) {
      weekDays = weekDaysFrom(makeupWeekEl.value || todayTaipei());
    }
    return { from: weekDays[0].iso, to: weekDays[6].iso };
  }
  const d = makeupDateEl.value || todayTaipei();
  return { from: d, to: d };
}

function pairSelfPunches(rows) {
  const clean = rows
    .filter((row) => String(row.type || "").trim() !== "無上班")
    .filter((row) => String(row.status || "").trim() !== "作廢")
    .filter((row) => String(row.source || "") !== "會計補打卡")
    .slice()
    .sort((a, b) => String(a.date + " " + a.time).localeCompare(String(b.date + " " + b.time)));
  const byKey = {};
  clean.forEach((row) => {
    const area = String(row.area || "").trim() || "未選區域";
    const key = String(row.name || "") + "|" + area;
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(row);
  });
  const pairs = [];
  Object.keys(byKey).forEach((key) => {
    const name = key.split("|")[0];
    const queue = [];
    byKey[key].forEach((row) => {
      const kind = String(row.type || "").trim();
      if (kind === "上班") queue.push(row);
      else if (kind === "下班") {
        const open = queue.shift();
        if (open) pairs.push(makePair(name, open, row));
        else pairs.push(makePair(name, null, row));
      }
    });
    queue.forEach((open) => {
      pairs.push(makePair(name, open, null));
    });
  });
  return pairs;
}

function makePair(name, open, close) {
  if (!open && close) {
    return {
      inId: "",
      outId: close.id,
      name,
      date: close.date,
      area: close.area || "",
      inTime: "",
      outTime: close.time,
      payIn: "",
      payOut: roundPayTime(close.time),
      lunch: "無",
      inStatus: "",
      outStatus: String(close.status || "").trim(),
    };
  }
  return {
    inId: open.id,
    outId: close ? close.id : "",
    name,
    date: open.date,
    area: open.area || (close && close.area) || "",
    inTime: open.time,
    outTime: close ? close.time : "",
    payIn: roundPayTime(open.time),
    payOut: close ? roundPayTime(close.time) : "",
    lunch: guessedLunchFromTimes(open.time, close && close.time),
    inStatus: String(open.status || "").trim(),
    outStatus: close ? String(close.status || "").trim() : "",
  };
}

function isPendingPair(pair) {
  if (pair.inStatus !== "已確認") return true;
  if (pair.outId && pair.outStatus !== "已確認") return true;
  return false;
}

function timeToSec(text) {
  const t = parseTypedTime(text);
  if (!t) return null;
  return Number(t.slice(0, 2)) * 3600 + Number(t.slice(3, 5)) * 60 + Number(t.slice(6, 8) || 0);
}

function crossesNoon(inTime, outTime) {
  const start = timeToSec(inTime);
  const end = timeToSec(outTime);
  if (start == null || end == null) return false;
  return start < NOON_SEC && end > NOON_SEC;
}

function guessedLunchFromTimes(inTime, outTime) {
  return crossesNoon(inTime, outTime) ? "1" : "無";
}

function sameArea(a, b) {
  const n = (x) => {
    let s = String(x || "").trim();
    if (s === "田區") s = "田間";
    if (s === "家鑫") s = "家鑫調工";
    return s;
  };
  return n(a) === n(b);
}

function isPendingPunchRow(row) {
  const st = String(row.status || "").trim();
  const src = String(row.source || "").trim();
  if (st === "作廢") return false;
  return st === "待確認" || (st === "" && src !== "會計補打卡");
}

function lastPunchRow(dayRows, area, type) {
  const hits = dayRows.filter((row) => {
    return sameArea(row.area, area) && String(row.type || "").trim() === type;
  });
  return hits.length ? hits[hits.length - 1] : null;
}

function punchRowNumber(id) {
  const s = String(id || "");
  const m = s.match(/:(\d+)$/);
  const n = m ? Number(m[1]) : Number(s);
  return n;
}

function pendingConfirmItems(dayRows, area) {
  const items = [];
  dayRows.forEach((row) => {
    if (!sameArea(row.area, area)) return;
    const type = String(row.type || "").trim();
    if (type !== "上班" && type !== "下班") return;
    if (!isPendingPunchRow(row)) return;
    const item = { id: row.id };
    if (type === "上班") {
      const out = lastPunchRow(dayRows, area, "下班");
      item.lunchHours = lunchValue(guessedLunchFromTimes(row.time, out && out.time));
    }
    items.push(item);
  });
  return items;
}

function guessedLunchOpt(dayRows, area) {
  const inn = lastPunchRow(dayRows, area, "上班");
  const out = lastPunchRow(dayRows, area, "下班");
  if (inn && lunchConfirmed(inn)) {
    const lunch = String(inn.lunch || "").trim();
    if (lunch === "0.5") return "0.5";
    if (lunch === "1") return "1";
    return "無";
  }
  return guessedLunchFromTimes(inn && inn.time, out && out.time);
}

function lunchValue(label) {
  if (label === "0.5") return 0.5;
  if (label === "1") return 1;
  return 0;
}

function attachLunchButtons(lunchCell, pair) {
  if (!pair.lunch || pair.lunch === "0") pair.lunch = guessedLunchFromTimes(pair.inTime, pair.outTime);
  ["無", "0.5", "1"].forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice";
    if (opt === "無") btn.classList.toggle("on", pair.lunch === "無" || pair.lunch === "0" || !pair.lunch);
    if (opt === "0.5") btn.classList.toggle("on", pair.lunch === "0.5");
    if (opt === "1") btn.classList.toggle("on", pair.lunch === "1");
    btn.textContent = opt === "無" ? "無" : opt + "小時";
    btn.addEventListener("click", () => {
      pair.lunch = opt === "無" ? "無" : opt;
      lunchCell.querySelectorAll("button").forEach((el) => el.classList.toggle("on", el === btn));
    });
    lunchCell.append(btn);
  });
}

function renderPairTable(wrap, pairs, attr, emptyText) {
  wrap.innerHTML = "";
  if (!pairs.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = emptyText;
    wrap.append(p);
    return false;
  }
  const table = document.createElement("table");
  table.className = "punch-table";
  table.innerHTML =
    "<thead><tr><th></th><th>員工</th><th>日期</th><th>區域</th><th>打卡上班</th><th>打卡下班</th><th>計薪上班</th><th>計薪下班</th><th>狀態</th><th>午休</th></tr></thead>";
  const tbody = document.createElement("tbody");
  pairs.forEach((pair, index) => {
    const tr = document.createElement("tr");
    if (isPendingPair(pair)) tr.classList.add("pending");
    const st = [pair.inStatus, pair.outStatus].filter(Boolean).join("／") || "待確認";
    const tdCheck = document.createElement("td");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.setAttribute(attr, String(index));
    tdCheck.append(cb);
    tr.append(tdCheck);
    [pair.name, pair.date, pair.area, hm(pair.inTime), hm(pair.outTime), hm(pair.payIn), hm(pair.payOut), st].forEach((val) => {
      const td = document.createElement("td");
      td.textContent = val;
      tr.append(td);
    });
    const lunchCell = document.createElement("td");
    attachLunchButtons(lunchCell, pair);
    tr.append(lunchCell);
    tbody.append(tr);
  });
  table.append(tbody);
  wrap.append(table);
  return true;
}

function pickedConfirmItems(wrap, pairs, attr) {
  const items = [];
  wrap.querySelectorAll(`input[${attr}]`).forEach((cb) => {
    if (!cb.checked) return;
    const pair = pairs[Number(cb.getAttribute(attr))];
    if (!pair) return;
    if (pair.inId) {
      items.push({
        id: pair.inId,
        lunchHours: lunchValue(pair.lunch),
      });
    }
    if (pair.outId) items.push({ id: pair.outId });
  });
  return items;
}

function renderExisting() {
  existingPairs = existingPairs.filter(isPendingPair);
  confirmPayBtn.hidden = !renderPairTable(
    existingWrap,
    existingPairs,
    "data-exist",
    "這段期間沒有待確認的員工自行打卡。",
  );
}

const pendingWrap = document.getElementById("pending-wrap");
const confirmPendingBtn = document.getElementById("confirm-pending");
let pendingPairs = [];

function daysAgoIso(n) {
  const d = new Date(todayTaipei() + "T12:00:00");
  d.setDate(d.getDate() - n);
  return isoFromLocalDate(d);
}

async function confirmPairs(wrap, pairs, attr) {
  const picked = pickedConfirmItems(wrap, pairs, attr);
  if (!picked.length) {
    setStatus(makeupStatusEl, "請勾選要確認的打卡", "err");
    return;
  }
  setStatus(makeupStatusEl, "正在確認計薪時間…");
  const data = await postScript({
    action: "setLunch",
    items: picked,
  });
  setStatus(
    makeupStatusEl,
    `已確認 ${data.count || picked.length} 筆，狀態改為已確認。請再到「出勤統計」重算，才會寫入員工出勤統計表。`,
    "ok",
  );
  makeupLinksEl.innerHTML = `<p><a href="./stats.html">前往出勤統計重算</a></p>`;
  await loadRoster();
}

async function loadPending(quiet) {
  if (!quiet) setStatus(makeupStatusEl, "正在載入待確認…");
  try {
    const data = await postScript({
      action: "listPunches",
      from: daysAgoIso(14),
      to: todayTaipei(),
      names: [...STAFF],
    });
    pendingPairs = pairSelfPunches(Array.isArray(data.rows) ? data.rows : []).filter(isPendingPair);
    confirmPendingBtn.hidden = !renderPairTable(
      pendingWrap,
      pendingPairs,
      "data-pending",
      "近 14 天沒有待確認的員工打卡。",
    );
    if (!quiet) {
      setStatus(
        makeupStatusEl,
        pendingPairs.length ? `待確認 ${pendingPairs.length} 筆。` : "目前沒有待確認。",
        "ok",
      );
    }
  } catch (err) {
    confirmPendingBtn.hidden = true;
    pendingWrap.innerHTML = "";
    const p = document.createElement("p");
    p.className = "status err";
    p.textContent = err instanceof Error ? err.message : "載入待確認失敗";
    pendingWrap.append(p);
    if (!quiet) setStatus(makeupStatusEl, p.textContent, "err");
  }
}

document.getElementById("load-existing").addEventListener("click", async () => {
  if (makeupSelected.size === 0) {
    setStatus(makeupStatusEl, "請先點選人名", "err");
    return;
  }
  const bounds = currentDateBounds();
  if (!bounds.from) {
    setStatus(makeupStatusEl, "請填日期", "err");
    return;
  }
  setStatus(makeupStatusEl, "正在帶出已打卡時間…");
  try {
    const data = await postScript({
      action: "listPunches",
      from: bounds.from,
      to: bounds.to,
      names: [...makeupSelected],
    });
    existingPairs = pairSelfPunches(Array.isArray(data.rows) ? data.rows : []);
    renderExisting();
    setStatus(
      makeupStatusEl,
      existingPairs.length
        ? `待確認 ${existingPairs.length} 筆。請核對計薪時間後按確認。`
        : "這段期間沒有待確認的員工自行打卡。",
      "ok",
    );
  } catch (err) {
    setStatus(makeupStatusEl, err instanceof Error ? err.message : "帶出失敗", "err");
  }
});

confirmPayBtn.addEventListener("click", async () => {
  try {
    await confirmPairs(existingWrap, existingPairs, "data-exist");
    await loadPending(true);
  } catch (err) {
    setStatus(makeupStatusEl, err instanceof Error ? err.message : "確認失敗", "err");
  }
});

document.getElementById("load-pending").addEventListener("click", async () => {
  try {
    await loadPending();
  } catch (err) {
    setStatus(makeupStatusEl, err instanceof Error ? err.message : "載入失敗", "err");
  }
});

confirmPendingBtn.addEventListener("click", async () => {
  try {
    await confirmPairs(pendingWrap, pendingPairs, "data-pending");
    await loadPending(true);
  } catch (err) {
    setStatus(makeupStatusEl, err instanceof Error ? err.message : "確認失敗", "err");
  }
});

loadPending = async function () {};

const missingNameEl = document.getElementById("missing-name");
const missingWrap = document.getElementById("missing-wrap");

STAFF.forEach((person) => {
  const opt = document.createElement("option");
  opt.value = person;
  opt.textContent = person;
  missingNameEl.append(opt);
});

function normDate(text) {
  const s = String(text || "").replace(/-/g, "/");
  const m = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return s;
  return m[1] + "/" + pad2(Number(m[2])) + "/" + pad2(Number(m[3]));
}

function isPayCounted(row) {
  const st = String(row.status || "").trim();
  const src = String(row.source || "").trim();
  if (st === "作廢" || st === "待確認") return false;
  if (st === "已確認") return true;
  if (src === "會計補打卡") return true;
  return false;
}

function areaShiftStatus(dayRows, area) {
  const list = dayRows.filter((row) => sameArea(row.area, area));
  const ins = list.filter((row) => String(row.type || "").trim() === "上班").length;
  const outs = list.filter((row) => String(row.type || "").trim() === "下班").length;
  if (ins >= 1 && outs >= 1 && ins === outs) return "";
  if (!ins && !outs) return `缺${area}上下班`;
  const parts = [];
  if (ins < 1) parts.push(`缺${area}上班`);
  if (outs < 1) parts.push(`缺${area}下班`);
  if (ins >= 1 && outs >= 1 && ins > outs) parts.push(`缺${area}下班`);
  if (ins >= 1 && outs >= 1 && outs > ins) parts.push(`缺${area}上班`);
  return parts.join("、");
}

function dayPunchStatus(rows, iso) {
  const key = slashDate(iso);
  const dayRows = rows.filter((row) => {
    if (normDate(row.date) !== key) return false;
    return String(row.status || "").trim() !== "作廢";
  });
  if (dayRows.some((row) => String(row.type || "").trim() === "無上班" && isPayCounted(row))) {
    return { reason: "已確認無上班", done: true };
  }
  const field = areaShiftStatus(dayRows, "田間");
  const factory = areaShiftStatus(dayRows, "工廠");
  if (!field && !factory) return { reason: "當天已完成打卡", done: true };
  if (field === "缺田間上下班" && factory === "缺工廠上下班") {
    return { reason: "整天沒打", done: false };
  }
  return { reason: [field, factory].filter(Boolean).join("、"), done: false };
}

function missingDays() {
  if (makeupRange === "week") {
    if (!weekDays.length) weekDays = weekDaysFrom(makeupWeekEl.value || todayTaipei());
    return weekDays;
  }
  const iso = makeupDateEl.value || todayTaipei();
  return [{ iso, label: "" }];
}

function selectedStaff() {
  return makeupSelected.size ? [...makeupSelected][0] : "";
}

function lunchConfirmed(row) {
  const lunch = String(row.lunch || "").trim();
  return lunch === "無" || lunch === "0" || lunch === "0.5" || lunch === "1";
}

function lunchText(row) {
  const lunch = String(row.lunch || "").trim();
  if (lunch === "0.5") return "0.5小時";
  if (lunch === "1") return "1小時";
  return "無";
}

function lunchAreaStatus(dayRows, area) {
  if (isNoWorkArea(dayRows, area)) return { label: "無上班", kind: "done", id: "" };
  const ins = dayRows.filter((row) => {
    return sameArea(row.area, area) && String(row.type || "").trim() === "上班";
  });
  if (!ins.length) return { label: "先補上班", kind: "need", id: "" };
  const hit = ins[ins.length - 1];
  const punch = itemPunchStatus(dayRows, area, "上班");
  if (punch.kind === "pending" || !lunchConfirmed(hit)) {
    return { label: "待確認", kind: "pending", id: hit.id || "" };
  }
  return { label: lunchText(hit), kind: "done", id: hit.id || "" };
}

function itemPunchStatus(dayRows, area, type) {
  if (isNoWorkArea(dayRows, area)) return { label: "無上班", kind: "done", time: "", id: "" };
  const hits = dayRows.filter((row) => {
    return sameArea(row.area, area) && String(row.type || "").trim() === type;
  });
  if (!hits.length) return { label: "須補卡", kind: "need", time: "", id: "" };
  const hit = hits[hits.length - 1];
  const st = String(hit.status || "").trim();
  const src = String(hit.source || "").trim();
  const time = hm(hit.time);
  if (st === "待確認" || (st === "" && src !== "會計補打卡")) {
    return { label: "待確認", kind: "pending", time, id: hit.id || "" };
  }
  return { label: "已確認", kind: "done", time, id: hit.id || "" };
}

function sortedAreaHits(dayRows, area, type) {
  return dayRows
    .filter((row) => sameArea(row.area, area) && String(row.type || "").trim() === type)
    .slice()
    .sort((a, b) => punchTimeKey(a.date, a.time).localeCompare(punchTimeKey(b.date, b.time)));
}

function pairAreaShifts(dayRows, area) {
  const ins = sortedAreaHits(dayRows, area, "上班");
  const outs = sortedAreaHits(dayRows, area, "下班");
  const len = Math.max(ins.length, outs.length);
  const pairs = [];
  for (let i = 0; i < len; i++) {
    pairs.push({ inn: ins[i] || null, out: outs[i] || null });
  }
  return pairs;
}

function firstClockInKey(dayRows) {
  let best = "9999-99-99T99:99:99";
  (dayRows || []).forEach((row) => {
    if (String(row.type || "").trim() !== "上班") return;
    if (String(row.status || "").trim() === "作廢") return;
    const k = punchTimeKey(row.date, row.time);
    if (k < best) best = k;
  });
  return best;
}

function requiredAreas() {
  return ["田間", "工廠"];
}

function extraAreas() {
  return ["家鑫調工"];
}

function workAreas() {
  return requiredAreas().concat(extraAreas());
}

function areasShown(dayRows) {
  return requiredAreas().concat(
    extraAreas().filter((area) => areaHasPunch(dayRows, area) || isNoWorkArea(dayRows, area)),
  );
}

function areasInClockOrder(dayRows) {
  const list = areasShown(dayRows);
  return list.slice().sort((a, b) => {
    const insA = sortedAreaHits(dayRows, a, "上班")[0];
    const insB = sortedAreaHits(dayRows, b, "上班")[0];
    const ka = insA ? punchTimeKey(insA.date, insA.time) : "9999-99-99T99:99:99";
    const kb = insB ? punchTimeKey(insB.date, insB.time) : "9999-99-99T99:99:99";
    if (ka !== kb) return ka < kb ? -1 : 1;
    return list.indexOf(a) - list.indexOf(b);
  });
}

function itemFromRow(row, type, area, seg) {
  if (!row) return { label: "須補卡", kind: "need", time: "", id: "", type, area, seg };
  const st = String(row.status || "").trim();
  const src = String(row.source || "").trim();
  const time = hm(row.time);
  if (st === "待確認" || (st === "" && src !== "會計補打卡")) {
    return { label: "待確認", kind: "pending", time, id: row.id || "", type, area, seg };
  }
  return { label: "已確認", kind: "done", time, id: row.id || "", type, area, seg };
}

function lunchOptFromRow(row) {
  const lunch = String((row && row.lunch) || "").trim();
  if (lunch === "0.5") return "0.5";
  if (lunch === "1") return "1";
  return "無";
}

function appendNeedInput(td, type, area, seg) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "need-input";
  input.autocomplete = "off";
  input.placeholder = "18:00 或 1800";
  input.dataset.makeupType = type;
  input.dataset.makeupArea = area;
  input.dataset.seg = String(seg);
  td.append(input);
}

function isNoWorkArea(dayRows, area) {
  return dayRows.some((row) => {
    if (String(row.type || "").trim() !== "無上班" || !isPayCounted(row)) return false;
    const rowArea = String(row.area || "").trim();
    return sameArea(rowArea, area) || rowArea === "－" || rowArea === "" || rowArea === "全日";
  });
}

function areaHasPunch(dayRows, area) {
  return dayRows.some((row) => {
    if (String(row.status || "").trim() === "作廢") return false;
    if (!sameArea(row.area, area)) return false;
    const type = String(row.type || "").trim();
    return type === "上班" || type === "下班";
  });
}

function areaDone(dayRows, area) {
  if (isNoWorkArea(dayRows, area)) return true;
  const punchesOk = ["上班", "下班"].every((type) => itemPunchStatus(dayRows, area, type).kind === "done");
  return punchesOk && lunchAreaStatus(dayRows, area).kind === "done";
}

function isNoWorkDay(dayRows) {
  return ["田間", "工廠"].every((area) => isNoWorkArea(dayRows, area));
}

function personDayDone(dayRows) {
  return areasShown(dayRows).every((area) => areaDone(dayRows, area));
}

function dayHasRecord(dayRows) {
  return dayRows.some((row) => String(row.status || "").trim() !== "作廢");
}

function personChipKind(dayRows, iso) {
  if (personDayDone(dayRows)) return "ok";
  if (dayHasRecord(dayRows)) return "pending";
  if (iso && iso === todayTaipei()) return "need";
  return "skip";
}

function chipKindForPerson(person) {
  if (makeupView === "range") {
    const from = makeupFromEl && makeupFromEl.value;
    const to = makeupToEl && makeupToEl.value;
    if (!from || !to) return "need";
    let kind = "ok";
    eachIso(from, to).forEach((day) => {
      const k = personChipKind(dayRowsFor(rangeRows, day, person), day);
      if (k === "skip") return;
      if (k === "need") kind = "need";
      else if (k === "pending" && kind === "ok") kind = "pending";
    });
    return kind;
  }
  const iso = makeupDateEl.value || todayTaipei();
  const k = personChipKind(dayRowsFor(rosterRows, iso, person), iso);
  return k === "skip" ? "need" : k;
}

function dayRowsFor(rows, iso, who) {
  const key = slashDate(iso);
  return rows.filter((row) => {
    if (who && row.name !== who) return false;
    if (normDate(row.date) !== key) return false;
    return String(row.status || "").trim() !== "作廢";
  });
}

function paintStaffChips() {
  makeupNamesEl.querySelectorAll(".chip").forEach((el) => {
    if (el.dataset.staffAll) {
      const allOn = makeupSelected.size === STAFF.length;
      el.classList.toggle("on", allOn);
      el.setAttribute("aria-pressed", allOn ? "true" : "false");
      return;
    }
    const person = el.textContent;
    const kind = chipKindForPerson(person);
    const picked = makeupSelected.has(person);
    el.classList.toggle("need", kind === "need");
    el.classList.toggle("pending", kind === "pending");
    el.classList.toggle("ok", kind === "ok");
    el.classList.toggle("on", picked);
    el.setAttribute("aria-pressed", picked ? "true" : "false");
  });
}

function incompleteReason(dayRows, iso) {
  if (personDayDone(dayRows)) return "";
  if (!dayHasRecord(dayRows) && iso !== todayTaipei()) return "";
  const bits = [];
  areasShown(dayRows).forEach((area) => {
    if (isNoWorkArea(dayRows, area)) return;
    ["上班", "下班"].forEach((type) => {
      const item = itemPunchStatus(dayRows, area, type);
      if (item.kind === "need") bits.push("缺" + area + type);
      else if (item.kind === "pending") bits.push(area + type + "待確認");
    });
    const lunch = lunchAreaStatus(dayRows, area);
    const inn = itemPunchStatus(dayRows, area, "上班");
    if (inn.kind !== "need" && lunch.kind !== "done") bits.push(area + "午休");
  });
  return bits.join("、") || "未完成";
}

function collectIncomplete() {
  const from = makeupFromEl.value;
  const to = makeupToEl.value;
  const whoSet = makeupSelected.size ? makeupSelected : null;
  const items = [];
  eachIso(from, to).forEach((iso) => {
    STAFF.forEach((person) => {
      if (whoSet && !whoSet.has(person)) return;
      const reason = incompleteReason(dayRowsFor(rangeRows, iso, person), iso);
      if (reason) items.push({ iso, person, reason });
    });
  });
  items.sort((a, b) => {
    if (a.iso !== b.iso) return a.iso < b.iso ? -1 : 1;
    const ka = firstClockInKey(dayRowsFor(rangeRows, a.iso, a.person));
    const kb = firstClockInKey(dayRowsFor(rangeRows, b.iso, b.person));
    if (ka !== kb) return ka < kb ? -1 : 1;
    return String(a.person).localeCompare(String(b.person), "zh-Hant");
  });
  return items;
}

function openPersonDay(iso, person) {
  makeupView = "day";
  makeupDateEl.value = iso;
  rememberMakeupDate(iso);
  syncMakeupViewUi();
  makeupSelected.clear();
  makeupSelected.add(person);
  loadRoster({ scroll: true }).catch(() => {});
}

function renderIncompleteList() {
  if (!incompleteWrap) return;
  incompleteWrap.innerHTML = "";
  paintStaffChips();
  const items = collectIncomplete();
  if (!items.length) {
    const p = document.createElement("p");
    p.className = "status ok";
    p.textContent = makeupSelected.size
      ? [...makeupSelected].join("、") + " 在這段期間都已完成。"
      : "這段期間全員都已完成。";
    incompleteWrap.append(p);
    return;
  }
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "共 " + items.length + " 筆未完成。點列進單日確認或補卡。";
  incompleteWrap.append(hint);
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  table.className = "punch-table roster-table roster-has-need";
  table.innerHTML = "<thead><tr><th>日期</th><th>員工</th><th>未完成</th></tr></thead>";
  const tbody = document.createElement("tbody");
  items.forEach((item) => {
    const tr = document.createElement("tr");
    tr.className = "roster-need incomplete-row";
    const d = document.createElement("td");
    d.textContent = slashDate(item.iso).replace(/^\d{4}\//, "");
    const n = document.createElement("td");
    n.textContent = item.person;
    const r = document.createElement("td");
    r.textContent = item.reason;
    tr.append(d, n, r);
    tr.addEventListener("click", () => openPersonDay(item.iso, item.person));
    tbody.append(tr);
  });
  table.append(tbody);
  wrap.append(table);
  incompleteWrap.append(wrap);
}

function syncMakeupViewUi() {
  const isRange = makeupView === "range";
  document.querySelectorAll("[data-makeup-view]").forEach((el) => {
    el.classList.toggle("on", el.getAttribute("data-makeup-view") === makeupView);
  });
  if (dayLabel) dayLabel.hidden = isRange;
  if (makeupRangeWrap) makeupRangeWrap.hidden = !isRange;
  if (incompleteWrap) incompleteWrap.hidden = !isRange;
  if (rosterWrap) rosterWrap.hidden = isRange;
}

async function loadIncomplete(opts) {
  if (!incompleteWrap) return;
  const from = makeupFromEl && makeupFromEl.value;
  const to = makeupToEl && makeupToEl.value;
  if (!from || !to) {
    incompleteWrap.innerHTML = "<p class='status err'>請選起迄日期</p>";
    return;
  }
  if (to < from) {
    incompleteWrap.innerHTML = "<p class='status err'>迄日不可早於起日</p>";
    return;
  }
  if (eachIso(from, to).length > 31) {
    incompleteWrap.innerHTML = "<p class='status err'>一次最多查 31 天</p>";
    return;
  }
  incompleteWrap.innerHTML = "<p class='hint'>載入多日未完成…</p>";
  try {
    const data = await postScript({
      action: "listPunches",
      from,
      to,
      names: [...STAFF],
    });
    rangeRows = Array.isArray(data.rows) ? data.rows : [];
    renderIncompleteList();
    if (opts && opts.scroll) scrollToInputArea();
  } catch (err) {
    incompleteWrap.innerHTML = "";
    const p = document.createElement("p");
    p.className = "status err";
    p.textContent = err instanceof Error ? err.message : "載入失敗";
    incompleteWrap.append(p);
  }
}

function appendLunchChoices(cell, id, selectedOpt, extraIds) {
  const picked = selectedOpt || "無";
  ["無", "0.5", "1"].forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice lunch-pick";
    if (opt === picked) btn.classList.add("on", opt === "無" ? "lunch-none" : "lunch-yes");
    btn.textContent = opt === "無" ? "無午休" : "午休" + opt + "小時";
    btn.addEventListener("click", () => {
      cell.querySelectorAll(".lunch-pick").forEach((el) => {
        el.classList.remove("on", "lunch-none", "lunch-yes");
      });
      btn.classList.add("on", opt === "無" ? "lunch-none" : "lunch-yes");
    });
    cell.append(btn);
  });
}

function appendExtraTimeInput(td, type, area) {
  const extra = document.createElement("input");
  extra.type = "text";
  extra.className = "need-input extra-in";
  extra.autocomplete = "off";
  extra.placeholder = type === "上班" ? "再加一筆上班" : "再加一筆下班";
  extra.dataset.makeupType = type;
  extra.dataset.makeupArea = area;
  extra.dataset.extraShift = "1";
  td.append(extra);
}

function appendLunchField(cell, area, selectedOpt, seg) {
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "扣" + (area === "田間" ? "田區" : area) + "工時";
  cell.append(hint);
  const sel = document.createElement("select");
  sel.className = "lunch-input";
  sel.dataset.makeupArea = area;
  if (seg != null) sel.dataset.seg = String(seg);
  [
    ["無", "無午休"],
    ["0.5", "0.5小時"],
    ["1", "1小時"],
  ].forEach(([value, label]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    sel.append(opt);
  });
  sel.value = selectedOpt || "無";
  cell.append(sel);
}

function addLine(td, text, className) {
  const line = document.createElement("div");
  line.className = className || "punch-line";
  line.textContent = text;
  td.append(line);
}

function appendStatusCell(td, item, dayRows) {
  if (item.label === "無上班" && item.kind === "done") {
    addLine(td, "無上班", "punch-line punch-status-line");
    return;
  }
  if (item.kind === "need") {
    addLine(td, "須補卡", "punch-line punch-status-line");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "need-input";
    input.autocomplete = "off";
    input.placeholder = "18:00 或 1800";
    input.dataset.makeupType = item.type;
    input.dataset.makeupArea = item.area;
    if (item.seg != null) input.dataset.seg = String(item.seg);
    td.append(input);
    return;
  }
  addLine(td, item.label, "punch-line punch-status-line");
  addLine(td, item.time || "－", "punch-line punch-time-line");
  const pay = item.time ? hm(roundPayTime(item.time)) : "";
  addLine(td, pay ? "計薪 " + pay : "計薪 －", "punch-line punch-pay-line");
  if (item.kind === "pending" && item.id) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice confirm-pick on";
    btn.dataset.punchId = String(item.id);
    btn.dataset.punchType = item.type || "";
    btn.textContent = "確認";
    btn.addEventListener("click", () => {
      btn.classList.toggle("on");
    });
    td.append(btn);
  }
}

function renderRoster(who, rows, iso) {
  const wrap = document.getElementById("roster-wrap");
  if (!wrap) return;
  wrap.innerHTML = "";
  paintStaffChips();
  const people = who ? [who] : [...makeupSelected];
  if (!people.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "請點上方員工。單一日期可複選，填一次時間共同補卡。";
    wrap.append(p);
    return;
  }
  people.sort((a, b) => {
    const ka = firstClockInKey(dayRowsFor(rows, iso, a));
    const kb = firstClockInKey(dayRowsFor(rows, iso, b));
    if (ka !== kb) return ka < kb ? -1 : 1;
    return String(a).localeCompare(String(b), "zh-Hant");
  });
  if (people.length > 1) appendBatchMakeup(wrap, iso, people, rows);
  people.forEach((person) => appendPersonDay(wrap, person, rows, iso));
}

function combinedDayRows(rows, iso, people) {
  const out = [];
  people.forEach((person) => {
    dayRowsFor(rows, iso, person).forEach((row) => out.push(row));
  });
  return out;
}

function appendBatchMakeup(wrap, iso, people, rows) {
  const box = document.createElement("div");
  box.className = "person-day batch-makeup";
  const title = document.createElement("h2");
  title.textContent = "共同補卡　" + people.join("、") + "　" + slashDate(iso);
  box.append(title);
  const note = document.createElement("p");
  note.className = "hint";
  note.textContent = "填一次上下班與午休，按送出會寫入所有已選員工。下面仍是各人當天資料，可個別確認。";
  box.append(note);
  const table = document.createElement("table");
  table.className = "punch-table roster-table roster-has-need";
  table.innerHTML =
    "<thead><tr><th>區域／段</th><th>上班</th><th>下班</th><th>午休（扣該段工時）</th></tr></thead>";
  const tbody = document.createElement("tbody");
  ["田間", "工廠"].forEach((area) => {
    const areaLabel = area === "田間" ? "田區" : area;
    const tr = document.createElement("tr");
    tr.dataset.area = area;
    const nameTd = document.createElement("td");
    const label = document.createElement("div");
    label.className = "seg-label";
    label.textContent = areaLabel + " 第1筆";
    nameTd.append(label);
    tr.append(nameTd);
    ["上班", "下班"].forEach((type) => {
      const td = document.createElement("td");
      appendNeedInput(td, type, area, 0);
      tr.append(td);
    });
    const lunchTd = document.createElement("td");
    appendLunchField(lunchTd, area, "無", 0);
    tr.append(lunchTd);
    tbody.append(tr);
    const addTr = document.createElement("tr");
    const addTd = document.createElement("td");
    addTd.colSpan = 4;
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "choice";
    addBtn.textContent = "再加一筆" + areaLabel + "上下班";
    addBtn.addEventListener("click", () => {
      const next = tbody.querySelectorAll(`tr[data-area="${area}"]`).length;
      const extra = document.createElement("tr");
      extra.dataset.area = area;
      extra.dataset.extra = "1";
      const extraName = document.createElement("td");
      const cap = document.createElement("div");
      cap.className = "seg-label";
      cap.textContent = areaLabel + " 第" + (next + 1) + "筆";
      extraName.append(cap);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "choice shift-remove";
      del.textContent = "刪除";
      del.addEventListener("click", () => {
        extra.remove();
        tbody.querySelectorAll(`tr[data-area="${area}"]`).forEach((row, i) => {
          const lab = row.querySelector(".seg-label");
          if (lab) lab.textContent = areaLabel + " 第" + (i + 1) + "筆";
        });
      });
      extraName.append(del);
      extra.append(extraName);
      ["上班", "下班"].forEach((type) => {
        const td = document.createElement("td");
        appendNeedInput(td, type, area, next);
        extra.append(td);
      });
      const extraLunch = document.createElement("td");
      appendLunchField(extraLunch, area, "無", next);
      extra.append(extraLunch);
      addTr.before(extra);
    });
    addTd.append(addBtn);
    addTr.append(addTd);
    tbody.append(addTr);
  });
  table.append(tbody);
  box.append(table);
  appendJiaxinAdd(box, tbody, combinedDayRows(rows, iso, people));
  const send = document.createElement("button");
  send.type = "button";
  send.className = "submit";
  send.textContent = "送出共同補卡";
  send.addEventListener("click", () => {
    submitPersonMakeup(iso, people, box, combinedDayRows(rows, iso, people));
  });
  box.append(send);
  wrap.append(box);
}

function appendBlankAreaRows(tbody, area) {
  const cap = typeof areaLabel === "function" ? areaLabel(area) : area === "田間" ? "田區" : area;
  const tr = document.createElement("tr");
  tr.dataset.area = area;
  tr.dataset.extra = "1";
  const nameTd = document.createElement("td");
  const label = document.createElement("div");
  label.className = "seg-label";
  label.textContent = cap + " 第1筆";
  nameTd.append(label);
  const del = document.createElement("button");
  del.type = "button";
  del.className = "choice shift-remove";
  del.textContent = "刪除";
  del.addEventListener("click", () => tr.remove());
  nameTd.append(del);
  tr.append(nameTd);
  ["上班", "下班"].forEach((type) => {
    const td = document.createElement("td");
    appendNeedInput(td, type, area, 0);
    tr.append(td);
  });
  const lunchTd = document.createElement("td");
  appendLunchField(lunchTd, area, "無", 0);
  tr.append(lunchTd);
  tbody.append(tr);
}

function appendJiaxinAdd(box, tbody, dayRows) {
  extraAreas().forEach((area) => {
    if (areaHasPunch(dayRows, area) || isNoWorkArea(dayRows, area)) return;
    if (tbody.querySelector(`tr[data-area="${area}"]`)) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice";
    btn.textContent = "加上" + area + "上下班";
    btn.addEventListener("click", () => {
      appendBlankAreaRows(tbody, area);
      btn.remove();
    });
    box.append(btn);
  });
}

function appendPersonDay(wrap, person, rows, iso) {
  const dayRows = dayRowsFor(rows, iso, person);
  const box = document.createElement("div");
  box.className = "person-day";
  const title = document.createElement("h2");
  title.textContent = person + "　" + slashDate(iso);
  box.append(title);
  const done = personDayDone(dayRows);
  const note = document.createElement("p");
  note.className = done ? "status ok" : "status err";
  const missing = incompleteReason(dayRows, iso);
  note.textContent = done
    ? "當天已完成打卡"
    : missing
      ? "尚未完成：" + missing + "。沒用到的區域請按無上班。"
      : "尚未完成：可補卡，或按該區無上班";
  box.append(note);
  const table = document.createElement("table");
  table.className = "punch-table roster-table " + (done ? "roster-all-ok" : "roster-has-need");
  table.innerHTML =
    "<thead><tr><th>區域／段</th><th>上班</th><th>下班</th><th>午休（扣該段工時）</th></tr></thead>";
  const tbody = document.createElement("tbody");
  areasInClockOrder(dayRows).forEach((area) => {
    const areaLabel = area === "田間" ? "田區" : area;
    if (isNoWorkArea(dayRows, area)) {
      const tr = document.createElement("tr");
      const nameTd = document.createElement("td");
      nameTd.textContent = areaLabel;
      tr.append(nameTd);
      const td = document.createElement("td");
      td.colSpan = 3;
      td.textContent = "無上班";
      tr.append(td);
      tbody.append(tr);
      return;
    }
    const pairs = pairAreaShifts(dayRows, area);
    const shiftRows = pairs.length ? pairs : [{ inn: null, out: null }];
    shiftRows.forEach((pair, index) => {
      const tr = document.createElement("tr");
      tr.dataset.area = area;
      const nameTd = document.createElement("td");
      const label = document.createElement("div");
      label.className = "seg-label";
      label.textContent = areaLabel + " 第" + (index + 1) + "筆";
      nameTd.append(label);
      if (index === 0 && !areaHasPunch(dayRows, area)) {
        const none = document.createElement("button");
        none.type = "button";
        none.className = "choice";
        none.textContent = "無上班";
        none.addEventListener("click", () => markNoWork(iso, person, area));
        nameTd.append(none);
      }
      tr.append(nameTd);
      const innItem = itemFromRow(pair.inn, "上班", area, index);
      const outItem = itemFromRow(pair.out, "下班", area, index);
      [innItem, outItem].forEach((item) => {
        const td = document.createElement("td");
        appendStatusCell(td, item, dayRows);
        tr.append(td);
      });
      const lunchTd = document.createElement("td");
      appendLunchField(lunchTd, area, lunchOptFromRow(pair.inn), index);
      const lunchSel = lunchTd.querySelector("select");
      if (lunchSel && pair.inn && pair.inn.id) lunchSel.dataset.punchId = String(pair.inn.id);
      tr.append(lunchTd);
      tbody.append(tr);
    });
    const addTr = document.createElement("tr");
    const addTd = document.createElement("td");
    addTd.colSpan = 4;
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "choice";
    addBtn.textContent = "再加一筆" + areaLabel + "上下班";
    addBtn.addEventListener("click", () => {
      const next = tbody.querySelectorAll(`tr[data-area="${area}"]`).length;
      const tr = document.createElement("tr");
      tr.dataset.area = area;
      tr.dataset.extra = "1";
      const nameTd = document.createElement("td");
      const label = document.createElement("div");
      label.className = "seg-label";
      label.textContent = areaLabel + " 第" + (next + 1) + "筆";
      nameTd.append(label);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "choice shift-remove";
      del.textContent = "刪除";
      del.addEventListener("click", () => {
        tr.remove();
        tbody.querySelectorAll(`tr[data-area="${area}"]`).forEach((row, i) => {
          const cap = row.querySelector(".seg-label");
          if (cap) cap.textContent = areaLabel + " 第" + (i + 1) + "筆";
        });
      });
      nameTd.append(del);
      tr.append(nameTd);
      ["上班", "下班"].forEach((type) => {
        const td = document.createElement("td");
        appendNeedInput(td, type, area, next);
        tr.append(td);
      });
      const lunchTd = document.createElement("td");
      appendLunchField(lunchTd, area, "無", next);
      tr.append(lunchTd);
      addTr.before(tr);
    });
    addTd.append(addBtn);
    addTr.append(addTd);
    tbody.append(addTr);
  });
  table.append(tbody);
  box.append(table);
  appendJiaxinAdd(box, tbody, dayRows);
  const sendHint = document.createElement("p");
  sendHint.className = "hint";
  sendHint.textContent = "此人補卡或確認請按下面送出。多人共同補卡請用最上方的共同補卡。";
  box.append(sendHint);
  const send = document.createElement("button");
  send.type = "button";
  send.className = "submit";
  send.textContent = "送出";
  send.addEventListener("click", () => submitPersonMakeup(iso, person, box, dayRows));
  box.append(send);
  wrap.append(box);
}

function collectPendingConfirms(wrap) {
  const items = [];
  wrap.querySelectorAll(".confirm-pick.on").forEach((btn) => {
    const id = btn.dataset.punchId;
    if (!id) return;
    const item = { id };
    if (btn.dataset.punchType === "上班") {
      const tr = btn.closest("tr");
      const sel = tr ? tr.querySelector("select.lunch-input") : null;
      item.lunchHours = lunchValue(sel ? sel.value : "無");
    }
    items.push(item);
  });
  return items;
}

async function confirmRosterItems(items, quiet, skipReload) {
  const packed = (items || []).filter((item) => punchRowNumber(item.id) >= 1);
  if (!packed.length) {
    if (!quiet) setStatus(makeupStatusEl, "找不到要確認的列，請重新載入後再試", "err");
    return 0;
  }
  if (!quiet) setStatus(makeupStatusEl, "正在寫入確認…");
  const data = await postScript({
    action: "setLunch",
    items: packed,
  });
  if (!data.count) {
    setStatus(makeupStatusEl, "確認沒有寫入。請把最新 Code.gs 貼上 Apps Script 並發新版本", "err");
    return 0;
  }
  if (!quiet) setStatus(makeupStatusEl, "已確認 " + data.count + " 筆。", "ok");
  if (!skipReload) await loadRoster();
  return data.count || packed.length;
}

function lunchFieldValue(wrap, area, seg) {
  const sel =
    wrap.querySelector(`select.lunch-input[data-makeup-area="${area}"][data-seg="${seg}"]`) ||
    wrap.querySelector(`select.lunch-input[data-makeup-area="${area}"]`);
  return lunchValue(sel ? sel.value : "無");
}

async function submitPersonMakeup(iso, personOrNames, wrap, dayRows) {
  const names = Array.isArray(personOrNames) ? personOrNames.filter(Boolean) : [personOrNames].filter(Boolean);
  const person = names.join("、");
  if (!names.length) {
    setStatus(makeupStatusEl, "請先點選員工", "err");
    return;
  }
  const entries = [];
  wrap.querySelectorAll(".need-input").forEach((input) => {
    const raw = input.value.trim();
    if (!raw) return;
    const time = parseTypedTime(raw);
    if (!time) {
      entries.error = "時間請打 8:00 或 0800";
      return;
    }
    const type = input.dataset.makeupType || "";
    const area = input.dataset.makeupArea || "";
    const seg = input.dataset.seg || "";
    entries.push({ type, time, area, seg });
  });
  if (entries.error) {
    setStatus(makeupStatusEl, entries.error, "err");
    return;
  }
  entries.forEach((entry) => {
    if (entry.type === "上班") entry.lunchHours = lunchFieldValue(wrap, entry.area, entry.seg);
  });
  const seen = {};
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type === "無上班") continue;
    const mk = hm(entry.time);
    const stamp = (entry.area || "") + "|" + mk;
    const typed = stamp + "|" + entry.type;
    if (seen[typed]) {
      setStatus(makeupStatusEl, "同一時間重複打卡：" + (entry.area === "田間" ? "田區" : entry.area) + " " + entry.type + " " + mk + "。請改時間或刪多餘的段。", "err");
      return;
    }
    if (seen[stamp] && seen[stamp] !== entry.type) {
      setStatus(makeupStatusEl, "同一時間不能同時上下班：" + (entry.area === "田間" ? "田區" : entry.area) + " " + mk, "err");
      return;
    }
    seen[typed] = true;
    seen[stamp] = entry.type;
  }
  (dayRows || []).forEach((row) => {
    if (names.indexOf(row.name) < 0) return;
    if (String(row.status || "").trim() === "作廢") return;
    if (String(row.type || "").trim() === "無上班") return;
    const mk = hm(row.time);
    entries.forEach((entry) => {
      if (entry.type === "無上班") return;
      if (!sameArea(row.area, entry.area)) return;
      if (hm(entry.time) !== mk) return;
      entries.dup =
        row.name +
        " 與表上重複：" +
        (entry.area === "田間" ? "田區" : entry.area) +
        " " +
        mk +
        " 已有打卡，同一時間不能重複計時";
    });
  });
  if (entries.dup) {
    setStatus(makeupStatusEl, entries.dup, "err");
    return;
  }
  const confirmItems = collectPendingConfirms(wrap);
  if (!entries.length && !confirmItems.length) {
    setStatus(makeupStatusEl, "請填補卡時間，或點亮要確認的上下班後再按送出", "err");
    return;
  }
  setStatus(makeupStatusEl, "正在一次寫入…");
  try {
    let punchCount = 0;
    if (entries.length) {
      const data = await postScript({
        action: "punch",
        names: names,
        source: "會計補打卡",
        dayEntries: [{ date: slashDate(iso), entries }],
      });
      rememberMakeupDate(iso);
      makeupDateEl.value = iso;
      if (!data.count) {
        setStatus(makeupStatusEl, person + " 畫面顯示送出，但試算表寫入 0 筆。請把最新 Code.gs 發新版本。", "err");
        return;
      }
      punchCount = data.count;
    }
    let confirmCount = 0;
    if (confirmItems.length) {
      confirmCount = await confirmRosterItems(confirmItems, true, true);
      if (!confirmCount && !punchCount) return;
    }
    const bits = [];
    if (punchCount) bits.push("補卡 " + punchCount + " 筆");
    if (confirmCount) bits.push("確認 " + confirmCount + " 筆");
    setStatus(makeupStatusEl, person + " " + slashDate(iso) + " 已一次寫入：" + bits.join("、"), "ok");
    await loadRoster();
  } catch (err) {
    setStatus(makeupStatusEl, err instanceof Error ? err.message : "送出失敗", "err");
  }
}

async function loadRoster(opts) {
  const wrap = document.getElementById("roster-wrap");
  if (!wrap) return;
  const iso = makeupDateEl.value || todayTaipei();
  if (rosterWrap) rosterWrap.hidden = false;
  wrap.innerHTML = "<p class='hint'>載入當天打卡…</p>";
  try {
    const data = await postScript({
      action: "listPunches",
      from: iso,
      to: iso,
      names: [...STAFF],
    });
    rosterRows = Array.isArray(data.rows) ? data.rows : [];
    renderRoster("", rosterRows, iso);
    if (opts && opts.scroll && makeupSelected.size) scrollToInputArea();
    const sheetName = data.sheetName || "打卡";
    const scanned = Number(data.scanned || 0);
    const people = [...makeupSelected];
    const person = people.join("、");
    const missingAll = people.length && people.every((who) => !dayHasRecord(dayRowsFor(rosterRows, iso, who)));
    if (people.length && missingAll) {
      if (scanned === 0) {
        setStatus(
          makeupStatusEl,
          "目前讀到的分頁沒有列。真正打卡可能在別的分頁。請把最新 Code.gs 貼上並發新版本。",
          "err",
        );
      } else if (!rosterRows.length) {
        setStatus(
          makeupStatusEl,
          "已讀「" + sheetName + "」共 " + scanned + " 列，但對不到 " + slashDate(iso) + "。請看日期欄是不是同一天。",
          "err",
        );
      } else {
        setStatus(makeupStatusEl, person + " " + slashDate(iso) + " 沒有打卡，可在下方補卡或按無上班。", "ok");
      }
    } else if (person) {
      setStatus(makeupStatusEl, person + " " + slashDate(iso) + " 已載入（" + sheetName + "）。", "ok");
    }
  } catch (err) {
    wrap.innerHTML = "";
    const p = document.createElement("p");
    p.className = "status err";
    p.textContent = "無法連線：" + (err instanceof Error ? err.message : "載入失敗");
    wrap.append(p);
    setStatus(makeupStatusEl, p.textContent, "err");
  }
}

async function confirmRosterLunch(ids, lunchHours) {
  await confirmRosterItems(ids.map((id) => ({ id, lunchHours })));
}

async function confirmPunchIds(ids) {
  await confirmRosterItems(ids.map((id) => ({ id })));
}

async function markNoWork(iso, who, area) {
  const person = who || selectedStaff();
  if (!person || !area) return;
  const isoKey = iso;
  const dayRows = dayRowsFor(rosterRows, isoKey, person);
  if (areaHasPunch(dayRows, area)) {
    setStatus(makeupStatusEl, "該區已有打卡，不能改選無上班", "err");
    return;
  }
  setStatus(makeupStatusEl, "正在登錄" + (area === "田間" ? "田區" : area) + "無上班…");
  try {
    await postScript({
      action: "punch",
      names: [person],
      source: "會計補打卡",
      dayEntries: [
        {
          date: slashDate(iso),
          entries: [{ type: "無上班", time: "00:00:00", area }],
        },
      ],
    });
    setStatus(makeupStatusEl, `${person} ${slashDate(iso)} ${area === "田間" ? "田區" : area}已確認無上班。`, "ok");
    await loadRoster();
  } catch (err) {
    setStatus(makeupStatusEl, err instanceof Error ? err.message : "登錄失敗", "err");
  }
}

function loadMissing() {
  return loadRoster();
}

