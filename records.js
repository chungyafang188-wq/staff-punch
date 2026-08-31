const nameEl = document.getElementById("record-name");
const dayEl = document.getElementById("void-day");
const fromEl = document.getElementById("void-from");
const toEl = document.getElementById("void-to");
const dayWrap = document.getElementById("day-wrap");
const rangeWrap = document.getElementById("range-wrap");
const wrapEl = document.getElementById("void-table-wrap");
const statusEl = document.getElementById("void-status");
const linksEl = document.getElementById("void-links");
const scriptInput = document.getElementById("scriptUrl");

const areaFilter = new Set(["田間", "工廠"]);
const sourceFilter = new Set(["員工打卡"]);
const typeFilter = new Set(["上班", "下班"]);
let allRows = [];
let periodKind = "day";
let loadSeq = 0;
let loadTimer = 0;

function todayTaipei() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

function shortDate(text) {
  const s = String(text || "").replace(/-/g, "/");
  const m = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return s;
  return m[2].padStart(2, "0") + "/" + m[3].padStart(2, "0");
}

function selectedName() {
  return (nameEl.value || "").trim();
}

function isVoidRow(row) {
  return String(row.status || "").trim() === "作廢";
}

function isPendingRow(row) {
  const st = String(row.status || "").trim();
  return st === "待確認" || (st === "" && String(row.source || "").trim() !== "會計補打卡");
}

function filteredRows() {
  const who = selectedName();
  return allRows.filter((row) => {
    if (who && row.name !== who) return false;
    const source = String(row.source || "").trim() || "員工打卡";
    if (sourceFilter.size && !sourceFilter.has(source)) return false;
    const type = String(row.type || "").trim();
    if ((type === "上班" || type === "下班") && !typeFilter.has(type)) return false;
    const area = String(row.area || "").trim();
    if (area === "田間" || area === "工廠") return areaFilter.has(area);
    return true;
  });
}

function renderTable() {
  const rows = filteredRows();
  wrapEl.innerHTML = "";
  if (!allRows.length) {
    const p = document.createElement("p");
    p.className = "empty-msg";
    p.textContent = "此條件無資料顯示";
    wrapEl.append(p);
    return;
  }
  if (!rows.length) {
    const p = document.createElement("p");
    p.className = "empty-msg";
    p.textContent = "此條件無資料顯示";
    wrapEl.append(p);
    return;
  }
  const table = document.createElement("table");
  table.className = "punch-table";
  table.innerHTML =
    "<thead><tr><th></th><th>日期</th><th>時間</th><th>員工</th><th>類型</th><th>區域</th><th>來源</th><th>狀態</th></tr></thead>";
  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const index = allRows.indexOf(row);
    const tr = document.createElement("tr");
    if (isVoidRow(row)) tr.classList.add("voided");
    else if (isPendingRow(row)) tr.classList.add("pending");
    const tdCheck = document.createElement("td");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.index = String(index);
    cb.disabled = isVoidRow(row);
    tdCheck.append(cb);
    tr.append(tdCheck);
    [shortDate(row.date), hm(row.time), row.name, row.type, row.area, row.source, row.status || (isPendingRow(row) ? "待確認" : "")].forEach((val) => {
      const td = document.createElement("td");
      td.textContent = String(val ?? "");
      tr.append(td);
    });
    tbody.append(tr);
  });
  table.append(tbody);
  wrapEl.append(table);
}

function selectedVoidRows() {
  const picked = [];
  wrapEl.querySelectorAll("tbody input[type='checkbox']").forEach((cb) => {
    if (!cb.checked || cb.disabled) return;
    const row = allRows[Number(cb.dataset.index)];
    if (row) picked.push(row);
  });
  return picked;
}

STAFF.forEach((person) => {
  const opt = document.createElement("option");
  opt.value = person;
  opt.textContent = person;
  nameEl.append(opt);
});

function syncPeriodFields() {
  const isDay = periodKind === "day";
  dayWrap.hidden = !isDay;
  rangeWrap.hidden = isDay;
}

function queryDates() {
  if (periodKind === "day") {
    if (!dayEl.value) return { error: "請選查詢日期" };
    return { from: dayEl.value, to: dayEl.value };
  }
  if (!fromEl.value) return { error: "請選起始日期" };
  if (!toEl.value) toEl.value = fromEl.value;
  if (toEl.value < fromEl.value) return { error: "迄日不可早於起日" };
  return { from: fromEl.value, to: toEl.value };
}

dayEl.value = todayTaipei();
fromEl.value = todayTaipei();
toEl.value = todayTaipei();
syncPeriodFields();

document.querySelectorAll("[data-period]").forEach((btn) => {
  btn.addEventListener("click", () => {
    periodKind = btn.getAttribute("data-period") || "day";
    document.querySelectorAll("[data-period]").forEach((el) => {
      el.classList.toggle("on", el === btn);
    });
    syncPeriodFields();
    scheduleLoad();
  });
});

fromEl.addEventListener("change", () => {
  if (!toEl.value || toEl.value < fromEl.value) toEl.value = fromEl.value;
  scheduleLoad();
});
toEl.addEventListener("change", scheduleLoad);
dayEl.addEventListener("change", scheduleLoad);
nameEl.addEventListener("change", scheduleLoad);

function bindFilter(attr, set) {
  document.querySelectorAll("[" + attr + "]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.getAttribute(attr) || "";
      if (set.has(value)) set.delete(value);
      else set.add(value);
      btn.classList.toggle("on", set.has(value));
      if (!sourceFilter.size) {
        setStatus(statusEl, "請選來源（員工打卡或會計補打卡）", "err");
        renderTable();
        return;
      }
      if (!areaFilter.size) {
        setStatus(statusEl, "請選區域（田間或工廠）", "err");
        renderTable();
        return;
      }
      if (!typeFilter.size) {
        setStatus(statusEl, "請選類型（上班或下班）", "err");
        renderTable();
        return;
      }
      if (allRows.length) {
        renderTable();
        const shown = filteredRows().length;
        setStatus(statusEl, shown ? `已載入 ${shown} 筆。` : "此條件無資料顯示", "ok");
      }
    });
  });
}

bindFilter("data-area-filter", areaFilter);
bindFilter("data-source-filter", sourceFilter);
bindFilter("data-type-filter", typeFilter);

scriptInput.value = scriptUrl();
document.getElementById("saveUrl").addEventListener("click", () => {
  localStorage.setItem("punch-script-url", scriptInput.value.trim());
  setStatus(statusEl, "已儲存腳本網址", "ok");
});

async function loadPunches() {
  const dates = queryDates();
  if (dates.error) {
    setStatus(statusEl, dates.error, "err");
    return;
  }
  if (!sourceFilter.size) {
    setStatus(statusEl, "請選來源（員工打卡或會計補打卡）", "err");
    return;
  }
  if (!areaFilter.size) {
    setStatus(statusEl, "請選區域（田間或工廠）", "err");
    return;
  }
  if (!typeFilter.size) {
    setStatus(statusEl, "請選類型（上班或下班）", "err");
    return;
  }
  const seq = ++loadSeq;
  linksEl.innerHTML = "";
  setStatus(statusEl, "載入紀錄中…");
  try {
    const who = selectedName();
    const data = await postScript({
      action: "listPunches",
      from: dates.from,
      to: dates.to,
      names: who ? [who] : [...STAFF],
    });
    if (seq !== loadSeq) return;
    allRows = Array.isArray(data.rows) ? data.rows : [];
    renderTable();
    const shown = filteredRows().length;
    setStatus(
      statusEl,
      shown ? `已載入 ${shown} 筆。` : "此條件無資料顯示",
      "ok",
    );
  } catch (err) {
    if (seq !== loadSeq) return;
    setStatus(statusEl, err instanceof Error ? err.message : "載入失敗", "err");
  }
}

function scheduleLoad() {
  clearTimeout(loadTimer);
  loadTimer = setTimeout(() => {
    loadPunches();
  }, 200);
}

document.getElementById("void-submit").addEventListener("click", async () => {
  const picked = selectedVoidRows();
  if (!picked.length) {
    setStatus(statusEl, "請勾選要作廢的打卡", "err");
    return;
  }
  linksEl.innerHTML = "";
  setStatus(statusEl, "正在以紅線作廢…");
  try {
    const data = await postScript({
      action: "voidPunch",
      ids: picked.map((row) => row.id).filter((id) => id != null && id !== ""),
    });
    const count = data.count || picked.length;
    try {
      await loadPunches();
    } catch {
      picked.forEach((row) => {
        row.status = "作廢";
      });
      renderTable();
    }
    setStatus(statusEl, `已作廢 ${count} 筆（表上仍保留，紅線槓掉）。`, "ok");
    if (data.spreadsheetUrl) {
      linksEl.innerHTML = `<p><a href="${data.spreadsheetUrl}" target="_blank" rel="noreferrer">開啟打卡試算表</a></p>`;
    }
  } catch (err) {
    setStatus(statusEl, err instanceof Error ? err.message : "作廢失敗", "err");
  }
});

renderTable();
scheduleLoad();
