const namesEl = document.getElementById("names");
const statusEl = document.getElementById("status");
const scriptInput = document.getElementById("scriptUrl");
const nowEl = document.getElementById("now");

function formatNow() {
  return new Date().toLocaleString("zh-Hant-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function tickClock() {
  if (nowEl) nowEl.textContent = "現在時間 " + formatNow();
}

tickClock();
setInterval(tickClock, 1000);

let name = "";
let type = "";
let area = "";

STAFF.forEach((person) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "chip";
  btn.textContent = person;
  btn.addEventListener("click", () => {
    name = person;
    for (const el of namesEl.children) el.classList.toggle("on", el.textContent === person);
  });
  namesEl.append(btn);
});

document.querySelectorAll(".choice").forEach((btn) => {
  btn.addEventListener("click", () => {
    const kind = btn.dataset.kind;
    const value = btn.dataset.value;
    if (kind === "type") type = value;
    if (kind === "area") area = value;
    document.querySelectorAll(`.choice[data-kind="${kind}"]`).forEach((el) => {
      el.classList.toggle("on", el === btn);
    });
  });
});

scriptInput.value = scriptUrl();
document.getElementById("saveUrl").addEventListener("click", () => {
  localStorage.setItem("punch-script-url", scriptInput.value.trim());
  setStatus(statusEl, "已儲存腳本網址", "ok");
});

document.getElementById("submit").addEventListener("click", async () => {
  if (!name || !type || !area) {
    setStatus(statusEl, "請選姓名、上班或下班、以及區域", "err");
    return;
  }
  setStatus(statusEl, "送出中…");
  try {
    const data = await postScript({
      action: "punch",
      name,
      type,
      area,
      at: new Date().toISOString(),
    });
    let msg = `${name} ${area} ${type} 已寫入。請打開試算表最下方名為「打卡」的工作表。`;
    if (data.spreadsheetUrl) {
      msg += " 連結：" + data.spreadsheetUrl;
    }
    setStatus(statusEl, msg, "ok");
  } catch (err) {
    setStatus(statusEl, err instanceof Error ? err.message : "送出失敗", "err");
  }
});
