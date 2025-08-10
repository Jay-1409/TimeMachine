// Dynamic configuration for TimeMachine Extension
// This file centralizes environment-specific values.
// It attempts to detect environment automatically, but allows override via chrome.storage.

const TMConfig = (function() {
  const PRODUCTION_API = 'https://timemachine-1.onrender.com';
  const DEVELOPMENT_API = 'http://localhost:3000';

  // Default inferred environment
  const inferredEnv = location.origin.startsWith('chrome-extension://') ? 'production' : 'development';

  let current = {
    env: inferredEnv,
    backendBaseUrl: inferredEnv === 'production' ? PRODUCTION_API : DEVELOPMENT_API,
    pdfEndpoint: '/api/report/generate',
    syncEndpoint: '/api/time-data/sync',
    reportEndpoint: '/api/time-data/report',
    categoryEndpoint: '/api/time-data/category',
    feedbackEndpoint: '/api/feedback/store',
    // Device authentication endpoints
    deviceVerifyEndpoint: '/api/device-management/verify-device',
    deviceRequestCodeEndpoint: '/api/device-management/request-verification',
    deviceVerifyCodeEndpoint: '/api/device-management/verify-code',
    deviceListEndpoint: '/api/device-management/devices'
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
