# 📈 每日台股盤後快訊分享站 (Daily Stock Brief)

專為台股投資人設計的「極簡自動化盤後快訊聚合站」！
您不需要改變習慣撰寫的 Google Doc，只要在每天完成盤後分析後貼上連結，網頁就會自動成為您的專屬發布入口。

---

## ✨ 核心特色

1. **🔥 今日最新 Hero 卡片**：大大的專屬顯眼入口，朋友點進去直接開啟當天 Google Doc。
2. **👁️ 站內免跳轉預覽**：內建 Google Doc 預覽抽屜，手機/電腦不用離開網站就能滑閱。
3. **📊 訪客與閱讀計數器**：整合隱私無感計數器，即時統計今日閱讀人次與累計造訪。
4. **📋 一鍵複製與分享**：提供網站短網址與單篇文件的複製分享按鈕，傳 LINE 給朋友超方便。
5. **🗂️ 歷史快訊歸檔與搜尋**：下方收納所有歷史日期的盤後紀錄，支援即時關鍵字與日期篩選。
6. **🚀 極速靜態架構**：零伺服器維護負擔，完美支援 Vercel / GitHub Pages 免費部署。

---

## 📂 專案結構

```text
stock_daily_brief/
├── index.html          # 現代科技感入口網頁
├── style.css           # 玻璃擬態 (Glassmorphism) 深色主題樣式
├── app.js              # 訪客計數、搜尋檢索、模態框預覽與資料渲染
├── add_brief.py        # 每日發布小工具（終端機問答或一行指令即可新增）
├── vercel.json         # Vercel 快取與網址優化設定
└── data/
    └── briefs.json     # 快訊資料庫（儲存日期、標題、Google Doc 網址與標籤）
```

---

## 🛠️ 本地快速預覽

在 `stock_daily_brief` 目錄下執行任何靜態伺服器，或直接在瀏覽器開啟 `index.html`：

```bash
# 使用 Python 內建伺服器（推薦）
python -m http.server 8080
```
開啟瀏覽器訪問：`http://localhost:8080`

---

## 📝 每天如何發布新快訊？

### 方式 A：執行互動小工具（最推薦）
```bash
python add_brief.py
```
小工具會一步步引導您貼上當天的 Google Doc 連結、標題與標籤，自動寫入 `data/briefs.json`！

### 方式 B：單行指令快速新增
```bash
python add_brief.py --url "https://docs.google.com/document/d/..." --title "1031 盤後快訊"
```

### 方式 C：直接編輯 `data/briefs.json`
打開 `data/briefs.json`，在最上方新增一筆物件即可。

---

## 🚀 部署至 Vercel 教學

1. **建立 GitHub 儲存庫**：
   在 GitHub 上建立一個新的公開或私有儲存庫（如 `water819-png/stock-daily-brief`）。
2. **推送本機程式碼**：
   ```bash
   git init
   git add .
   git commit -m "feat: 初次建立每日台股盤後快訊分享站"
   git branch -M main
   git remote add origin https://github.com/water819-png/stock-daily-brief.git
   git push -u origin main
   ```
3. **在 Vercel 點選「Add New... ➔ Project」**：
   * 選擇 `stock-daily-brief` 儲存庫。
   * Framework Preset 保持預設（Other / Static HTML）。
   * 點擊 **Deploy**。
4. **自訂專屬短網址**：
   * 部署完成後，Vercel 會提供網址（如 `stock-daily-brief.vercel.app`）。
   * 可以在 Project Settings ➔ Domains 將其改成您喜歡的名字（例如 `water-stock-brief.vercel.app`）！
