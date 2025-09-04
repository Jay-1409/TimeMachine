// Dynamic configuration for TimeMachine Extension
// This file centralizes environment-specific values.
// It attempts to detect environment automatically, but allows override via chrome.storage.

const TMConfig = (function() {
  const PRODUCTION_API = 'https://timemachine-1.onrender.com';
  const DEVELOPMENT_API = 'http://localhost:3000';
  
  // Default to production for extension
  const inferredEnv = 'production';

  let current = {
    env: inferredEnv,
    backendBaseUrl: inferredEnv === 'production' ? PRODUCTION_API : DEVELOPMENT_API,
    // Core endpoints
    pdfEndpoint: '/api/report/generate', // protected (requires auth)
    syncEndpoint: '/api/time-data/sync',
    reportEndpoint: '/api/time-data/report',
    categoryEndpoint: '/api/time-data/category',
    feedbackEndpoint: '/api/feedback/submit',
    // Authentication endpoints
    authSignupEndpoint: '/api/auth/signup',
    authLoginEndpoint: '/api/auth/login',
    authVerifyEndpoint: '/api/auth/verify',
    authProfileEndpoint: '/api/auth/profile',
    // Focus Session endpoints
    focusSessionsEndpoint: '/api/focus-sessions',
    focusSessionsGetEndpoint: '/api/focus-sessions/{userId}',
    focusSessionsDeleteEndpoint: '/api/focus-sessions/{sessionId}',
  focusDailyStatsEndpoint: '/api/focus-sessions/{userId}/stats/daily',
  focusWeeklyStatsEndpoint: '/api/focus-sessions/{userId}/stats/weekly',
    // Guard endpoints
    blockedSitesEndpoint: '/api/blocked-sites',
    blockedSitesGetEndpoint: '/api/blocked-sites/{userId}',
    blockedSitesDeleteEndpoint: '/api/blocked-sites/{siteId}',
    // Stats endpoints
    statsEndpoint: '/api/stats/daily',
    weeklyStatsEndpoint: '/api/stats/weekly'
  };

  async function loadOverrides() {
    try {
      if (!chrome?.storage?.local) return current;
      const { tmEnvOverride, tmBackendUrl } = await chrome.storage.local.get(['tmEnvOverride','tmBackendUrl']);
      if (tmEnvOverride && ['development','production'].includes(tmEnvOverride)) {
        current.env = tmEnvOverride;
      }
      if (tmBackendUrl && typeof tmBackendUrl === 'string' && tmBackendUrl.startsWith('http')) {
        current.backendBaseUrl = tmBackendUrl.replace(/\/$/, '');
      } else if (!tmBackendUrl) {
        // Determine base from env
        current.backendBaseUrl = current.env === 'production' ? PRODUCTION_API : DEVELOPMENT_API;
      }
      return current;
    } catch (e) {
      console.warn('TMConfig loadOverrides failed, using defaults:', e);
      return current;
    }
  }

  function getUrl(pathOrEndpoint) {
    if (!pathOrEndpoint.startsWith('/')) return current.backendBaseUrl + '/' + pathOrEndpoint;
    return current.backendBaseUrl + pathOrEndpoint;
  }

  return { current, loadOverrides, getUrl };
})();

// Expose globally
window.TMConfig = TMConfig;
