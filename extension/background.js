console.log("Background script loaded");

// Simple storage for blocked sites and keywords
let blockedSites = new Map();
let blockedKeywords = new Map();

// Simple pomodoro state
let pomodoroState = { 
	running: false, 
	mode: "work", 
	endsAt: null, 
	sessionStartTime: null 
};
let pomodoroInterval = null;

// Pomodoro functions
function startPomodoroCycle() {
	const duration = 25 * 60 * 1000; // 25 minutes
	pomodoroState = {
		running: true,
		mode: "work",
		endsAt: Date.now() + duration,
		sessionStartTime: Date.now()
	};
  
	pomodoroInterval = setTimeout(() => {
		pomodoroState.running = false;
		console.log("Pomodoro session completed!");
	}, duration);
  
	console.log("Pomodoro timer started for 25 minutes");
}

function stopPomodoroCycle() {
	if (pomodoroInterval) {
		clearTimeout(pomodoroInterval);
		pomodoroInterval = null;
	}
	pomodoroState.running = false;
	console.log("Pomodoro timer stopped");
}

// Initialize storage
async function initializeStorage() {
	try {
		console.log('🔄 Initializing storage...');
		const result = await chrome.storage.local.get(['blockedSites', 'blockedKeywords']);
    
		if (result.blockedSites && Array.isArray(result.blockedSites)) {
			blockedSites = new Map(result.blockedSites);
			console.log(`✅ Loaded ${blockedSites.size} blocked sites`);
		} else {
			console.log('ℹ️ No blocked sites found, starting fresh');
		}
    
		if (result.blockedKeywords && Array.isArray(result.blockedKeywords)) {
			blockedKeywords = new Map(result.blockedKeywords);
			console.log(`✅ Loaded ${blockedKeywords.size} blocked keywords`);
		} else {
			console.log('ℹ️ No blocked keywords found, starting fresh');
		}
    
		console.log('✅ Storage initialized successfully');
	} catch (error) {
		console.error('❌ Error initializing storage:', error);
		// Initialize empty maps as fallback
		blockedSites = new Map();
		blockedKeywords = new Map();
	}
}

// Enhanced keyword blocking - Check if a site should be blocked
async function checkBlockedSite(url) {
	if (!url) return { blocked: false };
  
	try {
		const urlObj = new URL(url);
		const domain = urlObj.hostname.replace(/^www\./, '').toLowerCase();
		const fullUrl = url.toLowerCase();
		const pathname = urlObj.pathname.toLowerCase();
		const search = urlObj.search.toLowerCase();
    
		console.log(`🔍 Checking URL: ${url}`);
		console.log(`📍 Domain: ${domain}`);
		console.log(`📂 Path: ${pathname}`);
    
		// Check direct domain blocking first
		for (const [blockedDomain, config] of blockedSites) {
			if (config.enabled) {
				const blockedDomainLower = blockedDomain.toLowerCase();
				if (domain === blockedDomainLower || domain.endsWith('.' + blockedDomainLower)) {
					console.log(`🚫 Site blocked by domain rule: ${blockedDomain}`);
					return { blocked: true, type: 'site', item: blockedDomain };
				}
			}
		}

		// Enhanced keyword blocking - check multiple parts of URL
		for (const [keyword, config] of blockedKeywords) {
			if (config.enabled) {
				const keywordLower = keyword.toLowerCase();
				console.log(`🔍 Checking keyword: "${keywordLower}"`);
        
				// Check if keyword is in domain
				if (domain.includes(keywordLower)) {
					console.log(`🚫 Keyword "${keyword}" found in domain: ${domain}`);
					return { blocked: true, type: 'keyword', item: keyword };
				}
        
				// Check if keyword is in full URL
				if (fullUrl.includes(keywordLower)) {
					console.log(`🚫 Keyword "${keyword}" found in URL: ${fullUrl}`);
					return { blocked: true, type: 'keyword', item: keyword };
				}
        
				// Check if keyword is in path
				if (pathname.includes(keywordLower)) {
					console.log(`🚫 Keyword "${keyword}" found in path: ${pathname}`);
					return { blocked: true, type: 'keyword', item: keyword };
				}
        
				// Check if keyword is in search parameters
				if (search.includes(keywordLower)) {
					console.log(`🚫 Keyword "${keyword}" found in search: ${search}`);
					return { blocked: true, type: 'keyword', item: keyword };
				}
			}
		}
    
		console.log(`✅ URL allowed: ${url}`);
		return { blocked: false };
	} catch (error) {
		console.error('❌ Error checking blocked site:', error);
		return { blocked: false };
	}
}

// Block a website
async function blockWebsite(tab, blockInfo) {
	try {
		if (!tab || !tab.id) {
			console.error('❌ Invalid tab provided to blockWebsite');
			return;
		}
    
		const domain = getDomainFromUrl(tab.url) || 'unknown';
		const blockedPageUrl = chrome.runtime.getURL('blocked.html') + 
			'?domain=' + encodeURIComponent(domain) + 
			'&type=' + encodeURIComponent(blockInfo.type) + 
			'&item=' + encodeURIComponent(blockInfo.item);
    
		await chrome.tabs.update(tab.id, { url: blockedPageUrl });
		console.log(`✅ Blocked access to ${domain} (${blockInfo.type}: ${blockInfo.item})`);
	} catch (error) {
		console.error('❌ Error blocking website:', error);
		try {
			// Fallback to new tab
			if (tab && tab.id) {
				await chrome.tabs.update(tab.id, { url: 'chrome://newtab/' });
				console.log('🔄 Fallback: Redirected to new tab');
			}
		} catch (fallbackError) {
			console.error('❌ Fallback failed:', fallbackError);
		}
	}
}

// Get domain from URL
function getDomainFromUrl(url) {
	if (!url) return null;
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return null;
	}
}

// Message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	console.log('📨 Received message:', msg);
  
	if (msg?.action === "getPomodoroState") {
		sendResponse({ state: pomodoroState });
		return true;
	}

	if (msg?.action === "togglePomodoro") {
		pomodoroState.running ? stopPomodoroCycle() : startPomodoroCycle();
		sendResponse({ state: pomodoroState });
		return true;
	}

	if (msg?.action === "addBlockedSite") {
		const { domain, config } = msg;
		if (!domain) {
			sendResponse({ success: false, error: 'No domain provided' });
			return true;
		}
		blockedSites.set(domain, { enabled: true, ...config });
		chrome.storage.local.set({ blockedSites: Array.from(blockedSites.entries()) })
			.then(() => {
				console.log(`✅ Added blocked site: ${domain}`);
				sendResponse({ success: true });
			})
			.catch(error => {
				console.error('❌ Error saving blocked site:', error);
				sendResponse({ success: false, error: error.message });
			});
		return true;
	}

	if (msg?.action === "addBlockedKeyword") {
		const { keyword, config } = msg;
		if (!keyword) {
			sendResponse({ success: false, error: 'No keyword provided' });
			return true;
		}
		blockedKeywords.set(keyword, { enabled: true, ...config });
		chrome.storage.local.set({ blockedKeywords: Array.from(blockedKeywords.entries()) })
			.then(() => {
				console.log(`✅ Added blocked keyword: ${keyword}`);
				sendResponse({ success: true });
			})
			.catch(error => {
				console.error('❌ Error saving blocked keyword:', error);
				sendResponse({ success: false, error: error.message });
			});
		return true;
	}

	if (msg?.action === "getBlockedSites") {
		sendResponse({ sites: Array.from(blockedSites.entries()) });
		return true;
	}

	if (msg?.action === "getBlockedKeywords") {
		sendResponse({ keywords: Array.from(blockedKeywords.entries()) });
		return true;
	}

	if (msg?.action === "removeBlockedSite") {
		const { domain } = msg;
		if (!domain) {
			sendResponse({ success: false, error: 'No domain provided' });
			return true;
		}
		blockedSites.delete(domain);
		chrome.storage.local.set({ blockedSites: Array.from(blockedSites.entries()) })
			.then(() => {
				console.log(`✅ Removed blocked site: ${domain}`);
				sendResponse({ success: true });
			})
			.catch(error => {
				console.error('❌ Error removing blocked site:', error);
				sendResponse({ success: false, error: error.message });
			});
		return true;
	}

	if (msg?.action === "removeBlockedKeyword") {
		const { keyword } = msg;
		if (!keyword) {
			sendResponse({ success: false, error: 'No keyword provided' });
			return true;
		}
		blockedKeywords.delete(keyword);
		chrome.storage.local.set({ blockedKeywords: Array.from(blockedKeywords.entries()) })
			.then(() => {
				console.log(`✅ Removed blocked keyword: ${keyword}`);
				sendResponse({ success: true });
			})
			.catch(error => {
				console.error('❌ Error removing blocked keyword:', error);
				sendResponse({ success: false, error: error.message });
			});
		return true;
	}

	if (msg?.action === "toggleBlockedSite") {
		const { domain } = msg;
		const siteConfig = blockedSites.get(domain);
		if (siteConfig) {
			siteConfig.enabled = !siteConfig.enabled;
			chrome.storage.local.set({ blockedSites: Array.from(blockedSites.entries()) })
				.then(() => {
					console.log(`✅ Toggled blocked site: ${domain} -> ${siteConfig.enabled}`);
					sendResponse({ success: true, enabled: siteConfig.enabled });
				})
				.catch(error => {
					console.error('❌ Error toggling blocked site:', error);
					sendResponse({ success: false, error: error.message });
				});
		} else {
			sendResponse({ success: false, error: 'Site not found' });
		}
		return true;
	}

	if (msg?.action === "toggleBlockedKeyword") {
		const { keyword } = msg;
		const keywordConfig = blockedKeywords.get(keyword);
		if (keywordConfig) {
			keywordConfig.enabled = !keywordConfig.enabled;
			chrome.storage.local.set({ blockedKeywords: Array.from(blockedKeywords.entries()) })
				.then(() => {
					console.log(`✅ Toggled blocked keyword: ${keyword} -> ${keywordConfig.enabled}`);
					sendResponse({ success: true, enabled: keywordConfig.enabled });
				})
				.catch(error => {
					console.error('❌ Error toggling blocked keyword:', error);
					sendResponse({ success: false, error: error.message });
				});
		} else {
			sendResponse({ success: false, error: 'Keyword not found' });
		}
		return true;
	}

	// Unknown action
	console.log('❓ Unknown action:', msg?.action);
	sendResponse({ success: false, error: 'Unknown action' });
	return true;
});

	// Resolve backend URL from overrides or defaults
	async function getBackendBaseUrl() {
		try {
			const { tmBackendUrl, tmEnvOverride } = await chrome.storage.local.get(['tmBackendUrl', 'tmEnvOverride']);
			if (tmBackendUrl && /^https?:\/\//i.test(tmBackendUrl)) {
				return tmBackendUrl.replace(/\/$/, '');
			}
			// Fallback to env override
			if (tmEnvOverride === 'development') {
				return 'http://localhost:3000';
			}
		} catch (e) {
			console.warn('getBackendBaseUrl fallback:', e?.message || e);
		}
		// Default to production API
		return 'https://timemachine-1.onrender.com';
	}

	// Listen separately for long-lived async actions
	chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
		if (!msg || !msg.action) return; 

		// Handle category update by calling backend directly from service worker
		if (msg.action === 'updateCategory') {
			(async () => {
				try {
					const { tm_auth_token, userEmail } = await chrome.storage.local.get(['tm_auth_token', 'userEmail']);
					if (!tm_auth_token || !userEmail) {
						return sendResponse({ status: 'error', error: 'Not authenticated' });
					}
					const base = await getBackendBaseUrl();
					const res = await fetch(`${base}/api/time-data/category`, {
						method: 'PATCH',
						headers: {
							'Content-Type': 'application/json',
							'Authorization': `Bearer ${tm_auth_token}`
						},
						body: JSON.stringify({
							userEmail,
							date: msg.date,
							domain: msg.domain,
							category: msg.category
						})
					});
					if (!res.ok) {
						const j = await res.json().catch(() => ({}));
						return sendResponse({ status: 'error', error: j.error || `HTTP ${res.status}` });
					}
					return sendResponse({ status: 'success' });
				} catch (e) {
					console.error('updateCategory error:', e);
					return sendResponse({ status: 'error', error: e?.message || String(e) });
				}
			})();
			return true; // keep the message channel open for async response
		}
	});

// Enhanced tab listeners for comprehensive blocking
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	try {
		// Check when URL changes or page is loading/complete
		if (changeInfo.url || (changeInfo.status === 'loading' && tab.url)) {
			const urlToCheck = changeInfo.url || tab.url;
      
			// Skip extension pages and chrome:// URLs
			if (urlToCheck.startsWith('chrome://') || urlToCheck.startsWith('chrome-extension://')) {
				return;
			}
      
			console.log(`📋 Tab ${tabId} updated - URL: ${urlToCheck}, Status: ${changeInfo.status}`);
      
			const blockInfo = await checkBlockedSite(urlToCheck);
			if (blockInfo.blocked) {
				console.log(`🚫 Blocking tab ${tabId}: ${blockInfo.type} - ${blockInfo.item}`);
				await blockWebsite(tab, blockInfo);
			}
		}
	} catch (error) {
		console.error('❌ Error in tabs.onUpdated listener:', error);
	}
});

// Also check when user switches tabs (for comprehensive coverage)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
	try {
		const tab = await chrome.tabs.get(activeInfo.tabId);
		if (tab.url) {
			// Skip extension pages and chrome:// URLs
			if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
				return;
			}
      
			console.log(`👆 User activated tab ${activeInfo.tabId}: ${tab.url}`);
			const blockInfo = await checkBlockedSite(tab.url);
			if (blockInfo.blocked) {
				console.log(`🚫 Blocking activated tab: ${blockInfo.type} - ${blockInfo.item}`);
				await blockWebsite(tab, blockInfo);
			}
		}
	} catch (error) {
		console.error('❌ Error in tabs.onActivated listener:', error);
	}
});

// Debug: Log all blocked sites and keywords on startup
setTimeout(async () => {
	try {
		console.log('🛡️ Current blocked sites:', Array.from(blockedSites.entries()));
		console.log('🔍 Current blocked keywords:', Array.from(blockedKeywords.entries()));
    
		// Test storage access
		const testResult = await chrome.storage.local.get(['blockedSites']);
		console.log('🧪 Storage test successful');
	} catch (error) {
		console.error('❌ Debug check failed:', error);
	}
}, 2000);

// Initialize when extension starts
initializeStorage()
	.then(() => {
		console.log("✅ Background script fully initialized");
	})
	.catch(error => {
		console.error("❌ Background script initialization failed:", error);
	});