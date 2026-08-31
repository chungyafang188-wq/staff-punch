const namesEl = document.getElementById("names");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const scriptInput = document.getElementById("scriptUrl");
const fromEl = document.getElementById("from");
const toEl = document.getElementById("to");
const exportBtn = document.getElementById("export-excel");

const PERSON_HEADERS = ["員工", "上班時間", "下班時間", "田區時數", "工廠時數", "午休", "合計時數", "出勤日數"];
const DETAIL_HEADERS = ["日期", "員工", "區域", "上班時間", "下班時間", "毛時數", "午休", "實工時"];
let lastExport = null;

function hoursText(value) {
  const n = Number(value);
  if (!isFinite(n) || n === 0) return "0.00";
  return n.toFixed(2);
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function excelCell(value) {
  const raw = value == null ? "" : value;
  if (typeof raw === "number" && isFinite(raw)) {
    return `<Cell><Data ss:Type="Number">${raw}</Data></Cell>`;
  }
  const text = String(raw);
  if (text !== "" && /^-?\d+(\.\d+)?$/.test(text)) {
    return `<Cell><Data ss:Type="Number">${text}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${xmlEscape(text)}</Data></Cell>`;
}

function excelRow(cells) {
  return `<Row>${cells.map(excelCell).join("")}</Row>`;
}

function downloadExcel(filename, sheets) {
  const worksheets = sheets
    .map((sheet) => {
      const rows = sheet.rows.map(excelRow).join("");
      return `<Worksheet ss:Name="${xmlEscape(sheet.name)}"><Table>${rows}</Table></Worksheet>`;
    })
    .join("");
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<?mso-application progid="Excel.Sheet"?>\n` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    worksheets +
    `</Workbook>`;
  const blob = new Blob(["\uFEFF" + xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function personCells(row) {
  return [
    row.name,
    row.clockInAt || "",
    row.clockOutAt || "",
    hoursText(row.fieldHours),
    hoursText(row.factoryHours),
    hoursText(row.lunchHours),
    hoursText(row.hours),
    row.days ?? 0,
  ];
}

function segmentCells(seg) {
  return [
    seg.date,
    seg.name,
    seg.area,
    seg.clockInTime || seg.clockInAt || "",
    seg.clockOutTime || seg.clockOutAt || "",
    hoursText(seg.grossHours != null ? seg.grossHours : seg.hours),
    hoursText(seg.lunchHours),
    hoursText(seg.hours),
  ];
}

function appendTable(title, headers, rows) {
  const block = document.createElement("div");
  block.className = "table-wrap";
  const h = document.createElement("h2");
  h.textContent = title;
  const table = document.createElement("table");
  table.innerHTML = `<thead><tr>${headers.map((x) => `<th>${x}</th>`).join("")}</tr></thead>`;
  const tbody = document.createElement("tbody");
  rows.forEach((cells) => {
    const tr = document.createElement("tr");
    tr.innerHTML = cells.map((x) => `<td>${x}</td>`).join("");
    tbody.append(tr);
  });
  table.append(tbody);
  block.append(h, table);
  resultEl.append(block);
}

const selected = new Set();

STAFF.forEach((person) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "chip";
  btn.textContent = person;
  btn.addEventListener("click", () => {
    if (selected.has(person)) selected.delete(person);
    else selected.add(person);
    btn.classList.toggle("on", selected.has(person));
  });
  namesEl.append(btn);
});

const allBtn = document.createElement("button");
allBtn.type = "button";
allBtn.className = "chip";
allBtn.textContent = "全選";
allBtn.addEventListener("click", () => {
  const allOn = selected.size === STAFF.length;
  selected.clear();
  for (const el of namesEl.querySelectorAll(".chip")) {
    if (el === allBtn) continue;
    if (!allOn) selected.add(el.textContent);
    el.classList.toggle("on", !allOn);
  }
});
namesEl.prepend(allBtn);

scriptInput.value = scriptUrl();
document.getElementById("saveUrl").addEventListener("click", () => {
  localStorage.setItem("punch-script-url", scriptInput.value.trim());
  setStatus(statusEl, "已儲存腳本網址", "ok");
});

exportBtn.addEventListener("click", () => {
  if (!lastExport) {
    setStatus(statusEl, "請先統計再匯出", "err");
    return;
  }
  const from = lastExport.from;
  const to = lastExport.to;
  const sheets = [
    {
      name: "人別時數",
      rows: [
        ["期間", from, "至", to],
        ["出勤人數", lastExport.people],
        [],
        PERSON_HEADERS,
        ...lastExport.rows.map(personCells),
      ],
    },
  ];
  if (lastExport.segments.length) {
    sheets.push({
      name: "工時明細",
      rows: [DETAIL_HEADERS, ...lastExport.segments.map(segmentCells)],
    });
  }
  downloadExcel(`出勤統計_${from}_${to}.xls`, sheets);
  setStatus(statusEl, "已下載 Excel 檔", "ok");
});

document.getElementById("run").addEventListener("click", async () => {
  const from = fromEl.value;
  const to = toEl.value;
  if (!from || !to) {
    setStatus(statusEl, "請選擇出勤起、迄日期", "err");
    return;
  }
  if (selected.size === 0) {
    setStatus(statusEl, "請至少選一位員工", "err");
    return;
  }
  setStatus(statusEl, "統計中…");
  resultEl.innerHTML = "";
  exportBtn.hidden = true;
  lastExport = null;
  try {
    const data = await postScript({
      action: "stats",
      from,
      to,
      names: [...selected],
    });
    const people = data.people ?? 0;
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const segments = Array.isArray(data.segments) ? data.segments : [];
    lastExport = { from, to, people, rows, segments };
    setStatus(statusEl, `期間出勤人數：${people}。時數由成對的上班、下班計算。`, "ok");
    if (data.spreadsheetUrl) {
      const link = document.createElement("p");
      link.innerHTML = `<a href="${data.spreadsheetUrl}" target="_blank" rel="noreferrer">開啟員工出勤統計表</a>`;
      resultEl.append(link);
    }
    if (rows.length) {
      appendTable(
        "人別時數",
        PERSON_HEADERS,
        rows.map(personCells),
      );
    }
    if (segments.length) {
      appendTable("工時明細", DETAIL_HEADERS, segments.map(segmentCells));
    } else {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "這段期間沒有成對的上班／下班，所以沒有時數。請確認打卡有上、下班各一筆。";
      resultEl.append(p);
    }
    exportBtn.hidden = false;
  } catch (err) {
    setStatus(statusEl, err instanceof Error ? err.message : "統計失敗", "err");
  }
});
