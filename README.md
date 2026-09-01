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

## 架在 Render

這個專案是靜態網頁，不必裝資料庫。在 [Render](https://render.com) 用同一個 GitHub 帳號登入後：

1. **New → Static Site**
2. 連到倉庫 `chungyafang188-wq/staff-punch`，分支 `master`
3. Build Command 留空
4. Publish Directory 填 `.`
5. Create Static Site

或在 Render 選 **New → Blueprint**，會讀倉庫根目錄的 `render.yaml`。

完成後網址會是類似 `https://staff-punch.onrender.com/`：

- 打卡：`https://你的網址/`
- 補打卡：`https://你的網址/makeup.html`
- 紀錄：`https://你的網址/records.html`
- 統計：`https://你的網址/stats.html`

Google 試算表腳本不用搬到 Render，仍用 Apps Script。

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
