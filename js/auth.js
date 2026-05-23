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
    window.location.href = '/index.html';
    return null;
  }
  return session;
}
