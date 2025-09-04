// Site Tracking Module
// Handles tracking, categorization and syncing of browsing data

const SiteTracker = (function() {
  // Internal state
  let _isAuthenticated = false;
  let _siteCategories = {};
  let _lastSync = 0;
  const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

  // Initialize module
  async function init() {
    try {
      _isAuthenticated = await Auth.isAuthenticated();
      const { siteCategories = {} } = await chrome.storage.local.get(['siteCategories']);
      _siteCategories = siteCategories;
      if (_isAuthenticated) {
        await syncWithBackend();
      }
    } catch (error) {
      console.error('Site tracker init error:', error);
    }
  }

  // Track site visit
  async function trackSiteVisit(domain, startTime, endTime, url, title) {
    try {
      // Save locally first
      const { timeData = {} } = await chrome.storage.local.get(['timeData']);
      const today = new Date().toISOString().split('T')[0];
      
      if (!timeData[today]) {
        timeData[today] = {};
      }
      
      if (!timeData[today][domain]) {
        timeData[today][domain] = {
          domain,
          category: _siteCategories[domain] || 'Other',
          totalTime: 0,
          sessions: []
        };
      }

      // Add new session
      const session = {
        startTime: startTime || Date.now(),
        endTime: endTime || Date.now(),
        url,
        title
      };

      timeData[today][domain].sessions.push(session);
      timeData[today][domain].totalTime += (session.endTime - session.startTime);

      await chrome.storage.local.set({ timeData });

      // Try to sync if authenticated and it's time
      if (_isAuthenticated && Date.now() - _lastSync > SYNC_INTERVAL) {
        await syncWithBackend();
      }

      return session;
    } catch (error) {
      console.error('Error tracking site visit:', error);
      throw error;
    }
  }

  // Update site category
  async function updateSiteCategory(domain, category) {
    try {
      // Update local cache
      _siteCategories[domain] = category;
      await chrome.storage.local.set({ siteCategories: _siteCategories });
      
      if (_isAuthenticated) {
        try {
          const { token, email } = await TokenStorage.getToken();
          if (!token || !email) return;
          const tz = new Date().getTimezoneOffset();
          const today = new Date(Date.now() - tz * 60000).toISOString().split('T')[0];
          // Delegate to background to persist + PATCH backend
          await chrome.runtime.sendMessage({
            action: 'updateCategory',
            domain,
            category,
            userEmail: email,
            date: today
          });
        } catch (e) {
          console.warn('Failed to sync category update (queued locally):', e);
        }
      }
    } catch (error) {
      console.error('Error updating site category:', error);
      throw error;
    }
  }

  // Sync with backend
  async function syncWithBackend() {
    try {
  const { token, email } = await TokenStorage.getToken();
  if (!token || !email) return;
  // Let background handle granular sync to match server contract
  try { await chrome.runtime.sendMessage({ action: 'triggerImmediateSync' }); } catch(_) {}
  _lastSync = Date.now();
    } catch (error) {
      console.error('Site sync error:', error);
      throw error;
    }
  }

  // Auth state changed handler
  async function handleAuthChanged(isAuthed) {
    _isAuthenticated = isAuthed;
    if (isAuthed) {
      await syncWithBackend();
    }
  }

  // Force sync
  async function forceSync() {
    if (_isAuthenticated) {
      await syncWithBackend();
    }
  }

  // Get site categories
  function getSiteCategories() {
    return { ..._siteCategories };
  }

  // Get site stats for date range
  async function getStats(startDate, endDate) {
    try {
      const { timeData = {} } = await chrome.storage.local.get(['timeData']);
      
      // If authenticated, try to get from backend first
      if (_isAuthenticated) {
        try {
          const { token, email } = await TokenStorage.getToken();
          if (token && email) {
            const backend = await TMConfig.getUrl(TMConfig.current.reportEndpoint);
            const url = `${backend}/${encodeURIComponent(email)}?date=${startDate}&endDate=${endDate}&timezone=${new Date().getTimezoneOffset()}`;
            const response = await fetch(url, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
              return await response.json();
            }
          }
        } catch (e) {
          console.warn('Failed to fetch stats from backend:', e);
        }
      }

      // Fall back to local data
      const stats = [];
      const dates = Object.keys(timeData).filter(date => 
        date >= startDate && date <= endDate
      );

      dates.forEach(date => {
        const domains = Object.values(timeData[date]);
        domains.forEach(domain => {
          stats.push({
            date,
            domain: domain.domain,
            category: domain.category,
            totalTime: domain.totalTime,
            sessions: domain.sessions
          });
        });
      });

      return stats;
    } catch (error) {
      console.error('Error getting stats:', error);
      throw error;
    }
  }

  // Public API
  return {
    init,
    trackSiteVisit,
    updateSiteCategory,
    forceSync,
    handleAuthChanged,
    getSiteCategories,
    getStats
  };
})();

// Export globally
window.SiteTracker = SiteTracker;
