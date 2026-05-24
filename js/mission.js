/**
 * mission.js — 使命任務狀態機
 *
 * 任務流程：
 *   ① 問卷（parallel）   ②→③→④→⑤（sequential chain）
 *   ⑥ 送出啟用條件：mission1_done && mission5_done
 */

const MISSION_STATE_KEY = 'mission_state';
const MISSION_DONE_KEY  = 'mission_done';

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

// ── Persisted state ──────────────────────────────────────────────
let mission1_done = false;
let mission5_done = false;

function _loadState() {
  try {
    const raw = localStorage.getItem(MISSION_STATE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      mission1_done = !!s.m1;
      mission5_done = !!s.m5;
    }
  } catch { /* ignore */ }
}

function _saveState() {
  localStorage.setItem(MISSION_STATE_KEY, JSON.stringify({
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

  // If mission already fully submitted, show QR only
  if (localStorage.getItem(MISSION_DONE_KEY) === 'true') {
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
  const canvas = document.getElementById('sigCanvas');
  canvas.width  = canvas.offsetWidth || 320;
  canvas.height = 160;
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
  const preview = document.getElementById('photoPreview');
  const drop    = document.getElementById('photoDrop');
  const confirmBtn = document.getElementById('photoConfirmBtn');

  const reader = new FileReader();
  reader.onload = e => {
    preview.src = e.target.result;
    preview.classList.add('show');
    drop.style.display = 'none';
    confirmBtn.style.display = 'block';
  };
  reader.readAsDataURL(file);

  // Compress in background
  _compressImage(file).then(result => {
    photoB64     = result.b64;
    photoMime    = result.mime;
    photoDataUrl = 'data:' + result.mime + ';base64,' + result.b64;
  });
}

function confirmPhoto() {
  if (!photoB64) return;
  photoConfirmed = true;
  updateUI();
  _openCard('card3');
}

async function _compressImage(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        else if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        const cvs = document.createElement('canvas');
        cvs.width = w; cvs.height = h;
        cvs.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = cvs.toDataURL('image/jpeg', 0.8);
        resolve({ b64: dataUrl.split(',')[1], mime: 'image/jpeg' });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
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
  // Export as PNG base64 (data URL → strip prefix)
  const dataUrl = sigPad.toDataURL('image/png');
  sigB64       = dataUrl.split(',')[1];
  sigConfirmed = true;
  updateUI();
  _openCard('card4');
}

// ── ④ 生成 PDF ───────────────────────────────────────────────────
async function generatePDF() {
  const btn = document.getElementById('genPdfBtn');
  btn.classList.add('loading');
  btn.disabled = true;

  try {
    const certImgDataUrl = await _renderCertificate();

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
    updateUI();
    _openCard('card5');
  } catch (err) {
    alert('PDF 生成失敗：' + err.message);
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

async function _renderCertificate() {
  const W = 794, H = 1123; // ~A4 at 96 DPI
  const cvs = document.createElement('canvas');
  cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext('2d');

  // Try loading designer's background first
  const bgLoaded = await _tryLoadImage('assets/certificate-bg.png');
  if (bgLoaded) {
    ctx.drawImage(bgLoaded, 0, 0, W, H);
  } else {
    _drawFallbackLayout(ctx, W, H);
  }

  // Photo area (top-center)
  if (photoDataUrl) {
    const img = await _tryLoadImage(photoDataUrl);
    if (img) {
      const px = Math.round(W * 0.10), py = Math.round(H * 0.22);
      const pw = Math.round(W * 0.80), ph = Math.round(W * 0.48);
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, pw, ph);
      ctx.clip();
      // Cover-fit
      const scale = Math.max(pw / img.width, ph / img.height);
      const sw = img.width * scale, sh = img.height * scale;
      ctx.drawImage(img, px + (pw - sw) / 2, py + (ph - sh) / 2, sw, sh);
      ctx.restore();
    }
  }

  // Name
  ctx.fillStyle = '#111827';
  ctx.font = `bold ${Math.round(W * 0.065)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(session.name, W / 2, Math.round(H * 0.64));

  // Date
  const today = new Date().toLocaleDateString('zh-TW',
    { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.fillStyle = '#4B5563';
  ctx.font = `${Math.round(W * 0.033)}px sans-serif`;
  ctx.fillText(today, W / 2, Math.round(H * 0.695));

  // Signature
  if (sigB64) {
    const sigImg = await _tryLoadImage('data:image/png;base64,' + sigB64);
    if (sigImg) {
      const sx = Math.round(W * 0.25), sy = Math.round(H * 0.74);
      const sw = Math.round(W * 0.50), sh = Math.round(H * 0.06);
      ctx.drawImage(sigImg, sx, sy, sw, sh);
    }
  }
  // Signature line
  ctx.strokeStyle = '#9CA3AF';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(Math.round(W * 0.25), Math.round(H * 0.815));
  ctx.lineTo(Math.round(W * 0.75), Math.round(H * 0.815));
  ctx.stroke();
  ctx.fillStyle = '#9CA3AF';
  ctx.font = `${Math.round(W * 0.028)}px sans-serif`;
  ctx.fillText('簽名 Signature', W / 2, Math.round(H * 0.845));

  return cvs.toDataURL('image/jpeg', 0.92);
}

function _drawFallbackLayout(ctx, W, H) {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  // Outer border
  ctx.strokeStyle = '#1E40AF';
  ctx.lineWidth = 8;
  ctx.strokeRect(18, 18, W - 36, H - 36);
  ctx.lineWidth = 2;
  ctx.strokeRect(26, 26, W - 52, H - 52);
  // Title
  ctx.fillStyle = '#1E40AF';
  ctx.font = `bold ${Math.round(W * 0.07)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('淨灘成果證明書', W / 2, 105);
  ctx.font = `${Math.round(W * 0.035)}px sans-serif`;
  ctx.fillStyle = '#6B7280';
  ctx.fillText('Beach Cleanup Achievement Certificate', W / 2, 150);
  ctx.strokeStyle = '#BFDBFE';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 168); ctx.lineTo(W - 80, 168);
  ctx.stroke();
  // "此人已參與" text below photo area placeholder
  ctx.fillStyle = '#374151';
  ctx.font = `${Math.round(W * 0.033)}px sans-serif`;
  ctx.fillText('本人確認已參與本次活動並完成淨灘任務', W / 2, Math.round(H * 0.725));
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
  URL.revokeObjectURL(url);
  mission5_done = true;
  _saveState();
  updateUI();
}

function saveEmailForSend() {
  const email = document.getElementById('emailInput').value.trim();
  if (!email || !email.includes('@')) {
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
  const btn   = document.getElementById('submitBtn');
  const alert = document.getElementById('submitAlert');
  alert.className = 'alert';

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

  if (res.success) {
    localStorage.setItem(MISSION_DONE_KEY, 'true');
    _saveState();
    alert.style.display = 'none';
    _showCheckoutQR();
    // Scroll to QR
    document.getElementById('checkoutSection').scrollIntoView({ behavior: 'smooth' });
  } else {
    btn.disabled = false;
    alert.textContent = res.error || '送出失敗，請再試一次';
    alert.className = 'alert alert-error show';
  }
}

// ── 簽退 QR Code ──────────────────────────────────────────────────
function _showCheckoutQR() {
  document.getElementById('checkoutSection').classList.add('show');
  const qrWrap = document.getElementById('checkoutQR');
  if (qrWrap.childNodes.length) return; // already rendered
  new QRCode(qrWrap, {
    text:         JSON.stringify({ name: session.name, code: session.code }),
    width:        220,
    height:       220,
    colorDark:    '#000000',
    colorLight:   '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });
}
