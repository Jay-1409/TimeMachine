import { formatDuration, addDayChangeListener, removeDayChangeListener } from './utils.js';

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
    get dailyFocusTime() { return document.getElementById('totalFocusTime'); }, // Fixed: dailyFocusTime doesn't exist, use totalFocusTime
    get timeRemaining() { return document.getElementById('timeRemaining'); },
    get progressPercent() { return document.getElementById('progressPercent'); },
    get progressFill() { return document.querySelector('.progress-indicator'); },
    get timerCircle() { return document.querySelector('.timer-circle'); },
    get presetButtons() { return document.querySelectorAll('.preset-btn'); },
    get focusStreak() { return document.getElementById('focusStreak'); },
    get completedSessions() { return document.getElementById('completedSessions'); },
    get totalFocusTime() { return document.getElementById('totalFocusTime'); },
    get focusProductivityScore() { return document.getElementById('focusProductivityScore'); },
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
    
    // Force refresh of session data when tab becomes active
    console.log('Focus tab activated - refreshing data');
    await loadSessions();
    await updateStats();
    
    if (!refreshInterval) refreshInterval = setInterval(refreshActive, 1000);
    
    // Add day change listener for auto-refresh
    addDayChangeListener(handleDayChange);
  }

  function hide() {
    el.focusTab?.classList.remove('active');
    removeDayChangeListener(handleDayChange);
  }

  async function handleDayChange() {
    console.log('Day changed - refreshing focus tab data');
    try {
      await loadSessions();
      await updateStats();
      window.showToast?.('New day started! 🌅', false);
    } catch (e) {
      console.error('Error handling day change in focus tab:', e);
    }
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
    
    // Clear the current session immediately to prevent auto-continue
    const sessionToSave = { ...currentSession };
    currentSession = null;
    await chrome.storage.local.remove('focusSession');
    
    const { timerLabel, progressFill, timerCircle, timeRemaining, progressPercent } = el;
    updateSessionUI('idle');
    
    // Show completion state
    if (timerLabel) timerLabel.textContent = 'Session Complete! 🎉';
    if (progressFill) progressFill.style.width = '100%';
    if (timerCircle) timerCircle.style.setProperty('--progress', '100%');
    if (timeRemaining) timeRemaining.textContent = 'Session completed!';
    if (progressPercent) progressPercent.textContent = '100%';
    
    // Save the session and update stats
    if (sessionToSave) {
      await addSessionToHistory(sessionToSave, 'completed');
      
      // Force immediate refresh of UI
      console.log('Session completed - forcing immediate refresh');
      setTimeout(async () => {
        await loadSessions();
        await updateStats();
      }, 100);
    }
    
    // Send completion message to background
    chrome.runtime.sendMessage({ action: 'completeFocusSession' });
    
    // Show completion notification and toast
    window.showToast?.('Focus session completed! Great work! 🎉', false);
    
    try {
      if (chrome?.notifications?.create) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icon48.png'),
          title: 'Focus Session Complete! 🎉',
          message: `Great job! You completed a ${sessionToSave?.duration || 25}-minute focus session.`
        });
      }
    } catch (_) {}
    
    // Reset timer display after showing completion for 3 seconds
    setTimeout(() => {
      if (timerLabel) timerLabel.textContent = 'Ready to Focus';
      if (progressFill) progressFill.style.width = '0%';
      if (timerCircle) timerCircle.style.setProperty('--progress', '0%');
      const activeBtn = document.querySelector('.preset-btn.active');
      const minutes = activeBtn ? parseInt(activeBtn.dataset.time, 10) : 25;
      updateTimerDisplay(minutes);
      if (timeRemaining) timeRemaining.textContent = `${minutes.toString().padStart(2, '0')}:00 remaining`;
      if (progressPercent) progressPercent.textContent = '0%';
    }, 3000);
  }

  async function addSessionToHistory(sessionData, status) {
    try {
      const now = Date.now();
      const payload = { 
        duration: sessionData.duration * 60000, 
        startTime: sessionData.startTime, 
        endTime: now, 
        status 
      };
      
      console.log('Saving focus session:', {
        duration: payload.duration,
        startTime: new Date(payload.startTime).toLocaleString(),
        endTime: new Date(payload.endTime).toLocaleString(),
        status: payload.status,
        startTimeDate: new Date(payload.startTime).toDateString(),
        endTimeDate: new Date(payload.endTime).toDateString(),
        todayDate: new Date().toDateString()
      });
      
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
      // Get today's date string for timezone-aware filtering
      const today = new Date().toDateString();
      console.log('Loading sessions for today:', today);
      
      // Try to get today's sessions from FocusSessionsManager first
      let sessions = await window.FocusSessionsManager?.getRecentSessions?.({ todayOnly: true, limit: 10 }) || [];
      
      if (!sessions.length) {
        // Fallback to local storage with timezone-aware filtering
        const { focusHistory = [] } = await chrome.storage.local.get(['focusHistory']);
        sessions = focusHistory.filter(session => {
          const sessionDate = new Date(session.startTime).toDateString();
          return sessionDate === today;
        });
        console.log('Using local storage sessions:', sessions.length);
      } else {
        console.log('Using FocusSessionsManager sessions:', sessions.length);
      }
      
      displayFocusSessions(sessions);
    } catch (e) {
      console.error('Error loading focus sessions:', e);
      displayFocusSessions([]); // Show empty state on error
    }
  }

  function displayFocusSessions(sessions) {
    if (!el.focusSessionsList) return;
    
    // Use timezone-aware filtering for today's sessions
    const today = new Date().toDateString();
    const todaySessions = sessions.filter(session => {
      const sessionDate = new Date(session.startTime).toDateString();
      return sessionDate === today;
    }).slice(0, 5);
    
    console.log('Displaying sessions for today:', today, 'Count:', todaySessions.length);
    
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
    
    console.log('=== FOCUS TAB DEBUG ===');
    console.log('Element checks:', {
      dailyFocusTime: !!dailyFocusTime,
      totalFocusTime: !!totalFocusTime,
      completedSessions: !!completedSessions,
      focusStreak: !!focusStreak,
      focusProductivityScore: !!focusProductivityScore
    });
    
    try {
      // Get timezone-aware today's date range
      const today = new Date();
      const todayString = today.toDateString();
      console.log('Today string:', todayString);
      
      // Force check local storage directly first
      const { focusHistory = [] } = await chrome.storage.local.get(['focusHistory']);
      console.log('Raw focus history:', focusHistory.length, 'sessions');
      console.log('Focus history sample:', focusHistory.slice(0, 3).map(s => ({
        startTime: new Date(s.startTime).toLocaleString(),
        dateString: new Date(s.startTime).toDateString(),
        duration: s.duration,
        status: s.status
      })));
      
      // Filter sessions for today manually
      const todaySessionsLocal = focusHistory.filter(session => {
        const sessionDate = new Date(session.startTime).toDateString();
        const isToday = sessionDate === todayString;
        console.log('Session check:', {
          sessionDate,
          todayString,
          isToday,
          startTime: new Date(session.startTime).toLocaleString()
        });
        return isToday;
      });
      
      console.log('Today sessions (local):', todaySessionsLocal.length);
      console.log('Today sessions details:', todaySessionsLocal.map(s => ({
        startTime: new Date(s.startTime).toLocaleString(),
        duration: s.duration,
        status: s.status
      })));
      
      // Try backend daily stats first (if authenticated)
      let stats = await window.FocusSessionsManager?.getDailyStats?.(today);
      let totalMinutes = 0;
      let completedCount = 0;
      let productivity = 0;
      
      if (stats && typeof stats === 'object' && (stats.totalMinutes > 0 || stats.sessionCount > 0)) {
        // Use backend stats if they have actual data
        totalMinutes = Number(stats.totalMinutes) || 0;
        completedCount = Number(stats.sessionCount) || 0;
        productivity = Number(stats.productivity) || 0;
        console.log('Using backend stats:', { totalMinutes, completedCount, productivity });
      } else {
        // Use local calculation
        console.log('Using local stats calculation');
        
        const onlyCompleted = todaySessionsLocal.filter(s => (s.status || 'completed') === 'completed');
        console.log('Completed sessions today:', onlyCompleted.length);
        
        totalMinutes = onlyCompleted.reduce((total, session) => {
          const durationMs = Number(session.duration) >= 1000 ? Number(session.duration) : Number(session.duration) * 60000;
          const minutes = Math.max(1, Math.round(durationMs / 60000));
          console.log('Session duration calc:', { 
            rawDuration: session.duration, 
            durationMs, 
            minutes 
          });
          return total + minutes;
        }, 0);
        completedCount = onlyCompleted.length;
        
        // Calculate basic productivity score
        const dailyGoal = 4;
        productivity = Math.min(100, (completedCount / dailyGoal) * 100);
        
        console.log('Final local stats:', { totalMinutes, completedCount, productivity });
      }
      
      // Update UI elements - use both dailyFocusTime and totalFocusTime (they point to same element)
      const formattedDuration = formatDuration(totalMinutes * 60000);
      console.log('Setting UI values:', {
        formattedDuration,
        completedCount,
        productivity: Math.round(productivity)
      });
      
      if (dailyFocusTime) {
        dailyFocusTime.textContent = formattedDuration;
        console.log('Set dailyFocusTime to:', formattedDuration);
      }
      if (totalFocusTime) {
        totalFocusTime.textContent = formattedDuration;
        console.log('Set totalFocusTime to:', formattedDuration);
      }
      if (completedSessions) {
        completedSessions.textContent = String(completedCount);
        console.log('Set completedSessions to:', completedCount);
      }
      if (focusProductivityScore) {
        const scoreText = `${Math.round(Math.min(100, Math.max(0, productivity)))}%`;
        focusProductivityScore.textContent = scoreText;
        console.log('Set focusProductivityScore to:', scoreText);
      }
      
      // Calculate streak
      if (focusStreak) {
        try {
          const completedSessionsAll = focusHistory.filter(s => (s.status || 'completed') === 'completed');
          
          // Group sessions by date
          const sessionsByDate = new Map();
          completedSessionsAll.forEach(session => {
            const dateStr = new Date(session.startTime).toDateString();
            if (!sessionsByDate.has(dateStr)) {
              sessionsByDate.set(dateStr, 0);
            }
            sessionsByDate.set(dateStr, sessionsByDate.get(dateStr) + 1);
          });
          
          // Calculate streak from today backwards
          let streak = 0;
          const currentDate = new Date();
          
          while (true) {
            const dateStr = currentDate.toDateString();
            if (sessionsByDate.has(dateStr) && sessionsByDate.get(dateStr) > 0) {
              streak++;
              currentDate.setDate(currentDate.getDate() - 1);
            } else {
              break;
            }
          }
          
          focusStreak.textContent = String(streak);
          console.log('Set focusStreak to:', streak);
        } catch (e) {
          console.error('Error calculating streak:', e);
          focusStreak.textContent = completedCount > 0 ? '1' : '0';
        }
      }
      
      console.log('=== END FOCUS TAB DEBUG ===');
      
    } catch (e) {
      console.error('Error updating focus stats:', e);
      // Fallback to showing zeros
      if (dailyFocusTime) dailyFocusTime.textContent = '0m';
      if (totalFocusTime) totalFocusTime.textContent = '0m';
      if (focusStreak) focusStreak.textContent = '0';
      if (completedSessions) completedSessions.textContent = '0';
      if (focusProductivityScore) focusProductivityScore.textContent = '0%';
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
      
      // Only complete if actively running (not paused) and time is up
      if (remaining <= 0 && focusSession.isActive && !focusSession.isPaused) {
        // Set current session for completion
        currentSession = { ...focusSession };
        await completeFocusSession();
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

  return { init, show, hide, loadSessions, updateStats, refreshActive };
})();

if (typeof window !== 'undefined') window.FocusTab = FocusTab;