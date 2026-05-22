/**
 * Setup.gs — 環境驗收函式
 *
 * 用途：客戶帳號完成部署後，手動執行一次 runSetupCheck()，
 *       確認所有 Script Properties 與 Google 服務存取均正常。
 *
 * 使用方式：
 *   Apps Script 編輯器 → 選取函式 runSetupCheck → 點擊「執行」
 *   結果在「執行紀錄」查看（View → Logs）
 *
 * 需要事先在 Script Properties 設定的 Key：
 *   SHEET_ID         Google Sheets 主資料表 ID
 *   DRIVE_FOLDER_ID  Drive 根資料夾 ID
 *   STAFF_TOKEN      前台 API 呼叫 token
 *   ADMIN_PASSWORD   後台工作人員密碼
 */

function runSetupCheck() {
  const props = PropertiesService.getScriptProperties();

  const checks = {
    'SHEET_ID 已設定':        !!props.getProperty('SHEET_ID'),
    'DRIVE_FOLDER_ID 已設定': !!props.getProperty('DRIVE_FOLDER_ID'),
    'STAFF_TOKEN 已設定':     !!props.getProperty('STAFF_TOKEN'),
    'ADMIN_PASSWORD 已設定':  !!props.getProperty('ADMIN_PASSWORD'),
    'Sheets 可存取':          _canAccessSheet(props.getProperty('SHEET_ID')),
    'Drive 資料夾可存取':      _canAccessDrive(props.getProperty('DRIVE_FOLDER_ID')),
    'Gmail 可寄信':           _canSendGmail(),
  };

  const passed = Object.values(checks).filter(Boolean).length;
  const total  = Object.keys(checks).length;

  const lines = Object.entries(checks).map(([k, v]) => `${v ? '✅' : '❌'} ${k}`);
  lines.push('');
  lines.push(`結果：${passed} / ${total} 項通過`);

  if (passed === total) {
    lines.push('🎉 所有項目通過，環境設定完成！');
  } else {
    lines.push('⚠️  有項目未通過，請檢查 Script Properties 設定後再次執行。');
  }

  Logger.log(lines.join('\n'));
}

// ── 內部檢查函式 ──────────────────────────────────────────────

function _canAccessSheet(id) {
  if (!id) return false;
  try {
    SpreadsheetApp.openById(id);
    return true;
  } catch (e) {
    return false;
  }
}

function _canAccessDrive(id) {
  if (!id) return false;
  try {
    DriveApp.getFolderById(id);
    return true;
  } catch (e) {
    return false;
  }
}

function _canSendGmail() {
  try {
    // 只檢查 quota，不實際寄信
    const remaining = MailApp.getRemainingDailyQuota();
    return remaining > 0;
  } catch (e) {
    return false;
  }
}
