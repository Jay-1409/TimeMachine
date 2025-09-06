import { resolveBackendUrl } from './api.js';

export const GuardTab = (() => {
  let initialized = false;
  let isPremium = false;

  const el = {
    container: () => document.getElementById('guardTabContent'),
    blockedItemsList: () => document.getElementById('blockedItemsList'),
    blockedCount: () => document.getElementById('blockedCount'),
    blockedSitesCount: () => document.getElementById('blockedSitesCount'),
    blockingStatus: () => document.getElementById('blockingStatus'),
    quickAddBtn: () => document.getElementById('addBlockBtn'),
    quickInput: () => document.getElementById('blockInput'),
  };

  const init = async () => {
    if (initialized) return;
    initialized = true;
    bindEvents();
    await checkPremiumStatus();
  };

  const bindEvents = () => {
    const addListener = (element, event, handler) => {
      if (element) {
        element.removeEventListener(event, handler);
        element.addEventListener(event, handler);
      }
    };
    addListener(el.quickAddBtn(), 'click', handleQuickAdd);
    addListener(el.blockedItemsList(), 'click', handleItemAction);
  };

  const checkPremiumStatus = async () => {
    try {
      const { userEmail, token } = await getUserCredentials();
      const resp = await fetch(`${await resolveBackendUrl()}/api/blocked-sites`, {
        headers: { 'Content-Type': 'application/json', 'x-user-email': userEmail, Authorization: `Bearer ${token}` },
      });
      isPremium = resp.ok;
      if (!isPremium && resp.status === 403) {
        window.showToast?.('Site blocking requires a premium subscription. Upgrade at https://x.ai/grok.', 'warning');
      } else if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
    } catch (e) {
      console.error('GuardTab.checkPremiumStatus:', e);
      isPremium = false;
      window.showToast?.('Failed to verify subscription. Using local data.', 'warning');
    }
  };

  const handleQuickAdd = async () => {
    const raw = el.quickInput()?.value.trim();
    if (!raw) {
      window.showToast?.('Enter a website or keyword', 'error');
      el.quickInput()?.focus();
      return;
    }
    const isSite = /\.|\//.test(raw);
    const value = isSite ? raw.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*/, '') : raw.toLowerCase();

    try {
      el.quickAddBtn()?.setAttribute('disabled', '');
      if (!await ensureAuthenticated()) throw new Error('Authentication required');
      await (isSite ? addSite(value) : addKeyword(value));
      el.quickInput().value = '';
    } catch (e) {
      console.error('GuardTab.handleQuickAdd:', e);
      window.showToast?.(e.message || 'Failed to add item', 'error');
    } finally {
      el.quickAddBtn()?.removeAttribute('disabled');
    }
  };

  const handleItemAction = async (e) => {
    const btn = e.target.closest('.action-btn.delete');
    if (!btn) return;
    const { type, domain, keyword } = btn.dataset;
    try {
      btn.setAttribute('disabled', '');
      if (!await ensureAuthenticated()) throw new Error('Authentication required');
      if (type === 'site' && domain) await removeSite(domain);
      else if (type === 'keyword' && keyword) await removeKeyword(keyword);
    } catch (e) {
      console.error('GuardTab.handleItemAction:', e);
      window.showToast?.(e.message || `Failed to remove ${type}`, 'error');
    } finally {
      btn.removeAttribute('disabled');
    }
  };

  const show = async () => {
    const container = el.container();
    if (!container) return console.error('Guard tab container not found');
    container.classList.add('active');
    await init();
    await refreshItemsAndStats();
  };

  const ensureAuthenticated = async () => {
    try {
      const { tm_auth_token } = await chrome.storage.local.get(['tm_auth_token']);
      if (!tm_auth_token) throw new Error('No authentication token found');
      if (!(await Auth?.isAuthenticated?.())) {
        if (!(await Auth?.authenticateUser?.())) throw new Error('Authentication failed');
      }
      return true;
    } catch (e) {
      console.error('GuardTab.ensureAuthenticated:', e);
      window.showError?.('Please sign in to use Website Guard');
      return false;
    }
  };

  const getUserCredentials = async () => {
    const { userEmail, tm_auth_token } = await chrome.storage.local.get(['userEmail', 'tm_auth_token']);
    if (!userEmail || !tm_auth_token) throw new Error('Missing user email or token');
    return { userEmail, token: tm_auth_token };
  };

  const fetchBackendData = async (endpoint, userEmail, token) => {
    try {
      const resp = await fetch(`${await resolveBackendUrl()}/api/${endpoint}`, {
        headers: { 'Content-Type': 'application/json', 'x-user-email': userEmail, Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        if (resp.status === 403) {
          isPremium = false;
          throw new Error('HTTP 403: Site blocking requires a premium subscription');
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      return await resp.json();
    } catch (e) {
      console.error(`GuardTab.fetchBackendData(${endpoint}):`, e);
      throw e;
    }
  };

  const syncToDatabase = async (endpoint, item, config, method = 'POST') => {
    if (!isPremium) {
      window.showToast?.('Backend sync requires a premium subscription', 'warning');
      return;
    }
    try {
      const { userEmail, token } = await getUserCredentials();
      const key = endpoint.includes('sites') ? 'domain' : 'keyword';
      const resp = await fetch(`${await resolveBackendUrl()}/api/${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-user-email': userEmail, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...config, [key]: item }),
      });
      if (!resp.ok) {
        if (resp.status === 403) {
          isPremium = false;
          throw new Error('HTTP 403: Site blocking requires a premium subscription');
        }
        throw new Error(`HTTP ${resp.status}`);
      }
    } catch (e) {
      console.error(`GuardTab.syncToDatabase(${endpoint}):`, e);
      window.showError?.(`Failed to sync ${endpoint}: ${e.message}`);
      throw e;
    }
  };

  const deleteFromDatabase = async (endpoint, item) => {
    if (!isPremium) {
      window.showToast?.('Backend sync requires a premium subscription', 'warning');
      return;
    }
    try {
      const { userEmail, token } = await getUserCredentials();
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      const list = await fetch(`${await resolveBackendUrl()}/api/${endpoint}`, { headers });
      if (!list.ok) {
        if (list.status === 403) {
          isPremium = false;
          throw new Error('HTTP 403: Site blocking requires a premium subscription');
        }
        throw new Error(`HTTP ${list.status}`);
      }
      const data = await list.json();
      const key = endpoint.includes('sites') ? 'domain' : 'keyword';
      const items = endpoint.includes('sites') ? data.blockedSites : data.blockedKeywords;
      const target = items?.find(i => i[key].toLowerCase() === item.toLowerCase());
      if (!target?._id) return;
      const resp = await fetch(`${await resolveBackendUrl()}/api/${endpoint}/${encodeURIComponent(target._id)}`, {
        method: 'DELETE',
        headers,
      });
      if (!resp.ok) {
        if (resp.status === 403) {
          isPremium = false;
          throw new Error('HTTP 403: Site blocking requires a premium subscription');
        }
        throw new Error(`HTTP ${resp.status}`);
      }
    } catch (e) {
      console.error(`GuardTab.deleteFromDatabase(${endpoint}):`, e);
      window.showError?.(`Failed to delete ${endpoint}: ${e.message}`);
      throw e;
    }
  };

  const refreshItemsAndStats = async () => {
    try {
      if (!await ensureAuthenticated()) return;

      let [sites, keywords] = await Promise.all([
        new Promise(resolve => chrome.runtime.sendMessage({ action: 'getBlockedSites' }, res => resolve(res?.sites || []))),
        new Promise(resolve => chrome.runtime.sendMessage({ action: 'getBlockedKeywords' }, res => resolve(res?.keywords || []))),
      ]);

      if (isPremium) {
        try {
          const { userEmail, token } = await getUserCredentials();
          await Promise.all([syncSitesFromDatabase(userEmail, token), syncKeywordsFromDatabase(userEmail, token)]);
          [sites, keywords] = await Promise.all([
            new Promise(resolve => chrome.runtime.sendMessage({ action: 'getBlockedSites' }, res => resolve(res?.sites || []))),
            new Promise(resolve => chrome.runtime.sendMessage({ action: 'getBlockedKeywords' }, res => resolve(res?.keywords || []))),
          ]);
        } catch (e) {
          if (e.message.includes('HTTP 403')) {
            isPremium = false;
            window.showToast?.('Site blocking requires a premium subscription. Upgrade at https://x.ai/grok.', 'warning');
          } else {
            window.showError?.(`Failed to sync with backend: ${e.message}`);
          }
        }
      }

      displayItems(sites, keywords);
      updateBlockingStatus(sites, keywords);
      updateStats(sites, keywords);
    } catch (e) {
      console.error('GuardTab.refreshItemsAndStats:', e);
      window.showError?.(`Failed to refresh blocked items: ${e.message}`);
    }
  };

  const syncSitesFromDatabase = async (userEmail, token) => {
    const data = await fetchBackendData('blocked-sites', userEmail, token);
    const sitesMap = new Map((data.blockedSites || []).map(site => [
      site.domain,
      { enabled: site.enabled, blockType: site.blockType, blockDuring: site.blockDuring, redirectUrl: site.redirectUrl },
    ]));
    await new Promise(resolve => chrome.runtime.sendMessage({ action: 'syncBlockedSites', sites: Array.from(sitesMap.entries()) }, resolve));
  };

  const syncKeywordsFromDatabase = async (userEmail, token) => {
    const data = await fetchBackendData('blocked-keywords', userEmail, token);
    const kwMap = new Map((data.blockedKeywords || []).map(k => [
      k.keyword,
      { enabled: k.enabled, blockType: k.blockType, blockDuring: k.blockDuring, redirectUrl: k.redirectUrl },
    ]));
    await new Promise(resolve => chrome.runtime.sendMessage({ action: 'syncBlockedKeywords', keywords: Array.from(kwMap.entries()) }, resolve));
  };

  const displayItems = (sites, keywords) => {
    const list = el.blockedItemsList();
    if (!list) return;

    const normalizedSites = (Array.isArray(sites) ? sites.map(item => Array.isArray(item) ? item[0] : item).filter(Boolean) : []);
    const normalizedKeywords = (Array.isArray(keywords) ? keywords.map(item => Array.isArray(item) ? item[0] : item).filter(Boolean) : []);
    const totalItems = normalizedSites.length + normalizedKeywords.length;

    el.blockedSitesCount()?.setTextContent(totalItems);
    el.blockedCount()?.setTextContent(`Blocked Items (${totalItems})`);

    if (!totalItems) {
      list.setInnerHTML(`
        <div class="empty-state">
          <div class="empty-graphic" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
          </div>
          <div>No blocked items yet</div>
          <div>Add a website or keyword above</div>
        </div>`);
      return;
    }

    list.setInnerHTML([
      ...normalizedSites.map(domain => `
        <div class="blocked-item">
          <div class="blocked-item-info">
            <span class="block-badge url">Website</span>
            <span class="blocked-item-name">${domain}</span>
          </div>
          <div class="blocked-item-actions">
            <button class="action-btn delete" data-domain="${domain}" data-type="site" title="Remove">🗑</button>
          </div>
        </div>`),
      ...normalizedKeywords.map(keyword => `
        <div class="blocked-item">
          <div class="blocked-item-info">
            <span class="block-badge keyword">Keyword</span>
            <span class="blocked-item-name">${keyword}</span>
          </div>
          <div class="blocked-item-actions">
            <button class="action-btn delete" data-keyword="${keyword}" data-type="keyword" title="Remove">🗑</button>
          </div>
        </div>`),
    ].join(''));
  };

  const updateBlockingStatus = (sites, keywords) => {
    const status = el.blockingStatus();
    if (!status) return;

    const activeSites = (Array.isArray(sites) ? sites.filter(item => Array.isArray(item) ? item[1]?.enabled : true).length : 0);
    const activeKeywords = (Array.isArray(keywords) ? keywords.filter(item => Array.isArray(item) ? item[1]?.enabled : true).length : 0);
    const totalActive = activeSites + activeKeywords;

    status.setTextContent(totalActive ? `${activeSites} site(s) and ${activeKeywords} keyword(s) currently blocked` : 'No sites or keywords currently blocked');
    status.className = `blocking-status${totalActive ? '' : ' inactive'}`;
  };

  const updateStats = async (sites, keywords) => {
    try {
      const totalItems = (Array.isArray(sites) ? sites.length : 0) + (Array.isArray(keywords) ? keywords.length : 0);
      el.blockedSitesCount()?.setTextContent(totalItems);
      el.blockedCount()?.setTextContent(`Blocked Items (${totalItems})`);
      if (document.getElementById('blockedToday')) document.getElementById('blockedToday').setTextContent('0'); // Placeholder
      if (document.getElementById('timeSaved')) document.getElementById('timeSaved').setTextContent('0m'); // Placeholder
    } catch (e) {
      console.error('GuardTab.updateStats:', e);
      window.showError?.(`Failed to update stats: ${e.message}`);
    }
  };

  const addItem = async (type, value, action, endpoint) => {
    try {
      const config = { enabled: true, blockType: 'focus-only', blockDuring: { focusSessions: true, breakTime: false }, redirectUrl: 'chrome://newtab' };
      const res = await new Promise(resolve => chrome.runtime.sendMessage({ action, [type]: value, config }, resolve));
      if (!res?.success) throw new Error(`Failed to add ${type}`);
      if (isPremium) {
        try {
          await syncToDatabase(endpoint, value, config);
        } catch (e) {
          if (e.message.includes('HTTP 403')) {
            isPremium = false;
            window.showToast?.(`Item added locally; backend sync requires a premium subscription`, 'warning');
          } else {
            throw e;
          }
        }
      }
      await refreshItemsAndStats();
      chrome.runtime.sendMessage({ action: 'recheckBlockActiveTab' }).catch(() => {});
      window.showToast?.(`${type === 'domain' ? value : `Keyword "${value}"`} added to blocked ${type}s`);
    } catch (e) {
      console.error(`GuardTab.addItem(${type}):`, e);
      window.showToast?.(`Failed to add blocked ${type}: ${e.message}`, 'error');
      throw e;
    }
  };

  const removeItem = async (type, value, action, endpoint) => {
    try {
      const res = await new Promise(resolve => chrome.runtime.sendMessage({ action, [type]: value }, resolve));
      if (!res?.success) throw new Error(`Failed to remove ${type}`);
      if (isPremium) {
        try {
          await deleteFromDatabase(endpoint, value);
        } catch (e) {
          if (e.message.includes('HTTP 403')) {
            isPremium = false;
            window.showToast?.(`Item removed locally; backend sync requires a premium subscription`, 'warning');
          } else {
            throw e;
          }
        }
      }
      await refreshItemsAndStats();
      window.showToast?.(`${type === 'domain' ? value : `Keyword "${value}"`} removed`);
    } catch (e) {
      console.error(`GuardTab.removeItem(${type}):`, e);
      window.showToast?.(`Failed to remove ${type}: ${e.message}`, 'error');
      throw e;
    }
  };

  const toggleKeyword = async (keyword) => {
    try {
      const res = await new Promise(resolve => chrome.runtime.sendMessage({ action: 'toggleBlockedKeyword', keyword }, resolve));
      if (!res?.success) throw new Error('Failed to toggle keyword');
      await refreshItemsAndStats();
      window.showToast?.(`Keyword "${keyword}" ${res.enabled ? 'blocked' : 'unblocked'}`);
    } catch (e) {
      console.error('GuardTab.toggleKeyword:', e);
      window.showToast?.(`Failed to toggle keyword: ${e.message}`, 'error');
      throw e;
    }
  };

  const addSite = domain => addItem('domain', domain.replace(/^www\./, ''), 'addBlockedSite', 'blocked-sites');
  const addKeyword = keyword => addItem('keyword', keyword, 'addBlockedKeyword', 'blocked-keywords');
  const removeSite = domain => removeItem('domain', domain, 'removeBlockedSite', 'blocked-sites');
  const removeKeyword = keyword => removeItem('keyword', keyword, 'removeBlockedKeyword', 'blocked-keywords');

  Element.prototype.setTextContent = function (value) { if (this) this.textContent = value; };
  Element.prototype.setInnerHTML = function (value) { if (this) this.innerHTML = value; };

  const cleanup = () => {
    const removeListener = (element, event, handler) => { if (element) element.removeEventListener(event, handler); };
    removeListener(el.quickAddBtn(), 'click', handleQuickAdd);
    removeListener(el.blockedItemsList(), 'click', handleItemAction);
    initialized = false;
  };

  return {
    init,
    show,
    loadItems: refreshItemsAndStats,
    loadSitesFromDatabase: () => isPremium ? syncSitesFromDatabase() : Promise.resolve(),
    loadKeywordsFromDatabase: () => isPremium ? syncKeywordsFromDatabase() : Promise.resolve(),
    displayItems,
    updateBlockingStatus,
    updateStats,
    addSite,
    addKeyword,
    toggleKeyword,
    removeSite,
    removeKeyword,
    deleteSiteFromDatabase: domain => isPremium ? deleteFromDatabase('blocked-sites', domain) : Promise.resolve(),
    deleteKeywordFromDatabase: keyword => isPremium ? deleteFromDatabase('blocked-keywords', keyword) : Promise.resolve(),
    cleanup,
  };
})();

if (typeof window !== 'undefined') window.GuardTab = GuardTab;