/* ===== AUTH.JS — frontend auth client (talks to real backend) ===== */

const API = window.__FORECASTAI_CONFIG__.authBase;


/* ================================================================
   API CALLS
   ================================================================ */

async function authApiRequest(path, body, headers = {}) {
  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    response = await fetch(`${API}/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
  } catch (error) {
    const message = error.name === 'AbortError'
      ? 'The server took too long to respond. Render may be starting up; wait a moment and retry.'
      : `Unable to reach the ForecastAI backend. Check your connection and try again. (${error.message})`;
    return { ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timeout);
  }

  try {
    const data = await response.json();
    return { ok: response.ok, status: response.status, ...data };
  } catch (_) {
    return { ok: false, status: response.status, error: `The server returned an invalid response (${response.status}).` };
  }
}

/**
 * POST /api/auth/signup
 * Registers user + sends OTP to phone (preferred) or email.
 */
async function apiSignup({ firstName, lastName, email, phone, password }) {
  return authApiRequest('signup', { firstName, lastName, email, phone, password });
}

/**
 * POST /api/auth/login
 * Password-based login.
 */
async function apiLoginPassword(identifier, password) {
  return authApiRequest('login', { identifier, password });
}

/**
 * POST /api/auth/send-otp
 * Verifies identifier exists, sends OTP to registered phone/email.
 */
async function apiSendOtp(identifier) {
  return authApiRequest('send-otp', { identifier });
}

/**
 * POST /api/auth/verify-otp
 */
async function apiVerifyOtp(identifier, otp) {
  return authApiRequest('verify-otp', { identifier, otp });
}

/**
 * POST /api/auth/resend-otp
 */
async function apiResendOtp(identifier) {
  return authApiRequest('resend-otp', { identifier });
}

/* ================================================================
   SESSION  (JWT stored in localStorage)
   ================================================================ */
function saveSession(user, token) {
  localStorage.setItem('auth_user', JSON.stringify(user));
  localStorage.setItem('auth_token', token);
}
function getSession() { try { return JSON.parse(localStorage.getItem('auth_user')); } catch { return null; } }
function getToken() { return localStorage.getItem('auth_token'); }
function clearSession() { localStorage.removeItem('auth_user'); localStorage.removeItem('auth_token'); }
function setAuthState(state) {
  document.body?.setAttribute('data-auth-state', state);
  window.__forecastiqAuthState = state;
}

/* ================================================================
   NAVIGATION
   ================================================================ */
function redirectToDashboard() { window.location.href = '../index.html'; }
function redirectToOTP(identifier, maskedTarget, channel) {
  sessionStorage.setItem('otp_identifier', identifier);
  sessionStorage.setItem('otp_masked', maskedTarget || maskIdentifier(identifier));
  sessionStorage.setItem('otp_channel', channel || (isEmail(identifier) ? 'email' : 'phone'));
  window.location.href = 'otp-verification.html';
}
async function guardAuth() {
  setAuthState('loading');
  const user = getSession();
  const token = getToken();

  if (!user || !token) {
    clearSession();
    setAuthState('unauthenticated');
    return;
  }

  try {
    const res = await fetch(`${API}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      setAuthState('authenticated');
      redirectToDashboard();
      return;
    }

    if (res.status === 401) {
      clearSession();
      setAuthState('unauthenticated');
      return;
    }
    setAuthState('error');
    const alert = document.getElementById('loginAlert') || document.getElementById('signupAlert');
    if (alert) {
      alert.textContent = `Unable to verify your session (${res.status}). Please try again.`;
      alert.className = 'alert alert-error show';
    }
  } catch (error) {
    setAuthState('error');
    const alert = document.getElementById('loginAlert') || document.getElementById('signupAlert');
    if (alert) {
      alert.textContent = error.name === 'AbortError' || error.name === 'TimeoutError'
        ? 'The server took too long to respond. Render may be starting up; wait a moment and retry.'
        : 'Unable to reach the ForecastAI backend. Check your connection and try again.';
      alert.className = 'alert alert-error show';
    }
  }
}

/* ================================================================
   VALIDATION HELPERS
   ================================================================ */
function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim()); }
function isPhone(v) { return /^\+?[\d\s\-()]{7,15}$/.test((v || '').trim()); }

function maskIdentifier(val) {
  if (!val) return '—';
  const v = val.trim();
  if (isEmail(v)) {
    const [user, domain] = v.split('@');
    return user.slice(0, Math.min(2, user.length)) + '****@' + domain;
  }
  const digits = v.replace(/\D/g, '');
  return '+** *****' + digits.slice(-4);
}

/* ================================================================
   UI UTILITIES
   ================================================================ */
function showAlert(id, type, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `alert-msg ${type} show`;
  el.innerHTML = `<i class="fa-solid ${alertIcon(type)}"></i><span>${msg}</span>`;
}
function hideAlert(id) {
  const el = document.getElementById(id);
  if (el) el.className = 'alert-msg';
}
function alertIcon(type) {
  return { info: 'fa-circle-info', success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation' }[type] || 'fa-circle-info';
}

function setBtnLoading(btnId, loading, label = '') {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  // support both old (.btn-spinner/.btn-text) and new (.ap-spinner/.ap-btn-text) class names
  const spinner = btn.querySelector('.ap-spinner, .btn-spinner');
  const text = btn.querySelector('.ap-btn-text, .btn-text');
  btn.disabled = loading;
  if (spinner) spinner.classList.toggle('show', loading);
  if (text) {
    if (!text.dataset.original) text.dataset.original = text.textContent;
    text.textContent = loading ? label : text.dataset.original;
  }
}

/* ================================================================
   DARK MODE
   ================================================================ */
function initTheme() {
  const saved = localStorage.getItem('darkMode');
  if (saved === '1') document.documentElement.setAttribute('data-theme', 'dark');
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  btn.innerHTML = saved === '1' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  btn.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('darkMode', isDark ? '0' : '1');
    btn.innerHTML = isDark ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
  });
}

document.addEventListener('DOMContentLoaded', initTheme);
