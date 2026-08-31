const makeupNamesEl = document.getElementById("makeup-names");
const makeupStatusEl = document.getElementById("makeup-status");
const makeupDateEl = document.getElementById("makeup-date");
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
let makeupArea = "";
let makeupRange = "week";
let weekDays = [];

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
  if (makeupArea) {
    wrap.dataset.area = makeupArea;
    const preset = wrap.querySelector(`[data-shift-area="${makeupArea}"]`);
    if (preset) preset.classList.add("on");
  }
  wrap.querySelector(".shift-remove").addEventListener("click", () => {
    const list = wrap.parentElement;
    if (list.querySelectorAll(".shift-card").length <= 1) return;
    wrap.remove();
    renumberShifts(list);
  });
  return wrap;
}

function collectCard(card) {
  const area = card.dataset.area || makeupArea;
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
  const entries = [
    clockIn ? { type: "上班", time: clockIn, area } : null,
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
  dayLabel.hidden = isWeek;
  weekLabel.hidden = !isWeek;
  weekGridEl.hidden = !isWeek;
  weekSpan.hidden = !isWeek;
  dayTimesEl.hidden = isWeek;
  if (isWeek) renderWeekGrid();
  else ensureDayShifts();
}

makeupDateEl.value = todayTaipei();
makeupWeekEl.value = todayTaipei();
syncRange();
scriptInput.value = scriptUrl();
document.getElementById("saveUrl").addEventListener("click", () => {
  localStorage.setItem("punch-script-url", scriptInput.value.trim());
  setStatus(makeupStatusEl, "已儲存腳本網址", "ok");
});

makeupWeekEl.addEventListener("change", renderWeekGrid);
document.getElementById("add-shift").addEventListener("click", () => {
  shiftListEl.append(makeShiftCard());
  renumberShifts(shiftListEl);
});

STAFF.forEach((person) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "chip";
  btn.textContent = person;
  btn.addEventListener("click", () => {
    if (makeupSelected.has(person)) makeupSelected.delete(person);
    else makeupSelected.add(person);
    btn.classList.toggle("on", makeupSelected.has(person));
  });
  makeupNamesEl.append(btn);
});

const makeupAllBtn = document.createElement("button");
makeupAllBtn.type = "button";
makeupAllBtn.className = "chip";
makeupAllBtn.textContent = "全選";
makeupAllBtn.addEventListener("click", () => {
  const allOn = makeupSelected.size === STAFF.length;
  makeupSelected.clear();
  for (const el of makeupNamesEl.querySelectorAll(".chip")) {
    if (el === makeupAllBtn) continue;
    if (!allOn) makeupSelected.add(el.textContent);
    el.classList.toggle("on", !allOn);
  }
});
makeupNamesEl.prepend(makeupAllBtn);

document.querySelectorAll("[data-kind='makeup-area']").forEach((btn) => {
  btn.addEventListener("click", () => {
    makeupArea = btn.getAttribute("data-value") || "";
    document.querySelectorAll("[data-kind='makeup-area']").forEach((el) => {
      el.classList.toggle("on", el === btn);
    });
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

  const firstArea = dayEntries[0].entries[0].area || makeupArea;
  if (!firstArea) {
    setStatus(makeupStatusEl, "請選擇區域", "err");
    return;
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
        area: day.entries[0].area || firstArea,
        source: "會計補打卡",
        at: stamp.at,
        date: day.date,
        time: day.entries[0].time,
        entries: day.entries,
        dayEntries: [day],
      });
      wrote += lastData.count || day.entries.length * names.length;
    }
    const who = names.join("、");
    setStatus(
      makeupStatusEl,
      lastData && lastData.preview
        ? `${who} 畫面已選好，但尚未連到 Google。`
        : `${who} 已存進 Google 雲端，共 ${wrote} 筆。`,
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
  } catch (err) {
    setStatus(makeupStatusEl, err instanceof Error ? err.message : "送出失敗", "err");
  }
});

const voidFromEl = document.getElementById("void-from");
const voidToEl = document.getElementById("void-to");
const voidWrapEl = document.getElementById("void-table-wrap");
const voidStatusEl = document.getElementById("void-status");
const voidLinksEl = document.getElementById("void-links");
let loadedPunches = [];

voidFromEl.value = todayTaipei();
voidToEl.value = todayTaipei();
voidFromEl.addEventListener("change", () => {
  if (!voidToEl.value || voidToEl.value < voidFromEl.value) {
    voidToEl.value = voidFromEl.value;
  }
});

function isVoidRow(row) {
  return String(row.status || "").trim() === "作廢";
}

function renderPunchTable(rows) {
  loadedPunches = rows;
  voidWrapEl.innerHTML = "";
  if (!rows.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "這段期間沒有打卡。";
    voidWrapEl.append(p);
    return;
  }
  const table = document.createElement("table");
  table.className = "punch-table";
  table.innerHTML =
    "<thead><tr><th></th><th>日期</th><th>時間</th><th>員工</th><th>類型</th><th>區域</th><th>來源</th><th>狀態</th></tr></thead>";
  const tbody = document.createElement("tbody");
  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    const voided = isVoidRow(row);
    if (voided) tr.classList.add("voided");
    const tdCheck = document.createElement("td");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.index = String(index);
    cb.disabled = voided;
    tdCheck.append(cb);
    tr.append(tdCheck);
    [row.date, row.time, row.name, row.type, row.area, row.source, row.status || ""].forEach((val) => {
      const td = document.createElement("td");
      td.textContent = String(val ?? "");
      tr.append(td);
    });
    tbody.append(tr);
  });
  table.append(tbody);
  voidWrapEl.append(table);
}

function selectedVoidRows() {
  const picked = [];
  voidWrapEl.querySelectorAll("tbody input[type='checkbox']").forEach((cb) => {
    if (!cb.checked || cb.disabled) return;
    const row = loadedPunches[Number(cb.dataset.index)];
    if (row) picked.push(row);
  });
  return picked;
}

async function loadPunches() {
  if (makeupSelected.size === 0) {
    setStatus(voidStatusEl, "請先點選人名", "err");
    return;
  }
  if (!voidFromEl.value) {
    setStatus(voidStatusEl, "請選起始日期", "err");
    return;
  }
  if (!voidToEl.value) voidToEl.value = voidFromEl.value;
  if (voidToEl.value < voidFromEl.value) {
    setStatus(voidStatusEl, "迄日不可早於起日", "err");
    return;
  }
  voidLinksEl.innerHTML = "";
  setStatus(voidStatusEl, "載入打卡中…");
  try {
    const data = await postScript({
      action: "listPunches",
      from: voidFromEl.value,
      to: voidToEl.value,
      names: [...makeupSelected],
    });
    const rows = Array.isArray(data.rows) ? data.rows : [];
    renderPunchTable(rows);
    setStatus(
      voidStatusEl,
      rows.length ? `已載入 ${rows.length} 筆。勾選重複的再作廢。` : "這段期間沒有打卡。",
      "ok",
    );
  } catch (err) {
    setStatus(voidStatusEl, err instanceof Error ? err.message : "載入失敗", "err");
  }
}

document.getElementById("void-load").addEventListener("click", loadPunches);

document.getElementById("void-submit").addEventListener("click", async () => {
  const picked = selectedVoidRows();
  if (!picked.length) {
    setStatus(voidStatusEl, "請勾選要作廢的打卡", "err");
    return;
  }
  voidLinksEl.innerHTML = "";
  setStatus(voidStatusEl, "正在以紅線作廢…");
  try {
    const data = await postScript({
      action: "voidPunch",
      ids: picked.map((row) => row.id).filter((id) => id != null && id !== ""),
      rows: picked.map((row) => ({
        date: row.date,
        time: row.time,
        name: row.name,
        type: row.type,
        area: row.area,
      })),
    });
    const count = data.count || picked.length;
    const punchUrl = data.spreadsheetUrl;
    try {
      const listed = await postScript({
        action: "listPunches",
        from: voidFromEl.value,
        to: voidToEl.value,
        names: [...makeupSelected],
      });
      renderPunchTable(Array.isArray(listed.rows) ? listed.rows : []);
    } catch {
      /* 作廢已成功，重新載入失敗時仍顯示結果 */
    }
    setStatus(voidStatusEl, `已作廢 ${count} 筆（表上仍保留，紅線槓掉）。`, "ok");
    if (punchUrl) {
      voidLinksEl.innerHTML = `<p><a href="${punchUrl}" target="_blank" rel="noreferrer">開啟打卡試算表</a></p>`;
    }
  } catch (err) {
    setStatus(voidStatusEl, err instanceof Error ? err.message : "作廢失敗", "err");
  }
});
