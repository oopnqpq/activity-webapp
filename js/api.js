/**
 * api.js — Apps Script API 呼叫 + 指數退避重試
 *
 * 所有 API 呼叫統一透過 callAPI()：
 *   - 自動帶入 token 和 action
 *   - 批次端點（action=batch）失敗時最多重試 3 次
 *   - 非批次端點不重試（登入、掃碼）
 */

const BATCH_MAX_RETRY = 3;

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

    try {
      const res = await fetch(CONFIG.API_URL, {
        method:  'POST',
        // Content-Type 用 text/plain 避免 CORS preflight
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      return json;

    } catch (err) {
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
