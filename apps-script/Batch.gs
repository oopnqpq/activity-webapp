/**
 * Batch.gs — AB 端點
 *
 * action = 'batch'
 * 接收：{ action, token, name, code, photo, pdf, email? }
 * 處理：建 Drive 資料夾 → 上傳照片 → 上傳 PDF → 更新 Sheets → 可選 Gmail
 *
 * ⚠ 完整實作於 Stage 3，目前為骨架。
 */

var Batch = {

  upload: function(params) {
    // TODO Stage 3：
    //   1. 找到該使用者的 Sheets 列
    //   2. LockService.waitLock(10000)
    //   3. 在 Drive 根資料夾下建個人資料夾
    //   4. 上傳照片（base64 → Blob）
    //   5. 上傳 PDF（base64 → Blob）
    //   6. 更新 Sheets：任務完成時間、Drive資料夾ID
    //   7. 若 params.email 存在，觸發 Gmail 寄送
    return _respond({ success: false, error: 'Batch 端點尚未實作（Stage 3）' });
  },

};
