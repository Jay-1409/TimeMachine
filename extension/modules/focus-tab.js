import { formatDuration } from './utils.js';

export const FocusTab = (() => {
  let initialized = false;
  let focusTimer = null;
  let currentSession = null;
  let refreshInterval = null;
  let uiOwnedByTimer = false;

  // Lazy DOM getters
  const el = {
    get focusTab() { return document.getElementById('focusTabContent'); },
    get pomodoroToggle() { return document.getElementById('pomodoroToggle'); },
    get pomodoroStop() { return document.getElementById('pomodoroStop'); },
    get pomodoroStatus() { return document.getElementById('pomodoroStatus'); },
    get timerLabel() { return document.getElementById('timerLabel'); },
    get focusSessionsList() { return document.getElementById('focusSessionsList'); },
    get dailyFocusTime() { return document.getElementById('dailyFocusTime'); },
    get timeRemaining() { return document.getElementById('timeRemaining'); },
    get progressPercent() { return document.getElementById('progressPercent'); },
    get progressFill() { return document.querySelector('.progress-indicator'); },
    get timerCircle() { return document.querySelector('.timer-circle'); },
    get presetButtons() { return document.querySelectorAll('.preset-btn'); },
  };

  async function init() {
    if (initialized) return;
    initialized = true;
    try {
      await window.FocusSessionsManager?.init?.();
      bindEvents();
      const { focusSettings = { focusDuration: 25 } } = await chrome.storage.local.get(['focusSettings']);
      updateTimerDisplay(focusSettings.focusDuration);
    } catch (e) {
      console.warn('FocusTab init warning:', e);
    }
  }

  function bindEvents() {
    document.getElementById('startFocusBtn')?.addEventListener('click', handleStartFocusSession);
    document.getElementById('saveFocusSettingsBtn')?.addEventListener('click', saveFocusSettings);
    document.getElementById('focusSettingsBtn')?.addEventListener('click', showFocusSettingsModal);
    document.getElementById('clearHistoryBtn')?.addEventListener('click', clearFocusHistory);
    el.pomodoroToggle?.addEventListener('click', handleFocusToggle);
    el.pomodoroStop?.addEventListener('click', handleFocusStop);
    el.focusSessionsList?.addEventListener('click', handleSessionListClick);
    el.presetButtons.forEach(btn => btn.addEventListener('click', () => {
      el.presetButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateTimerDisplay(parseInt(btn.dataset.time, 10));
    }));
  }

  async function show() {
    el.focusTab?.classList.add('active');
    await init();
    await window.FocusSessionsManager?.forceSync?.().catch(() => {});
    await loadSessions();
    await updateStats();
    if (!refreshInterval) refreshInterval = setInterval(refreshActive, 1000);
  }

  function updateTimerDisplay(minutes) {
    if (el.pomodoroStatus) el.pomodoroStatus.textContent = `${minutes.toString().padStart(2, '0')}:00`;
    if (el.timeRemaining) el.timeRemaining.textContent = `${minutes.toString().padStart(2, '0')}:00 remaining`;
    if (el.progressPercent) el.progressPercent.textContent = '0%';
  }

  function setToggle(label, cls) {
    if (!el.pomodoroToggle) return;
    const labelSpan = el.pomodoroToggle.querySelector('.control-label');
    if (labelSpan) labelSpan.textContent = label; else el.pomodoroToggle.textContent = label;
    el.pomodoroToggle.className = `control-button ${cls}`;
  }

  function updateSessionUI(state) {
    const { timerLabel, pomodoroStop, presetButtons } = el;
    const states = {
      active: () => {
        setToggle('Pause', 'pause-control');
        pomodoroStop?.classList.remove('hidden');
        if (timerLabel) timerLabel.textContent = 'Focus Active';
        presetButtons.forEach(btn => { btn.disabled = true; btn.style.opacity = '0.5'; });
      },
      paused: () => {
        setToggle('Resume', 'resume-control');
        pomodoroStop?.classList.remove('hidden');
        if (timerLabel) timerLabel.textContent = 'Session Paused';
      },
      idle: () => {
        setToggle('Start', 'start-control');
        pomodoroStop?.classList.add('hidden');
        if (timerLabel) timerLabel.textContent = 'Ready to Focus';
        presetButtons.forEach(btn => { btn.disabled = false; btn.style.opacity = '1'; });
      }
    };
    states[state]?.();
  }

  function startTimer(seconds) {
    const { pomodoroStatus, progressFill, timerCircle, timeRemaining, progressPercent } = el;
    const totalMs = (currentSession?.duration || 25) * 60000;
    if (focusTimer) clearInterval(focusTimer);
    uiOwnedByTimer = true;
    focusTimer = setInterval(() => {
      seconds--;
      const m = Math.floor(seconds / 60).toString().padStart(2, '0');
      const s = (seconds % 60).toString().padStart(2, '0');
      const elapsedMs = Math.min(totalMs, Date.now() - (currentSession?.startTime || Date.now()));
      const pct = Math.min(100, (elapsedMs / totalMs) * 100);
      if (pomodoroStatus) pomodoroStatus.textContent = `${m}:${s}`;
      if (progressFill) progressFill.style.width = `${pct}%`;
      if (timerCircle) timerCircle.style.setProperty('--progress', `${pct}%`);
      if (timeRemaining) timeRemaining.textContent = `${m}:${s} remaining`;
      if (progressPercent) progressPercent.textContent = `${Math.round(pct)}%`;
      if (seconds <= 0) completeFocusSession();
    }, 1000);
  }

  function handleFocusToggle() {
    if (currentSession?.isActive) return pauseFocusSession();
    if (currentSession?.isPaused) return resumeFocusSession();
    startFocusSession();
  }

  function handleFocusStop() {
    if (!currentSession) return;
    window.showConfirmModal?.('Stop Session', 'Are you sure you want to stop the current focus session?', endFocusSession);
  }

  async function startFocusSession() {
    const activeTimeBtn = document.querySelector('.preset-btn.active');
    const duration = activeTimeBtn ? parseInt(activeTimeBtn.dataset.time, 10) : 25;
    currentSession = { duration, startTime: Date.now(), isActive: true, isPaused: false };
    updateSessionUI('active');
    startTimer(duration * 60);
    await chrome.storage.local.set({ focusSession: currentSession });
    window.showToast?.('Focus session started! 🎯');
  }

  function pauseFocusSession() {
    if (focusTimer) { clearInterval(focusTimer); focusTimer = null; }
    if (!currentSession) return;
    uiOwnedByTimer = false;
    currentSession.isPaused = true;
    currentSession.isActive = false;
    currentSession.pausedAt = Date.now();
    updateSessionUI('paused');
    chrome.storage.local.set({ focusSession: currentSession });
    window.showToast?.('Session paused ⏸️');
  }

  function resumeFocusSession() {
    if (!currentSession) return;
    const elapsed = (currentSession.pausedAt || Date.now()) - currentSession.startTime;
    const totalMs = currentSession.duration * 60 * 1000;
    const remaining = Math.max(0, totalMs - elapsed);
    if (remaining <= 0) return completeFocusSession();
    currentSession.isActive = true;
    currentSession.isPaused = false;
    currentSession.startTime = Date.now() - elapsed;
    updateSessionUI('active');
    startTimer(Math.floor(remaining / 1000));
    chrome.storage.local.set({ focusSession: currentSession });
    window.showToast?.('Session resumed! 🎯');
  }

  async function endFocusSession() {
    if (focusTimer) { clearInterval(focusTimer); focusTimer = null; }
    uiOwnedByTimer = false;
    updateSessionUI('idle');
    const { progressFill, timerCircle, timeRemaining, progressPercent } = el;
    if (progressFill) progressFill.style.width = '0%';
    if (timerCircle) timerCircle.style.setProperty('--progress', '0%');
    if (timeRemaining) {
      const activeBtn = document.querySelector('.preset-btn.active');
      timeRemaining.textContent = `${(activeBtn ? parseInt(activeBtn.dataset.time, 10) : 25).toString().padStart(2, '0')}:00 remaining`;
    }
    if (progressPercent) progressPercent.textContent = '0%';
    if (currentSession) await addSessionToHistory(currentSession, 'interrupted');
    currentSession = null;
    await chrome.storage.local.remove('focusSession');
    chrome.runtime.sendMessage({ action: 'stopFocusSession' });
    window.showToast?.('Focus session stopped');
  }

  async function completeFocusSession() {
    if (focusTimer) { clearInterval(focusTimer); focusTimer = null; }
    uiOwnedByTimer = false;
    const { timerLabel, progressFill, timerCircle } = el;
    updateSessionUI('idle');
    if (timerLabel) timerLabel.textContent = 'Session Complete! 🎉';
    if (progressFill) progressFill.style.width = '100%';
    if (timerCircle) timerCircle.style.setProperty('--progress', '100%');
    if (currentSession) await addSessionToHistory(currentSession, 'completed');
    currentSession = null;
    await chrome.storage.local.remove('focusSession');
    chrome.runtime.sendMessage({ action: 'completeFocusSession' });
    window.showToast?.('Focus session completed! Great work! 🎉');
    try {
      if (chrome?.notifications?.create) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icon48.png'),
          title: 'Focus Complete',
          message: 'Great job! Your focus session finished.'
        });
      }
    } catch (_) {}
    setTimeout(() => {
      if (timerLabel) timerLabel.textContent = 'Ready to Focus';
      if (progressFill) progressFill.style.width = '0%';
      const activeBtn = document.querySelector('.preset-btn.active');
      updateTimerDisplay(activeBtn ? parseInt(activeBtn.dataset.time, 10) : 25);
    }, 3000);
  }

  async function addSessionToHistory(sessionData, status) {
    try {
      const payload = { duration: sessionData.duration * 60000, startTime: sessionData.startTime, endTime: Date.now(), status };
      if (window.FocusSessionsManager) {
        await window.FocusSessionsManager.saveSession(payload);
      } else {
        const session = { ...payload, date: new Date().toDateString(), sessionType: 'focus' };
        const { focusHistory = [] } = await chrome.storage.local.get(['focusHistory']);
        focusHistory.unshift(session);
        if (focusHistory.length > 10) focusHistory.splice(10);
        await chrome.storage.local.set({ focusHistory });
      }
      await loadSessions();
      await updateStats();
    } catch (e) {
      console.error('Failed to record focus session:', e);
      window.showToast?.('Could not save session');
    }
  }

  async function loadSessions() {
    try {
      let sessions = await window.FocusSessionsManager?.getRecentSessions?.({ todayOnly: true, limit: 5 }) || [];
      if (!sessions.length) {
        const { focusHistory = [] } = await chrome.storage.local.get(['focusHistory']);
        sessions = focusHistory;
      }
      displayFocusSessions(sessions);
    } catch (e) {
      console.error('Error loading focus sessions:', e);
    }
  }

  function displayFocusSessions(sessions) {
    if (!el.focusSessionsList) return;
    const today = new Date().toDateString();
    const todaySessions = sessions.filter(s => new Date(s.startTime).toDateString() === today).slice(0, 5);
    el.focusSessionsList.innerHTML = todaySessions.length ? todaySessions.map((session, index) => {
      const ms = Number(session.duration) < 1000 ? Number(session.duration) * 60000 : Number(session.duration);
      const start = new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const end = session.endTime ? new Date(session.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const status = (session.status || 'completed').toLowerCase();
      const minutes = Math.max(1, Math.round(ms / 60000));
      const delta = Math.max(0, Date.now() - (session.endTime || session.startTime));
      const ago = delta >= 86400000 ? `${Math.floor(delta / 86400000)}d ago` : delta >= 3600000 ? `${Math.floor(delta / 3600000)}h ago` : `${Math.floor(delta / 60000)}m ago`;
      return `
        <div class="session-item" data-session-index="${index}">
          <div class="session-left">
            <div class="session-top">
              <span class="session-duration">${formatDuration(ms)}</span>
              <span class="status-badge status-${status}">${status === 'completed' ? 'Completed' : 'Interrupted'}</span>
            </div>
            <div class="session-meta">
              <span class="session-time-range">${end ? `${start} – ${end}` : `Started ${start}`}</span>
              <span class="session-sep">•</span>
              <span class="session-ago">${ago}</span>
            </div>
          </div>
          <div class="session-actions">
            <button class="chip-btn ${status === 'interrupted' ? 'resume-session-btn' : 'repeat-session-btn'}" data-duration="${minutes}">${status === 'interrupted' ? 'Resume' : 'Repeat'}</button>
            <button class="delete-session-btn" data-session-index="${index}" data-session-id="${session.sessionId || ''}" aria-label="Delete">🗑</button>
          </div>
        </div>`;
    }).join('') : `
      <div class="empty-history">
        <div class="empty-graphic" aria-hidden="true">🙘</div>
        <div class="empty-message">No focus sessions today</div>
        <div class="empty-hint">Start your first focus session!</div>
      </div>`;
  }

  function handleSessionListClick(event) {
    const btn = event.target.closest('.resume-session-btn, .repeat-session-btn, .delete-session-btn');
    if (!btn) return;
    const minutes = parseInt(btn.dataset.duration, 10);
    const index = parseInt(btn.dataset.sessionIndex, 10);
    if (btn.classList.contains('resume-session-btn') || btn.classList.contains('repeat-session-btn')) {
      if (!isNaN(minutes)) quickStartFocusWithMinutes(minutes);
    } else if (!isNaN(index)) {
      deleteFocusSession(index);
    }
  }

  async function deleteFocusSession(sessionIndex) {
    try {
      let sessions = await window.FocusSessionsManager?.getRecentSessions?.({ todayOnly: true, limit: 5 }) || [];
      if (!sessions.length) {
        const { focusHistory = [] } = await chrome.storage.local.get(['focusHistory']);
        sessions = focusHistory.filter(s => new Date(s.startTime).toDateString() === new Date().toDateString()).slice(0, 5);
      }
      if (!(sessionIndex >= 0 && sessionIndex < sessions.length)) return;
      const target = sessions[sessionIndex];
      if (target.sessionId && window.FocusSessionsManager) {
        await window.FocusSessionsManager.deleteSession(target.sessionId);
      } else {
        const { focusHistory = [] } = await chrome.storage.local.get(['focusHistory']);
        await chrome.storage.local.set({ focusHistory: focusHistory.filter(s => s.startTime !== target.startTime || s.duration !== target.duration) });
      }
      window.showToast?.('Session deleted');
      await loadSessions();
      await updateStats();
    } catch (e) {
      console.error('deleteFocusSession error:', e);
    }
  }

  function quickStartFocusWithMinutes(minutes) {
    el.presetButtons.forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.time, 10) === minutes));
    const activeBtn = document.querySelector('.preset-btn.active');
    if (!activeBtn) {
      const first = el.presetButtons[0];
      if (first) {
        first.classList.add('active');
        first.dataset.time = String(minutes);
        first.textContent = `${minutes}m`;
      }
    }
    updateTimerDisplay(minutes);
    startFocusSession();
  }

  async function updateStats() {
    const { dailyFocusTime, focusStreak, completedSessions, totalFocusTime, focusProductivityScore } = el;
    try {
      // Prefer backend daily stats; fallback to computing from today's sessions (remote if authed), then local
      let stats = await window.FocusSessionsManager?.getDailyStats?.(new Date());
      let totalMinutes = 0;
      let completedCount = 0;
      let productivity = 0;
      let todayCompletedCount = 0;
      if (stats && typeof stats === 'object') {
        totalMinutes = Number(stats.totalMinutes) || 0;
        completedCount = Number(stats.sessionCount) || 0;
        productivity = Number(stats.productivity) || 0;
        todayCompletedCount = completedCount;
      } else {
        // Try fetching a larger slice of today's sessions from backend manager
        let todaySessions = await window.FocusSessionsManager?.getRecentSessions?.({ todayOnly: true, limit: 50 });
        if (!Array.isArray(todaySessions) || todaySessions.length === 0) {
          const { focusHistory = [] } = await chrome.storage.local.get(['focusHistory']);
          const today = new Date().toDateString();
          todaySessions = focusHistory.filter(s => new Date(s.startTime).toDateString() === today);
        }
        const onlyCompleted = todaySessions.filter(s => (s.status || 'completed') === 'completed');
        totalMinutes = onlyCompleted.reduce((t, s) => t + Math.max(1, Math.round((Number(s.duration) >= 1000 ? Number(s.duration) : Number(s.duration) * 60000) / 60000)), 0);
        completedCount = onlyCompleted.length;
        todayCompletedCount = completedCount;
      }
      // If backend returned zeros but we do have local/remote sessions for today, compute fallback
      if (totalMinutes === 0 && completedCount === 0) {
        let todaySessions = await window.FocusSessionsManager?.getRecentSessions?.({ todayOnly: true, limit: 50 });
        if (!Array.isArray(todaySessions) || todaySessions.length === 0) {
          const { focusHistory = [] } = await chrome.storage.local.get(['focusHistory']);
          const today = new Date().toDateString();
          todaySessions = focusHistory.filter(s => new Date(s.startTime).toDateString() === today);
        }
        const onlyCompleted = todaySessions.filter(s => (s.status || 'completed') === 'completed');
        totalMinutes = onlyCompleted.reduce((t, s) => t + Math.max(1, Math.round((Number(s.duration) >= 1000 ? Number(s.duration) : Number(s.duration) * 60000) / 60000)), 0);
        completedCount = onlyCompleted.length;
        todayCompletedCount = completedCount;
      }
      if (dailyFocusTime) dailyFocusTime.textContent = formatDuration(totalMinutes * 60000);
      if (focusStreak) {
        const { focusHistory = [] } = await chrome.storage.local.get(['focusHistory']);
        const uniqueDays = new Set(focusHistory.filter(s => (s.status || 'completed') === 'completed').map(s => new Date(s.startTime).toDateString()));
        const hasToday = todayCompletedCount > 0 || uniqueDays.has(new Date().toDateString());
        focusStreak.textContent = String(hasToday ? 1 + [...uniqueDays].reduce((streak, d) => {
          const current = new Date();
          current.setDate(current.getDate() - streak - 1);
          return d === current.toDateString() ? streak + 1 : streak;
        }, 0) : 0);
      }
      if (completedSessions) completedSessions.textContent = String(completedCount);
      if (totalFocusTime) totalFocusTime.textContent = formatDuration(totalMinutes * 60000);
      if (focusProductivityScore) focusProductivityScore.textContent = `${Math.round(Math.min(100, Math.max(0, productivity)))}%`;
    } catch (e) {
      console.error('Error updating focus stats:', e);
    }
  }

  // Removed the per-list total updater to avoid inconsistencies; updateStats is the single source of truth

  async function refreshActive() {
    if (uiOwnedByTimer && focusTimer) return;
    try {
      const { focusSession } = await chrome.storage.local.get(['focusSession']);
      if (!focusSession || (!focusSession.isActive && !focusSession.isPaused)) {
        updateSessionUI('idle');
        const card = document.getElementById('pomodoroCard');
        card?.classList.remove('break-mode', 'active-timer');
        if (el.progressFill) el.progressFill.style.width = '0%';
        if (el.timerCircle) el.timerCircle.style.setProperty('--progress', '0%');
        updateTimerDisplay(document.querySelector('.preset-btn.active')?.dataset.time || 25);
        return;
      }
      const totalMs = focusSession.duration * 60 * 1000;
      const elapsed = Math.min(totalMs, (focusSession.isPaused ? focusSession.pausedAt : Date.now()) - focusSession.startTime);
      const remaining = Math.max(0, totalMs - elapsed);
      const mm = Math.floor(remaining / 60000).toString().padStart(2, '0');
      const ss = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
      const pct = Math.min(100, (elapsed / totalMs) * 100);
      if (el.pomodoroStatus) el.pomodoroStatus.textContent = `${mm}:${ss}`;
      updateSessionUI(focusSession.isPaused ? 'paused' : 'active');
      document.getElementById('pomodoroCard')?.classList.add('active-timer');
      if (el.progressFill) el.progressFill.style.width = `${pct}%`;
      if (el.timerCircle) el.timerCircle.style.setProperty('--progress', `${pct}%`);
      if (el.timeRemaining) el.timeRemaining.textContent = `${mm}:${ss} remaining`;
      if (el.progressPercent) el.progressPercent.textContent = `${Math.round(pct)}%`;
      if (remaining <= 0) {
        await addSessionToHistory({ duration: focusSession.duration, startTime: focusSession.startTime }, 'completed');
        await updateStats();
        await chrome.storage.local.remove('focusSession');
        updateSessionUI('idle');
        if (chrome?.notifications?.create) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icon48.png'),
            title: 'Focus Complete',
            message: 'Great job! Your focus session finished.'
          });
        }
      }
    } catch (e) {
      console.error('Error refreshing focus session:', e);
    }
  }

  function showFocusSettingsModal() {
    chrome.storage.local.get(['focusSettings'], ({ focusSettings = { focusDuration: 25, breakDuration: 5, notificationSounds: true, blockWebsitesDuringFocus: false } }) => {
      document.getElementById('focusDurationSetting').value = focusSettings.focusDuration;
      document.getElementById('breakDuration').value = focusSettings.breakDuration;
      document.getElementById('notificationSounds').checked = focusSettings.notificationSounds;
      document.getElementById('blockWebsitesDuringFocus').checked = focusSettings.blockWebsitesDuringFocus;
      window.showModal?.('focusSettingsModal');
    });
  }

  function saveFocusSettings() {
    const settings = {
      focusDuration: parseInt(document.getElementById('focusDurationSetting').value) || 25,
      breakDuration: parseInt(document.getElementById('breakDuration').value) || 5,
      notificationSounds: document.getElementById('notificationSounds').checked,
      blockWebsitesDuringFocus: document.getElementById('blockWebsitesDuringFocus').checked
    };
    if (settings.focusDuration < 5 || settings.focusDuration > 120) return window.showToast?.('Focus duration must be 5-120 minutes', true);
    if (settings.breakDuration < 1 || settings.breakDuration > 30) return window.showToast?.('Break duration must be 1-30 minutes', true);
    chrome.storage.local.set({ focusSettings }, () => {
      window.hideModal?.('focusSettingsModal');
      document.getElementById('focusDuration').value = settings.focusDuration;
      window.showToast?.('Focus settings saved!');
    });
  }

  async function handleStartFocusSession() {
    const durationInput = document.getElementById('focusDuration');
    const blockAllInput = document.getElementById('blockAllSites');
    const duration = parseInt(durationInput?.value || '25', 10);
    if (!duration || duration < 1 || duration > 480) {
      window.showToast?.('Enter a valid duration (1-480 minutes)', true);
      durationInput?.focus();
      return;
    }
    const { focusSettings = {} } = await chrome.storage.local.get(['focusSettings']);
    el.presetButtons.forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.time, 10) === duration));
    if (!document.querySelector('.preset-btn.active')) {
      const first = el.presetButtons[0];
      if (first) {
        first.classList.add('active');
        first.dataset.time = String(duration);
        first.textContent = `${duration}m`;
      }
    }
    updateTimerDisplay(duration);
    startFocusSession();
    window.hideModal?.('focusSessionModal');
    if (durationInput) durationInput.value = focusSettings.focusDuration || 25;
    if (blockAllInput) blockAllInput.checked = false;
  }

  async function clearFocusHistory() {
    window.showConfirmModal?.('Clear History', 'Are you sure you want to clear all focus session history?', async () => {
      await chrome.storage.local.remove('focusHistory');
      await loadSessions();
      await updateStats();
      window.showToast?.('Focus history cleared');
    });
  }

  return { init, show, loadSessions, updateStats, refreshActive };
})();

if (typeof window !== 'undefined') window.FocusTab = FocusTab;