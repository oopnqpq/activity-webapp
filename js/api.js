/**
 * api.js — Apps Script API 呼叫 + 指數退避重試
 *
 * 所有 API 呼叫統一透過 callAPI()：
 *   - 自動帶入 token 和 action
 *   - 批次端點（action=batch）失敗時最多重試 3 次
 *   - network 錯誤 或 GAS 回傳 success:false（鎖超時、暫時性錯誤）皆會重試
 *   - 確定性業務錯誤（已完成、驗證碼錯誤）不重試
 *   - 每次請求設有 45 秒 AbortController timeout，防止 UI 無限 loading
 *   - 非批次端點不重試（登入、掃碼）
 */

const BATCH_MAX_RETRY = 3;

// 這些錯誤代表確定性失敗，重試無意義
const TERMINAL_ERRORS = [
  '任務已完成，請勿重複送出',
  '姓名或驗證碼不符',
  '姓名或驗證碼不可為空',
];

async function callAPI(action, data = {}) {
  const payload = { ...data, action, token: CONFIG.STAFF_TOKEN };
  const isBatch = action === 'batch';
  const maxAttempts = isBatch ? BATCH_MAX_RETRY : 1;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 第一次 batch 呼叫前隨機等待 0–2s，分散 200 人同時送出的衝擊
    if (isBatch && attempt === 1) {
      await _sleep(Math.floor(Math.random() * 2000));
    }

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 45000);

    try {
      const res = await fetch(CONFIG.API_URL, {
        method:  'POST',
        // Content-Type 用 text/plain 避免 CORS preflight
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify(payload),
        signal:  controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();

      // batch 對 GAS 層的暫時性錯誤（鎖超時、並發滿載）也要重試
      if (isBatch && !json.success && !TERMINAL_ERRORS.includes(json.error)) {
        throw new Error(json.error || '伺服器暫時無法處理，請稍後再試');
      }

      return json;

    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;

      if (isBatch && attempt < maxAttempts) {
        // 指數退避：1s → 2s → 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await _sleep(delay);
      }
    }
  }

  return { success: false, error: lastError?.message || '網路連線失敗，請稍後再試' };
}

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
