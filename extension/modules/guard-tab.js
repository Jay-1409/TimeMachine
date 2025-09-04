import { resolveBackendUrl } from "./api.js";

export const GuardTab = (() => {
  let initialized = false;

  // Lazy DOM getters
  const el = {
    get container() { return document.getElementById("guardTabContent"); },
    get blockedItemsList() { return document.getElementById("blockedItemsList"); },
    get addBlockedSiteBtn() { return document.getElementById("addBlockedSite"); },
    get blockedCount() { return document.getElementById("blockedCount"); },
    get blockedSitesCount() { return document.getElementById("blockedSitesCount"); },
    get blockingStatus() { return document.getElementById("blockingStatus"); },
    get quickAddBtn() { return document.getElementById("addBlockBtn"); },
    get quickInput() { return document.getElementById("blockInput"); }
  };

  async function init() {
    if (initialized) return;
    initialized = true;
    bindEvents();
  }

  function bindEvents() {
    el.quickAddBtn?.addEventListener("click", handleQuickAdd);
    el.blockedItemsList?.addEventListener("click", handleItemAction);
  }

  function handleQuickAdd() {
    const raw = el.quickInput?.value.trim();
    if (!raw) {
      window.showToast?.("Enter a website or keyword", "error");
      el.quickInput?.focus();
      return;
    }
    const isSite = /\.|\//.test(raw);
    const value = isSite 
      ? raw.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/.*/, "")
      : raw.toLowerCase();
    
    isSite ? addSite(value) : addKeyword(value);
    el.quickInput.value = "";
  }

  function handleItemAction(e) {
    const btn = e.target.closest(".action-btn.delete");
    if (!btn) return;
    const { type, domain, keyword } = btn.dataset;
    if (type === "site" && domain) removeSite(domain);
    if (type === "keyword" && keyword) removeKeyword(keyword);
  }

  async function show() {
    el.container?.classList.add("active");
    await init();
    await refreshItemsAndStats();
  }

  async function fetchBackendData(endpoint, userEmail, token) {
    try {
      const backend = await resolveBackendUrl();
      const headers = {
        "Content-Type": "application/json",
        "x-user-email": userEmail,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };
      const resp = await fetch(`${backend}/api/${endpoint}`, { headers });
      return resp.ok ? await resp.json() : {};
    } catch (e) {
      console.error(`GuardTab.fetchBackendData(${endpoint}) error:`, e);
      return {};
    }
  }

  async function syncToDatabase(endpoint, item, config, method = "POST") {
    const { userEmail, tm_auth_token } = await chrome.storage.local.get(["userEmail", "tm_auth_token"]);
    if (!userEmail) return;
    try {
      const backend = await resolveBackendUrl();
      await fetch(`${backend}/api/${endpoint}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-user-email": userEmail,
          ...(tm_auth_token ? { Authorization: `Bearer ${tm_auth_token}` } : {})
        },
        body: JSON.stringify({ ...config, [endpoint.includes("sites") ? "domain" : "keyword"]: item })
      });
    } catch (e) {
      console.error(`GuardTab.syncToDatabase(${endpoint}) error:`, e);
    }
  }

  async function deleteFromDatabase(endpoint, item) {
    const { userEmail, tm_auth_token } = await chrome.storage.local.get(["userEmail", "tm_auth_token"]);
    if (!userEmail || !tm_auth_token) return;
    try {
      const backend = await resolveBackendUrl();
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${tm_auth_token}` };
      const list = await fetch(`${backend}/api/${endpoint}`, { headers });
      if (!list.ok) return;
      const data = await list.json();
      const key = endpoint.includes("sites") ? "domain" : "keyword";
      const items = endpoint.includes("sites") ? data.blockedSites : data.blockedKeywords;
      const target = items?.find(i => i[key].toLowerCase() === item.toLowerCase());
      if (!target?._id) return;
      await fetch(`${backend}/api/${endpoint}/${encodeURIComponent(target._id)}`, { method: "DELETE", headers });
    } catch (e) {
      console.error(`GuardTab.deleteFromDatabase(${endpoint}) error:`, e);
    }
  }

  async function refreshItemsAndStats() {
    try {
      const [sites, keywords] = await Promise.all([
        new Promise(r => chrome.runtime.sendMessage({ action: "getBlockedSites" }, res => r(res?.sites || []))),
        new Promise(r => chrome.runtime.sendMessage({ action: "getBlockedKeywords" }, res => r(res?.keywords || [])))
      ]);
      displayItems(sites, keywords);
      updateBlockingStatus(sites, keywords);
      
      const { userEmail, tm_auth_token } = await chrome.storage.local.get(["userEmail", "tm_auth_token"]);
      if (userEmail) {
        await Promise.all([
          syncSitesFromDatabase(userEmail, tm_auth_token),
          syncKeywordsFromDatabase(userEmail, tm_auth_token)
        ]);
        const [updatedSites, updatedKeywords] = await Promise.all([
          new Promise(r => chrome.runtime.sendMessage({ action: "getBlockedSites" }, res => r(res?.sites || []))),
          new Promise(r => chrome.runtime.sendMessage({ action: "getBlockedKeywords" }, res => r(res?.keywords || [])))
        ]);
        displayItems(updatedSites, updatedKeywords);
        updateBlockingStatus(updatedSites, updatedKeywords);
      }
      updateStats(sites.length + keywords.length);
    } catch (e) {
      console.error("GuardTab.refreshItemsAndStats error:", e);
    }
  }

  async function syncSitesFromDatabase(userEmail, token) {
    const data = await fetchBackendData("blocked-sites", userEmail, token);
    const sitesMap = new Map((data.blockedSites || []).map(site => [
      site.domain,
      { enabled: site.enabled, blockType: site.blockType, blockDuring: site.blockDuring, redirectUrl: site.redirectUrl }
    ]));
    await new Promise(r => chrome.runtime.sendMessage({ action: "syncBlockedSites", sites: Array.from(sitesMap.entries()) }, r));
  }

  async function syncKeywordsFromDatabase(userEmail, token) {
    const data = await fetchBackendData("blocked-keywords", userEmail, token);
    const kwMap = new Map((data.blockedKeywords || []).map(k => [
      k.keyword,
      { enabled: k.enabled, blockType: k.blockType, blockDuring: k.blockDuring, redirectUrl: k.redirectUrl }
    ]));
    await new Promise(r => chrome.runtime.sendMessage({ action: "syncBlockedKeywords", keywords: Array.from(kwMap.entries()) }, r));
  }

  function displayItems(sites, keywords) {
    const list = el.blockedItemsList;
    if (!list) return;
    const totalItems = (sites?.length || 0) + (keywords?.length || 0);
    el.blockedCount && (el.blockedCount.textContent = totalItems);
    el.blockedSitesCount && (el.blockedSitesCount.textContent = totalItems);
    
    if (totalItems === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-graphic" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
          </div>
          <div>No blocked items yet</div>
          <div>Add a website or keyword above</div>
        </div>`;
      return;
    }

    list.innerHTML = [
      ...sites.map(([domain]) => `
        <div class="blocked-item">
          <div class="blocked-item-info">
            <span class="block-badge url">Website</span>
            <span class="blocked-item-name">${domain}</span>
          </div>
          <div class="blocked-item-actions">
            <button class="action-btn delete" data-domain="${domain}" data-type="site" title="Remove">🗑</button>
          </div>
        </div>`),
      ...keywords.map(([keyword]) => `
        <div class="blocked-item">
          <div class="blocked-item-info">
            <span class="block-badge keyword">Keyword</span>
            <span class="blocked-item-name">${keyword}</span>
          </div>
          <div class="blocked-item-actions">
            <button class="action-btn delete" data-keyword="${keyword}" data-type="keyword" title="Remove">🗑</button>
          </div>
        </div>`)
    ].join("");
  }

  function updateBlockingStatus(sites, keywords) {
    if (!el.blockingStatus) return;
    const activeSites = (sites || []).filter(([_, cfg]) => cfg.enabled).length;
    const activeKeywords = (keywords || []).filter(([_, cfg]) => cfg.enabled).length;
    const totalActive = activeSites + activeKeywords;
    el.blockingStatus.textContent = totalActive > 0 
      ? `${activeSites} site(s) and ${activeKeywords} keyword(s) currently blocked`
      : "No sites or keywords currently blocked";
    el.blockingStatus.className = `blocking-status${totalActive ? "" : " inactive"}`;
  }

  async function updateStats(totalItems) {
    try {
      if (el.blockedSitesCount) el.blockedSitesCount.textContent = String(totalItems);
      if (document.getElementById("blockedToday")) document.getElementById("blockedToday").textContent = "0"; // Placeholder
      if (document.getElementById("timeSaved")) document.getElementById("timeSaved").textContent = "0m"; // Placeholder
    } catch (e) {
      console.error("GuardTab.updateStats error:", e);
    }
  }

  async function addItem(type, value, action, endpoint) {
    const config = {
      enabled: true,
      blockType: "focus-only",
      blockDuring: { focusSessions: true, breakTime: false },
      redirectUrl: "chrome://newtab"
    };
    await new Promise(r => chrome.runtime.sendMessage({ action, [type]: value, config }, async res => {
      if (res?.success) {
        window.showToast?.(`${type === "domain" ? value : `Keyword "${value}"`} added to blocked ${type}s`);
        await syncToDatabase(endpoint, value, config);
        await refreshItemsAndStats();
        chrome.runtime.sendMessage({ action: "recheckBlockActiveTab" }).catch(() => {});
      } else {
        window.showToast?.(`Failed to add blocked ${type}`, "error");
      }
      r();
    }));
  }

  async function removeItem(type, value, action, endpoint) {
    await new Promise(r => chrome.runtime.sendMessage({ action, [type]: value }, async res => {
      if (res?.success) {
        window.showToast?.(`${type === "domain" ? value : `Keyword "${value}"`} removed`);
        await deleteFromDatabase(endpoint, value);
        await refreshItemsAndStats();
      } else {
        window.showToast?.(`Failed to remove ${type}`, "error");
      }
      r();
    }));
  }

  const addSite = (domain) => addItem("domain", domain.replace(/^www\./, ""), "addBlockedSite", "blocked-sites");
  const addKeyword = (keyword) => addItem("keyword", keyword, "addBlockedKeyword", "blocked-keywords");
  const removeSite = (domain) => removeItem("domain", domain, "removeBlockedSite", "blocked-sites");
  const removeKeyword = (keyword) => removeItem("keyword", keyword, "removeBlockedKeyword", "blocked-keywords");

  async function toggleKeyword(keyword) {
    await new Promise(r => chrome.runtime.sendMessage({ action: "toggleBlockedKeyword", keyword }, async res => {
      if (res?.success) {
        window.showToast?.(`Keyword "${keyword}" ${res.enabled ? "blocked" : "unblocked"}`);
        await refreshItemsAndStats();
      }
      r();
    }));
  }

  return {
    init,
    show,
    loadItems: refreshItemsAndStats,
    loadSitesFromDatabase: () => syncSitesFromDatabase(),
    loadKeywordsFromDatabase: () => syncKeywordsFromDatabase(),
    displayItems,
    updateBlockingStatus,
    updateStats,
    addSite,
    addKeyword,
    toggleKeyword,
    removeSite,
    removeKeyword,
    deleteSiteFromDatabase: (domain) => deleteFromDatabase("blocked-sites", domain),
    deleteKeywordFromDatabase: (keyword) => deleteFromDatabase("blocked-keywords", keyword)
  };
})();

if (typeof window !== "undefined") window.GuardTab = GuardTab;