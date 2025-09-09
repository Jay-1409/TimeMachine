import { resolveBackendUrl } from './api.js';
import { formatDuration, getDateRangeForPeriod, addDayChangeListener, removeDayChangeListener } from './utils.js';

// AnalyticsTab module for time tracking and productivity insights
const AnalyticsTab = (() => {
  let initialized = false, timeChart = null, currentSubTab = 'daily', dayChangeCallback = null;
  const el = {
    siteList: () => document.querySelector('.site-list'),
    error: () => document.getElementById('errorDisplay'),
    totalTime: () => document.getElementById('totalTimeToday'),
    score: () => document.getElementById('productivityScore'),
    sitesVisited: () => document.getElementById('sitesVisited'),
    dateRange: () => document.getElementById('dateRangeDisplay'),
    insights: () => document.getElementById('quickInsights'),
    chart: () => document.getElementById('timeChart')
  };

  const CHART_COLORS = {
    light: { work: '#3b82f6', social: '#ef4444', entertainment: '#8b5cf6', professional: '#10b981', other: '#6b7280' },
    dark: { work: '#60a5fa', social: '#f87171', entertainment: '#a78bfa', professional: '#34d399', other: '#9ca3af' },
    cyberpunk: { work: '#00ff9f', social: '#ff0080', entertainment: '#00d4ff', professional: '#ffff00', other: '#8000ff' },
    minimal: { work: '#1f2937', social: '#7c3aed', entertainment: '#059669', professional: '#dc2626', other: '#64748b' },
    ocean: { work: '#0ea5e9', social: '#06b6d4', entertainment: '#3b82f6', professional: '#0891b2', other: '#64748b' },
    sunset: { work: '#f59e0b', social: '#ef4444', entertainment: '#f97316', professional: '#eab308', other: '#6b7280' },
    forest: { work: '#059669', social: '#dc2626', entertainment: '#16a34a', professional: '#15803d', other: '#6b7280' }
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

  const getTheme = () => localStorage.getItem('theme') || document.body.className.match(/theme-([a-z]+)/i)?.[1] || 'light';
  const getLegendColor = (theme = getTheme()) => ({
    light: '#1e293b', dark: '#f1f5f9', cyberpunk: '#e0e7ff', minimal: '#1e293b',
    ocean: '#0f172a', sunset: '#451a03', forest: '#1a2e05'
  })[theme] || '#1e293b';

  const getDateRange = tab => getDateRangeForPeriod({ daily: 'today', weekly: 'week', monthly: 'month' }[tab] || 'today');
  const getDateRangeText = tab => {
    const today = new Date();
    if (tab === 'daily') return today.toLocaleDateString();
    const start = new Date(today);
    start.setDate(today.getDate() - (tab === 'weekly' ? 6 : 29));
    return `${start.toLocaleDateString()} - ${today.toLocaleDateString()}`;
  };

  const updateDateRangeDisplay = tab => {
    const elDate = el.dateRange();
    if (elDate) elDate.textContent = getDateRangeText(tab) + (tab === 'weekly' ? ' (7 days)' : tab === 'monthly' ? ' (30 days)' : '');
  };

  const updateInsights = ({ totalTime, domainTimes, productivityScore }) => {
    el.totalTime()?.setTextContent(totalTime ? formatDuration(totalTime) : '0m');
    if (el.score()) {
      el.score().textContent = productivityScore ? `${productivityScore}%` : '0%';
      el.score().className = `score-badge ${productivityScore >= 70 ? 'bg-green-500' : productivityScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`;
    }
    el.sitesVisited()?.setTextContent(domainTimes ? Object.keys(domainTimes).length : '0');
  };

  const updateSiteCategory = async (domain, category, subTab) => {
    if (!['Work', 'Social', 'Entertainment', 'Professional', 'Other'].includes(category)) throw new Error('Invalid category');
    const select = document.querySelector(`.category-select[data-domain="${domain}"]`);
    try {
      select.disabled = true;
      let response = window.SiteTracker?.updateSiteCategory ? await window.SiteTracker.updateSiteCategory(domain, category).catch(e => (console.warn('SiteTracker.updateSiteCategory:', e), null)) : null;
      if (!response?.status === 'success') {
        const { siteCategories = {} } = await chrome.storage.local.get(['siteCategories']);
        siteCategories[domain] = category;
        await chrome.storage.local.set({ siteCategories });
        const { userEmail } = await chrome.storage.local.get(['userEmail']);
        if (userEmail) {
          const res = await chrome.runtime.sendMessage({ action: 'updateCategory', domain, category, userEmail, date: new Date().toISOString().split('T')[0] });
          if (res?.status === 'error') console.warn('Backend sync failed:', res.error);
        }
        response = { status: 'success' };
      }
      if (response?.status !== 'success') throw new Error(response?.error || 'Failed to update category');
      window.showToast?.(`Category for ${domain} updated to ${category}`);
      await load(subTab);
      return true;
    } catch (e) {
      console.error('updateSiteCategory:', e);
      window.showToast?.(`Error updating category: ${e.message}`, 'error');
      throw e;
    } finally {
      select.disabled = false;
    }
  };

  const buildQuickInsights = ({ totalTime, productivityScore, categoryData, sortedDomainTimes, timeframe }) => {
    const container = el.insights();
    if (!container) return;
    if (!totalTime) {
      container.innerHTML = `<div class="qi-empty">${timeframe === 'weekly' ? 'No activity this week' : timeframe === 'monthly' ? 'No activity this month' : 'No activity today'}</div>`;
      updateInsights({ totalTime: 0, domainTimes: {}, productivityScore: 0 });
      return;
    }
    const [topDomain, topData] = sortedDomainTimes[0] || [];
    const [, secondData] = sortedDomainTimes[1] || [];
    const topPct = topData ? ((topData.time / totalTime) * 100).toFixed(1) : 0;
    const secondPct = secondData ? ((secondData.time / totalTime) * 100).toFixed(1) : 0;
    const focusTime = categoryData.Work + categoryData.Professional;
    const focusPct = totalTime ? ((focusTime / totalTime) * 100).toFixed(1) : 0;
    const leisureTime = categoryData.Entertainment + categoryData.Social;
    const leisurePct = totalTime ? ((leisureTime / totalTime) * 100).toFixed(1) : 0;
    const balanceScore = Math.max(0, Math.min(100, Math.round(100 - Math.min(100, Math.abs(62.5 - parseFloat(focusPct || '0')) * 2.4))));
    const dominance = topPct >= 50 ? `${topDomain} dominates (${topPct}%)` : topPct >= 35 ? `High concentration on ${topDomain}` : 'Balanced domain usage';
    const period = timeframe === 'weekly' ? 'this week' : timeframe === 'monthly' ? 'this month' : 'today';
    const trend = productivityScore >= 75 ? `High productivity ${period}` : productivityScore >= 50 ? `Moderate productivity ${period}` : `Low productivity ${period}`;
    const categoryBreak = Object.entries(categoryData).filter(([_, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, v]) => `${c} ${(v / totalTime * 100).toFixed(1)}%`).join(', ');
    container.innerHTML = `
      <div class="qi-card">
        <div class="qi-label">Top Site</div>
        <div class="qi-value">${topDomain || '—'}</div>
        <div class="qi-sub">${topPct}%${secondData ? ` · Next ${secondPct}%` : ''}</div>
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
        <div class="qi-sub">${trend}</div>
      </div>
      <div class="qi-card wide">
        <div class="qi-label">Category Mix</div>
        <div class="qi-value small">${categoryBreak || '—'}</div>
        <div class="qi-sub">${dominance}</div>
      </div>`;
  };

  const renderSiteList = (timeData, timeframe, siteCategories, subTab) => {
    if (timeChart) timeChart.destroy(), timeChart = null;
    const siteList = el.siteList(), score = el.score(), insights = el.insights();
    if (!Array.isArray(timeData) || !timeData.length) {
      const msg = timeframe === 'weekly' ? 'No data for the past 7 days. Start browsing.' : timeframe === 'monthly' ? 'No data for the past 30 days.' : 'No activity today.';
      siteList.innerHTML = `<div class="empty-state">${msg}</div>`;
      if (score) score.textContent = '0%', score.className = 'score-badge bg-red-500';
      if (insights) insights.innerHTML = `<div class="qi-empty">${timeframe === 'weekly' ? 'No activity this week' : timeframe === 'monthly' ? 'No activity this month' : 'No activity today'}</div>`;
      updateInsights({ totalTime: 0, domainTimes: {}, productivityScore: 0 });
      return;
    }

    const categoryData = { Work: 0, Social: 0, Entertainment: 0, Professional: 0, Other: 0 };
    const domainTimes = {};
    timeData.forEach(entry => {
      if (!entry?.domain) return;
      const time = entry.totalTime || 0, category = siteCategories[entry.domain] || entry.category || 'Other';
      categoryData[category] += time;
      domainTimes[entry.domain] = domainTimes[entry.domain] ? { time: domainTimes[entry.domain].time + time, category } : { time, category };
    });

    const totalTime = Object.values(categoryData).reduce((s, t) => s + t, 0);
    const productiveTime = categoryData.Work + categoryData.Professional + categoryData.Other * 0.5;
    const productivityScore = totalTime ? Math.round((productiveTime / totalTime) * 100) : 0;

    updateInsights({ totalTime, domainTimes, productivityScore });
    buildQuickInsights({ totalTime, productivityScore, categoryData, sortedDomainTimes: Object.entries(domainTimes).sort((a, b) => b[1].time - a[1].time), timeframe });

    siteList.innerHTML = Object.entries(domainTimes).sort((a, b) => b[1].time - a[1].time).map(([domain, data], i) => `
      <div class="site-item ${i < 3 ? 'top-site' : ''}">
        <div class="site-info">
          <span class="site-domain">${domain}</span>
          <select class="category-select" data-domain="${domain}">
            ${['Work', 'Social', 'Entertainment', 'Professional', 'Other'].map(c => `<option value="${c}" ${data.category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <span class="site-time">${formatDuration(data.time)}</span>
      </div>`).join('');

    const ctx = el.chart()?.getContext('2d');
    if (!ctx || !window.Chart) {
      console.error('Chart.js or canvas missing');
      window.showToast?.('Chart rendering failed', 'error');
      return;
    }

    const theme = getTheme(), colors = CHART_COLORS[theme] || CHART_COLORS.light;
    timeChart = new window.Chart(ctx, {
      ...CHART_CONFIG,
      data: {
        labels: Object.keys(categoryData),
        datasets: [{ data: Object.values(categoryData), backgroundColor: [colors.work, colors.social, colors.entertainment, colors.professional, colors.other], borderWidth: 0 }]
      },
      options: { ...CHART_CONFIG.options, plugins: { ...CHART_CONFIG.options.plugins, legend: { ...CHART_CONFIG.options.plugins.legend, labels: { ...CHART_CONFIG.options.plugins.legend.labels, color: getLegendColor() } } } }
    });

    document.querySelectorAll('.category-select').forEach(s => {
      const newSelect = s.cloneNode(true);
      s.parentNode.replaceChild(newSelect, s);
      newSelect.onchange = async e => updateSiteCategory(e.target.dataset.domain, e.target.value, subTab).catch(() => {});
    });
  };

  const load = async (subTab = 'daily') => {
    currentSubTab = subTab;
    const errorDisplay = el.error(), siteList = el.siteList();
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

      window.SiteTracker?.forceSync?.().catch(e => console.warn('SiteTracker.forceSync:', e));
      const { startDate, endDate, timezone } = getDateRange(subTab);
      const backend = await resolveBackendUrl(), { token } = await window.TokenStorage?.getToken?.() || {};
      const res = await fetch(`${backend}/api/time-data/report/${encodeURIComponent(userEmail)}?date=${startDate}&endDate=${endDate}&timezone=${timezone}&useUserTimezone=true`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error(res.status === 401 ? 'Unauthorized. Please log in.' : res.status === 429 ? 'Rate limited. Try again later.' : (await res.json().catch(() => ({}))).error || `Failed to load data (${res.status})`);
      const data = await res.json();
      const actualData = Array.isArray(data) ? data : data?.data || [];
      if (!Array.isArray(actualData)) throw new Error('Invalid data format');
      const { siteCategories = {} } = await chrome.storage.local.get(['siteCategories']);
      renderSiteList(actualData, subTab, siteCategories, subTab);
      updateDateRangeDisplay(subTab);
    } catch (e) {
      console.error('load:', e);
      const msg = e.message.includes('Unauthorized') ? 'Please log in to view analytics.' : 'Error loading data';
      siteList.innerHTML = `<div class="empty-state">${msg}</div>`;
      errorDisplay.textContent = `Error: ${e.message}`;
      errorDisplay.classList.remove('hidden');
    }
  };

  const updateChartTheme = () => {
    if (!timeChart) return;
    const theme = getTheme(), colors = CHART_COLORS[theme] || CHART_COLORS.light;
    timeChart.data.datasets[0].backgroundColor = [colors.work, colors.social, colors.entertainment, colors.professional, colors.other];
    timeChart.options.plugins.legend.labels.color = getLegendColor();
    timeChart.update();
  };

  const init = async () => {
    if (initialized) return;
    initialized = true;
    window.SiteTracker?.init?.().catch(e => console.warn('SiteTracker init:', e));
    dayChangeCallback = () => load(currentSubTab);
    addDayChangeListener(dayChangeCallback);
  };

  const cleanup = () => {
    if (dayChangeCallback) removeDayChangeListener(dayChangeCallback), dayChangeCallback = null;
    if (timeChart) timeChart.destroy(), timeChart = null;
    initialized = false;
  };

  return { init, load, updateChartTheme, updateDateRangeDisplay, getDateRangeText, cleanup };
})();

if (typeof window !== 'undefined') window.AnalyticsTab = AnalyticsTab;