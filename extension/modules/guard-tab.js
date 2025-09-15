import { resolveBackendUrl } from './api.js';

// GuardTab module for managing blocked sites and keywords
const GuardTab = (() => {
  let initialized = false, isPremium = false;
  const el = {
    container: () => document.getElementById('guardTabContent'),
    list: () => document.getElementById('blockedItemsList'),
    count: () => document.getElementById('blockedCount'),
    sitesCount: () => document.getElementById('blockedSitesCount'),
    status: () => document.getElementById('blockingStatus'),
    addBtn: () => document.getElementById('addBlockBtn'),
    input: () => document.getElementById('blockInput'),
    keywordScanToggle: () => document.getElementById('keywordScanToggle'),
    keywordScanLabel: () => document.getElementById('keywordScanToggleLabel')
  };

  const init = async () => {
    if (initialized) return;
    initialized = true;
    bindEvents();
    await checkPremiumStatus();
  };

  const bindEvents = () => {
    const addListener = (elem, event, handler) => elem?.addEventListener(event, handler, { once: false });
    addListener(el.addBtn(), 'click', handleQuickAdd);
    addListener(el.list(), 'click', handleItemAction);
    addListener(el.keywordScanToggle(), 'change', handleKeywordScanToggleChange);
  };

  const checkPremiumStatus = async () => {
    if (!(await window.Auth?.isAuthenticated?.().catch(() => false))) return (isPremium = false);
    try {
      const { userEmail, token } = await getUserCredentials() || {};
      if (!token) return (isPremium = false);
      const resp = await fetch(`${await resolveBackendUrl()}/api/blocked-sites`, {
        headers: { 'Content-Type': 'application/json', 'x-user-email': userEmail, Authorization: `Bearer ${token}` }
      });
      isPremium = resp.ok;
      if (!isPremium && resp.status === 403) window.showToast?.('Site blocking requires a premium subscription.', 'warning');
    } catch (e) {
      console.warn('checkPremiumStatus:', e.message);
      isPremium = false;
    }
  };

  const handleQuickAdd = async () => {
    const value = el.input()?.value.trim()?.toLowerCase();
    if (!value) return window.showToast?.('Enter a website or keyword', 'error'), el.input()?.focus();
    const isSite = /\.|\//.test(value);
    const cleanValue = isSite ? value.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*/, '') : value;
    try {
      el.addBtn()?.setAttribute('disabled', '');
      if (!await ensureAuthenticated()) throw new Error('Authentication required');
      await (isSite ? addSite(cleanValue) : addKeyword(cleanValue));
      el.input().value = '';
    } catch (e) {
      console.error('handleQuickAdd:', e);
      window.showToast?.(e.message || 'Failed to add item', 'error');
    } finally {
      el.addBtn()?.removeAttribute('disabled');
    }
  };

  const handleItemAction = async e => {
    const btn = e.target.closest('.action-btn.delete');
    if (!btn) return;
    const { type, domain, keyword } = btn.dataset;
    try {
      btn.setAttribute('disabled', '');
      if (!await ensureAuthenticated()) throw new Error('Authentication required');
      if (type === 'site' && domain) await removeSite(domain);
      else if (type === 'keyword' && keyword) await removeKeyword(keyword);
    } catch (e) {
      console.error('handleItemAction:', e);
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
    await loadKeywordScanSetting();
    await refreshItemsAndStats();
  };

  const loadKeywordScanSetting = async () => {
    try {
      const { keywordScanEnabled = true } = await chrome.storage.local.get(['keywordScanEnabled']);
      const toggle = el.keywordScanToggle();
      if (toggle) toggle.checked = !!keywordScanEnabled;
      const label = el.keywordScanLabel();
      if (label) label.textContent = `In‑page keyword scanning ${keywordScanEnabled ? 'On' : 'Off'}`;
    } catch (e) { /* ignore */ }
  };

  const handleKeywordScanToggleChange = async (e) => {
    const enabled = !!e.target.checked;
    await chrome.storage.local.set({ keywordScanEnabled: enabled });
    const label = el.keywordScanLabel();
    if (label) label.textContent = `In‑page keyword scanning ${enabled ? 'On' : 'Off'}`;
    window.showToast?.(`Keyword scanning ${enabled ? 'enabled' : 'disabled'}`);
    // Ask active tab's content script (if any) to re-evaluate / self-disable. We'll send a ping.
    chrome.runtime.sendMessage({ action: 'keywordScanSettingChanged', enabled }).catch(() => {});
  };

  const ensureAuthenticated = async (showErrors = false) => {
    try {
      const { token } = await window.TokenStorage?.getToken?.() || await chrome.storage.local.get(['tm_auth_token']);
      if (!token || !(await window.Auth?.isAuthenticated?.().catch(() => false))) {
        const success = await window.Auth?.authenticateUser?.().catch(() => false);
        if (!success && showErrors) window.showError?.('Please sign in to use Website Guard');
        return success;
      }
      return true;
    } catch (e) {
      if (showErrors) window.showError?.('Please sign in to use Website Guard');
      return false;
    }
  };

  const getUserCredentials = async () => {
    const { token, email: userEmail } = await window.TokenStorage?.getToken?.() || await chrome.storage.local.get(['tm_auth_token', 'userEmail']);
    return token && userEmail ? { userEmail, token } : null;
  };

  const fetchBackendData = async (endpoint, userEmail, token) => {
    const resp = await fetch(`${await resolveBackendUrl()}/api/${endpoint}`, {
      headers: { 'Content-Type': 'application/json', 'x-user-email': userEmail, Authorization: `Bearer ${token}` }
    });
    if (!resp.ok) throw new Error(resp.status === 403 ? 'HTTP 403: Premium subscription required' : `HTTP ${resp.status}`);
    return await resp.json();
  };

  const syncToDatabase = async (endpoint, item, config) => {
    if (!isPremium) return window.showToast?.('Backend sync requires a premium subscription', 'warning');
    const { userEmail, token } = await getUserCredentials();
    const key = endpoint.includes('sites') ? 'domain' : 'keyword';
    const resp = await fetch(`${await resolveBackendUrl()}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-email': userEmail, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...config, [key]: item })
    });
    if (!resp.ok) throw new Error(resp.status === 403 ? 'HTTP 403: Premium subscription required' : `HTTP ${resp.status}`);
  };

  const deleteFromDatabase = async (endpoint, item) => {
    if (!isPremium) return window.showToast?.('Backend sync requires a premium subscription', 'warning');
    const { userEmail, token } = await getUserCredentials();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const list = await fetch(`${await resolveBackendUrl()}/api/${endpoint}`, { headers });
    if (!list.ok) throw new Error(list.status === 403 ? 'HTTP 403: Premium subscription required' : `HTTP ${list.status}`);
    const data = await list.json();
    const key = endpoint.includes('sites') ? 'domain' : 'keyword';
    const items = endpoint.includes('sites') ? data.blockedSites : data.blockedKeywords;
    const target = items?.find(i => i[key].toLowerCase() === item.toLowerCase());
    if (!target?._id) return;
    const resp = await fetch(`${await resolveBackendUrl()}/api/${endpoint}/${encodeURIComponent(target._id)}`, { method: 'DELETE', headers });
    if (!resp.ok) throw new Error(resp.status === 403 ? 'HTTP 403: Premium subscription required' : `HTTP ${resp.status}`);
  };

  const refreshItemsAndStats = async () => {
    if (!await ensureAuthenticated(false)) return;
    let sites = [], keywords = [];
    try {
      [sites, keywords] = await Promise.all([
        new Promise(r => chrome.runtime.sendMessage({ action: 'getBlockedSites' }, res => r(res?.sites || []))),
        new Promise(r => chrome.runtime.sendMessage({ action: 'getBlockedKeywords' }, res => r(res?.keywords || [])))
      ]);
      if (isPremium) {
        const { userEmail, token } = await getUserCredentials();
        await Promise.all([syncSitesFromDatabase(userEmail, token), syncKeywordsFromDatabase(userEmail, token)]);
        [sites, keywords] = await Promise.all([
          new Promise(r => chrome.runtime.sendMessage({ action: 'getBlockedSites' }, res => r(res?.sites || []))),
          new Promise(r => chrome.runtime.sendMessage({ action: 'getBlockedKeywords' }, res => r(res?.keywords || [])))
        ]);
      }
    } catch (e) {
      if (e.message.includes('HTTP 403')) {
        isPremium = false;
        window.showToast?.('Site blocking requires a premium subscription. Upgrade at https://x.ai/grok.', 'warning');
      } else {
        window.showError?.(`Failed to sync: ${e.message}`);
      }
    }
    displayItems(sites, keywords);
    updateBlockingStatus(sites, keywords);
    updateStats(sites, keywords);
  };

  const syncSitesFromDatabase = async (userEmail, token) => {
    const { blockedSites } = await fetchBackendData('blocked-sites', userEmail, token);
    const sitesMap = new Map(blockedSites.map(s => [s.domain, { enabled: s.enabled, blockType: s.blockType, blockDuring: s.blockDuring, redirectUrl: s.redirectUrl }]));
    await new Promise(r => chrome.runtime.sendMessage({ action: 'syncBlockedSites', sites: Array.from(sitesMap.entries()) }, r));
  };

  const syncKeywordsFromDatabase = async (userEmail, token) => {
    const { blockedKeywords } = await fetchBackendData('blocked-keywords', userEmail, token);
    const kwMap = new Map(blockedKeywords.map(k => [k.keyword, { enabled: k.enabled, blockType: k.blockType, blockDuring: k.blockDuring, redirectUrl: k.redirectUrl }]));
    await new Promise(r => chrome.runtime.sendMessage({ action: 'syncBlockedKeywords', keywords: Array.from(kwMap.entries()) }, r));
  };

  const displayItems = (sites, keywords) => {
    const list = el.list();
    if (!list) return;
    const normSites = (Array.isArray(sites) ? sites.map(i => Array.isArray(i) ? i[0] : i).filter(Boolean) : []);
    const normKeywords = (Array.isArray(keywords) ? keywords.map(i => Array.isArray(i) ? i[0] : i).filter(Boolean) : []);
    const total = normSites.length + normKeywords.length;
    el.sitesCount()?.setTextContent(total);
    el.count()?.setTextContent(`Blocked Items (${total})`);
    list.setInnerHTML(total ? [
      ...normSites.map(d => `
        <div class="blocked-item">
          <div class="blocked-item-info">
            <span class="block-badge url">Website</span>
            <span class="blocked-item-name">${d}</span>
          </div>
          <button class="action-btn delete" data-domain="${d}" data-type="site" title="Remove">🗑</button>
        </div>`),
      ...normKeywords.map(k => `
        <div class="blocked-item">
          <div class="blocked-item-info">
            <span class="block-badge keyword">Keyword</span>
            <span class="blocked-item-name">${k}</span>
          </div>
          <button class="action-btn delete" data-keyword="${k}" data-type="keyword" title="Remove">🗑</button>
        </div>`)
    ].join('') : `
      <div class="empty-state">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="M9 12l2 2 4-4"/>
        </svg>
        <div>No blocked items yet</div>
        <div>Add a website or keyword above</div>
      </div>`);
  };

  const updateBlockingStatus = (sites, keywords) => {
    const status = el.status();
    if (!status) return;
    const activeSites = (Array.isArray(sites) ? sites.filter(i => Array.isArray(i) ? i[1]?.enabled : true).length : 0);
    const activeKeywords = (Array.isArray(keywords) ? keywords.filter(i => Array.isArray(i) ? i[1]?.enabled : true).length : 0);
    const total = activeSites + activeKeywords;
    status.setTextContent(total ? `${activeSites} site(s) and ${activeKeywords} keyword(s) blocked` : 'No sites or keywords blocked');
    status.className = `blocking-status${total ? '' : ' inactive'}`;
  };

  const updateStats = async (sites, keywords) => {
    const total = (Array.isArray(sites) ? sites.length : 0) + (Array.isArray(keywords) ? keywords.length : 0);
    el.sitesCount()?.setTextContent(total);
    el.count()?.setTextContent(`Blocked Items (${total})`);
    document.getElementById('blockedToday')?.setTextContent('0');
    document.getElementById('timeSaved')?.setTextContent('0m');
  };

  const addItem = async (type, value, action, endpoint) => {
    if (!await ensureAuthenticated(true)) throw new Error('Authentication required');
    const config = { enabled: true, blockType: 'focus-only', blockDuring: { focusSessions: true, breakTime: false }, redirectUrl: 'chrome://newtab' };
    const res = await new Promise(r => chrome.runtime.sendMessage({ action, [type]: value, config }, r));
    if (!res?.success) throw new Error(`Failed to add ${type}`);
    if (isPremium) await syncToDatabase(endpoint, value, config).catch(e => {
      if (e.message.includes('HTTP 403')) isPremium = false, window.showToast?.(`Item added locally; premium subscription required`, 'warning');
      else throw e;
    });
    await refreshItemsAndStats();
    chrome.runtime.sendMessage({ action: 'recheckBlockActiveTab' }).catch(() => {});
    window.showToast?.(`${type === 'domain' ? value : `Keyword "${value}"`} added`);
  };

  const removeItem = async (type, value, action, endpoint) => {
    if (!await ensureAuthenticated(true)) throw new Error('Authentication required');
    const res = await new Promise(r => chrome.runtime.sendMessage({ action, [type]: value }, r));
    if (!res?.success) throw new Error(`Failed to remove ${type}`);
    if (isPremium) await deleteFromDatabase(endpoint, value).catch(e => {
      if (e.message.includes('HTTP 403')) isPremium = false, window.showToast?.(`Item removed locally; premium subscription required`, 'warning');
      else throw e;
    });
    await refreshItemsAndStats();
    window.showToast?.(`${type === 'domain' ? value : `Keyword "${value}"`} removed`);
  };

  const addSite = domain => addItem('domain', domain.replace(/^www\./, ''), 'addBlockedSite', 'blocked-sites');
  const addKeyword = keyword => addItem('keyword', keyword, 'addBlockedKeyword', 'blocked-keywords');
  const removeSite = domain => removeItem('domain', domain, 'removeBlockedSite', 'blocked-sites');
  const removeKeyword = keyword => removeItem('keyword', keyword, 'removeBlockedKeyword', 'blocked-keywords');

  Element.prototype.setTextContent = function(v) { if (this) this.textContent = v; };
  Element.prototype.setInnerHTML = function(v) { if (this) this.innerHTML = v; };

  const cleanup = () => {
    el.addBtn()?.removeEventListener('click', handleQuickAdd);
    el.list()?.removeEventListener('click', handleItemAction);
    el.keywordScanToggle()?.removeEventListener('change', handleKeywordScanToggleChange);
    initialized = false;
  };

  return {
    init, show, loadItems: refreshItemsAndStats,
    loadSitesFromDatabase: () => isPremium ? syncSitesFromDatabase() : Promise.resolve(),
    loadKeywordsFromDatabase: () => isPremium ? syncKeywordsFromDatabase() : Promise.resolve(),
    displayItems, updateBlockingStatus, updateStats,
    addSite, addKeyword, removeSite, removeKeyword,
    deleteSiteFromDatabase: domain => isPremium ? deleteFromDatabase('blocked-sites', domain) : Promise.resolve(),
    deleteKeywordFromDatabase: keyword => isPremium ? deleteFromDatabase('blocked-keywords', keyword) : Promise.resolve(),
    cleanup
  };
})();

if (typeof window !== 'undefined') window.GuardTab = GuardTab;