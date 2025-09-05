// Shared lightweight utilities for the extension UI and modules.

export function formatDuration(ms) {
  if (isNaN(ms) || ms < 0) return '0m';
  const MAX = 24 * 60 * 60 * 1000;
  if (ms > MAX) ms = MAX;
  const s = Math.floor(ms / 1000);
  if (s === 0) return '0m';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

// Timezone-aware date utilities
export function getLocalDateString(date = new Date()) {
  // Get local date string in YYYY-MM-DD format (not UTC)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getStartOfLocalDay(date = new Date()) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay;
}

export function getEndOfLocalDay(date = new Date()) {
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay;
}

export function getTodayDateRange() {
  const today = new Date();
  const todayStr = getLocalDateString(today);
  const timezone = today.getTimezoneOffset();
  return {
    startDate: todayStr,
    endDate: todayStr,
    timezone,
    useUserTimezone: true
  };
}

export function getDateRangeForPeriod(period = 'today') {
  const today = new Date();
  const todayStr = getLocalDateString(today);
  let startDate = todayStr;
  
  if (period === 'week' || period === 'weekly') {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 6);
    startDate = getLocalDateString(weekStart);
  } else if (period === 'month' || period === 'monthly') {
    const monthStart = new Date(today);
    monthStart.setDate(today.getDate() - 29);
    startDate = getLocalDateString(monthStart);
  }
  
  return {
    startDate,
    endDate: todayStr,
    timezone: today.getTimezoneOffset(),
    useUserTimezone: true
  };
}

// Auto-refresh functionality for new day detection
let dayChangeListeners = [];
let dayChangeTimer = null;

export function addDayChangeListener(callback) {
  dayChangeListeners.push(callback);
  startDayChangeWatcher();
}

export function removeDayChangeListener(callback) {
  dayChangeListeners = dayChangeListeners.filter(cb => cb !== callback);
  if (dayChangeListeners.length === 0) {
    stopDayChangeWatcher();
  }
}

function startDayChangeWatcher() {
  if (dayChangeTimer) return; // Already running
  
  function scheduleNextCheck() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(0, 0, 1, 0); // 1 second after midnight
    
    const msUntilTomorrow = tomorrow.getTime() - now.getTime();
    
    dayChangeTimer = setTimeout(() => {
      // Notify all listeners that a new day has started
      dayChangeListeners.forEach(callback => {
        try {
          callback();
        } catch (e) {
          console.error('Day change listener error:', e);
        }
      });
      
      // Schedule the next check
      scheduleNextCheck();
    }, msUntilTomorrow);
  }
  
  scheduleNextCheck();
}

function stopDayChangeWatcher() {
  if (dayChangeTimer) {
    clearTimeout(dayChangeTimer);
    dayChangeTimer = null;
  }
}

export default { formatDuration, clamp, getLocalDateString, getStartOfLocalDay, getEndOfLocalDay, getTodayDateRange, getDateRangeForPeriod, addDayChangeListener, removeDayChangeListener };
