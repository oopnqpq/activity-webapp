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
    if (!inputName) {
      return _respond({ success: false, error: '姓名不可為空' });
    }

    var sheet = _getSheet();
    var lock  = LockService.getScriptLock();

    try {
      lock.waitLock(10000);

      var data      = sheet.getDataRange().getValues();
      var inputCode = String(params.code || '').trim();
      var rowIndex  = -1;
      var rowData   = null;

      for (var i = 1; i < data.length; i++) {
        var name = String(data[i][COL.NAME] || '').trim();
        if (name !== inputName) continue;

        if (type === 'manual') {
          rowIndex = i; rowData = data[i]; break;
        }
        // checkin / checkout：需比對驗證碼
        if (String(data[i][COL.CODE] || '').trim() === inputCode) {
          rowIndex = i; rowData = data[i]; break;
        }
      }

      if (rowIndex === -1) {
        return _respond({
          success: false,
          error: type === 'manual' ? '找不到此姓名' : '姓名或驗證碼錯誤',
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
        if (!rowData[COL.CHECKIN]) {
          return _respond({ success: false, error: '尚未報到，無法簽退', name: rowData[COL.NAME], group: rowData[COL.GROUP] });
        }
        if (!rowData[COL.MISSION]) {
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
        if (params.note) {
          sheet.getRange(sheetRow, COL.NOTE + 1).setValue(String(params.note).slice(0, 100));
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
      mission:  rows.filter(function(r) { return r[COL.MISSION];  }).length,
      checkout: rows.filter(function(r) { return r[COL.CHECKOUT]; }).length,
    });
  },

  lookup: function(params) {
    var inputName = String(params.name || '').trim();
    if (!inputName) return _respond({ success: false, error: '姓名不可為空' });

    var sheet = _getSheet();
    var data  = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL.NAME] || '').trim() === inputName) {
        return _respond({
          success:  true,
          name:     data[i][COL.NAME],
          group:    data[i][COL.GROUP],
          checkin:  !!data[i][COL.CHECKIN],
          mission:  !!data[i][COL.MISSION],
          checkout: !!data[i][COL.CHECKOUT],
          manual:   !!data[i][COL.MANUAL],
          note:     data[i][COL.NOTE] || '',
        });
      }
    }
    return _respond({ success: false, error: '找不到此姓名' });
  },

};
