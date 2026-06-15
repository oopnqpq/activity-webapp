/**
 * mission.js — 使命任務狀態機
 *
 * 任務流程：
 *   ① 問卷（parallel）   ②→③→④→⑤（sequential chain）
 *   ⑥ 送出啟用條件：mission1_done && mission5_done
 */

const MISSION_STATE_KEY = () => session?.code ? `mission_state_${session.code}` : null;
const MISSION_DONE_KEY  = () => session?.code ? `mission_done_${session.code}` : null;

// ── In-memory state ──────────────────────────────────────────────
let session         = null;
let sigPad          = null;

let photoDataUrl    = null;   // full data URL (for canvas drawing)
let photoB64        = null;   // base64 only (for API)
let photoMime       = 'image/jpeg';
let photoConfirmed  = false;

let sigB64          = null;   // signature PNG base64
let sigConfirmed    = false;

let pdfB64          = null;   // PDF base64 (for API)
let pdfBlob         = null;   // PDF blob (for local download)
let pdfGenerated    = false;

let emailForSend    = '';

// 預載的背景圖（confirmSig 後開始載入，generatePDF 時直接用）
let certBgImage     = null;

// ── Persisted state ──────────────────────────────────────────────
let mission1_done = false;
let mission5_done = false;

function _loadState() {
  try {
    const key = MISSION_STATE_KEY();
    if (!key) return;
    const raw = localStorage.getItem(key);
    if (raw) {
      const s = JSON.parse(raw);
      mission1_done = !!s.m1;
      mission5_done = !!s.m5;
    }
  } catch { /* ignore */ }
}

function _saveState() {
  const key = MISSION_STATE_KEY();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify({
    m1: mission1_done,
    m5: mission5_done,
  }));
}

// ── Initialise ───────────────────────────────────────────────────
(function init() {
  session = requireAuth();
  if (!session) return;

  _loadState();

  // Set Google Form link
  document.getElementById('formLink').href = CONFIG.FORM_URL_M1;

  // Option A：點擊連結後才啟用「我已完成問卷」按鈕
  document.getElementById('formLink').addEventListener('click', function() {
    document.getElementById('m1DoneBtn').disabled = false;
    document.getElementById('m1Hint').style.display = 'none';
  });

  // If mission already fully submitted, show QR only
  const doneKey = MISSION_DONE_KEY();
  if (doneKey && localStorage.getItem(doneKey) === 'true') {
    _showCheckoutQR();
    document.querySelector('.content').querySelectorAll('.task-card, .submit-section').forEach(el => {
      el.style.display = 'none';
    });
    return;
  }

  // Photo input change handler
  document.getElementById('photoInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) _handlePhotoSelect(file);
  });

  updateUI();
})();

function _initSigPad() {
  if (sigPad) return;
  if (typeof SignaturePad === 'undefined') {
    alert('簽名元件載入失敗，請重新整理頁面');
    return;
  }
  const canvas   = document.getElementById('sigCanvas');
  const dpr      = window.devicePixelRatio || 1;
  const displayW = canvas.offsetWidth || 320;
  const displayH = 160;
  // Scale internal resolution by DPR so signature stays sharp on retina displays (M-5)
  canvas.width        = Math.round(displayW * dpr);
  canvas.height       = Math.round(displayH * dpr);
  canvas.style.width  = displayW + 'px';
  canvas.style.height = displayH + 'px';
  sigPad = new SignaturePad(canvas, { backgroundColor: 'rgb(255,255,255)' });
}

// ── UI Rendering ──────────────────────────────────────────────────
function updateUI() {
  // ① 問卷
  _setCard('card1', 'body1', mission1_done, true);
  document.getElementById('st1').textContent = mission1_done ? '✓' : '';

  // ② 照片
  _setCard('card2', 'body2', photoConfirmed, true);
  document.getElementById('st2').textContent = photoConfirmed ? '✓' : '';

  // ③ 簽名 — unlocked after ② done
  _setCard('card3', 'body3', sigConfirmed, photoConfirmed);
  document.getElementById('st3').textContent = sigConfirmed ? '✓' : '';

  // ④ PDF — unlocked after ③ done
  _setCard('card4', 'body4', pdfGenerated, sigConfirmed);
  document.getElementById('st4').textContent = pdfGenerated ? '✓' : '';

  // ⑤ 取得 PDF — unlocked after ④ done
  _setCard('card5', 'body5', mission5_done, pdfGenerated);
  document.getElementById('st5').textContent = mission5_done ? '✓' : '';

  // ⑥ Submit button
  const canSubmit = mission1_done && mission5_done;
  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = !canSubmit;
  document.getElementById('submitHint').style.display = canSubmit ? 'none' : 'block';
}

function _setCard(cardId, bodyId, isDone, isUnlocked) {
  const card = document.getElementById(cardId);
  const body = document.getElementById(bodyId);
  card.classList.toggle('done',   isDone);
  card.classList.toggle('locked', !isUnlocked);
  card.classList.toggle('active', isUnlocked && !isDone);
  if (isDone && body.classList.contains('open')) {
    body.classList.remove('open');
  }
}

function toggleCard(cardId) {
  const card = document.getElementById(cardId);
  if (card.classList.contains('locked')) return;
  const body = document.getElementById(cardId.replace('card', 'body'));
  const opening = !body.classList.contains('open');
  body.classList.toggle('open');
  if (cardId === 'card3' && opening) _initSigPad();
}

function _openCard(cardId) {
  const card = document.getElementById(cardId);
  if (card.classList.contains('locked')) return;
  document.getElementById(cardId.replace('card', 'body')).classList.add('open');
  if (cardId === 'card3') _initSigPad();
}

// ── ① 問卷 ───────────────────────────────────────────────────────
function markM1Done() {
  mission1_done = true;
  _saveState();
  updateUI();
}

// ── ② 照片 ───────────────────────────────────────────────────────
function _handlePhotoSelect(file) {
  const preview    = document.getElementById('photoPreview');
  const drop       = document.getElementById('photoDrop');
  const confirmBtn = document.getElementById('photoConfirmBtn');

  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    preview.src = dataUrl;
    preview.classList.add('show');
    drop.style.display    = 'none';
    confirmBtn.style.display = 'block';
    confirmBtn.disabled   = true; // wait for compression before allowing confirm

    // Reuse the already-read dataURL — no second FileReader needed (M-6)
    _compressImage(dataUrl).then(result => {
      photoB64     = result.b64;
      photoMime    = result.mime;
      photoDataUrl = 'data:' + result.mime + ';base64,' + result.b64;
      confirmBtn.disabled = false; // enable only after compression done (C-4)
    });
  };
  reader.readAsDataURL(file);
}

function confirmPhoto() {
  if (!photoB64) return;
  photoConfirmed = true;
  updateUI();
  _openCard('card3');
}

async function _compressImage(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1200;
      let w = img.width, h = img.height;
      if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      else if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
      const cvs = document.createElement('canvas');
      cvs.width = w; cvs.height = h;
      cvs.getContext('2d').drawImage(img, 0, 0, w, h);
      const result = cvs.toDataURL('image/jpeg', 0.8);
      resolve({ b64: result.split(',')[1], mime: 'image/jpeg' });
    };
    img.onerror = () => resolve({ b64: null, mime: 'image/jpeg' });
    img.src = dataUrl;
  });
}

// ── ③ 簽名 ───────────────────────────────────────────────────────
function clearSig() {
  sigPad.clear();
}

function confirmSig() {
  if (sigPad.isEmpty()) {
    alert('請先完成簽名');
    return;
  }
  const dataUrl = sigPad.toDataURL('image/png');
  sigB64       = dataUrl.split(',')[1];
  sigConfirmed = true;

  // 方案 A：確認簽名後立即預載背景圖，④ 生成時直接用快取
  _preloadCertBg();

  updateUI();
  _openCard('card4');
}

// ── 背景圖預載（方案 A）──────────────────────────────────────────
async function _preloadCertBg() {
  if (certBgImage) return; // 已載入則跳過
  certBgImage = await _tryLoadImage('assets/certificate-bg.png')
             || await _tryLoadImage('assets/certificate-bg.jpg');
}

// ── ④ 生成 PDF ───────────────────────────────────────────────────
async function generatePDF() {
  const btn      = document.getElementById('genPdfBtn');
  const statusEl = document.getElementById('genPdfStatus');
  btn.classList.add('loading');
  btn.disabled = true;
  statusEl.style.display = 'block';
  statusEl.textContent   = '';

  try {
    const certImgDataUrl = await _renderCertificate(msg => {
      statusEl.textContent = msg;
    });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.addImage(certImgDataUrl, 'JPEG', 0, 0, 210, 297);

    pdfBlob = doc.output('blob');
    pdfB64  = doc.output('datauristring').split(',')[1];

    // Show thumbnail
    const thumb = document.getElementById('pdfThumb');
    thumb.src = certImgDataUrl;
    thumb.classList.add('show');

    pdfGenerated = true;
    statusEl.style.display = 'none';
    updateUI();
    _openCard('card5');
  } catch (err) {
    statusEl.style.display = 'none';
    alert('PDF 生成失敗：' + err.message);
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

async function _renderCertificate(onProgress) {
  const W = 794, H = 1123; // ~A4 at 96 DPI
  const cvs = document.createElement('canvas');
  cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext('2d');

  // 步驟一：載入背景圖（優先用預載快取）
  onProgress('正在載入背景圖… (1/3)');
  await new Promise(r => setTimeout(r, 50)); // 讓 UI 更新

  const bg = certBgImage
          || await _tryLoadImage('assets/certificate-bg.png')
          || await _tryLoadImage('assets/certificate-bg.jpg');

  // 方案 B：背景圖失敗直接報錯，不使用 fallback
  if (!bg) {
    throw new Error('背景圖載入失敗，請確認網路連線後重試');
  }
  ctx.drawImage(bg, 0, 0, W, H);

  // 步驟二：合成照片與簽名
  onProgress('正在合成照片與簽名… (2/3)');
  await new Promise(r => setTimeout(r, 50));

  // A4 畫布 794px = 210mm → 1mm ≈ 3.781px
  const MM = W / 210;

  // ── 活動照片 → X:151.539 / Y:72.959 / 寬:45.954 / 高:61.489 (mm) ──
  if (photoDataUrl) {
    const img = await _tryLoadImage(photoDataUrl);
    if (img) {
      const px = Math.round(151.539 * MM), py = Math.round(72.959 * MM);
      const pw = Math.round( 45.954 * MM), ph = Math.round(61.489 * MM);
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, pw, ph);
      ctx.clip();
      const scale = Math.max(pw / img.width, ph / img.height);
      const sw = img.width * scale, sh = img.height * scale;
      ctx.drawImage(img, px + (pw - sw) / 2, py + (ph - sh) / 2, sw, sh);
      ctx.restore();
    }
  }

  // ── 手寫簽名 → X:67.227 / Y:69.98 / 寬:46.164 / 高:10.003 (mm) ───
  if (sigB64) {
    const sigImg = await _tryLoadImage('data:image/png;base64,' + sigB64);
    if (sigImg) {
      const sx = Math.round(67.227 * MM), sy = Math.round(69.98  * MM);
      const sw = Math.round(46.164 * MM), sh = Math.round(10.003 * MM);
      ctx.drawImage(sigImg, sx, sy, sw, sh);
    }
  }

  // 步驟三：輸出 PDF
  onProgress('正在輸出 PDF… (3/3)');
  await new Promise(r => setTimeout(r, 50));

  return cvs.toDataURL('image/jpeg', 0.92);
}

function _tryLoadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ── ⑤ 取得 PDF ───────────────────────────────────────────────────
function downloadPDF() {
  if (!pdfBlob) return;
  const url = URL.createObjectURL(pdfBlob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = '淨灘成果證明書.pdf';
  a.click();
  // Delay revoke so mobile browsers finish processing the blob URL (M-3)
  setTimeout(() => URL.revokeObjectURL(url), 100);
  mission5_done = true;
  _saveState();
  updateUI();
}

function saveEmailForSend() {
  const email = document.getElementById('emailInput').value.trim();
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRe.test(email)) {
    alert('請輸入有效的 Email 地址');
    return;
  }
  emailForSend = email;
  document.getElementById('emailSavedMsg').style.display = 'block';
  mission5_done = true;
  _saveState();
  updateUI();
}

// ── ⑥ 批次送出 ────────────────────────────────────────────────────
async function submitAll() {
  const btn     = document.getElementById('submitBtn');
  const alertEl = document.getElementById('submitAlert');
  alertEl.className = 'alert';

  btn.classList.add('loading');
  btn.disabled = true;

  const payload = {
    name:      session.name,
    code:      session.code,
    photo:     photoB64,
    photoMime: photoMime,
    pdf:       pdfB64,
  };
  if (emailForSend) payload.email = emailForSend;

  const res = await callAPI('batch', payload);

  btn.classList.remove('loading');

  if (res.success || res.error === '任務已完成，請勿重複送出') {
    const key = MISSION_DONE_KEY();
    if (key) localStorage.setItem(key, 'true');
    _saveState();
    alertEl.style.display = 'none';
    _showCheckoutQR();
    // Scroll to QR
    document.getElementById('checkoutSection').scrollIntoView({ behavior: 'smooth' });
  } else {
    btn.disabled = false;
    alertEl.textContent = res.error || '送出失敗，請再試一次';
    alertEl.className = 'alert alert-error show';
  }
}

// ── 簽退 QR Code ──────────────────────────────────────────────────
function _showCheckoutQR() {
  document.getElementById('checkoutSection').classList.add('show');
  const qrWrap = document.getElementById('checkoutQR');
  if (qrWrap.childNodes.length) return; // already rendered
  new QRCode(qrWrap, {
    text:         session.code,
    width:        220,
    height:       220,
    colorDark:    '#000000',
    colorLight:   '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });
}
