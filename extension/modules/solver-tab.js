// Solver (Stopwatch) Tab Controller (ES Module)
// Encapsulates problem-solving session tracking, stopwatch UI, and history

import { resolveBackendUrl } from './api.js';
import { formatDuration } from './utils.js';

export const SolverTab = (() => {
  let initialized = false;
  let activeSession = null;
  let stopwatchInterval = null;

  const el = {
    get container() { return document.getElementById('stopwatchTabContent'); },
    get activeCard() { return document.getElementById('activeSessionCard'); },
    get newCard() { return document.getElementById('newSessionCard'); },
    get sessionTitle() { return document.getElementById('sessionTitle'); },
    get sessionCategory() { return document.getElementById('sessionCategory'); },
    get sessionSite() { return document.getElementById('sessionSite'); },
    get stopwatchTime() { return document.getElementById('stopwatchTime'); },
    get pauseResumeBtn() { return document.getElementById('pauseResumeBtn'); },
    get completeBtn() { return document.getElementById('completeBtn'); },
    get abandonBtn() { return document.getElementById('abandonBtn'); },
    get startBtn() { return document.getElementById('startSessionBtn'); },
    get historyList() { return document.getElementById('sessionsList'); },
    get historyFilter() { return document.getElementById('historyFilter'); },
    get quickCategory() { return document.getElementById('quickCategory'); },
    get detectedTitle() { return document.getElementById('detectedTitle'); },
    get detectedUrl() { return document.getElementById('detectedUrl'); },
    // Stats
    get dailyProblems() { return document.getElementById('dailyProblems'); },
    get dailyTime() { return document.getElementById('dailyTime'); },
    get completedCount() { return document.getElementById('completedCount'); },
    get totalTime() { return document.getElementById('totalTime'); },
    get streakCount() { return document.getElementById('streakCount'); },
    get sessionNotes() { return document.getElementById('sessionNotes'); },
  };

  async function init() {
    if (initialized) return;
    initialized = true;

    // Listeners
    el.startBtn?.addEventListener('click', startNewSession);
    el.pauseResumeBtn?.addEventListener('click', pauseResumeSession);
    el.completeBtn?.addEventListener('click', completeSession);
    el.abandonBtn?.addEventListener('click', abandonSession);
    el.historyFilter?.addEventListener('change', async () => {
      await loadSessionHistory();
      await loadProgressStats();
    });

    // Optional: save notes on blur with small debounce
    el.sessionNotes?.addEventListener('input', debounce(saveSessionNotes, 600));
  }

  async function show() {
    el.container?.classList.add('active');
    await init();
    await detectCurrentPage();
    await Promise.all([
      loadDailyStats(),
      loadProgressStats(),
      loadActiveSession().then(() => loadSessionHistory()),
    ]);
  }

  // Data/Stats
  async function loadDailyStats() {
    try {
      if (typeof Auth !== 'undefined' && !await Auth.isAuthenticated()) return;
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (!userEmail) return;
      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      if (!token) return;
      const today = new Date().toISOString().split('T')[0];
  const tz = new Date().getTimezoneOffset();
  const resp = await fetch(`${backend}/api/problem-sessions/history/${encodeURIComponent(userEmail)}?date=${today}&endDate=${today}&timezone=${tz}&useUserTimezone=true`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!resp.ok) return;
      const data = await resp.json();
      const sessions = data.sessions || [];
      const completedToday = sessions.filter(s => s.status === 'completed').length;
      const totalMs = sessions.reduce((t,s)=> t + (s.duration||0), 0);
      if (el.dailyProblems) el.dailyProblems.textContent = String(completedToday);
      if (el.dailyTime) el.dailyTime.textContent = formatDuration(totalMs);
    } catch (e) { console.error('loadDailyStats error', e); }
  }

  async function loadProgressStats() {
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (!userEmail) return;
      const filter = el.historyFilter?.value || 'week';
      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      const end = new Date();
      const start = new Date(end);
      if (filter === 'week') start.setDate(end.getDate() - 7);
      else if (filter === 'month') start.setMonth(end.getMonth() - 1);
      else start.setHours(0,0,0,0);
  const tz = new Date().getTimezoneOffset();
  const qs = new URLSearchParams({ date: start.toISOString().split('T')[0], endDate: end.toISOString().split('T')[0], timezone: String(tz), useUserTimezone: 'true' });
  const resp = await fetch(`${backend}/api/problem-sessions/history/${encodeURIComponent(userEmail)}?${qs}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!resp.ok) return;
      const data = await resp.json();
      const sessions = data.sessions || [];
      const completed = sessions.filter(s => s.status === 'completed').length;
      const totalMs = sessions.reduce((t,s)=> t + (s.duration||0), 0);
      const streak = await calculateStreak(sessions);
      if (el.completedCount) el.completedCount.textContent = String(completed);
      if (el.totalTime) el.totalTime.textContent = formatDuration(totalMs);
      if (el.streakCount) el.streakCount.textContent = String(streak);
    } catch (e) { console.error('loadProgressStats error', e); }
  }

  async function calculateStreak(sessions) {
    const completed = (sessions||[]).filter(s => s.status === 'completed');
    if (completed.length === 0) return 0;
    const days = [...new Set(completed.map(s => new Date(s.startTime).toDateString()))].sort();
    const today = new Date().toDateString();
    if (!days.includes(today)) return 0;
    let streak = 1;
    for (let i = days.length - 2; i >= 0; i--) {
      const current = new Date(days[i]);
      const next = new Date(days[i+1]);
      const diff = (next - current) / 86400000;
      if (diff === 1) streak++; else break;
    }
    return streak;
  }

  // Session lifecycle
  async function startNewSession() {
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (!userEmail) return window.showError?.('Please set your email first');
      const pageInfo = window.detectedPageInfo || {};
      const category = el.quickCategory?.value || 'Coding';
      // Sanitize inputs: trim and limit lengths
      const safeTitle = String(pageInfo.title || 'Problem Session').trim().slice(0, 120);
      const safeUrl = (() => {
        try { return pageInfo.url && /^https?:\/\//i.test(pageInfo.url) ? pageInfo.url.slice(0, 2048) : ''; } catch { return ''; }
      })();
      const safeSite = String(pageInfo.site || '').trim().slice(0, 120);
      const payload = {
        userEmail,
        title: safeTitle,
        url: safeUrl,
        site: safeSite,
        category,
        difficulty: 'Medium',
        timezone: new Date().getTimezoneOffset(),
        timezoneName: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      const resp = await fetch(`${backend}/api/problem-sessions/start`, { method:'POST', headers:{ 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!resp.ok) { const err = await resp.json().catch(()=>({})); return window.showError?.(err.error||'Failed to start session'); }
  const data = await resp.json();
  activeSession = { ...data.session, pausedDuration: 0, pausedAt: null };
      showActiveSession();
      startStopwatchTimer();
      window.showToast?.('Session started!');
    } catch (e) { console.error('startNewSession', e); window.showError?.('Failed to start session'); }
  }

  async function pauseResumeSession() {
    if (!activeSession) return;
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      const resp = await fetch(`${backend}/api/problem-sessions/${activeSession.id}/pause`, { method:'PATCH', headers:{ 'Authorization': `Bearer ${token}`, 'Content-Type':'application/json' }, body: JSON.stringify({ userEmail, reason: activeSession.status==='active'?'Manual pause':'Manual resume' }) });
      if (!resp.ok) return;
      const data = await resp.json();
      activeSession.status = data.session.status;
      if (typeof data.session.pausedDuration === 'number') activeSession.pausedDuration = data.session.pausedDuration;
      if (activeSession.status === 'paused') {
        activeSession.pausedAt = new Date();
      } else {
        activeSession.pausedAt = null;
      }
      updateStopwatchStatus();
      if (activeSession.status === 'paused') { window.showToast?.('Session paused'); }
      else { window.showToast?.('Session resumed'); }
    } catch (e) { console.error('pauseResumeSession', e); window.showError?.('Failed to update session'); }
  }

  async function completeSession() {
    if (!activeSession) return;
    const notes = el.sessionNotes?.value?.trim();
    window.showConfirmModal?.('Complete Session', 'Mark this session as completed successfully?', async () => {
      try {
        const { userEmail } = await chrome.storage.local.get(['userEmail']);
        const backend = await resolveBackendUrl();
        const { token } = await TokenStorage.getToken();
        const resp = await fetch(`${backend}/api/problem-sessions/${activeSession.id}/complete`, { method:'PATCH', headers:{ 'Authorization': `Bearer ${token}`, 'Content-Type':'application/json' }, body: JSON.stringify({ userEmail, completionNotes: notes, wasSuccessful: true }) });
        if (!resp.ok) return;
        const data = await resp.json();
        stopStopwatchTimer(); activeSession = null; showNewSessionForm(); await loadSessionHistory();
        window.showToast?.(`Session completed! Duration: ${formatDuration(data.session.duration)}`);
      } catch (e) { console.error('completeSession', e); window.showError?.('Failed to complete session'); }
    });
  }

  async function abandonSession() {
    if (!activeSession) return;
    window.showConfirmModal?.('Abandon Session', 'Are you sure you want to abandon this session? This action cannot be undone.', async () => {
      try {
        const { userEmail } = await chrome.storage.local.get(['userEmail']);
        const backend = await resolveBackendUrl();
        const { token } = await TokenStorage.getToken();
        const resp = await fetch(`${backend}/api/problem-sessions/${activeSession.id}/abandon`, { method:'PATCH', headers:{ 'Authorization': `Bearer ${token}`, 'Content-Type':'application/json' }, body: JSON.stringify({ userEmail, reason: 'User abandoned session' }) });
        if (!resp.ok) return;
        stopStopwatchTimer(); activeSession = null; showNewSessionForm(); await loadSessionHistory();
        window.showToast?.('Session abandoned');
      } catch (e) { console.error('abandonSession', e); window.showError?.('Failed to abandon session'); }
    });
  }

  function showActiveSession() {
    if (!activeSession || !el.activeCard || !el.newCard) return;
    el.activeCard.classList.remove('hidden');
    el.newCard.classList.add('hidden');
    if (el.sessionTitle) el.sessionTitle.textContent = activeSession.title;
    if (el.sessionCategory) el.sessionCategory.textContent = activeSession.category;
    if (el.sessionSite) el.sessionSite.textContent = activeSession.site || 'Website';
    updateStopwatchStatus();
  }

  function showNewSessionForm() {
    if (!el.activeCard || !el.newCard) return;
    el.activeCard.classList.add('hidden');
    el.newCard.classList.remove('hidden');
  }

  async function loadActiveSession() {
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (!userEmail) { showNewSessionForm(); return; }
      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      const resp = await fetch(`${backend}/api/problem-sessions/current/${encodeURIComponent(userEmail)}`, { headers:{ 'Authorization': `Bearer ${token}`, 'Content-Type':'application/json' } });
      if (!resp.ok) { showNewSessionForm(); return; }
  const data = await resp.json();
  if (data.activeSession) { activeSession = data.activeSession; showActiveSession(); startStopwatchTimer(); }
      else { showNewSessionForm(); }
    } catch (e) { console.error('loadActiveSession', e); showNewSessionForm(); }
  }

  async function loadSessionHistory() {
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (!userEmail) return;
      const filter = el.historyFilter?.value || 'today';
      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      const end = new Date();
      const start = new Date(end);
      if (filter === 'week') start.setDate(end.getDate() - 7);
      else if (filter === 'month') start.setMonth(end.getMonth() - 1);
      else start.setHours(0,0,0,0);
  // show in-list loader
  if (el.historyList) el.historyList.innerHTML = '<div class="loading-text">Loading sessions…</div>';
  const tz = new Date().getTimezoneOffset();
  const qs = new URLSearchParams({ date: start.toISOString().split('T')[0], endDate: end.toISOString().split('T')[0], timezone: String(tz), useUserTimezone: 'true' });
  const resp = await fetch(`${backend}/api/problem-sessions/history/${encodeURIComponent(userEmail)}?${qs}`, { headers:{ 'Authorization': `Bearer ${token}`, 'Content-Type':'application/json' } });
      if (!resp.ok) return;
      const data = await resp.json();
      displayCompactHistory(data.sessions || []);
    } catch (e) { console.error('loadSessionHistory', e); }
  }

  function displayCompactHistory(sessions) {
    const list = el.historyList; if (!list) return;
    if (!sessions || sessions.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">•</div><div class="empty-text">No sessions yet</div><div class="empty-subtext">Start your first problem-solving session!</div></div>`;
      return;
    }
    list.innerHTML = sessions.slice(0, 5).map(session => {
      const status = session.status;
      const icon = status === 'completed' ? '✓' : status === 'paused' ? '⏸' : status === 'active' ? '•' : '×';
      const cls = status === 'completed' ? 'completed' : status === 'paused' ? 'paused' : status === 'active' ? 'active' : 'abandoned';
      const duration = formatDuration(session.duration || 0);
      const timeAgo = getTimeAgo(new Date(session.startTime));
      return `
        <div class="session-item ${cls}">
          <div class="session-info">
            <div class="session-name">
              <span class="session-status-icon">${icon}</span>
              <span class="session-title-text">${session.title || 'Problem Session'}</span>
            </div>
            <div class="session-meta">
              <span class="session-site-badge">${session.site || 'Website'}</span>
              <span class="session-category-badge">${session.category || 'Coding'}</span>
            </div>
          </div>
          <div class="session-stats">
            <div class="session-duration">${duration}</div>
            <div class="session-time">${timeAgo}</div>
          </div>
        </div>`;
    }).join('');
  }

  function getTimeAgo(date) {
    const now = new Date(); const diffMs = now - date; const h = Math.floor(diffMs / 3600000); const m = Math.floor(diffMs / 60000);
    if (h > 24) return Math.floor(h/24) + 'd ago'; if (h > 0) return h + 'h ago'; if (m > 0) return m + 'm ago'; return 'Just now';
  }

  // Stopwatch visuals
  function updateStopwatchStatus() {
    if (!activeSession || !el.pauseResumeBtn) return;
    const icon = el.pauseResumeBtn.querySelector('.btn-icon');
    const text = el.pauseResumeBtn.querySelector('.btn-text');
    if (activeSession.status === 'paused') {
      if (icon) icon.textContent = '▶';
      if (text) text.textContent = 'Resume';
      el.pauseResumeBtn.title = 'Resume session';
    } else {
      if (icon) icon.textContent = '⏸';
      if (text) text.textContent = 'Pause';
      el.pauseResumeBtn.title = 'Pause session';
    }
  }

  function updateStopwatchDisplay() {
    if (!activeSession || !el.stopwatchTime) return;
    const now = Date.now();
    const start = new Date(activeSession.startTime).getTime();
    let pausedSoFar = activeSession.pausedDuration || 0;
    if (activeSession.status === 'paused' && activeSession.pausedAt) {
      const pAt = new Date(activeSession.pausedAt).getTime();
      pausedSoFar += Math.max(0, now - pAt);
    }
    const elapsed = Math.max(0, now - start - pausedSoFar);
    const totalSec = Math.floor(elapsed / 1000);
    el.stopwatchTime.textContent = formatTimeDisplay(totalSec);
  }

  function formatTimeDisplay(seconds) {
    const h = Math.floor(seconds/3600), m = Math.floor((seconds%3600)/60), s = seconds%60;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  }

  function startStopwatchTimer() {
  if (stopwatchInterval) clearInterval(stopwatchInterval);
  stopwatchInterval = setInterval(() => { if (activeSession) updateStopwatchDisplay(); }, 1000);
  updateStopwatchDisplay();
  }

  function stopStopwatchTimer() { if (stopwatchInterval) { clearInterval(stopwatchInterval); stopwatchInterval = null; } }

  // Notes
  async function saveSessionNotes() {
    if (!activeSession || !el.sessionNotes) return;
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      await fetch(`${backend}/api/problem-sessions/${activeSession.id}/update`, { method:'PATCH', headers:{ 'Authorization': `Bearer ${token}`, 'Content-Type':'application/json' }, body: JSON.stringify({ userEmail, notes: el.sessionNotes.value.trim() }) });
    } catch (e) { console.error('saveSessionNotes', e); }
  }

  // Page detection helpers
  async function detectCurrentPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      const title = extractProblemTitle(tab.title || '', tab.url || '');
      const site = extractSiteName(tab.url || '');
      if (el.detectedTitle) el.detectedTitle.textContent = title || 'Click "Start" to track current problem';
      if (el.detectedUrl) {
        const url = tab.url || '';
        try { const u = new URL(url); el.detectedUrl.textContent = u.hostname.replace(/^www\./,''); el.detectedUrl.title = url; }
        catch { el.detectedUrl.textContent = (url.length > 60 ? url.slice(0,57)+'…' : url) || (site || 'Auto-detect from current tab'); }
      }
      const status = document.getElementById('detectionStatus')?.querySelector('.status-text');
      if (status) status.textContent = 'Detected';
  window.detectedPageInfo = { title: title || tab.title || 'Problem Session', url: tab.url, site, favicon: tab.favIconUrl };
    } catch (e) { console.error('detectCurrentPage', e); }
  }

  function extractProblemTitle(title, url) {
    if (url.includes('leetcode.com')) { const m = title.match(/(\d+\.\s+.*?)\s*-\s*LeetCode/); return m ? m[1] : 'LeetCode Problem'; }
    if (url.includes('hackerrank.com')) { const m = title.match(/(.*?)\s*\|\s*HackerRank/); return m ? m[1] : 'HackerRank Challenge'; }
    if (url.includes('codepen.io')) return 'CodePen Project';
    if (url.includes('github.com')) { const m = title.match(/^(.*?)\s*·\s*GitHub/); return m ? m[1] : 'GitHub Project'; }
    if (url.includes('stackoverflow.com')) { const m = title.match(/^(.*?)\s*-\s*Stack Overflow/); return m ? m[1] : 'Stack Overflow Question'; }
    if (url.includes('youtube.com')) { const m = title.match(/^(.*?)\s*-\s*YouTube/); return m ? m[1] : 'YouTube Tutorial'; }
    return title.split(' - ')[0].split(' | ')[0].substring(0, 50);
  }

  function extractSiteName(url) {
    try {
      const domain = new URL(url).hostname;
      const map = { 'leetcode.com': 'LeetCode', 'hackerrank.com': 'HackerRank', 'codepen.io': 'CodePen', 'github.com': 'GitHub', 'stackoverflow.com': 'StackOverflow', 'youtube.com': 'YouTube', 'medium.com': 'Medium', 'dev.to': 'Dev.to' };
      for (const [k,v] of Object.entries(map)) { if (domain.includes(k)) return v; }
      return domain.replace('www.','').split('.')[0];
    } catch { return 'Website'; }
  }

  // Small debounce helper
  function debounce(fn, wait) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; }

  return { init, show };
})();

if (typeof window !== 'undefined') window.SolverTab = SolverTab;
