// Summary Tab Controller (ES Module)
// Encapsulates Summary tab UI, date navigation, data fetch, and rendering

import { resolveBackendUrl } from './api.js';
import { formatDuration, getLocalDateString, addDayChangeListener, removeDayChangeListener } from './utils.js';

export const SummaryTab = (() => {
  let initialized = false;
  let loading = false;
  let queued = false;
  let dayChangeCallback = null;

  // Local date helpers to avoid UTC parsing issues
  function toLocalDateString(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function parseLocalDate(str) {
    const [y, m, d] = (str || '').split('-').map(n => parseInt(n, 10));
    if (!y || !m || !d) return new Date();
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  const el = {
    get container() { return document.getElementById('summaryTabContent'); },
  get error() { return document.getElementById('summaryError'); },
    get dateInput() { return document.getElementById('summaryDate'); },
    get prevBtn() { return document.getElementById('prevDayBtn'); },
    get nextBtn() { return document.getElementById('nextDayBtn'); },
    get todayBtn() { return document.getElementById('todayBtn'); },
    get title() { return document.getElementById('summaryTitle'); },
    get loading() { return document.getElementById('summaryLoading'); },
    // Daily activity content block (older layout)
    get dailyContent() { return document.getElementById('dailySummaryContent'); },
    // Insight metric elements used by newer layout
    get key() {
      return {
        totalFocusSessions: document.getElementById('totalFocusSessions'),
        totalSitesVisited: document.getElementById('totalSitesVisited'),
        totalActiveTime: document.getElementById('totalActiveTime'),
        problemsSolved: document.getElementById('problemsSolved'),
        topSite1Name: document.getElementById('topSite1Name'),
        topSite2Name: document.getElementById('topSite2Name'),
        topSite3Name: document.getElementById('topSite3Name'),
        topSite1Time: document.getElementById('topSite1Time'),
        topSite2Time: document.getElementById('topSite2Time'),
        topSite3Time: document.getElementById('topSite3Time'),
  productivityScore: document.getElementById('summaryProductivityScore'),
  scoreDescription: document.getElementById('summaryScoreDescription'),
  focusQuality: document.getElementById('summaryFocusQuality'),
  qualityDescription: document.getElementById('summaryQualityDescription')
      };
    }
  };

  async function init() {
    if (initialized) return;
    initialized = true;
    
    // Default date to today using timezone-aware function
    const today = getLocalDateString(new Date());
    if (el.dateInput) {
      el.dateInput.value = today;
      el.dateInput.addEventListener('change', handleDateChange);
    }
    // Navigation buttons
    el.prevBtn?.addEventListener('click', navigateToPreviousDay);
    el.nextBtn?.addEventListener('click', navigateToNextDay);
    el.todayBtn?.addEventListener('click', navigateToToday);
    // Keyboard navigation (when summary tab active)
    document.addEventListener('keydown', handleKeyNav);
    
    // Add day change listener for auto-refresh
    dayChangeCallback = () => {
      console.log('Day changed - refreshing summary if viewing today');
      const currentDate = getSelectedDate();
      const todayStr = getLocalDateString(new Date());
      if (currentDate === todayStr) {
        // Only refresh if currently viewing today
        loadSummaryData();
      }
      // Update navigation buttons for new day
      updateNavigationButtons();
    };
    addDayChangeListener(dayChangeCallback);
  }

  async function show() {
    el.container?.classList.add('active');
  hideError();
    await init();
    await loadForDate();
    updateNavigationButtons();
  }

  function getSelectedDate() {
  return (el.dateInput?.value || getLocalDateString(new Date()));
  }

  async function handleDateChange() {
  await loadForDate();
    updateNavigationButtons();
  }

  function navigateToPreviousDay() {
    if (!el.dateInput) return;
    const d = parseLocalDate(el.dateInput.value);
    d.setDate(d.getDate() - 1);
    el.dateInput.value = getLocalDateString(d);
    handleDateChange();
  }

  function navigateToNextDay() {
    if (!el.dateInput) return;
    const d = parseLocalDate(el.dateInput.value);
    d.setDate(d.getDate() + 1);
    el.dateInput.value = getLocalDateString(d);
    handleDateChange();
  }

  function navigateToToday() {
    if (!el.dateInput) return;
    el.dateInput.value = getLocalDateString(new Date());
    handleDateChange();
  }

  function handleKeyNav(event) {
    // Only when Summary tab button is active
    const tabBtn = document.querySelector('[data-maintab="summary"]');
    if (!tabBtn || !tabBtn.classList.contains('active')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); navigateToPreviousDay(); }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (!el.nextBtn?.disabled) navigateToNextDay();
    }
  }

  function updateNavigationButtons() {
    const dateStr = getSelectedDate();
    const selected = parseLocalDate(dateStr);
    const today = new Date(); 
    today.setHours(0,0,0,0);
    if (el.nextBtn) el.nextBtn.disabled = selected.getTime() >= today.getTime();
    if (el.todayBtn) el.todayBtn.disabled = isSameDay(selected, today);
    if (el.title) {
      const isToday = isSameDay(selected, today);
      const yest = new Date(today.getTime() - 86400000);
      const isYesterday = isSameDay(selected, yest);
      if (isToday) el.title.textContent = "Today's Activity Summary";
      else if (isYesterday) el.title.textContent = "Yesterday's Activity Summary";
      else el.title.textContent = `${selected.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })} Summary`;
    }
  }

  async function loadForDate() {
  if (loading) { queued = true; return; }
  loading = true; showLoading();
    try {
      const selectedDate = getSelectedDate();
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
  if (!userEmail) { showError('Please sign in to view your summary.'); return; }
      const backend = await resolveBackendUrl();
  let token = null, userId = null;
  try { ({ token, userId } = await TokenStorage.getToken()); } catch(_) {}

      const tz = new Date().getTimezoneOffset();
      // Fetch browsing report, problem sessions, focus daily stats, and focus session list concurrently
      const headers = { ...(token ? { 'Authorization': `Bearer ${token}` } : {}), 'Content-Type': 'application/json' };
      const queries = [
        fetch(`${backend}/api/time-data/report/${encodeURIComponent(userEmail)}?date=${selectedDate}&endDate=${selectedDate}&timezone=${tz}&useUserTimezone=true`, { headers })
          .then(async r => { if (!r.ok) throw new Error(`report ${r.status}`); const j = await r.json(); return j.data || []; })
          .catch(err => { console.warn('summary: report failed', err); return []; }),
        fetch(`${backend}/api/problem-sessions/history/${encodeURIComponent(userEmail)}?date=${selectedDate}&timezone=${tz}&useUserTimezone=true`, { headers })
          .then(async r => { if (!r.ok) throw new Error(`problems ${r.status}`); const j = await r.json(); return j.sessions || []; })
          .catch(err => { console.warn('summary: problems failed', err); return []; }),
        userId ? fetch(`${backend}/api/focus-sessions/${encodeURIComponent(userId)}/stats/daily?date=${encodeURIComponent(selectedDate)}&timezone=${tz}&useUserTimezone=true`, { headers })
          .then(async r => { if (!r.ok) throw new Error(`focus-stats ${r.status}`); const j = await r.json(); return (j && j.success ? j.stats : null); })
          .catch(err => { console.warn('summary: focus-stats failed', err); return null; }) : Promise.resolve(null),
        userId ? fetch(`${backend}/api/focus-sessions/${encodeURIComponent(userId)}?date=${encodeURIComponent(selectedDate)}&timezone=${tz}&useUserTimezone=true&limit=50`, { headers })
          .then(async r => { if (!r.ok) throw new Error(`focus-list ${r.status}`); const j = await r.json(); return (j && j.success ? j.sessions : []); })
          .catch(err => { console.warn('summary: focus-list failed', err); return []; }) : Promise.resolve([])
      ];
  const [browsingData, problemSessions, focusDailyStats, focusSessions] = await Promise.all(queries);

  // The backend already returns data scoped to the selected local day; avoid re-filtering by Date parsing
  const filteredBrowsing = Array.isArray(browsingData) ? browsingData : [];

      // Fallback: compute focus stats from local data if backend focus endpoints unavailable
      let computedFocusStats = focusDailyStats;
      let computedFocusSessions = focusSessions;
      if ((!computedFocusStats && (!Array.isArray(computedFocusSessions) || computedFocusSessions.length === 0))) {
        try {
          const sel = new Date(selectedDate);
          const today = new Date(); today.setHours(0,0,0,0);
          const isToday = sel.toDateString() === today.toDateString();
          let localSessions = [];
          if (isToday && window.FocusSessionsManager?.getRecentSessions) {
            localSessions = await window.FocusSessionsManager.getRecentSessions({ todayOnly: true, limit: 50 }) || [];
          }
          if (!Array.isArray(localSessions) || localSessions.length === 0) {
            const { focusHistory = [] } = await chrome.storage.local.get(['focusHistory']);
            localSessions = (focusHistory || []).filter(s => new Date(s.startTime).toDateString() === sel.toDateString());
          }
          if (Array.isArray(localSessions) && localSessions.length) {
            const completed = localSessions.filter(s => (s.status || 'completed') === 'completed');
            const totalMinutes = completed.reduce((t, s) => {
              const raw = Number(s.duration) || 0; const ms = raw >= 1000 ? raw : raw * 60000; return t + Math.max(1, Math.round(ms / 60000));
            }, 0);
            computedFocusStats = { totalMinutes, sessionCount: completed.length, productivity: 0 };
            computedFocusSessions = localSessions;
          }
        } catch (e) {
          console.warn('summary: fallback focus computation failed', e);
        }
      }

      const allActivities = [
        ...filteredBrowsing.map(item => ({ title: item.site || item.domain, time: item.totalTime, type: 'browsing', category: item.category || 'Other' })),
        ...problemSessions.map(session => ({ title: session.title, time: session.duration || 0, type: 'problem', category: session.category || 'Coding' })),
        ...(Array.isArray(computedFocusSessions) ? computedFocusSessions.map(s => { const raw = Number(s.duration) || 0; const ms = raw >= 1000 ? raw : raw * 60000; return ({ title: 'Focus Session', time: ms, type: 'focus', category: s.sessionType || 'focus', startTime: s.startTime }); }) : [])
      ].sort((a,b) => b.time - a.time);

      updateSummaryInsights(filteredBrowsing, problemSessions, allActivities, selectedDate, computedFocusStats, computedFocusSessions);
      if (allActivities.length === 0) showEmptyState(); else hideEmptyState();

      // Render optional older daily summary block if present
      if (el.dailyContent) {
        renderDailyContent(selectedDate, filteredBrowsing, problemSessions, focusSessions);
      }
    } catch (e) {
      console.error('SummaryTab.loadForDate error:', e);
      showError(e?.message || 'Failed to load summary.');
    } finally { hideLoading(); loading = false; if (queued) { queued = false; // re-run for latest date selection
        try { await loadForDate(); } catch (_) {}
      } }
  }

  function showLoading() { el.loading?.classList.remove('hidden'); }
  function hideLoading() { el.loading?.classList.add('hidden'); }

  function updateSummaryInsights(browsingData, problemSessions, allActivities, selectedDate, focusDailyStats, focusSessions) {
    updateKeyMetrics(browsingData, problemSessions, focusDailyStats, focusSessions);
    updateTopSites(browsingData);
    updateProductivityInsights(browsingData, problemSessions, focusDailyStats);
    updateActivityList(allActivities);
  }

  function showError(msg) {
    if (!el.error) return;
    el.error.textContent = msg;
    el.error.classList.remove('hidden');
    hideLoading();
  }
  function hideError() { el.error?.classList.add('hidden'); }

  function updateKeyMetrics(browsingData, problemSessions, focusDailyStats, focusSessions) {
    const key = el.key;
    // Focus sessions count from focus API
    const focusCount = Array.isArray(focusSessions) ? focusSessions.length : (focusDailyStats?.sessionCount || 0);
    if (key.totalFocusSessions) key.totalFocusSessions.textContent = String(focusCount);
    if (key.totalSitesVisited) key.totalSitesVisited.textContent = String(browsingData.length);
    const totalBrowsing = browsingData.reduce((t, i) => t + (i.totalTime||0), 0);
    const totalSolving = problemSessions.reduce((t, s) => t + (s.duration||0), 0);
    const totalFocusMs = (focusDailyStats?.totalMinutes || 0) * 60000;
    if (key.totalActiveTime) key.totalActiveTime.textContent = formatDuration(totalBrowsing + totalSolving + totalFocusMs);
    const solved = problemSessions.filter(s => s.status === 'completed').length;
    if (key.problemsSolved) key.problemsSolved.textContent = String(solved);
  }

  function updateTopSites(browsingData) {
    const key = el.key; const sorted = [...browsingData].sort((a,b)=> (b.totalTime||0)-(a.totalTime||0));
    const set = (i, item) => {
      const nameEl = key[`topSite${i}Name`]; const timeEl = key[`topSite${i}Time`];
      if (!nameEl || !timeEl) return;
      if (item) { const label = item.site || item.domain || item.name || '—'; nameEl.textContent = label; timeEl.textContent = formatDuration(item.totalTime||0); }
      else { nameEl.textContent = '-'; timeEl.textContent = '-'; }
    };
    set(1, sorted[0]); set(2, sorted[1]); set(3, sorted[2]);
  }

  function updateProductivityInsights(browsingData, problemSessions, focusDailyStats) {
    const key = el.key;
    const totalBrowsing = browsingData.reduce((t,i)=>t+(i.totalTime||0),0);
    const totalSolving = problemSessions.reduce((t,s)=>t+(s.duration||0),0);
    const totalFocusMs = (focusDailyStats?.totalMinutes || 0) * 60000;
    const total = totalBrowsing + totalSolving + totalFocusMs;

    // Compute productive time similar to Analytics: Work + Professional + (Other * 0.5) + Focus + Problem
    const catSums = browsingData.reduce((acc, item) => {
      const cat = item?.category || 'Other';
      acc[cat] = (acc[cat] || 0) + (item.totalTime || 0); return acc;
    }, {});
    const work = catSums.Work || 0;
    const prof = catSums.Professional || 0;
    const other = catSums.Other || 0;
    const productiveBrowsing = work + prof + (other * 0.5);

    let productivityScore = 0; let scoreDesc = 'No activity';
    if (total > 0) {
      const productive = productiveBrowsing + totalSolving + totalFocusMs;
      const ratio = productive / total; productivityScore = Math.round(ratio * 100);
      if (productivityScore >= 70) scoreDesc = 'Excellent focus!';
      else if (productivityScore >= 50) scoreDesc = 'Good balance';
      else if (productivityScore >= 25) scoreDesc = 'Room for improvement';
      else scoreDesc = 'Mostly browsing';
    }
    if (key.productivityScore) key.productivityScore.textContent = total > 0 ? `${productivityScore}%` : '-';
    if (key.scoreDescription) key.scoreDescription.textContent = scoreDesc;

    // "Focus Quality" reflects focus sessions, not solver sessions
    const focusSessionsCount = Math.max(0, parseInt(focusDailyStats?.sessionCount || 0, 10));
    let quality = '-'; let qDesc = 'No focus sessions';
    if (focusSessionsCount > 0) {
      const fp = Math.max(0, Math.min(100, parseInt(focusDailyStats?.productivity || 0, 10)));
      quality = `${fp}%`;
      if (fp >= 80) qDesc = 'Great consistency';
      else if (fp >= 60) qDesc = 'Good focus';
      else if (fp >= 40) qDesc = 'Needs improvement';
      else qDesc = 'Low quality';
    }
    if (key.focusQuality) key.focusQuality.textContent = quality;
    if (key.qualityDescription) key.qualityDescription.textContent = qDesc;
  }

  function showEmptyState() {
  const ids = ['totalFocusSessions','totalSitesVisited','totalActiveTime','problemsSolved','topSite1Name','topSite2Name','topSite3Name','topSite1Time','topSite2Time','topSite3Time','summaryProductivityScore','summaryFocusQuality'];
    ids.forEach(id => {
      const node = document.getElementById(id); if (!node) return;
      if (id.includes('Time') || id.includes('Score') || id.includes('Quality')) node.textContent = '-';
      else if (id.includes('Name')) node.textContent = 'No activity';
      else node.textContent = '0';
    });
  const sd = document.getElementById('summaryScoreDescription'); if (sd) sd.textContent = 'No activity recorded';
  const qd = document.getElementById('summaryQualityDescription'); if (qd) qd.textContent = 'No focus sessions';
  }

  function hideEmptyState() { /* placeholder for any overlay cleanup */ }

  // Render optional daily content block (legacy/alternate layout)
  function renderDailyContent(date, browsingData, problemSessions, focusSessions) {
    const container = el.dailyContent; if (!container) return;
    const hasActivity = (browsingData?.length||0) > 0 || (problemSessions?.length||0) > 0 || (focusSessions?.length||0) > 0;
    if (!hasActivity) {
      container.innerHTML = `<div class="no-activity"><h4>No activity recorded</h4><p>No browsing or problem-solving activity found for ${new Date(date).toLocaleDateString()}</p></div>`;
      return;
    }
    const totalBrowsingTime = browsingData.reduce((sum, e) => sum + (e.totalTime||0), 0);
    const totalProblemTime = problemSessions.reduce((sum, s) => sum + (s.duration||0), 0);
    const totalFocusTime = (Array.isArray(focusSessions) ? focusSessions.reduce((sum, s) => sum + ((s.duration||0) * 60000), 0) : 0);
    const completed = problemSessions.filter(s => s.status==='completed').length;
    const uniqueDomains = new Set(browsingData.map(e => e.domain || e.site)).size;
    const timeline = createActivityTimeline(browsingData, problemSessions, focusSessions);
    container.innerHTML = `
      <div class="activity-summary">
        <div class="summary-stat"><span class="summary-stat-value">${formatDuration(totalBrowsingTime)}</span><span class="summary-stat-label">Browsing Time</span></div>
        <div class="summary-stat"><span class="summary-stat-value">${formatDuration(totalFocusTime)}</span><span class="summary-stat-label">Focus Time</span></div>
        <div class="summary-stat"><span class="summary-stat-value">${formatDuration(totalProblemTime)}</span><span class="summary-stat-label">Problem Solving</span></div>
        <div class="summary-stat"><span class="summary-stat-value">${completed}</span><span class="summary-stat-label">Problems Solved</span></div>
        <div class="summary-stat"><span class="summary-stat-value">${uniqueDomains}</span><span class="summary-stat-label">Websites Visited</span></div>
      </div>
      <h4>Activity Timeline</h4>
      <div class="activity-timeline">
        ${timeline.map(item => `
          <div class="timeline-item">
            <div class="timeline-time">${item.time}</div>
            <div class="timeline-content">
              <h4>${item.title}</h4>
              <p>${item.description}</p>
              <div class="timeline-meta">${item.tags.map(tag => `<span class="timeline-tag">${tag}</span>`).join('')}</div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  function createActivityTimeline(browsingData, problemSessions, focusSessions) {
    const timeline = [];
    (problemSessions||[]).forEach(session => {
      const start = new Date(session.startTime);
      timeline.push({
        time: start.toLocaleTimeString(),
        timestamp: start.getTime(),
        title: `Problem: ${session.title}`,
        description: `${session.category} • ${session.difficulty} • Duration: ${formatDuration(session.duration)}`,
        tags: [session.status, session.category, session.difficulty].concat(session.tags || []),
        type: 'problem'
      });
    });
    (focusSessions||[]).forEach(s => {
      const st = new Date(s.startTime);
      const ms = (s.duration || 0) * 60000;
      timeline.push({
        time: st.toLocaleTimeString(),
        timestamp: st.getTime(),
        title: 'Focus Session',
        description: `Duration: ${formatDuration(ms)} • ${s.status || 'completed'}`,
        tags: ['focus', s.sessionType || 'focus'],
        type: 'focus'
      });
    });
    (browsingData||[]).filter(e => (e.totalTime||0) > 300000).forEach(entry => {
      const firstSession = Array.isArray(entry.sessions) && entry.sessions[0];
      if (firstSession) {
        const st = new Date(firstSession.startTime);
        timeline.push({
          time: st.toLocaleTimeString(),
          timestamp: st.getTime(),
          title: `Browsing: ${entry.domain || entry.site}`,
          description: `Total time: ${formatDuration(entry.totalTime)} • ${(entry.sessions||[]).length} session(s)`,
          tags: [entry.category || 'Other', `${(entry.sessions||[]).length} sessions`],
          type: 'browsing'
        });
      }
    });
    timeline.sort((a,b) => a.timestamp - b.timestamp);
    return timeline;
  }

  function updateActivityList(activities) {
    const container = document.getElementById('activityItems');
    if (!container) return;
    if (!activities || activities.length === 0) {
      container.innerHTML = '<div class="loading-text">No activities found for this date</div>';
      return;
    }
    container.innerHTML = activities.map(activity => `
      <div class="activity-item">
        <div class="activity-info">
          <div class="activity-title">${activity.title}</div>
          <div class="activity-type">${activity.type} • ${activity.category}</div>
        </div>
        <div class="activity-time">${formatDuration(activity.time)}</div>
      </div>`).join('');
  }

  function cleanup() {
    if (dayChangeCallback) {
      removeDayChangeListener(dayChangeCallback);
      dayChangeCallback = null;
    }
  }

  return { init, show, loadForDate, cleanup };
})();

if (typeof window !== 'undefined') window.SummaryTab = SummaryTab;
 
