/**
 * auth.js — Session 管理（localStorage，12小時過期）
 *
 * session 格式：{ name, email, group, token, expiry }
 */

const SESSION_KEY    = 'user_session';
const SESSION_HOURS  = 12;

function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (Date.now() > session.expiry) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    clearSession();
    return null;
  }
}

function setSession(data) {
  const session = {
    name:   data.name,
    email:  data.email,
    group:  data.group,
    code:   data.code,
    token:  CONFIG.STAFF_TOKEN,
    expiry: Date.now() + SESSION_HOURS * 3600 * 1000,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// 每個需要登入的頁面頂部呼叫：未登入則導回登入頁
function requireAuth() {
  const session = getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  return session;
}

// ── Admin session（後台工作人員）────────────────────────────────
const ADMIN_SESSION_KEY   = 'admin_session';
const ADMIN_SESSION_HOURS = 8;

function getAdminSession() {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (Date.now() > s.expiry) { clearAdminSession(); return null; }
    return s;
  } catch {
    clearAdminSession();
    return null;
  }
}

function setAdminSession(username) {
  const s = { username: username || '', expiry: Date.now() + ADMIN_SESSION_HOURS * 3600 * 1000 };
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(s));
  return s;
}

function clearAdminSession() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
}

function requireAdminAuth() {
  const s = getAdminSession();
  if (!s) {
    window.location.href = 'index.html';
    return null;
  }
  return s;
}
