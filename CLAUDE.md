# 活動 Web App — 開發手冊

## 專案架構

純靜態前端（GitHub Pages）+ Google Apps Script API Layer + Google Services，費用 $0。

| 層級 | 技術 | 用途 |
|------|------|------|
| 前台（參與者） | GitHub Pages 純 HTML/CSS/JS | 登入、任務流程、簽退 |
| 後台（工作人員） | GitHub Pages 純 HTML/CSS/JS | 儀表板、掃碼、核銷 |
| API Layer | Apps Script Web App (doPost) | 驗證、批次上傳、掃碼核銷 |
| 資料庫 | Google Sheets | 200人資料主表 |
| 檔案儲存 | Google Drive | 個人資料夾（照片 + PDF） |
| 通知 | Gmail via Apps Script | 活動前通知 + 可選 PDF 寄送 |

## 資料夾結構

```
/ (GitHub Pages root)
├── index.html          # 前台登入
├── home.html           # 主頁面
├── info.html           # 個人資訊 + 報到 QR Code
├── safety.html         # 安全提醒
├── route.html          # 路線（靜態圖片，獨立頁面）
├── mission.html        # 使命任務（①～⑥）
├── admin/
│   ├── index.html      # 後台密碼登入
│   ├── dashboard.html  # 儀表板
│   ├── checkin.html    # 報到掃碼
│   ├── checkout.html   # 簽退掃碼
│   └── manage.html     # 手動核銷
├── css/style.css
├── js/
│   ├── auth.js         # session + localStorage（12h 過期）
│   ├── api.js          # Apps Script API 呼叫 + 指數退避重試
│   └── mission.js      # 任務流程狀態機
├── lib/                # 第三方函式庫（本地 bundle，不用 CDN）
│   ├── qrcode.min.js
│   ├── jsQR.min.js
│   ├── signature_pad.min.js
│   └── jspdf.umd.min.js
└── apps-script/        # 本地版控，不由 GitHub Pages 服務
    ├── Code.gs         # doPost 主路由
    ├── Auth.gs         # AV 端點
    ├── Batch.gs        # AB 端點
    └── Scan.gs         # AC 端點
```

## Apps Script 三個端點

| 端點 | action 值 | 功能 | 對應前端 |
|------|-----------|------|----------|
| AV | `auth` | token + 驗證碼比對，回傳個人資料 | 前台登入 |
| AB | `batch` | 建 Drive 資料夾 → 上傳照片 → 上傳 PDF → 更新 Sheets → 可選 Gmail | 前台 ⑥ 批次送出 |
| AC | `scan` | 報到 / 簽退 / 手動核銷寫入 | 後台掃碼 |

部署方式：Execute as **Me**，Who has access **Anyone**。
部署後不要建新部署（URL 會變），統一用「編輯現有部署」更新版本。

## 鐵律（每次寫 Apps Script 必遵守）

1. **所有 Sheets 寫入必加 `LockService.getScriptLock().waitLock(10000)`**
2. **前端不儲存任何 token / 密碼 — 一律透過 API 比對後回傳**
3. **批次 API（AB）前端最多重試 3 次，採 Exponential Backoff**

## Session 邏輯（前台參與者）

- localStorage key：`user_session`
- 格式：`{ name, group, token, expiry }`（expiry = `Date.now() + 12 * 3600 * 1000`）
- 每次載入頁面先檢查 `expiry`，過期則清除並 redirect 到 `index.html`

## 任務解鎖邏輯（mission.html）

- ① 問卷 與 ②～⑤ 為**並行獨立**（各自 boolean flag）
- ⑥ 送出按鈕啟用條件：`mission1_done && mission5_done`（Checklist 驗證，非 Gated Unlock）
- 簽退 QR Code 在 ⑥ 送出成功後才顯示

## 使命⑤ PDF 取得二選一

| 選項 | 實作 | API 呼叫 |
|------|------|----------|
| 下載至手機 | 瀏覽器 Blob API | 0（純前端） |
| 輸入 Email 寄送 | 夾帶 email 欄位至 ⑥ 批次 API，Apps Script AB 觸發 Gmail | 含於 ⑥ 的 1 次 API |

## Gmail 配額警示

- Gmail.com 帳號上限：100 封/日（Apps Script）
- 活動前通知：分兩天寄（Day1: 100封，Day2: 剩餘）
- M5 Email 選項：若大量使用者選寄送有超限風險
  - **備案**：改用 `mailto:` 連結，讓使用者自己用 Email client 寄送（0 配額消耗）

## 第三方函式庫

| 函式庫 | 建議版本 | 說明 |
|--------|----------|------|
| qrcode.js | 1.5.3 | 產生報到 / 簽退 QR Code |
| jsQR | 1.4.0 | 後台掃碼解析 |
| signature_pad | 4.1.7 | 使命③ 手寫簽名 |
| jsPDF (umd build) | 2.5.1 | 使命④ 純前端 PDF 合成 |

所有函式庫**本地 bundle 至 `/lib/`，不依賴 CDN**（活動現場 CDN 不可用時無備案）。

## 開發階段參考

見 `development_stages_plan.html`（四階段，共 20–25 天）。

## 路徑規則（GitHub Pages 帳號轉移關鍵）

所有 HTML 檔案內的連結與資源引用，**一律用 `/` 開頭的絕對路徑**，禁止出現任何網域名稱：

```html
<!-- ✅ 正確 -->
<script src="/js/auth.js"></script>
<link rel="stylesheet" href="/css/style.css">
<a href="/home.html">回主頁</a>
<img src="/assets/route-map.jpg">

<!-- ❌ 禁止 -->
<script src="https://oopnqpq.github.io/activity-webapp/js/auth.js"></script>
```

環境相關的值（API URL、token、Form URL）只能出現在 `js/config.js`，其他檔案一律讀 `CONFIG.*`。

## 環境設定集中化（開發 → 客戶帳號移交）

前端所有環境相關的值集中在 `js/config.js`，不在其他檔案硬寫：

```js
// js/config.js
const CONFIG = {
  API_URL:     'https://script.google.com/macros/s/xxxxxxxx/exec',
  STAFF_TOKEN: 'your-token-here',
  FORM_URL_M1: 'https://forms.gle/xxxxxxxx',  // 使命① 問卷連結
};
```

移交步驟：
1. 客戶建 Sheets / Drive / Forms / Apps Script，取得各 ID
2. 客戶在 Apps Script 設 Script Properties，執行 `runSetupCheck()` 驗收
3. 客戶部署 Web App 取得新 `exec` URL
4. 開發者更新 `js/config.js`（API_URL、STAFF_TOKEN、Form URL）
5. GitHub repo transfer（Settings → Transfer）

## Google 環境變數（Script Properties）

在 Apps Script 編輯器 → 專案設定 → 指令碼屬性 設定：

| Key | 說明 |
|-----|------|
| `STAFF_TOKEN` | 前台 API 呼叫用的 token（前端 hardcode 或由登入回傳） |
| `ADMIN_PASSWORD` | 後台工作人員密碼 |
| `SHEET_ID` | Google Sheets 主資料表 ID |
| `DRIVE_FOLDER_ID` | Drive 根資料夾 ID（個人資料夾建在此之下） |
