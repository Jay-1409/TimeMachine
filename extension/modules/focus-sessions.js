const FocusSessionsManager = (() => {
  let isAuthenticated = false;
  let syncPromise = null;
  const POSTED_KEY = 'focusPosted';

  const toMinutes = (value) => Math.max(1, Math.min(480, Number(value) >= 1000 ? Math.round(Number(value) / 60000) : Math.round(Number(value) || 0)));
  const sanitizeSession = (s) => ({
    duration: toMinutes(s.duration),
    startTime: Number(s.startTime),
    endTime: Number(s.endTime || Date.now()),
    status: s.status === 'interrupted' ? 'interrupted' : 'completed',
    date: new Date(s.startTime).toDateString(),
    sessionType: s.sessionType || 'focus',
    sessionId: s.sessionId || undefined
  });
  const getPostedSet = async () => new Set((await chrome.storage.local.get([POSTED_KEY]))[POSTED_KEY] || []);
  const addPosted = async (startTime) => {
    if (!Number.isFinite(Number(startTime))) return;
    const set = await getPostedSet();
    set.add(Number(startTime));
    await chrome.storage.local.set({ [POSTED_KEY]: Array.from(set).sort((a, b) => b - a).slice(0, 200) });
  };
  const removePosted = async (startTime) => {
    if (!Number.isFinite(Number(startTime))) return;
    const set = await getPostedSet();
    set.delete(Number(startTime));
    await chrome.storage.local.set({ [POSTED_KEY]: Array.from(set).sort((a, b) => b - a).slice(0, 200) });
  };

  async function init() {
    try {
      await TMConfig.loadOverrides?.();
      isAuthenticated = await Auth.isAuthenticated();
      const { focusHistory = [], focusPending = [] } = await chrome.storage.local.get(['focusHistory', 'focusPending']);
      const posted = await getPostedSet();
      const normalizedHistory = focusHistory.map(sanitizeSession);
      const updates = isAuthenticated
        ? {
            focusHistory: normalizedHistory.filter(s => s.sessionId),
            focusPending: [...focusPending, ...normalizedHistory.filter(s => !s.sessionId && !posted.has(Number(s.startTime)))]
          }
        : { focusHistory: normalizedHistory, focusPending };
      await chrome.storage.local.set(updates);
      if (isAuthenticated) await syncWithBackend();
    } catch (error) {
      console.error('FocusSessionsManager init error:', error);
    }
  }

  async function syncWithBackend() {
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      try {
        await TMConfig.loadOverrides?.();
        const { token, userId } = await TokenStorage.getToken();
        if (!token || !userId) return;
        const { focusHistory = [], focusPending = [] } = await chrome.storage.local.get(['focusHistory', 'focusPending']);
        const posted = await getPostedSet();
        const pending = [...new Map([...focusPending, ...focusHistory.filter(s => !s.sessionId && !posted.has(Number(s.startTime)))].map(s => [s.startTime, sanitizeSession(s)])).values()];
        const historyWithIds = focusHistory.filter(s => s.sessionId);
        const backend = TMConfig.getUrl(TMConfig.current.focusSessionsEndpoint);
        const stillPending = [];
        for (const session of pending) {
          try {
            // Pre-mark as posted to avoid races with background watcher
            await addPosted(session.startTime);
            const response = await fetch(backend, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({
                userId,
                duration: session.duration,
                startTime: new Date(session.startTime).toISOString(),
                endTime: new Date(session.endTime).toISOString(),
                status: session.status,
                sessionType: session.sessionType
              })
            });
            if (!response.ok) throw new Error(`POST /focus-sessions failed: ${response.status}`);
            const data = await response.json();
            if (data?.success && (data.session?.id || data.session?._id)) {
              session.sessionId = data.session.id || data.session._id;
              historyWithIds.push(session);
              // keep posted mark
            } else {
              throw new Error('Invalid response');
            }
          } catch (e) {
            console.warn('Failed to sync session:', e);
            // Rollback posted mark on failure so we can retry later
            await removePosted(session.startTime);
            stillPending.push(session);
          }
        }
        const getUrl = TMConfig.getUrl(TMConfig.current.focusSessionsGetEndpoint).replace('{userId}', userId);
        const response = await fetch(`${getUrl}?limit=50`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) throw new Error(`Failed to fetch sessions: ${response.status}`);
        const data = await response.json();
        if (!data?.success || !Array.isArray(data.sessions)) throw new Error('Invalid response');
        const uniqueRemote = [...new Map(data.sessions.map(s => sanitizeSession({
          duration: s.duration,
          startTime: new Date(s.startTime).getTime(),
          endTime: new Date(s.endTime).getTime(),
          status: s.status,
          sessionType: s.sessionType,
          sessionId: s._id || s.id
        })).map(s => [s.sessionId || s.startTime, s])).values()].sort((a, b) => b.startTime - a.startTime);
        await chrome.storage.local.set({ focusHistory: uniqueRemote, focusPending: stillPending });
      } catch (error) {
        console.error('Focus sync error:', error);
        throw error;
      } finally {
        syncPromise = null;
      }
    })();
    return syncPromise;
  }

  async function saveSession(sessionData) {
    try {
      const session = sanitizeSession({ ...sessionData, endTime: Date.now(), sessionType: 'focus' });
      const { focusHistory = [], focusPending = [] } = await chrome.storage.local.get(['focusHistory', 'focusPending']);
      const historyUpdates = focusHistory.filter(s => Number(s.startTime) !== Number(session.startTime));
      historyUpdates.unshift(session);
      if (historyUpdates.length > 50) historyUpdates.length = 50;
      if (isAuthenticated) {
        const { token, userId } = await TokenStorage.getToken();
        if (token && userId) {
          // Pre-mark posted to avoid a race with background completion watcher submitting the same session
          await addPosted(session.startTime);
          const response = await fetch(TMConfig.getUrl(TMConfig.current.focusSessionsEndpoint), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              userId,
              duration: session.duration,
              startTime: new Date(session.startTime).toISOString(),
              endTime: new Date(session.endTime).toISOString(),
              status: session.status,
              sessionType: session.sessionType
            })
          });
          if (!response.ok) throw new Error(`POST /focus-sessions failed: ${response.status}`);
          const data = await response.json();
          if (data?.success && (data.session?.id || data.session?._id)) {
            session.sessionId = data.session.id || data.session._id;
            // keep posted mark
          } else {
            throw new Error('Invalid response');
          }
        } else {
          throw new Error('Not authenticated');
        }
      }
      await chrome.storage.local.set({
        focusHistory: historyUpdates,
        ...(isAuthenticated && !session.sessionId ? { focusPending: [...focusPending, session] } : {})
      });
      return session;
    } catch (error) {
      console.error('Error saving session:', error);
      // Rollback pre-mark if we added it
      try { await removePosted(sessionData?.startTime); } catch (_) {}
      if (isAuthenticated) {
        const { focusPending = [] } = await chrome.storage.local.get(['focusPending']);
        await chrome.storage.local.set({ focusPending: [...focusPending, sanitizeSession(sessionData)] });
      } else {
        const { focusHistory = [] } = await chrome.storage.local.get(['focusHistory']);
        const historyUpdates = focusHistory.filter(s => Number(s.startTime) !== Number(sessionData.startTime));
        historyUpdates.unshift(sanitizeSession(sessionData));
        if (historyUpdates.length > 50) historyUpdates.length = 50;
        await chrome.storage.local.set({ focusHistory: historyUpdates });
      }
      throw error;
    }
  }

  async function deleteSession(sessionId) {
    try {
      if (isAuthenticated && sessionId) {
        const { token } = await TokenStorage.getToken();
        if (token) {
          const deleteUrl = TMConfig.getUrl(TMConfig.current.focusSessionsDeleteEndpoint).replace('{sessionId}', sessionId);
          const resp = await fetch(deleteUrl, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
          if (!resp.ok) throw new Error(`Delete failed: ${resp.status}`);
        }
      }
      const { focusHistory = [] } = await chrome.storage.local.get(['focusHistory']);
      await chrome.storage.local.set({ focusHistory: focusHistory.filter(s => s.sessionId !== sessionId) });
      return true;
    } catch (error) {
      console.error('Error deleting session:', error);
      throw error;
    }
  }

  async function handleAuthChanged(isAuthed) {
    isAuthenticated = isAuthed;
    if (isAuthed) await syncWithBackend();
  }

  async function forceSync() {
    if (isAuthenticated) await syncWithBackend();
  }

  async function getDailyStats(date = new Date()) {
    try {
      if (!isAuthenticated) return null;
      const { token, userId } = await TokenStorage.getToken();
      if (!token || !userId) return null;
      const tz = new Date().getTimezoneOffset();
      const url = `${TMConfig.getUrl(TMConfig.current.focusDailyStatsEndpoint).replace('{userId}', userId)}?date=${encodeURIComponent(date.toISOString())}&timezone=${tz}&useUserTimezone=true`;
      const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data?.success ? data.stats : null;
    } catch (e) {
      console.warn('getDailyStats failed:', e);
      return null;
    }
  }

  async function getWeeklyStats(weekStart = new Date()) {
    try {
      if (!isAuthenticated) return null;
      const { token, userId } = await TokenStorage.getToken();
      if (!token || !userId) return null;
      const url = `${TMConfig.getUrl(TMConfig.current.focusWeeklyStatsEndpoint).replace('{userId}', userId)}?weekStart=${encodeURIComponent(weekStart.toISOString())}`;
      const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data?.success ? data.stats : null;
    } catch (e) {
      console.warn('getWeeklyStats failed:', e);
      return null;
    }
  }

  async function getRecentSessions({ todayOnly = true, limit = 5 } = {}) {
    try {
    if (isAuthenticated) {
        const { token, userId } = await TokenStorage.getToken();
        if (token && userId) {
      const baseUrl = TMConfig.getUrl(TMConfig.current.focusSessionsGetEndpoint).replace('{userId}', userId);
      const params = new URLSearchParams();
      params.set('limit', String(Math.max(1, limit)));
      if (todayOnly) {
        params.set('date', new Date().toISOString());
        params.set('timezone', String(new Date().getTimezoneOffset()));
        params.set('useUserTimezone', 'true');
      }
      const url = `${baseUrl}?${params.toString()}`;
          const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
          if (resp.ok) {
            const data = await resp.json();
            if (data?.success && Array.isArray(data.sessions)) {
              let list = data.sessions.map(s => sanitizeSession({
                duration: s.duration,
                startTime: new Date(s.startTime).getTime(),
                endTime: new Date(s.endTime).getTime(),
                status: s.status,
                sessionType: s.sessionType,
                sessionId: s._id || s.id
              }));
              if (todayOnly) list = list.filter(s => new Date(s.startTime).toDateString() === new Date().toDateString());
              return list.slice(0, limit);
            }
          }
        }
      }
      const { focusHistory = [] } = await chrome.storage.local.get(['focusHistory']);
      const sorted = focusHistory.map(sanitizeSession).sort((a, b) => b.startTime - a.startTime);
      return (todayOnly ? sorted.filter(s => new Date(s.startTime).toDateString() === new Date().toDateString()) : sorted).slice(0, limit);
    } catch (e) {
      console.warn('getRecentSessions failed:', e);
      return [];
    }
  }

  return { init, saveSession, deleteSession, forceSync, handleAuthChanged, getDailyStats, getWeeklyStats, getRecentSessions };
})();

window.FocusSessionsManager = FocusSessionsManager;