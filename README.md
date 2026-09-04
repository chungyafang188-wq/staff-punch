# 員工打卡與出勤統計

員工在手機打卡；會計補打卡與出勤統計。資料寫入你的 Google 雲端試算表。不必把 Google 密碼給這個網頁。

- 員工：武、定、好、青、山、香
- 類型：上班／下班
- 區域：田間／工廠

## 公開網址（任意電腦、手機可開）

- 工人打卡：https://chungyafang188-wq.github.io/staff-punch/
- 會計補打卡：https://chungyafang188-wq.github.io/staff-punch/makeup.html
- 出勤紀錄：https://chungyafang188-wq.github.io/staff-punch/records.html
- 出勤統計：https://chungyafang188-wq.github.io/staff-punch/stats.html

工人請只用打卡網址。會計請用補打卡／紀錄／統計網址。

## 架在 Render（請用 Web Service）

程式已推到 GitHub。請用 **同一個 GitHub 帳號** 登入 [Render](https://dashboard.render.com)，然後：

1. 右上角 **New +** → **Web Service**
2. 連 GitHub，選倉庫 **staff-punch**（若第一次要按 **Connect GitHub** 授權）
3. 設定如下（多數會自動填）：
   - Name：`staff-punch`
   - Region：**Singapore**
   - Branch：`master`
   - Runtime：**Node**
   - Build Command：`npm install`
   - Start Command：`npm start`
   - Instance：**Free**
4. **Deploy Web Service**

或 **New → Blueprint**，選這個倉庫，會讀 `render.yaml` 自動建。

完成後網址類似 `https://staff-punch.onrender.com`：

- 打卡：`https://你的網址/`
- 補打卡：`https://你的網址/makeup.html`
- 紀錄：`https://你的網址/records.html`
- 統計：`https://你的網址/stats.html`

免費方案約 15 分鐘沒人用會休眠，第一次再開可能等 30～60 秒。資料仍寫 Google 試算表，不必在 Render 填試算表密碼。

## 本機預覽

```bash
cd C:\Users\user\staff-punch
npx --yes serve -l 3000 .
```

- 打卡：http://localhost:3000/
- 補打卡：http://localhost:3000/makeup.html
- 出勤紀錄：http://localhost:3000/records.html
- 統計：http://localhost:3000/stats.html

請用瀏覽器網址打開，不要從檔案總管雙擊 HTML。

## Google 試算表

腳本網址已寫在網頁裡。之後若改 `apps-script/Code.gs`：貼上儲存後，**部署 → 管理部署作業 → 新版本**。
