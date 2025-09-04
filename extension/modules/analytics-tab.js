// Analytics Tab Controller (ES Module)
// Encapsulates analytics data loading, aggregation, chart rendering, and insights UI.
import { resolveBackendUrl } from './api.js';
import { formatDuration } from './utils.js';

export const AnalyticsTab = (() => {
  let initialized = false;
  let timeChart = null;

  // Local color palette (temporary; can be moved to a shared UI module)
  const CHART_COLORS = {
    light: { work: '#3b82f6', social: '#ef4444', entertainment: '#8b5cf6', professional: '#10b981', other: '#6b7280' },
    dark: { work: '#60a5fa', social: '#f87171', entertainment: '#a78bfa', professional: '#34d399', other: '#9ca3af' },
    cyberpunk: { work: '#00ff9f', social: '#ff0080', entertainment: '#00d4ff', professional: '#ffff00', other: '#8000ff' },
    minimal: { work: '#1f2937', social: '#7c3aed', entertainment: '#059669', professional: '#dc2626', other: '#64748b' },
    ocean: { work: '#0ea5e9', social: '#06b6d4', entertainment: '#3b82f6', professional: '#0891b2', other: '#64748b' },
    sunset: { work: '#f59e0b', social: '#ef4444', entertainment: '#f97316', professional: '#eab308', other: '#6b7280' },
    forest: { work: '#059669', social: '#dc2626', entertainment: '#16a34a', professional: '#15803d', other: '#6b7280' },
  };

  const CHART_CONFIG = {
    type: 'doughnut',
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { font: { family: 'inherit' } } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatDuration(ctx.raw)}` } },
      },
      cutout: '65%',
    },
  };

  function getCurrentTheme() {
    // Prefer explicit localStorage theme
    const t = localStorage.getItem('theme');
    if (t) return t;
    // Fallback to body class name pattern "theme-*"
    const cls = document.body?.className || '';
    const match = cls.match(/theme-([a-z]+)/i);
    return match ? match[1] : 'light';
  }

  function getLegendColor() {
    const theme = getCurrentTheme();
    switch (theme) {
      case 'light': return '#1e293b';
      case 'dark': return '#f1f5f9';
      case 'cyberpunk': return '#e0e7ff';
      case 'minimal': return '#1e293b';
      case 'ocean': return '#0f172a';
      case 'sunset': return '#451a03';
      case 'forest': return '#1a2e05';
      default: return '#1e293b';
    }
  }

  function getDateRangeForTab(tab) {
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];
    let startDate = endDate;
    if (tab === 'weekly') {
      const start = new Date(today); start.setDate(today.getDate() - 6);
      startDate = start.toISOString().split('T')[0];
    } else if (tab === 'monthly') {
      const start = new Date(today); start.setDate(today.getDate() - 29);
      startDate = start.toISOString().split('T')[0];
    }
    return { startDate, endDate, timezone: today.getTimezoneOffset() };
  }

  function getDateRangeDisplayText(tab) {
    const today = new Date();
    if (tab === 'daily') return today.toLocaleDateString();
    if (tab === 'weekly') {
      const start = new Date(today); start.setDate(today.getDate() - 6);
      return `${start.toLocaleDateString()} - ${today.toLocaleDateString()}`;
    }
    if (tab === 'monthly') {
      const start = new Date(today); start.setDate(today.getDate() - 29);
      return `${start.toLocaleDateString()} - ${today.toLocaleDateString()}`;
    }
    return '';
  }

  function updateDateRangeDisplay(tab) {
    const el = document.getElementById('dateRangeDisplay');
    if (!el) return;
    const periodInfo = tab === 'weekly' ? ' (7 days)' : tab === 'monthly' ? ' (30 days)' : '';
    el.textContent = getDateRangeDisplayText(tab) + periodInfo;
  }

  function updateInsightsOverview({ totalTime, domainTimes, productivityScore }) {
    const totalTimeElement = document.getElementById('totalTimeToday');
    if (totalTimeElement && totalTime) totalTimeElement.textContent = formatDuration(totalTime);
    const productivityScoreElement = document.getElementById('productivityScore');
    if (productivityScoreElement && typeof productivityScore !== 'undefined') {
      productivityScoreElement.textContent = `${productivityScore}%`;
    }
    const sitesVisitedElement = document.getElementById('sitesVisited');
    if (sitesVisitedElement && domainTimes) sitesVisitedElement.textContent = String(Object.keys(domainTimes).length);
  }

  async function updateSiteCategory(domain, category) {
    try {
      const valid = ['Work','Social','Entertainment','Professional','Other'];
      if (!valid.includes(category)) throw new Error('Invalid category');
      const categorySelect = document.querySelector(`.category-select[data-domain="${domain}"]`);
      if (categorySelect) categorySelect.disabled = true;
      // Use SiteTracker from global
      const tracker = window.SiteTracker || SiteTracker;
      const response = await tracker.updateSiteCategory(domain, category);
      if (response?.status !== 'success') throw new Error(response?.error || 'Failed to update category');
      categorySelect && (categorySelect.disabled = false);
      // Reload to reflect updates
      return true;
    } catch (e) {
      console.error('updateSiteCategory failed:', e);
      const categorySelect = document.querySelector(`.category-select[data-domain="${domain}"]`);
      if (categorySelect) categorySelect.disabled = false;
      throw e;
    }
  }

  function buildQuickInsights({ totalTime, productivityScore, categoryData, sortedDomainTimes, timeframe }) {
    const container = document.getElementById('quickInsights');
    if (!container) return;
    if (!totalTime) {
      const emptyMsg = timeframe === 'weekly' ? 'No activity this week' : timeframe === 'monthly' ? 'No activity this month' : 'No activity today';
      container.innerHTML = `<div class="qi-empty">${emptyMsg}</div>`;
      return;
    }
    const topEntry = sortedDomainTimes[0];
    const secondEntry = sortedDomainTimes[1];
    const topPct = topEntry ? ((topEntry[1].time / totalTime) * 100).toFixed(1) : 0;
    const secondPct = secondEntry ? ((secondEntry[1].time / totalTime) * 100).toFixed(1) : 0;
    const focusTime = (categoryData.Work + categoryData.Professional);
    const focusPct = totalTime ? ((focusTime/ totalTime) * 100).toFixed(1) : 0;
    const leisureTime = categoryData.Entertainment + categoryData.Social;
    const leisurePct = totalTime ? ((leisureTime / totalTime) * 100).toFixed(1) : 0;
    let balanceScore = 100 - Math.min(100, Math.abs(62.5 - parseFloat(focusPct || '0')) * 2.4);
    balanceScore = Math.max(0, Math.min(100, Math.round(balanceScore)));
    const dominance = topPct >= 50 ? `${topEntry[0]} dominates (${topPct}%)` : topPct>=35? `High concentration on ${topEntry[0]}` : 'Balanced domain usage';
    const timeframePeriod = timeframe === 'weekly' ? 'this week' : timeframe === 'monthly' ? 'this month' : 'today';
    const trendMsg = productivityScore >= 75 ? `High productivity ${timeframePeriod}` : productivityScore >= 50 ? `Moderate productivity ${timeframePeriod}` : `Low productivity ${timeframePeriod}`;
    const categoryBreak = Object.entries(categoryData).filter(([_,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([c,v])=> `${c} ${(v/totalTime*100).toFixed(1)}%`).join(', ');
    container.innerHTML = `
      <div class="qi-card">
        <div class="qi-label">Top Site</div>
        <div class="qi-value">${topEntry ? topEntry[0] : '—'}</div>
        <div class="qi-sub">${topPct}%${secondEntry? ` · Next ${secondPct}%`:''}</div>
      </div>
      <div class="qi-card">
        <div class="qi-label">Focus Time</div>
        <div class="qi-value">${formatDuration(focusTime)}</div>
        <div class="qi-sub">${focusPct}% (Work+Prof)</div>
      </div>
      <div class="qi-card">
        <div class="qi-label">Leisure</div>
        <div class="qi-value">${formatDuration(leisureTime)}</div>
        <div class="qi-sub">${leisurePct}% Social+Ent</div>
      </div>
      <div class="qi-card">
        <div class="qi-label">Balance</div>
        <div class="qi-value">${balanceScore}</div>
        <div class="qi-sub">${trendMsg}</div>
      </div>
      <div class="qi-card wide">
        <div class="qi-label">Category Mix</div>
        <div class="qi-value small">${categoryBreak || '—'}</div>
        <div class="qi-sub">${dominance}</div>
      </div>`;
  }

  function renderSiteList(timeData, timeframe, siteCategories) {
    if (timeChart) { timeChart.destroy(); timeChart = null; }
    const siteListEl = document.querySelector('.site-list');
    const scoreEl = document.getElementById('productivityScore');
    if (!Array.isArray(timeData) || timeData.length === 0) {
      let message = 'No data available';
      if (timeframe === 'weekly') message = 'No data available for the past 7 days. Start browsing to track your activity.';
      else if (timeframe === 'monthly') message = 'No data available for the past 30 days. Continue using TimeMachine to build your productivity insights.';
      else message = 'No activity tracked today. Start browsing to collect data.';
      siteListEl.innerHTML = `<div class="empty-state">${message}</div>`;
      if (scoreEl) scoreEl.textContent = '0%';
      return;
    }

  const categoryData = { Work:0, Social:0, Entertainment:0, Professional:0, Other:0 };
  const domainTimes = {};

    timeData.forEach((entry) => {
      if (!entry || typeof entry !== 'object' || !entry.domain) return;
      const totalTime = (entry.totalTime || 0);
      const category = siteCategories[entry.domain] || entry.category || 'Other';
      categoryData[category] += totalTime;
      if (domainTimes[entry.domain]) domainTimes[entry.domain].time += totalTime;
      else domainTimes[entry.domain] = { time: totalTime, category };
    });

    const totalTime = Object.values(categoryData).reduce((s,t)=>s+t,0);
    const productiveTime = categoryData.Work + categoryData.Professional + categoryData.Other * 0.5;
    const productivityScore = totalTime > 0 ? Math.round((productiveTime / totalTime) * 100) : 0;
    if (scoreEl) {
      scoreEl.textContent = `${productivityScore}%`;
      scoreEl.className = `score-badge ${ productivityScore>=70 ? 'bg-green-500' : productivityScore>=40 ? 'bg-yellow-500' : 'bg-red-500' }`;
    }

    const sortedDomainTimes = Object.entries(domainTimes).sort((a,b)=> b[1].time - a[1].time);
    buildQuickInsights({ totalTime, productivityScore, categoryData, sortedDomainTimes, timeframe });
    updateInsightsOverview({ totalTime, productivityScore, domainTimes });

    // Render domain list
    document.querySelector('.site-list').innerHTML = sortedDomainTimes.map(([domain, data], index) => `
      <div class="site-item ${index < 3 ? 'top-site' : ''}">
        <div class="site-info">
          <span class="site-domain">${domain}</span>
          <select class="category-select" data-domain="${domain}">
            <option value="Work" ${data.category==='Work'?'selected':''}>Work</option>
            <option value="Social" ${data.category==='Social'?'selected':''}>Social</option>
            <option value="Entertainment" ${data.category==='Entertainment'?'selected':''}>Entertainment</option>
            <option value="Professional" ${data.category==='Professional'?'selected':''}>Professional</option>
            <option value="Other" ${data.category==='Other'?'selected':''}>Other</option>
          </select>
        </div>
        <span class="site-time">${formatDuration(data.time)}</span>
      </div>`).join('');

    // Chart
    const ctx = document.getElementById('timeChart').getContext('2d');
    const theme = getCurrentTheme();
    const colors = CHART_COLORS[theme] || CHART_COLORS.light;
    timeChart = new Chart(ctx, {
      ...CHART_CONFIG,
      data: {
        labels: Object.keys(categoryData),
        datasets: [{
          data: Object.values(categoryData),
          backgroundColor: [colors.work, colors.social, colors.entertainment, colors.professional, colors.other],
          borderWidth: 0,
        }],
      },
      options: {
        ...CHART_CONFIG.options,
        plugins: { ...CHART_CONFIG.options.plugins, legend: { ...CHART_CONFIG.options.plugins.legend, labels: { ...CHART_CONFIG.options.plugins.legend.labels, color: getLegendColor() } } },
      },
    });

    // Category change events
    document.querySelectorAll('.category-select').forEach((select) => {
      select.addEventListener('change', async (event) => {
        const domain = event.target.dataset.domain;
        const newCategory = event.target.value;
        try {
          await updateSiteCategory(domain, newCategory);
          const stored = await chrome.storage.local.get(['siteCategories']);
          const sc = stored.siteCategories || {}; sc[domain] = newCategory; await chrome.storage.local.set({ siteCategories: sc });
          // Reload current view
          await load(window.currentSubTab || 'daily');
        } catch (e) {
          // Show a toast if available
          try { window.showFeedback?.(`Category for ${domain} updated to ${newCategory}`); } catch(_){ }
        }
      });
    });
  }

  async function load(subTab = 'daily') {
    try {
      const user = await chrome.storage.local.get(['userEmail']);
      const userEmail = user.userEmail;
      const errorDisplay = document.getElementById('errorDisplay');
      const siteList = document.querySelector('.site-list');
      if (!userEmail) {
        errorDisplay?.classList?.remove('hidden');
        errorDisplay && (errorDisplay.textContent = 'Please set an email first');
        siteList && (siteList.innerHTML = '<div class="empty-state">Set your email to load data</div>');
        return;
      }
      if (siteList) siteList.innerHTML = '<div class="loading-text"><span class="loader"></span>Loading data...</div>';
      errorDisplay?.classList?.add('hidden');

      // Sync local data to backend first
      const tracker = window.SiteTracker || SiteTracker;
      if (tracker && typeof tracker.forceSync === 'function') await tracker.forceSync();

      const { startDate, endDate, timezone } = getDateRangeForTab(subTab);
      const backend = await resolveBackendUrl();
      const deviceId = typeof Auth !== 'undefined' ? Auth.getDeviceId() : null;
      let token = null; try { token = (await TokenStorage.getToken())?.token; } catch(_) {}

      const response = await fetch(`${backend}/api/time-data/report/${encodeURIComponent(userEmail)}?date=${startDate}&endDate=${endDate}&timezone=${timezone}&useUserTimezone=true`, { headers: { 'X-Device-ID': deviceId || 'unknown', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) } });
      if (!response.ok) {
        let msg = `Failed to load data (${response.status})`;
        if (response.status === 401) msg = 'Unauthorized. Please log in again.';
        if (response.status === 429) {
          // Rate-limited: show friendly message and keep UI usable
          siteList && (siteList.innerHTML = '<div class="empty-state">Rate limited. Please try again in a few minutes.</div>');
          errorDisplay && (errorDisplay.textContent = 'Rate limited (429). Try again later.');
          errorDisplay?.classList?.remove('hidden');
          return;
        }
        try { const errJson = await response.json(); if (errJson?.error) msg = errJson.error; } catch(_) {}
        throw new Error(msg);
      }
      const raw = await response.json();
      const actualData = raw?.data || raw;
      if (!Array.isArray(actualData)) throw new Error('Invalid data format received from server');

  const stored = await chrome.storage.local.get(['siteCategories']);
  const siteCategories = stored.siteCategories || {};
  renderSiteList(actualData, subTab, siteCategories);
      updateDateRangeDisplay(subTab);
    } catch (error) {
      console.error('AnalyticsTab.load failed:', error);
      const siteList = document.querySelector('.site-list');
      const errEl = document.getElementById('errorDisplay');
      const msg = error?.message || 'Error loading data';
      if (siteList) siteList.innerHTML = `<div class="empty-state">${msg.includes('Unauthorized') ? 'Please log in to view analytics.' : 'Error loading data'}</div>`;
      if (errEl) { errEl.textContent = `Error loading data: ${msg}`; errEl.classList.remove('hidden'); }
    }
  }

  function updateChartTheme() {
    if (!timeChart) return;
    timeChart.options.plugins.legend.labels.color = getLegendColor();
    timeChart.update();
  }

  async function init() {
    if (initialized) return; initialized = true;
    // nothing yet; called from popup to ensure module is ready
  }

  return { init, load, updateChartTheme, updateDateRangeDisplay };
})();

if (typeof window !== 'undefined') {
  window.AnalyticsTab = AnalyticsTab;
}
