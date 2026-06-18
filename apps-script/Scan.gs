/**
 * Scan.gs — AC 端點
 *
 * action = 'scan'   → Scan.process()   報到 / 簽退 / 手動核銷
 * action = 'stats'  → Scan.stats()     儀表板統計
 * action = 'lookup' → Scan.lookup()    姓名查詢（不修改資料）
 */

var Scan = {

  process: function(params) {
    var type = String(params.type || '');
    if (['checkin', 'checkout', 'manual'].indexOf(type) === -1) {
      return _respond({ success: false, error: '未知的操作類型' });
    }

    var inputName = String(params.name || '').trim();
    var inputCode = String(params.code || '').trim();

    // manual 以驗證碼（優先）或姓名查找；checkin/checkout 以驗證碼查找
    if (type === 'manual' && !inputCode && !inputName) {
      return _respond({ success: false, error: '姓名或驗證碼不可為空' });
    }
    if (type !== 'manual' && !inputCode) {
      return _respond({ success: false, error: '驗證碼不可為空' });
    }

    var sheet = _getSheet();
    var lock  = LockService.getScriptLock();

    try {
      lock.waitLock(10000);

      var data     = sheet.getDataRange().getValues();
      var rowIndex = -1;
      var rowData  = null;

      for (var i = 1; i < data.length; i++) {
        if (type === 'manual') {
          // 優先以驗證碼（唯一）比對，沒有 code 才退回姓名
          var match = inputCode
            ? String(data[i][COL.CODE] || '').trim() === inputCode
            : String(data[i][COL.NAME] || '').trim() === inputName;
          if (match) { rowIndex = i; rowData = data[i]; break; }
        } else {
          // checkin / checkout：以驗證碼比對
          if (String(data[i][COL.CODE] || '').trim() === inputCode) {
            rowIndex = i; rowData = data[i]; break;
          }
        }
      }

      if (rowIndex === -1) {
        return _respond({
          success: false,
          error: type === 'manual' ? '找不到此姓名' : 'QR Code 無效',
        });
      }

      var sheetRow = rowIndex + 1; // 1-based

      if (type === 'checkin') {
        if (rowData[COL.CHECKIN]) {
          return _respond({ success: false, error: '已重複報到', name: rowData[COL.NAME], group: rowData[COL.GROUP] });
        }
        sheet.getRange(sheetRow, COL.CHECKIN + 1).setValue(_timestamp());
        return _respond({ success: true, name: rowData[COL.NAME], group: rowData[COL.GROUP], message: '報到成功' });
      }

      if (type === 'checkout') {
        if (!rowData[COL.MISSION] || rowData[COL.MISSION] === 'PROCESSING') {
          return _respond({ success: false, error: '任務尚未完成，無法簽退', name: rowData[COL.NAME], group: rowData[COL.GROUP] });
        }
        if (rowData[COL.CHECKOUT]) {
          return _respond({ success: false, error: '已重複簽退', name: rowData[COL.NAME], group: rowData[COL.GROUP] });
        }
        sheet.getRange(sheetRow, COL.CHECKOUT + 1).setValue(_timestamp());
        return _respond({ success: true, name: rowData[COL.NAME], group: rowData[COL.GROUP], message: '簽退成功' });
      }

      if (type === 'manual') {
        if (rowData[COL.MANUAL]) {
          return _respond({ success: false, error: '已手動核銷', name: rowData[COL.NAME], group: rowData[COL.GROUP] });
        }
        sheet.getRange(sheetRow, COL.MANUAL + 1).setValue(true);
        // 若尚未簽退，手動核銷同時寫入簽退時間戳（統一看 G 欄判斷可否領禮物）
        if (!rowData[COL.CHECKOUT]) {
          sheet.getRange(sheetRow, COL.CHECKOUT + 1).setValue(_timestamp());
        }
        // 組合備註：[操作人員] 備註內容
        var staff   = String(params.staff || '').trim();
        var noteVal = String(params.note  || '').trim();
        var combined = staff ? '[' + staff + '] ' + noteVal : noteVal;
        if (combined) {
          sheet.getRange(sheetRow, COL.NOTE + 1).setValue(combined.slice(0, 120));
        }
        return _respond({ success: true, name: rowData[COL.NAME], group: rowData[COL.GROUP], message: '手動核銷成功' });
      }

    } catch (err) {
      return _respond({ success: false, error: err.message });
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }
  },

  stats: function() {
    var sheet = _getSheet();
    var data  = sheet.getDataRange().getValues();
    var rows  = data.slice(1).filter(function(r) {
      return String(r[COL.NAME] || '').trim();
    });
    return _respond({
      success:  true,
      total:    rows.length,
      checkin:  rows.filter(function(r) { return r[COL.CHECKIN];  }).length,
      mission:  rows.filter(function(r) { return r[COL.MISSION] && r[COL.MISSION] !== 'PROCESSING'; }).length,
      checkout: rows.filter(function(r) { return r[COL.CHECKOUT]; }).length,
    });
  },

  list: function() {
    var sheet = _getSheet();
    var data  = sheet.getDataRange().getValues();
    var participants = [];
    for (var i = 1; i < data.length; i++) {
      var name = String(data[i][COL.NAME] || '').trim();
      if (!name) continue;
      participants.push({
        name:     name,
        group:    String(data[i][COL.GROUP] || ''),
        checkin:  !!data[i][COL.CHECKIN],
        mission:  !!data[i][COL.MISSION] && data[i][COL.MISSION] !== 'PROCESSING',
        checkout: !!data[i][COL.CHECKOUT],
        manual:   !!data[i][COL.MANUAL],
      });
    }
    return _respond({ success: true, participants: participants });
  },

  lookup: function(params) {
    var inputName = String(params.name || '').trim();
    if (!inputName) return _respond({ success: false, error: '姓名不可為空' });

    var sheet   = _getSheet();
    var data    = sheet.getDataRange().getValues();
    var results = [];

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL.NAME] || '').trim() === inputName) {
        results.push({
          name:     data[i][COL.NAME],
          group:    data[i][COL.GROUP],
          code:     data[i][COL.CODE],
          checkin:  !!data[i][COL.CHECKIN],
          mission:  !!data[i][COL.MISSION] && data[i][COL.MISSION] !== 'PROCESSING',
          checkout: !!data[i][COL.CHECKOUT],
          manual:   !!data[i][COL.MANUAL],
          note:     data[i][COL.NOTE] || '',
        });
      }
    }

    if (results.length === 0) return _respond({ success: false, error: '找不到此姓名' });
    return _respond({ success: true, results: results });
  },

};
