/**
 * Auth.gs — AV 端點
 *
 * action = 'auth'
 * 接收：{ action, token, name, code }
 * 回傳：{ success, name, email, group } 或 { success: false, error }
 *
 * 純讀取操作，不需要 LockService。
 */

var Auth = {

  verify: function(params) {
    const sheet = _getSheet();
    const data  = sheet.getDataRange().getValues();

    const inputName = String(params.name || '').trim();
    const inputCode = String(params.code || '').trim();

    if (!inputName || !inputCode) {
      return _respond({ success: false, error: '姓名與驗證碼不可為空' });
    }

    // 從第 2 列開始（跳過標題列）
    for (let i = 1; i < data.length; i++) {
      const row  = data[i];
      const name = String(row[COL.NAME] || '').trim();
      const code = String(row[COL.CODE] || '').trim();

      if (name === inputName && code === inputCode) {
        return _respond({
          success: true,
          name:    row[COL.NAME],
          email:   row[COL.EMAIL],
          group:   row[COL.GROUP],
          code:    String(row[COL.CODE]),
        });
      }
    }

    return _respond({ success: false, error: '姓名或驗證碼錯誤' });
  },

  adminAuth: function(params) {
    var username = String(params.username || '').trim();
    var password = String(params.password || '').trim();
    if (!username || !password) {
      return _respond({ success: false, error: '帳號與密碼不可為空' });
    }
    // 每個帳號對應一個 Script Property，Key 格式為 ADMIN_{username}
    var stored = _getProp('ADMIN_' + username);
    if (!stored || stored !== password) {
      return _respond({ success: false, error: '帳號或密碼錯誤' });
    }
    return _respond({ success: true });
  },

};
