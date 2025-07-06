console.log("Background script loaded");

// Allowed categories (keeping this as it's used elsewhere)
const ALLOWED_CATEGORIES = ['Work', 'Social', 'Entertainment', 'Professional', 'Other'];

// Helper function to extract a valid domain from a URL
function getDomainFromUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    // Exclude internal browser pages and non-web protocols (e.g., 'chrome://', 'file://', 'about:')
    // Also, ensure the hostname is not empty
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
      return null; // Return null for non-web URLs or empty hostnames
    }
    // Remove 'www.' prefix for consistency
    return url.hostname.replace(/^www\./, "");
  } catch (e) {
    // Log errors for malformed URLs
    console.error("Error parsing URL to get domain:", urlStr, e);
    return null; // Return null for invalid URLs
  }
}

class TimeTracker {
  constructor() {
    this.defaultSiteCategories = {
      "github.com": "Work",
      "stackoverflow.com": "Work",
      "leetcode.com": "Work",
      "youtube.com": "Entertainment",
      "instagram.com": "Social",
      "chatgpt.com": "Work",
      "reddit.com": "Social",
      "twitter.com": "Social",
      "linkedin.com": "Professional",
      "netflix.com": "Entertainment",
      "codechef.com": "Work",
    };
    this.siteCategories = { ...this.defaultSiteCategories };
    this.activeSessions = {};
    this.initialize();
  }

  async initialize() {
    const data = await chrome.storage.local.get([
      "siteCategories",
      "activeSessions",
    ]);

    this.siteCategories = {
      ...this.defaultSiteCategories,
      ...(data.siteCategories || {}),
    };

    this.activeSessions = data.activeSessions || {};

    console.log(
      "TimeTracker initialized with site categories:",
      this.siteCategories
    );
    console.log("Active sessions:", this.activeSessions);

    await chrome.storage.local.set({ siteCategories: this.siteCategories });

    this.startPeriodicSync();
  }

  async handleTabChange(tab) {
    // Basic checks for tab existence and activity
    if (!tab?.url || !tab.active) return;

    const domain = getDomainFromUrl(tab.url); // Use the new helper function
    const tabId = tab.id.toString();
    const now = Date.now();

    // If the domain is invalid/untrackable, handle any existing session for this tabId
    if (!domain) {
      console.warn(`Skipping tab change for untrackable URL: ${tab.url}. Domain could not be extracted.`);
      if (this.activeSessions[tabId]) {
        // If there was an active session for this tab, attempt to save its duration
        const { domain: prevDomain, startTime: prevStartTime } = this.activeSessions[tabId];
        const duration = now - prevStartTime;
        // Only save if the previous domain was valid and duration positive
        if (prevDomain && typeof prevDomain === 'string' && prevDomain.trim() !== '' && duration > 0) {
          await this.saveSession(prevDomain, prevStartTime, now, duration);
        } else {
          console.log(`Clearing active session for untrackable tabId ${tabId} (prevDomain: '${prevDomain}', duration: ${duration}) without saving.`);
        }
        delete this.activeSessions[tabId];
        await chrome.storage.local.set({ activeSessions: this.activeSessions });
      }
      return; // Stop processing for this untrackable tab
    }

    console.log(`Tab changed to ${domain} (Tab ID: ${tabId})`);

    // End previous session if one existed for this tabId
    if (this.activeSessions[tabId]) {
      const { domain: prevDomain, startTime: prevStartTime } = this.activeSessions[tabId];
      const duration = now - prevStartTime;
      // Explicitly check prevDomain validity before saving
      if (prevDomain && typeof prevDomain === 'string' && prevDomain.trim() !== '' && duration > 0) {
        await this.saveSession(prevDomain, prevStartTime, now, duration);
      } else {
        console.warn(`Skipping saveSession for previous tab '${prevDomain}' (Tab ID: ${tabId}) due to invalid domain or non-positive duration: ${duration}`);
      }
      delete this.activeSessions[tabId];
    }

    // Start a new session for the current active tab
    this.activeSessions[tabId] = { domain, startTime: now };
    await chrome.storage.local.set({ activeSessions: this.activeSessions });
  }

  async saveSession(domain, startTime, endTime, duration, category = null) {
    try {
      // Enhanced validation at the entry point of saveSession
      if (!domain || typeof domain !== 'string' || domain.trim() === '' || typeof duration !== 'number' || duration <= 0) {
        console.warn(`Skipping saveSession for domain '${domain}': Invalid domain (empty/not string) or non-positive duration (${duration}).`);
        return;
      }

      const currentDate = new Date(startTime).toISOString().split("T")[0];
      const { userEmail } = await chrome.storage.local.get(["userEmail"]);
      if (!userEmail) {
        console.warn("No userEmail set, cannot save session to backend. Storing locally.");
        await this.storeSessionLocally(domain, startTime, endTime, duration, category);
        return;
      }

      const payload = {
        userEmail,
        date: currentDate,
        domain,
        sessions: [{ startTime, endTime, duration }],
        category: category || this.siteCategories[domain] || "Other",
      };

      console.log(`Attempting to save session for ${domain} to backend:`, payload);

      const response = await fetch("http://localhost:3000/api/time-data/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let responseBody;
      try {
        responseBody = await response.json();
      } catch (jsonError) {
        const text = await response.text();
        console.error(`Non-JSON response for ${domain} on ${currentDate} from /api/time-data/sync:`, {
          status: response.status,
          statusText: response.statusText,
          body: text.slice(0, 200) + (text.length > 200 ? '...' : ''),
          error: jsonError.message
        });
        await this.storeSessionLocally(domain, startTime, endTime, duration, category);
        return;
      }

      if (!response.ok) {
        console.error(`Backend sync failed for ${domain} on ${currentDate}: ${response.status} - ${JSON.stringify(responseBody)}. Storing locally.`, payload);
        await this.storeSessionLocally(domain, startTime, endTime, duration, category);
      } else {
        console.log(`Session saved successfully for ${domain} on ${currentDate}. Response:`, responseBody);
      }
    } catch (error) {
      console.error(`Critical error saving session for ${domain}:`, error);
      await this.storeSessionLocally(domain, startTime, endTime, duration, category);
    }
  }

  async storeSessionLocally(domain, start, end, duration, category = null) {
    try {
      // Also add domain validation here, just in case
      if (!domain || typeof domain !== 'string' || domain.trim() === '' || typeof duration !== 'number' || duration <= 0) {
        console.warn(`Skipping storeSessionLocally for domain '${domain}': Invalid domain (empty/not string) or non-positive duration (${duration}).`);
        return;
      }

      const currentDate = new Date(start).toISOString().split("T")[0];
      const { timeData = {} } = await chrome.storage.local.get(["timeData"]);
      const effectiveCategory = category || this.siteCategories[domain] || "Other";

      if (!timeData[currentDate]) timeData[currentDate] = {};
      if (!timeData[currentDate][domain]) {
        timeData[currentDate][domain] = {
          sessions: [],
          category: effectiveCategory,
        };
      } else if (!Array.isArray(timeData[currentDate][domain].sessions)) {
        console.warn(`Correcting corrupted 'sessions' data for ${domain} on ${currentDate}. It was not an array.`);
        timeData[currentDate][domain].sessions = [];
      }

      timeData[currentDate][domain].sessions.push({
        startTime: start,
        endTime: end,
        duration,
      });
      timeData[currentDate][domain].category = effectiveCategory;

      await chrome.storage.local.set({ timeData });
      console.log(`Stored session locally for ${domain} on ${currentDate}, category: ${effectiveCategory}`);
    } catch (error) {
      console.error("Error storing session locally:", error);
    }
  }

  async endAllSessions() {
    const now = Date.now();
    const sessionsToEnd = { ...this.activeSessions };

    console.log("Ending all active sessions:", sessionsToEnd);

    for (const tabId in sessionsToEnd) {
      const { domain, startTime } = sessionsToEnd[tabId];
      const duration = now - startTime;
      // Explicitly check for a valid domain before attempting to save
      if (domain && typeof domain === 'string' && domain.trim() !== '' && duration > 0) {
        await this.saveSession(domain, startTime, now, duration);
      } else {
        console.log(`Skipping ending session for '${domain || '[EMPTY/INVALID DOMAIN]'}' (Tab ID: ${tabId}) due to invalid domain or non-positive duration: ${duration}`);
      }
      delete this.activeSessions[tabId];
    }

    await chrome.storage.local.set({ activeSessions: this.activeSessions });
    console.log("All active sessions ended and cleared.");
  }

  async syncPendingData() {
    try {
      const { timeData = {}, userEmail } = await chrome.storage.local.get([
        "timeData",
        "userEmail",
      ]);

      if (!userEmail) {
        console.warn("Sync pending data skipped: No user email found.");
        return;
      }

      if (Object.keys(timeData).length === 0) {
        console.log("No pending time data to sync.");
        return;
      }

      console.log("Starting to sync pending time data...");

      const dataToSync = { ...timeData };

      for (const date in dataToSync) {
        if (!dataToSync[date] || typeof dataToSync[date] !== 'object') {
          console.warn(`Skipping malformed data for date: ${date}. Expected object, got ${typeof dataToSync[date]}`);
          delete dataToSync[date];
          continue;
        }

        for (const domain in dataToSync[date]) {
          const entry = dataToSync[date][domain];

          // Enhanced validation for domain within local storage entries
          if (!domain || typeof domain !== 'string' || domain.trim() === '' || !entry || !Array.isArray(entry.sessions)) {
            console.error(
              `Sync skipped for date: ${date}, domain: '${domain || '[EMPTY/INVALID DOMAIN]' }'. Missing or invalid critical fields for entry. (domain: '${domain}', entry_exists: ${!!entry}, sessions_is_array: ${Array.isArray(entry?.sessions)}).`
            );
            // Delete the problematic entry so it doesn't keep causing errors
            delete dataToSync[date][domain];
            continue;
          }

          const category = entry.category || this.siteCategories[domain] || "Other";

          const payload = {
            userEmail,
            date,
            domain,
            sessions: entry.sessions,
            category,
          };

          console.log(`Attempting to sync payload for ${domain} on ${date}:`, payload);

          const response = await fetch("http://localhost:3000/api/time-data/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          let responseBody;
          try {
            responseBody = await response.json();
          } catch (jsonError) {
            const text = await response.text();
            console.error(`Non-JSON response from /api/time-data/sync for ${domain} on ${date}:`, {
              status: response.status,
              statusText: response.statusText,
              body: text.slice(0, 200) + (text.length > 200 ? '...' : ''),
              error: jsonError.message
            });
            continue; // Keep the data locally if backend response is not valid JSON
          }

          if (response.ok) {
            console.log(`Successfully synced ${domain} on ${date}, category: ${category}. Response:`, responseBody);
            delete dataToSync[date][domain]; // Remove successfully synced data
          } else {
            console.error(`Sync failed for ${domain} on ${date}: ${response.status} - ${JSON.stringify(responseBody)}. Payload sent:`, payload);
            // Keep the data in dataToSync so it can be retried later
          }
        }
        if (Object.keys(dataToSync[date]).length === 0) {
          delete dataToSync[date]; // If all domains for a date are synced/removed, delete the date
        }
      }
      await chrome.storage.local.set({ timeData: dataToSync });
      console.log("Finished attempting to sync pending time data.");

    } catch (error) {
      console.error("Critical error in syncPendingData:", error);
    }
  }

  startPeriodicSync() {
    chrome.alarms.clear("periodicSync");
    chrome.alarms.create("periodicSync", { periodInMinutes: 5 });

    chrome.alarms.clear("endAllSessions");
    chrome.alarms.create("endAllSessions", { periodInMinutes: 15 });

    chrome.alarms.onAlarm.addListener(alarm => {
      if (alarm.name === "periodicSync") {
        this.syncPendingData();
      } else if (alarm.name === "endAllSessions") {
        this.endAllSessions();
      }
    });

    console.log("Periodic sync and end session alarms scheduled.");
  }

  async saveSiteCategories() {
    await chrome.storage.local.set({ siteCategories: this.siteCategories });
  }
}

const tracker = new TimeTracker();

// Event Listeners
chrome.runtime.onStartup.addListener(async () => {
  console.log("Browser started, restoring sessions and syncing pending data.");
  await tracker.endAllSessions();
  await tracker.syncPendingData();
});

chrome.runtime.onSuspend.addListener(async () => {
  console.log("Extension unloading, saving sessions and syncing pending data.");
  await tracker.endAllSessions();
  await tracker.syncPendingData();
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab) {
      tracker.handleTabChange(tab);
    } else {
      console.warn(`Tab with ID ${activeInfo.tabId} not found on activation.`);
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only trigger handleTabChange if the URL has actually changed, or if the tab has finished loading and is active
  // This prevents redundant calls and ensures a complete URL is available
  if (changeInfo.url || (changeInfo.status === "complete" && tab.active)) {
    tracker.handleTabChange(tab);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  // When a new tab is created, if it's active, handle it.
  // Note: new tabs often start with 'chrome://newtab/' or 'about:blank',
  // which `getDomainFromUrl` will correctly filter.
  if (tab.active) {
    tracker.handleTabChange(tab);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabIdStr = tabId.toString();
  if (tracker.activeSessions[tabIdStr]) {
    const { domain, startTime } = tracker.activeSessions[tabIdStr];
    const duration = Date.now() - startTime;
    // Ensure domain is valid before attempting to save a session for a removed tab
    if (domain && typeof domain === 'string' && domain.trim() !== '' && duration > 0) {
      await tracker.saveSession(domain, startTime, Date.now(), duration);
    } else {
      console.log(`Skipping ending session for removed tab ${tabIdStr} ('${domain || '[EMPTY/INVALID DOMAIN]'}') due to invalid domain or non-positive duration: ${duration}`);
    }
    delete tracker.activeSessions[tabIdStr];
    await chrome.storage.local.set({ activeSessions: tracker.activeSessions });
  }
});

chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener(async (state) => {
  console.log(`Idle state changed to: ${state}`);
  if (state === "idle" || state === "locked") {
    console.log("Browser is idle/locked, ending all sessions.");
    await tracker.endAllSessions();
  } else if (state === "active") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) {
        console.log("Browser is active, resuming tracking for active tab.");
        tracker.handleTabChange(tabs[0]);
      } else {
        console.log("Browser is active, but no active tab URL found to resume tracking.");
      }
    });
  }
});

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === "updateCategory") {
    const { domain, category, userEmail, date } = request;

    if (!domain || typeof domain !== 'string' || domain.trim() === '' || !category || !userEmail || !date) {
      console.error("Missing or invalid required fields for updateCategory:", {
        domain,
        category,
        userEmail,
        date,
      });
      sendResponse({ status: "error", error: "Missing or invalid required fields" });
      return true;
    }

    const validCategories = ALLOWED_CATEGORIES;
    if (!validCategories.includes(category)) {
      console.error("Invalid category for updateCategory:", category);
      sendResponse({ status: "error", error: "Invalid category" });
      return true;
    }

    try {
      tracker.siteCategories[domain] = category;
      await tracker.saveSiteCategories();
      console.log(`Local category updated for ${domain} to ${category}`);

      sendResponse({ status: "success" }); // Respond immediately as local update is done

      const endpoint = "http://localhost:3000/api/time-data/category";
      const payload = { userEmail, date, domain, category };

      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `Backend PATCH error for category update (${domain}): ${response.status} - ${errorText}. Storing locally.`
        );
        // Store locally if backend update fails. Note: duration 0 for category updates only
        await tracker.storeSessionLocally(
          domain,
          Date.now(),
          Date.now(),
          0,
          category
        );
      } else {
        console.log(
          `Category synced with backend for ${domain} to ${category}`
        );
      }
    } catch (error) {
      console.error(`Error updating category for ${domain}:`, error);
      // Store locally if a critical error occurs during category update
      await tracker.storeSessionLocally(
        domain,
        Date.now(),
        Date.now(),
        0,
        category
      );
    }
    return true; // Indicates that sendResponse will be called asynchronously
  }

  if (request.action === "sendFeedback") {
    const { message, userEmail } = request;
    fetch("http://localhost:3000/api/feedback/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, userEmail }),
    })
      .then((response) => response.json())
      .then((data) => sendResponse(data))
      .catch((error) =>
        sendResponse({ status: "error", error: error.message })
      );
    return true; // Indicates that sendResponse will be called asynchronously
  }
});