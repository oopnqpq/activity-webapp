/**
 * Scan.gs — AC 端點
 *
 * action = 'scan'
 * 接收：{ action, token, type, name, code }
 *   type = 'checkin'  | 報到掃碼
 *   type = 'checkout' | 簽退掃碼
 *   type = 'manual'   | 手動核銷
 * 回傳：{ success, name, group, ... } 或 { success: false, error }
 *
 * ⚠ 完整實作於 Stage 2，目前為骨架。
 */

var Scan = {

  process: function(params) {
    // TODO Stage 2：
    //   checkin:  找到使用者列 → LockService → 寫入報到時間（E欄）
    //   checkout: 確認報到＋任務完成 → LockService → 寫入簽退時間（G欄）
    //   manual:   找到使用者列 → LockService → 寫入手動核銷 TRUE（I欄）＋備註（J欄）
    return _respond({ success: false, error: 'Scan 端點尚未實作（Stage 2）' });
  },

};
