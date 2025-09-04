import { resolveBackendUrl } from './api.js';
import { formatDuration } from './utils.js';

export const AnalyticsTab = (() => {
  let initialized = false;
  let timeChart = null;

  const ELEMENTS = {
    siteList: '.site-list',
    errorDisplay: 'errorDisplay',
    totalTimeToday: 'totalTimeToday',
    productivityScore: 'productivityScore',
    sitesVisited: 'sitesVisited',
    dateRangeDisplay: 'dateRangeDisplay',
    quickInsights: 'quickInsights',
    timeChart: 'timeChart'
  };

  const CHART_CONFIG = {
    type: 'doughnut',
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { font: { family: 'inherit' } } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${formatDuration(ctx.raw)}` } }
      },
      cutout: '65%'
    }
  };

  const getElement = id => document.getElementById(id) || document.querySelector(id);

  function getCurrentTheme() {
    const theme = localStorage.getItem('theme') || document.body.className.match(/theme-([a-z]+)/i)?.[1] || 'light';
    return theme;
  }

  function getLegendColor(theme = getCurrentTheme()) {
    const colors = {
      light: '#1e293b', dark: '#f1f5f9', cyberpunk: '#e0e7ff', minimal: '#1e293b',
      ocean: '#0f172a', sunset: '#451a03', forest: '#1a2e05'
    };
    return colors[theme] || colors.light;
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
    return { startDate, endDate, timezone: -330 }; // IST offset
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
    const el = getElement(ELEMENTS.dateRangeDisplay);
    if (el) el.textContent = getDateRangeDisplayText(tab) + (tab === 'weekly' ? ' (7 days)' : tab === 'monthly' ? ' (30 days)' : '');
  }

  function updateInsightsOverview({ totalTime, domainTimes, productivityScore }) {
    const totalTimeEl = getElement(ELEMENTS.totalTimeToday);
    const scoreEl = getElement(ELEMENTS.productivityScore);
    const sitesVisitedEl = getElement(ELEMENTS.sitesVisited);
    if (totalTimeEl) totalTimeEl.textContent = formatDuration(totalTime);
    if (scoreEl) {
      scoreEl.textContent = `${productivityScore}%`;
      scoreEl.className = `score-badge ${productivityScore >= 70 ? 'bg-green-500' : productivityScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`;
    }
    if (sitesVisitedEl) sitesVisitedEl.textContent = String(Object.keys(domainTimes).length);
  }

  async function updateSiteCategory(domain, category) {
    const validCategories = ['Work', 'Social', 'Entertainment', 'Professional', 'Other'];
    if (!validCategories.includes(category)) throw new Error('Invalid category');
    const categorySelect = document.querySelector(`.category-select[data-domain="${domain}"]`);
    try {
      if (categorySelect) categorySelect.disabled = true;
      const response = await window.SiteTracker.updateSiteCategory(domain, category);
      if (response?.status !== 'success') throw new Error(response?.error || 'Failed to update category');
      const stored = await chrome.storage.local.get(['siteCategories']);
      const siteCategories = stored.siteCategories || {};
      siteCategories[domain] = category;
      await chrome.storage.local.set({ siteCategories });
      return true;
    } catch (e) {
      console.error('updateSiteCategory failed:', e);
      throw e;
    } finally {
      if (categorySelect) categorySelect.disabled = false;
    }
  }

  function buildQuickInsights({ totalTime, productivityScore, categoryData, sortedDomainTimes, timeframe }) {
    const container = getElement(ELEMENTS.quickInsights);
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
    const focusTime = categoryData.Work + categoryData.Professional;
    const focusPct = totalTime ? ((focusTime / totalTime) * 100).toFixed(1) : 0;
    const leisureTime = categoryData.Entertainment + categoryData.Social;
    const leisurePct = totalTime ? ((leisureTime / totalTime) * 100).toFixed(1) : 0;
    const balanceScore = Math.max(0, Math.min(100, Math.round(100 - Math.min(100, Math.abs(62.5 - parseFloat(focusPct || '0')) * 2.4))));
    const dominance = topPct >= 50 ? `${topEntry[0]} dominates (${topPct}%)` : topPct >= 35 ? `High concentration on ${topEntry[0]}` : 'Balanced domain usage';
    const timeframePeriod = timeframe === 'weekly' ? 'this week' : timeframe === 'monthly' ? 'this month' : 'today';
    const trendMsg = productivityScore >= 75 ? `High productivity ${timeframePeriod}` : productivityScore >= 50 ? `Moderate productivity ${timeframePeriod}` : `Low productivity ${timeframePeriod}`;
    const categoryBreak = Object.entries(categoryData).filter(([_, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, v]) => `${c} ${(v / totalTime * 100).toFixed(1)}%`).join(', ');

    container.innerHTML = `
      <div class="qi-card">
        <div class="qi-label">Top Site</div>
        <div class="qi-value">${topEntry ? topEntry[0] : '—'}</div>
        <div class="qi-sub">${topPct}%${secondEntry ? ` · Next ${secondPct}%` : ''}</div>
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
    const siteListEl = getElement(ELEMENTS.siteList);
    if (!Array.isArray(timeData) || !timeData.length) {
      const message = timeframe === 'weekly' ? 'No data available for the past 7 days. Start browsing to track your activity.' :
                      timeframe === 'monthly' ? 'No data available for the past 30 days. Continue using TimeMachine to build your productivity insights.' :
                      'No activity tracked today. Start browsing to collect data.';
      siteListEl.innerHTML = `<div class="empty-state">${message}</div>`;
      getElement(ELEMENTS.productivityScore).textContent = '0%';
      return;
    }

    const categoryData = { Work: 0, Social: 0, Entertainment: 0, Professional: 0, Other: 0 };
    const domainTimes = {};
    timeData.forEach(entry => {
      if (!entry?.domain) return;
      const totalTime = entry.totalTime || 0;
      const category = siteCategories[entry.domain] || entry.category || 'Other';
      categoryData[category] += totalTime;
      domainTimes[entry.domain] = domainTimes[entry.domain] ? { time: domainTimes[entry.domain].time + totalTime, category } : { time: totalTime, category };
    });

    const totalTime = Object.values(categoryData).reduce((s, t) => s + t, 0);
    const productiveTime = categoryData.Work + categoryData.Professional + categoryData.Other * 0.5;
    const productivityScore = totalTime > 0 ? Math.round((productiveTime / totalTime) * 100) : 0;

    updateInsightsOverview({ totalTime, domainTimes, productivityScore });
    buildQuickInsights({ totalTime, productivityScore, categoryData, sortedDomainTimes: Object.entries(domainTimes).sort((a, b) => b[1].time - a[1].time), timeframe });

    siteListEl.innerHTML = Object.entries(domainTimes).sort((a, b) => b[1].time - a[1].time).map(([domain, data], index) => `
      <div class="site-item ${index < 3 ? 'top-site' : ''}">
        <div class="site-info">
          <span class="site-domain">${domain}</span>
          <select class="category-select" data-domain="${domain}">
            ${['Work', 'Social', 'Entertainment', 'Professional', 'Other'].map(cat => `<option value="${cat}" ${data.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
          </select>
        </div>
        <span class="site-time">${formatDuration(data.time)}</span>
      </div>`).join('');

    const ctx = getElement(ELEMENTS.timeChart)?.getContext('2d');
    if (ctx) {
      const theme = getCurrentTheme();
      timeChart = new Chart(ctx, {
        ...CHART_CONFIG,
        data: {
          labels: Object.keys(categoryData),
          datasets: [{
            data: Object.values(categoryData),
            backgroundColor: Object.values(window.CONFIG.CHART_COLORS[theme] || window.CONFIG.CHART_COLORS.light),
            borderWidth: 0
          }]
        },
        options: {
          ...CHART_CONFIG.options,
          plugins: { ...CHART_CONFIG.options.plugins, legend: { ...CHART_CONFIG.options.plugins.legend, labels: { ...CHART_CONFIG.options.plugins.legend.labels, color: getLegendColor() } } }
        }
      });
    }

    document.querySelectorAll('.category-select').forEach(select => {
      select.addEventListener('change', async e => {
        const domain = e.target.dataset.domain;
        const newCategory = e.target.value;
        try {
          await updateSiteCategory(domain, newCategory);
          window.showToast?.(`Category for ${domain} updated to ${newCategory}`);
          await load(window.currentSubTab || 'daily');
        } catch (e) {
          window.showToast?.(`Error updating category for ${domain}: ${e.message}`, 'error');
        }
      });
    });
  }

  async function load(subTab = 'daily') {
    const errorDisplay = getElement(ELEMENTS.errorDisplay);
    const siteList = getElement(ELEMENTS.siteList);
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (!userEmail) {
        errorDisplay?.classList.remove('hidden');
        errorDisplay.textContent = 'Please set an email first';
        siteList.innerHTML = '<div class="empty-state">Set your email to load data</div>';
        return;
      }
      siteList.innerHTML = '<div class="loading-text"><span class="loader"></span>Loading data...</div>';
      errorDisplay?.classList.add('hidden');

      await window.SiteTracker?.forceSync?.();
      const { startDate, endDate, timezone } = getDateRangeForTab(subTab);
      const backend = await resolveBackendUrl();
      const deviceId = window.Auth?.getDeviceId?.() || 'unknown';
      const { token } = await window.TokenStorage?.getToken?.() || {};

      const response = await fetch(`${backend}/api/time-data/report/${encodeURIComponent(userEmail)}?date=${startDate}&endDate=${endDate}&timezone=${timezone}&useUserTimezone=true`, {
        headers: { 'X-Device-ID': deviceId, ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
      });
      if (!response.ok) {
        const msg = response.status === 401 ? 'Unauthorized. Please log in again.' :
                    response.status === 429 ? 'Rate limited. Please try again in a few minutes.' :
                    (await response.json().catch(() => ({}))).error || `Failed to load data (${response.status})`;
        throw new Error(msg);
      }
      const data = await response.json();
      const actualData = Array.isArray(data) ? data : data?.data || [];
      if (!Array.isArray(actualData)) throw new Error('Invalid data format received from server');

      const { siteCategories = {} } = await chrome.storage.local.get(['siteCategories']);
      renderSiteList(actualData, subTab, siteCategories);
      updateDateRangeDisplay(subTab);
    } catch (error) {
      console.error('AnalyticsTab.load failed:', error);
      const msg = error.message.includes('Unauthorized') ? 'Please log in to view analytics.' : 'Error loading data';
      siteList.innerHTML = `<div class="empty-state">${msg}</div>`;
      errorDisplay.textContent = `Error loading data: ${error.message}`;
      errorDisplay.classList.remove('hidden');
    }
  }

  function updateChartTheme() {
    if (timeChart) {
      const theme = getCurrentTheme();
      timeChart.data.datasets[0].backgroundColor = Object.values(window.CONFIG.CHART_COLORS[theme] || window.CONFIG.CHART_COLORS.light);
      timeChart.options.plugins.legend.labels.color = getLegendColor();
      timeChart.update();
    }
  }

  async function init() {
    if (initialized) return;
    initialized = true;
  }

  return { init, load, updateChartTheme, updateDateRangeDisplay, getDateRangeDisplayText };
})();