const namesEl = document.getElementById("names");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const scriptInput = document.getElementById("scriptUrl");
const fromEl = document.getElementById("from");
const toEl = document.getElementById("to");

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
  try {
    const data = await postScript({
      action: "stats",
      from,
      to,
      names: [...selected],
    });
    const people = data.people ?? 0;
    setStatus(
      statusEl,
      `已寫入「員工出勤統計表」。期間出勤人數：${people}` +
        (data.spreadsheetUrl ? "（可在回傳連結開啟）" : ""),
      "ok",
    );
    if (data.spreadsheetUrl) {
      const link = document.createElement("p");
      link.innerHTML = `<a href="${data.spreadsheetUrl}" target="_blank" rel="noreferrer">開啟員工出勤統計表</a>`;
      resultEl.append(link);
    }
    if (Array.isArray(data.rows) && data.rows.length) {
      const table = document.createElement("table");
      table.innerHTML =
        "<thead><tr><th>員工</th><th>打卡筆數</th><th>上班</th><th>下班</th><th>田間</th><th>工廠</th><th>有出勤</th></tr></thead>";
      const tbody = document.createElement("tbody");
      for (const row of data.rows) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${row.name}</td><td>${row.punches}</td><td>${row.clockIn}</td><td>${row.clockOut}</td><td>${row.field}</td><td>${row.factory}</td><td>${row.present ? "是" : "否"}</td>`;
        tbody.append(tr);
      }
      table.append(tbody);
      resultEl.append(table);
    }
  } catch (err) {
    setStatus(statusEl, err instanceof Error ? err.message : "統計失敗", "err");
  }
});
