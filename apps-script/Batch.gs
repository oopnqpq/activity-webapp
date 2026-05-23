/**
 * Batch.gs — AB 端點
 *
 * action = 'batch'
 * 接收：{ action, token, name, code, photo, photoMime, pdf, email? }
 * 處理：建 Drive 資料夾 → 上傳照片 → 上傳 PDF → 更新 Sheets → 可選 Gmail
 *
 * 鐵律：Sheets 寫入前必加 LockService.waitLock(10000)
 */

var Batch = {

  upload: function(params) {
    var name = String(params.name || '').trim();
    var code = String(params.code || '').trim();

    if (!name || !code) {
      return _respond({ success: false, error: '姓名或驗證碼不可為空' });
    }

    var sheet = _getSheet();
    var lock  = LockService.getScriptLock();

    try {
      lock.waitLock(10000);

      // 找到對應列
      var data = sheet.getDataRange().getValues();
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

      if (data[rowIndex][COL.MISSION]) {
        return _respond({ success: false, error: '任務已完成，請勿重複送出' });
      }

      var sheetRow = rowIndex + 1; // 1-based

      // 取得或建立 Drive 個人資料夾
      var folderId = String(data[rowIndex][COL.DRIVE_ID] || '').trim();
      var folder;
      if (folderId) {
        try {
          folder = DriveApp.getFolderById(folderId);
        } catch (e) {
          folderId = '';
        }
      }
      if (!folderId) {
        var rootFolder = DriveApp.getFolderById(_getProp('DRIVE_FOLDER_ID'));
        folder   = rootFolder.createFolder(name);
        folderId = folder.getId();
        sheet.getRange(sheetRow, COL.DRIVE_ID + 1).setValue(folderId);
      }

      // 上傳照片
      if (params.photo) {
        var photoBlob = Utilities.newBlob(
          Utilities.base64Decode(params.photo),
          params.photoMime || 'image/jpeg',
          name + '_活動照片.jpg'
        );
        folder.createFile(photoBlob);
      }

      // 上傳 PDF
      if (params.pdf) {
        var pdfBlob = Utilities.newBlob(
          Utilities.base64Decode(params.pdf),
          'application/pdf',
          name + '_淨灘成果證明書.pdf'
        );
        folder.createFile(pdfBlob);
      }

      // 更新 Sheets：任務完成時間
      sheet.getRange(sheetRow, COL.MISSION + 1).setValue(_timestamp());

    } catch (err) {
      return _respond({ success: false, error: err.message });
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }

    // Gmail 寄送（在 lock 外，不影響 Sheets 一致性）
    if (params.email && params.pdf) {
      try {
        var mailPdf = Utilities.newBlob(
          Utilities.base64Decode(params.pdf),
          'application/pdf',
          '淨灘成果證明書.pdf'
        );
        GmailApp.sendEmail(
          params.email,
          '您的淨灘成果證明書',
          '感謝您參與本次淨灘活動！\n附件為您的個人淨灘成果證明書。',
          { attachments: [mailPdf] }
        );
      } catch (mailErr) {
        // Gmail 失敗不影響主流程
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
