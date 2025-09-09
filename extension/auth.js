const STORAGE_KEYS = {
  USER_EMAIL: 'userEmail',
  AUTH_TOKEN: 'tm_auth_token',
  USER_ID: 'userId'
};

// Token storage for auth token, email, and userId
const TokenStorage = {
  _decode(token) {
    try {
      const [, payload] = token.split('.');
      return payload ? JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) : {};
    } catch {
      return {};
    }
  },
  async setToken(token, email) {
    const decoded = this._decode(token);
    const userId = decoded.userId || decoded.id || decoded.sub || decoded._id || null;
    try {
      localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
      localStorage.setItem(STORAGE_KEYS.USER_EMAIL, email);
      if (userId) localStorage.setItem(STORAGE_KEYS.USER_ID, userId);
      await chrome.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: token, [STORAGE_KEYS.USER_EMAIL]: email, [STORAGE_KEYS.USER_ID]: userId });
    } catch {}
    return { token, email, userId };
  },
  async getToken() {
    let token, email, userId;
    try {
      token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      email = localStorage.getItem(STORAGE_KEYS.USER_EMAIL);
      userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    } catch {}
    if (!token || !email) {
      try {
        const stored = await chrome.storage.local.get([STORAGE_KEYS.AUTH_TOKEN, STORAGE_KEYS.USER_EMAIL, STORAGE_KEYS.USER_ID]);
        token = token || stored[STORAGE_KEYS.AUTH_TOKEN];
        email = email || stored[STORAGE_KEYS.USER_EMAIL];
        userId = userId || stored[STORAGE_KEYS.USER_ID];
      } catch {}
    }
    if (token && !userId) {
      const decoded = this._decode(token);
      userId = decoded.userId || decoded.id || decoded.sub || decoded._id || null;
      if (userId) try { localStorage.setItem(STORAGE_KEYS.USER_ID, userId); } catch {}
    }
    return { token, email, userId };
  },
  async clearToken() {
    try {
      localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER_EMAIL);
      localStorage.removeItem(STORAGE_KEYS.USER_ID);
      await chrome.storage.local.remove([STORAGE_KEYS.AUTH_TOKEN, STORAGE_KEYS.USER_EMAIL, STORAGE_KEYS.USER_ID]);
    } catch {}
    if (window.__TM_AUTH_CACHE__) window.__TM_AUTH_CACHE__ = { last: 0, ok: false };
  }
};

// Create login/signup UI modal
const createAuthUI = (mode = 'login', onComplete) => {
  document.getElementById('tm-auth-modal')?.remove();
  const modal = Object.assign(document.createElement('div'), { id: 'tm-auth-modal', className: 'verification-modal' });
  const content = Object.assign(document.createElement('div'), { className: 'verification-content' });
  const header = Object.assign(document.createElement('h2'), { textContent: mode === 'login' ? 'Sign In' : 'Create Account', className: 'verification-title' });
  const explanation = Object.assign(document.createElement('p'), { 
    textContent: mode === 'login' ? 'Sign in to access your TimeMachine data' : 'Create an account to start using TimeMachine', 
    className: 'verification-text' 
  });
  const emailInput = Object.assign(document.createElement('input'), { type: 'email', placeholder: 'Email address', className: 'verification-input', id: 'tm-auth-email' });
  const passwordWrapper = Object.assign(document.createElement('div'), { className: 'tm-password-wrapper' });
  const passwordInput = Object.assign(document.createElement('input'), { 
    type: 'password', placeholder: 'Password', className: 'verification-input', id: 'tm-auth-password', autocomplete: 'current-password' 
  });
  const toggleBtn = Object.assign(document.createElement('button'), { 
    type: 'button', className: 'tm-password-toggle', innerHTML: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/></svg>' 
  });
  toggleBtn.setAttribute('aria-label', 'Show password');
  toggleBtn.onclick = () => {
    const showing = passwordInput.type === 'text';
    passwordInput.type = showing ? 'password' : 'text';
    toggleBtn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    toggleBtn.classList.toggle('active', !showing);
  };
  passwordWrapper.append(passwordInput, toggleBtn);
  const errorMsg = Object.assign(document.createElement('div'), { className: 'verification-error' });
  const btnContainer = Object.assign(document.createElement('div'), { className: 'verification-button-container' });
  const primaryBtn = Object.assign(document.createElement('button'), { 
    className: 'btn primary', id: 'tm-auth-primary', type: 'button', innerHTML: `<span class="btn-label">${mode === 'login' ? 'Sign In' : 'Create Account'}</span>` 
  });
  const cancelBtn = Object.assign(document.createElement('button'), { textContent: 'Cancel', className: 'btn secondary' });
  const toggleLink = Object.assign(document.createElement('button'), { 
    textContent: mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in', 
    className: 'verification-resend', id: 'tm-auth-toggle' 
  });

  const showError = msg => Object.assign(errorMsg, { textContent: msg, style: { display: msg ? 'block' : 'none' } });
  const validateEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePassword = pwd => pwd.length >= 6;

  const toggleMode = () => {
    const isLogin = header.textContent === 'Sign In';
    header.textContent = isLogin ? 'Create Account' : 'Sign In';
    explanation.textContent = isLogin ? 'Create an account to start using TimeMachine' : 'Sign in to access your TimeMachine data';
    primaryBtn.innerHTML = `<span class="btn-label">${isLogin ? 'Create Account' : 'Sign In'}</span>`;
    toggleLink.textContent = isLogin ? 'Already have an account? Sign in' : "Don't have an account? Sign up";
    showError('');
    emailInput.value = passwordInput.value = '';
  };

  const handleSubmit = async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const isLogin = /Sign In/i.test(primaryBtn.textContent);
    if (!email) return showError('Enter email'), emailInput.focus();
    if (!validateEmail(email)) return showError('Invalid email'), emailInput.focus();
    if (!password) return showError('Enter password'), passwordInput.focus();
    if (!validatePassword(password)) return showError('Password must be 6+ characters'), passwordInput.focus();
    try {
      primaryBtn.disabled = true;
      primaryBtn.querySelector('.btn-label').textContent = isLogin ? 'Signing In...' : 'Creating...';
      primaryBtn.classList.add('loading');
      const spinner = Object.assign(document.createElement('div'), { className: 'tm-spinner' });
      primaryBtn.appendChild(spinner);
      showError('');
      const success = isLogin ? await login(email, password) : await signup(email, password);
      if (success) {
        localStorage.setItem(STORAGE_KEYS.USER_EMAIL, email);
        modal.remove();
        onComplete?.(true, email);
      } else {
        showError(isLogin ? 'Invalid email or password' : 'Account creation failed. Try another email.');
      }
    } catch (e) {
      console.error('Auth failed:', e);
      showError(e.message || 'Authentication failed');
    } finally {
      primaryBtn.disabled = false;
      primaryBtn.querySelector('.btn-label').textContent = header.textContent === 'Sign In' ? 'Sign In' : 'Create Account';
      primaryBtn.classList.remove('loading');
      primaryBtn.querySelector('.tm-spinner')?.remove();
    }
  };

  primaryBtn.onclick = handleSubmit;
  emailInput.onkeydown = e => e.key === 'Enter' && handleSubmit();
  passwordInput.onkeydown = e => e.key === 'Enter' && handleSubmit();
  cancelBtn.onclick = () => { modal.remove(); onComplete?.(false); };
  toggleLink.onclick = toggleMode;

  btnContainer.append(primaryBtn, cancelBtn);
  content.append(header, explanation, emailInput, passwordWrapper, errorMsg, btnContainer, toggleLink);
  modal.appendChild(content);
  document.body.appendChild(modal);
  setTimeout(() => emailInput.focus(), 100);
  return modal;
};

const login = async (email, password) => authRequest('login', email, password);
const signup = async (email, password) => authRequest('signup', email, password);

// Shared auth request handler
const authRequest = async (type, email, password) => {
  try {
    const backendUrl = await resolveBackendUrl();
    const res = await fetch(`${backendUrl}/api/auth/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || `${type === 'login' ? 'Login' : 'Signup'} failed`);
    if (!data.token) throw new Error('No token received');
    await TokenStorage.setToken(data.token, email);
    window.__TM_AUTH_CACHE__ = { last: Date.now(), ok: true };
    try { chrome.runtime.sendMessage({ action: 'triggerImmediateSync' }); } catch {}
    if (type === 'signup') try { chrome.runtime.sendMessage({ action: 'authSuccess' }); } catch {}
    return true;
  } catch (e) {
    console.error(`${type} error:`, e);
    throw e;
  }
};

// Check authentication status
const isAuthenticated = async () => {
  window.__TM_AUTH_CACHE__ = window.__TM_AUTH_CACHE__ || { last: 0, ok: false };
  const CACHE_TTL = 5 * 60 * 1000;
  const { token, email } = await TokenStorage.getToken();
  if (!token || !email) return false;
  if (window.__TM_AUTH_CACHE__.ok && Date.now() - window.__TM_AUTH_CACHE__.last < CACHE_TTL) return true;
  try {
    const backendUrl = await resolveBackendUrl();
    const res = await fetch(`${backendUrl}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      window.__TM_AUTH_CACHE__ = { last: Date.now(), ok: true };
      return true;
    }
    if (res.status === 429) {
      console.warn('Token verification rate-limited');
      window.__TM_AUTH_CACHE__ = { last: Date.now(), ok: true };
      return true;
    }
    const data = res.headers.get('content-type')?.includes('application/json') ? await res.json().catch(() => ({})) : { message: await res.text().catch(() => '') };
    console.warn('Token verification failed:', data || { status: res.status });
    if (data?.code === 'TOKEN_EXPIRED' || data?.code === 'INVALID_TOKEN') await TokenStorage.clearToken();
    window.__TM_AUTH_CACHE__ = { last: Date.now(), ok: false };
    return false;
  } catch (e) {
    console.error('Token verification error:', e);
    window.__TM_AUTH_CACHE__ = { last: Date.now(), ok: false };
    return false;
  }
};

// Main auth function
const authenticateUser = async callback => {
  if (await isAuthenticated()) {
    const { email } = await TokenStorage.getToken();
    callback?.(true, email);
    return true;
  }
  return new Promise(resolve => createAuthUI('login', (success, email) => { callback?.(success, email); resolve(success); }));
};

const logout = async () => await TokenStorage.clearToken();

// Resolve backend URL with fallback
const resolveBackendUrl = async () => {
  try {
    if (window.TMConfig) {
      await window.TMConfig.loadOverrides();
      return window.TMConfig.current.backendBaseUrl;
    }
  } catch {}
  try {
    const { tmBackendUrl } = await chrome.storage.local.get(['tmBackendUrl']);
    if (tmBackendUrl && /^https?:\/\//.test(tmBackendUrl)) {
      const url = tmBackendUrl.replace(/\/$/, '');
      try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 1200);
        const res = await fetch(`${url}/health`, { method: 'GET', cache: 'no-store', signal: controller.signal });
        if (res.ok) return url;
      } catch {}
    }
  } catch {}
  const renderBase = 'https://timemachine-1.onrender.com';
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${renderBase}/health`, { method: 'GET', cache: 'no-store', signal: controller.signal });
    if (res.ok) {
      try { await chrome.storage.local.set({ tmBackendUrl: renderBase }); } catch {}
      return renderBase;
    }
  } catch {}
  for (const base of ['http://127.0.0.1:3000', 'http://localhost:3000']) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`${base}/health`, { method: 'GET', cache: 'no-store', signal: controller.signal });
      if (res.ok) {
        try { await chrome.storage.local.set({ tmBackendUrl: base }); } catch {}
        return base;
      }
    } catch {}
  }
  return renderBase;
};

window.Auth = { authenticateUser, login, signup, logout, isAuthenticated };
try { window.TokenStorage = TokenStorage; } catch {}