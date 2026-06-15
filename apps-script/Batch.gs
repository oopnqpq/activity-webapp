/**
 * Batch.gs — AB 端點
 *
 * action = 'batch'
 * 接收：{ action, token, name, code, photo, photoMime, pdf, email? }
 * 處理：建 Drive 資料夾 → 上傳照片 → 上傳 PDF → 更新 Sheets → 可選 Gmail
 *
 * Lock 策略：只在 Sheets 讀寫時持鎖（短暫），Drive 操作在 Lock 外執行
 * Lock①：讀取 + 防重複 + 寫「PROCESSING」佔位（~2s）
 * Lock②：寫入 Drive ID + 任務完成時間戳（~1s）
 */

var Batch = {

  upload: function(params) {
    var name = String(params.name || '').trim();
    var code = String(params.code || '').trim();

    if (!name || !code) {
      return _respond({ success: false, error: '姓名或驗證碼不可為空' });
    }

    var sheet    = _getSheet();
    var lock     = LockService.getScriptLock();
    var sheetRow = -1;
    var folderId = '';

    // ── Lock①：讀取 + 防重複 + 寫佔位（持鎖時間 ~2s）────────────
    try {
      lock.waitLock(10000);

      var data     = sheet.getDataRange().getValues();
      var rowIndex = -1;
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][COL.NAME] || '').trim() === name &&
            String(data[i][COL.CODE] || '').trim() === code) {
          rowIndex = i;
          break;
        }
      }

      if (rowIndex === -1) {
        return _respond({ success: false, error: '姓名或驗證碼不符' });
      }

      // PROCESSING 或已有時間戳，皆視為已提交
      if (data[rowIndex][COL.MISSION]) {
        return _respond({ success: false, error: '任務已完成，請勿重複送出' });
      }

      sheetRow = rowIndex + 1; // 1-based
      folderId = String(data[rowIndex][COL.DRIVE_ID] || '').trim();

      // 寫佔位防並發重複
      sheet.getRange(sheetRow, COL.MISSION + 1).setValue('PROCESSING');

    } catch (err) {
      return _respond({ success: false, error: err.message });
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }

    // ── Drive 操作（Lock 外，各人並行執行）──────────────────────
    var folder;
    try {
      if (folderId) {
        try {
          folder = DriveApp.getFolderById(folderId);
        } catch (e) {
          folderId = '';
        }
      }
      if (!folderId) {
        var rootFolder = DriveApp.getFolderById(_getProp('DRIVE_FOLDER_ID'));
        // 查重，避免重試時建出多個同名資料夾
        var existing = rootFolder.getFoldersByName(name);
        folder   = existing.hasNext() ? existing.next() : rootFolder.createFolder(name);
        folderId = folder.getId();
      }

      if (params.photo) {
        var photoBlob = Utilities.newBlob(
          Utilities.base64Decode(params.photo),
          params.photoMime || 'image/jpeg',
          name + '_活動照片.jpg'
        );
        folder.createFile(photoBlob);
      }

      // 解碼一次，Drive 上傳與 Gmail 附件共用同一個 blob
      var pdfFileBlob = null;
      if (params.pdf) {
        pdfFileBlob = Utilities.newBlob(
          Utilities.base64Decode(params.pdf),
          'application/pdf',
          name + '_淨灘成果證明書.pdf'
        );
        folder.createFile(pdfFileBlob);
      }

    } catch (driveErr) {
      // Drive 失敗：清除佔位符讓用戶可重試
      try {
        var clearLock = LockService.getScriptLock();
        clearLock.waitLock(5000);
        sheet.getRange(sheetRow, COL.MISSION + 1).setValue('');
        clearLock.releaseLock();
      } catch (e) {}
      return _respond({ success: false, error: '檔案上傳失敗，請重試' });
    }

    // ── Lock②：寫入 Drive ID + 任務完成時間戳（持鎖時間 ~1s）────
    try {
      lock.waitLock(10000);
      sheet.getRange(sheetRow, COL.DRIVE_ID + 1).setValue(folderId);
      sheet.getRange(sheetRow, COL.MISSION + 1).setValue(_timestamp());
    } catch (err) {
      // Lock② failed: clear PROCESSING so the user can retry instead of being stuck
      try {
        var recoverLock = LockService.getScriptLock();
        recoverLock.waitLock(5000);
        sheet.getRange(sheetRow, COL.MISSION + 1).setValue('');
        recoverLock.releaseLock();
      } catch (e) {}
      return _respond({ success: false, error: '資料寫入失敗：' + err.message });
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }

    // Gmail（Lock 外，失敗不影響主流程；reuse pdfFileBlob，不重複解碼）
    if (params.email && pdfFileBlob) {
      try {
        GmailApp.sendEmail(
          params.email,
          '您的淨灘成果證明書',
          '感謝您參與本次淨灘活動！\n附件為您的個人淨灘成果證明書。',
          { attachments: [pdfFileBlob] }
        );
      } catch (mailErr) {
        Logger.log('Gmail error: ' + mailErr.message);
      }
    }

    return _respond({
      success: true,
      message: '任務完成',
      name:    name,
    });
  },

};
