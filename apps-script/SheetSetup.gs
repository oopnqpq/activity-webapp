/**
 * SheetSetup.gs — 主資料表初始化
 *
 * 使用方式：
 *   1. 在 Google Sheets 建立新試算表
 *   2. 點選 擴充功能 → Apps Script
 *   3. 貼上此檔案內容，選取 setupMainSheet → 執行
 *   4. 執行完成後關閉 Apps Script，回到試算表確認結果
 */

function setupMainSheet() {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const sheet  = ss.getActiveSheet();

  sheet.setName('主資料');

  // ── 欄位標題 ──────────────────────────────────────────────
  const headers = [
    '姓名',         // A
    'Email',        // B
    '驗證碼',       // C
    '分組',         // D
    '報到時間',     // E
    '任務完成時間', // F
    '簽退時間',     // G
    'Drive資料夾ID',// H
    '手動核銷',     // I
    '備註',         // J
  ];

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);

  // ── 標題列樣式 ────────────────────────────────────────────
  headerRange
    .setBackground('#4a4a4a')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontSize(11);

  // ── 欄寬設定 ──────────────────────────────────────────────
  const colWidths = [100, 200, 80, 80, 150, 150, 150, 220, 80, 150];
  colWidths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  // ── 凍結第一列 ────────────────────────────────────────────
  sheet.setFrozenRows(1);

  // ── 驗證碼欄：格式設為純文字（避免前導零被吃掉）──────────
  sheet.getRange('C2:C').setNumberFormat('@');

  // ── 驗證碼重複偵測：條件格式標紅色 ───────────────────────
  const dupRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=COUNTIF($C:$C,C2)>1')
    .setBackground('#f4cccc')
    .setFontColor('#cc0000')
    .setRanges([sheet.getRange('C2:C')])
    .build();

  sheet.setConditionalFormatRules([dupRule]);

  // ── 手動核銷欄：核取方塊 ──────────────────────────────────
  sheet.getRange('I2:I').insertCheckboxes();

  // ── 試算表 ID 顯示（方便複製到 Script Properties）─────────
  const id = ss.getId();
  Logger.log('✅ 主資料表建立完成');
  Logger.log('📋 SHEET_ID = ' + id);
  Logger.log('請將此 ID 設定到 Apps Script → Script Properties → SHEET_ID');
}
