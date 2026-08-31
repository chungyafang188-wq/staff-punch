const STAFF = ["武", "定", "好", "青", "山", "香"];

function scriptUrl() {
  return localStorage.getItem("punch-script-url") || "";
}

function setStatus(el, text, kind) {
  el.textContent = text;
  el.className = "status" + (kind ? " " + kind : "");
}

async function postScript(payload) {
  const url = scriptUrl().trim();
  if (!url) throw new Error("請先在「老闆設定」貼上 Apps Script 網址");
  if (!url.includes("script.google.com")) {
    throw new Error("請貼網頁應用程式網址（含 script.google.com），不是試算表分享連結");
  }
  if (location.protocol === "file:") {
    throw new Error("請不要直接雙擊 HTML。用本機網址打開（例如 http://localhost:3000）再打卡");
  }
  const endpoint = new URL(url);
  endpoint.searchParams.set("payload", JSON.stringify(payload));
  let res;
  try {
    res = await fetch(endpoint.toString(), { method: "GET", redirect: "follow" });
  } catch {
    throw new Error(
      "連不到 Google 腳本。請確認：1. 用 http 網址開打卡頁 2. 腳本已部署為「任何人」 3. 改過程式後要「管理部署作業」發新版本",
    );
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("腳本沒有回傳正確資料。請重新部署網頁應用程式，對象選「任何人」");
  }
  if (!data.ok) throw new Error(data.error || "送出失敗");
  return data;
}
