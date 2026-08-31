const STAFF = ["武", "定", "好", "青", "山", "香"];
const DEFAULT_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyHvLlQWH5W2LB5opOKhFQdXTYUbisUOMFbu0qka3bzXH-DYQU0xB1BSJSjyqXWPZ3YdA/exec";
const OLD_SCRIPT_URLS = [
  "https://script.google.com/macros/s/AKfycbzSJtBERIufam9XMAFMmnsckChiNhTozP8gxmJXKh4rODbWFD-922q6-2Tato8DdkpCjQ/exec",
  "https://script.google.com/macros/s/AKfycbyPbepBNl6WsSeZRryOTu0zeZh4fwHOgAncKSsq6XYrBaO89AxzdGBZrfmEqXMwUFIBiQ/exec",
  "https://script.google.com/macros/s/AKfycbz--U2auMzgVqFhYQOF2wf6UEje6u2KZp7rAIvC-0XJcRdYjlTufVcZMI-lAKRWwRiGpg/exec",
  "https://script.google.com/macros/s/AKfycbwW74vDGmEchQGcwCOY-D7CVyC6JR7OnmUVAhLG9ewG46IT1qb5sbQaBTwcXa6wrWGJIg/exec",
  "https://script.google.com/macros/s/AKfycbzXbiXb5lLoJ3KwyWjYwrZdXVw0aJ20wT7S90reldGwZuOEjZQunSVxAdV6_iXeZr3DZQ/exec",
  "https://script.google.com/macros/s/AKfycbyLfXa5VlzBQDurTo_jvMKn7Vf-pjxXic1y4b-N60c7UOVAgSgpuEgqncnOX1N0C8TODg/exec",
  "https://script.google.com/macros/s/AKfycbzOKqoHdCRYTUCot1z18Es-Xa57vaLTotiYCyZtQL_aBazRa5XXMb3CqvmY-JJyUhZ3mQ/exec",
];

function scriptUrl() {
  const saved = (localStorage.getItem("punch-script-url") || "").trim();
  if (saved && OLD_SCRIPT_URLS.indexOf(saved) !== -1) {
    localStorage.removeItem("punch-script-url");
    return DEFAULT_SCRIPT_URL;
  }
  if (saved.indexOf("script.google.com") !== -1 && saved.indexOf("/exec") !== -1) {
    return saved;
  }
  return DEFAULT_SCRIPT_URL;
}

function setStatus(el, text, kind) {
  el.textContent = text;
  el.className = "status" + (kind ? " " + kind : "");
}

function taipeiDateTime() {
  const now = new Date();
  const date = now.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }).replace(/-/g, "/");
  const time = now.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return { date, time, at: now.toISOString() };
}

function pad2(n) {
  return (n < 10 ? "0" : "") + n;
}

function parseTypedTime(value) {
  var raw = String(value || "")
    .trim()
    .replace(/：/g, ":")
    .replace(/．/g, ":")
    .replace(/\./g, ":")
    .replace(/\s/g, "");
  if (!raw) return "";
  var h;
  var m;
  var s = 0;
  var matched = raw.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (matched) {
    h = Number(matched[1]);
    m = Number(matched[2]);
    s = Number(matched[3] || 0);
  } else if (/^\d{3,6}$/.test(raw)) {
    if (raw.length === 3) {
      h = Number(raw.slice(0, 1));
      m = Number(raw.slice(1));
    } else if (raw.length === 4) {
      h = Number(raw.slice(0, 2));
      m = Number(raw.slice(2));
    } else if (raw.length === 5) {
      h = Number(raw.slice(0, 1));
      m = Number(raw.slice(1, 3));
      s = Number(raw.slice(3));
    } else {
      h = Number(raw.slice(0, 2));
      m = Number(raw.slice(2, 4));
      s = Number(raw.slice(4));
    }
  } else {
    return "";
  }
  if (!isFinite(h) || !isFinite(m) || !isFinite(s) || h > 23 || m > 59 || s > 59) return "";
  return pad2(h) + ":" + pad2(m) + ":" + pad2(s);
}

function roundPayTime(timeText) {
  const t = parseTypedTime(timeText);
  if (!t) return "";
  let h = Number(t.slice(0, 2));
  let m = Number(t.slice(3, 5));
  if (m < 15) m = 0;
  else if (m < 45) m = 30;
  else {
    m = 0;
    h += 1;
    if (h > 23) h = 0;
  }
  return pad2(h) + ":" + pad2(m) + ":00";
}

function hm(timeText) {
  const t = parseTypedTime(timeText) || String(timeText || "");
  return t ? t.slice(0, 5) : "";
}

async function postScript(payload) {
  const url = scriptUrl().trim();
  if (!url) throw new Error("請先展開會計頁「進階：連到 Google 雲端」貼上 Apps Script 網址");
  if (!url.includes("script.google.com")) {
    throw new Error("請貼網頁應用程式網址（含 script.google.com），不是試算表分享連結");
  }
  if (location.protocol === "file:") {
    throw new Error("請不要直接雙擊 HTML。用本機網址打開（例如 http://localhost:3000）再打卡");
  }
  const text = await fetchScript(url, payload);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("腳本沒有回傳正確資料。請重新部署網頁應用程式，對象選「任何人」");
  }
  if (!data.ok) {
    const err = data.error || "送出失敗";
    if (String(err).indexOf("未知動作") !== -1) {
      throw new Error("線上腳本還是舊版。請把 Code.gs 整份貼上，對「網頁應用程式」發新版本（不是程式庫）");
    }
    throw new Error(err);
  }
  return data;
}

async function fetchScript(url, payload) {
  const endpoint = new URL(url);
  endpoint.searchParams.set("payload", JSON.stringify(payload));
  let res;
  try {
    res = await fetch(endpoint.toString(), { method: "GET", redirect: "follow" });
  } catch {
    throw new Error(
      "連不到 Google 腳本。請確認用網址打開頁面，且 Apps Script 網頁應用程式已發新版本、對象選任何人",
    );
  }
  return res.text();
}
