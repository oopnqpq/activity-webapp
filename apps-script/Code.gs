/**
 * Code.gs — doPost 主路由 + 共用工具
 *
 * 所有 API 請求由此分派到對應端點：
 *   action=auth  → Auth.verify()
 *   action=batch → Batch.upload()
 *   action=scan  → Scan.process()
 */

// Sheets 欄位索引（0-based，對應 getValues() 回傳的陣列）
var COL = {
  NAME:       0,  // A 姓名
  EMAIL:      1,  // B Email
  CODE:       2,  // C 驗證碼
  GROUP:      3,  // D 分組
  CHECKIN:    4,  // E 報到時間
  MISSION:    5,  // F 任務完成時間
  CHECKOUT:   6,  // G 簽退時間
  DRIVE_ID:   7,  // H Drive資料夾ID
  MANUAL:     8,  // I 手動核銷
  NOTE:       9,  // J 備註
};

function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);

    if (params.token !== _getProp('STAFF_TOKEN')) {
      return _respond({ success: false, error: 'Unauthorized' });
    }

    switch (params.action) {
      case 'auth':       return Auth.verify(params);
      case 'admin_auth': return Auth.adminAuth(params);
      case 'scan':       return Scan.process(params);
      case 'stats':      return Scan.stats();
      case 'lookup':     return Scan.lookup(params);
      case 'batch':      return Batch.upload(params);
      default:           return _respond({ success: false, error: 'Unknown action' });
    }
  } catch (err) {
    return _respond({ success: false, error: err.message });
  }
}

// ── 共用工具（所有 .gs 檔可直接呼叫）──────────────────────────

function _respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function _getProp(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function _getSheet() {
  return SpreadsheetApp
    .openById(_getProp('SHEET_ID'))
    .getSheetByName('主資料');
}

function _timestamp() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
}
