console.log("Background script loaded");

// Dynamic backend resolution (mirrors popup config approach)
let _backendCache = null;
async function resolveBackendUrl() {
  if (_backendCache) return _backendCache;
  try {
    // Support both legacy TMConfigOverrides and new tmBackendUrl key used by popup config
    const { TMConfigOverrides, tmBackendUrl } = await chrome.storage.local.get([
      "TMConfigOverrides",
      "tmBackendUrl",
    ]);
    const candidate = tmBackendUrl || TMConfigOverrides?.backendBaseUrl;
    if (candidate && typeof candidate === "string") {
      _backendCache = candidate.replace(/\/$/, "");
      return _backendCache;
    }
  } catch (e) {
    console.warn("resolveBackendUrl (background) override load failed:", e);
  }
  // Heuristic: if localhost host permission exists, prefer production unless explicit override
  _backendCache = "https://timemachine-1.onrender.com";
  return _backendCache;
}

async function backendFetch(path, options = {}) {
  const base = await resolveBackendUrl();
  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  // Add authentication token if available
  const { tm_auth_token } = await chrome.storage.local.get(["tm_auth_token"]);
  if (tm_auth_token && !options.headers?.Authorization) {
    if (!options.headers) options.headers = {};
    options.headers["Authorization"] = `Bearer ${tm_auth_token}`;
  }

  try {
    // Ensure headers object exists
    if (!options.headers) options.headers = {};
    // Default content type for JSON requests without body already specifying it
    if (options.body && !options.headers["Content-Type"]) {
      options.headers["Content-Type"] = "application/json";
    }
    const response = await fetch(url, options);
    if (!options.headers?.Authorization) {
      console.warn("backendFetch WITHOUT Authorization header ->", url);
    } else {
      console.log("backendFetch with Authorization header to", url);
    }

    // Handle token expiration
    if (response.status === 401) {
      const errorData = await response.json().catch(() => ({}));
      if (
        errorData.code === "TOKEN_EXPIRED" ||
        errorData.code === "AUTH_REQUIRED"
      ) {
        console.warn("Authentication expired, clearing stored token");
        await chrome.storage.local.remove(["tm_auth_token", "userEmail"]);
      }
    }

    return response;
  } catch (error) {
    console.error("Network error in backendFetch:", error);
    throw error;
  }
}

// --- Phase 1 Scaffolding: Pomodoro & Goals ---
const POMODORO_DEFAULTS = { workMinutes: 25, breakMinutes: 5 };
let pomodoroState = { running: false, mode: "work", endsAt: null };
let pomodoroInterval = null;

async function loadProductivitySettings() {
  const { pomodoroConfig, timeGoals } = await chrome.storage.local.get([
    "pomodoroConfig",
    "timeGoals",
  ]);
  if (pomodoroConfig) Object.assign(POMODORO_DEFAULTS, pomodoroConfig);
  return { timeGoals: timeGoals || {} };
}

function notify(id, title, message) {
  chrome.notifications?.create(
    id,
    {
      type: "basic",
      iconUrl: "icon48.png",
      title,
      message,
      priority: 1,
    },
    () => {}
  );
}

function startPomodoroCycle() {
  if (pomodoroState.running) return;
  pomodoroState.running = true;
  pomodoroState.mode = "work";
  pomodoroState.endsAt = Date.now() + POMODORO_DEFAULTS.workMinutes * 60000;
  schedulePomodoroTick();
  notify(
    "tm_pomo_start",
    "Focus Started",
    `Focus for ${POMODORO_DEFAULTS.workMinutes} minutes.`
  );
}

function stopPomodoroCycle() {
  pomodoroState = { running: false, mode: "work", endsAt: null };
  if (pomodoroInterval) clearInterval(pomodoroInterval);
  pomodoroInterval = null;
  notify("tm_pomo_stop", "Pomodoro Stopped", "Timer stopped.");
}

function schedulePomodoroTick() {
  if (pomodoroInterval) clearInterval(pomodoroInterval);
  pomodoroInterval = setInterval(() => {
    if (!pomodoroState.running) return;
    const remaining = pomodoroState.endsAt - Date.now();
    if (remaining <= 0) {
      if (pomodoroState.mode === "work") {
        notify("tm_pomo_break", "Break Time", "Great job! Take a short break.");
        pomodoroState.mode = "break";
        pomodoroState.endsAt =
          Date.now() + POMODORO_DEFAULTS.breakMinutes * 60000;
      } else {
        notify("tm_pomo_focus", "Focus Time", "Break over! Back to focus.");
        pomodoroState.mode = "work";
        pomodoroState.endsAt =
          Date.now() + POMODORO_DEFAULTS.workMinutes * 60000;
      }
    }
  }, 1000);
}

chrome.commands?.onCommand.addListener((cmd) => {
  if (cmd === "tm_toggle_pomodoro") {
    pomodoroState.running ? stopPomodoroCycle() : startPomodoroCycle();
  }
});

// Expose state for popup queries
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action === "getPomodoroState") {
    sendResponse({ state: pomodoroState, defaults: POMODORO_DEFAULTS });
    return true;
  }
  if (msg?.action === "togglePomodoro") {
    pomodoroState.running ? stopPomodoroCycle() : startPomodoroCycle();
    sendResponse({ state: pomodoroState });
    return true;
  }
});

// Allowed categories (keeping this as it's used elsewhere)
const ALLOWED_CATEGORIES = [
  "Work",
  "Social",
  "Entertainment",
  "Professional",
  "Other",
];

// Helper function to extract a valid domain from a URL
function getDomainFromUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    // Exclude internal browser pages and non-web protocols (e.g., 'chrome://', 'file://', 'about:')
    // Also, ensure the hostname is not empty
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
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
      "tm_auth_token",
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

    // If no auth token yet, show badge to indicate login needed
    if (!data.tm_auth_token && chrome.action) {
      try {
        chrome.action.setBadgeText({ text: "!" });
        chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
      } catch (e) {
        /* ignore */
      }
    }

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
      console.warn(
        `Skipping tab change for untrackable URL: ${tab.url}. Domain could not be extracted.`
      );
      if (this.activeSessions[tabId]) {
        // If there was an active session for this tab, attempt to save its duration
        const { domain: prevDomain, startTime: prevStartTime } =
          this.activeSessions[tabId];
        const duration = now - prevStartTime;
        // Only save if the previous domain was valid and duration positive
        if (
          prevDomain &&
          typeof prevDomain === "string" &&
          prevDomain.trim() !== "" &&
          duration > 0
        ) {
          await this.saveSession(prevDomain, prevStartTime, now, duration);
        } else {
          console.log(
            `Clearing active session for untrackable tabId ${tabId} (prevDomain: '${prevDomain}', duration: ${duration}) without saving.`
          );
        }
        delete this.activeSessions[tabId];
        await chrome.storage.local.set({ activeSessions: this.activeSessions });
      }
      return; // Stop processing for this untrackable tab
    }

    console.log(`Tab changed to ${domain} (Tab ID: ${tabId})`);

    // End previous session if one existed for this tabId
    if (this.activeSessions[tabId]) {
      const { domain: prevDomain, startTime: prevStartTime } =
        this.activeSessions[tabId];
      const duration = now - prevStartTime;
      // Explicitly check prevDomain validity before saving
      if (
        prevDomain &&
        typeof prevDomain === "string" &&
        prevDomain.trim() !== "" &&
        duration > 0
      ) {
        await this.saveSession(prevDomain, prevStartTime, now, duration);
      } else {
        console.warn(
          `Skipping saveSession for previous tab '${prevDomain}' (Tab ID: ${tabId}) due to invalid domain or non-positive duration: ${duration}`
        );
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
      if (
        !domain ||
        typeof domain !== "string" ||
        domain.trim() === "" ||
        typeof duration !== "number" ||
        duration <= 0
      ) {
        console.warn(
          `Skipping saveSession for domain '${domain}': Invalid domain (empty/not string) or non-positive duration (${duration}).`
        );
        return;
      }

      // Calculate user's timezone offset in minutes
      const timezoneOffsetMinutes = new Date().getTimezoneOffset();

      // Cap unrealistic session duration (max 12 hours per session)
      const MAX_SESSION_DURATION = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
      if (duration > MAX_SESSION_DURATION) {
        console.warn(
          `Capping extremely long session duration for ${domain}: ${duration}ms -> ${MAX_SESSION_DURATION}ms`
        );
        duration = MAX_SESSION_DURATION;
      }

      // Derive date in the USER'S LOCAL TIME (previous implementation used UTC via toISOString())
      // This fixes off-by-one-day issues for users in positive offsets (e.g. India UTC+5:30)
      const localDate = new Date(
        startTime - new Date().getTimezoneOffset() * 60000
      )
        .toISOString()
        .split("T")[0];
      const currentDate = localDate;
      const { userEmail } = await chrome.storage.local.get(["userEmail"]);
      if (!userEmail) {
        console.warn(
          "No userEmail set, cannot save session to backend. Storing locally."
        );
        await this.storeSessionLocally(
          domain,
          startTime,
          endTime,
          duration,
          category,
          timezoneOffsetMinutes
        );
        return;
      }

      const payload = {
        userEmail,
        date: currentDate,
        domain,
        sessions: [{ startTime, endTime, duration }],
        category: category || this.siteCategories[domain] || "Other",
        timezone: timezoneOffsetMinutes, // Include timezone information
      };

      // Ensure token present before attempting backend (avoid guaranteed 401 spam)
      const { tm_auth_token } = await chrome.storage.local.get([
        "tm_auth_token",
      ]);
      if (!tm_auth_token) {
        console.warn(
          `Auth token missing; queueing session locally for ${domain} on ${currentDate}`
        );
        await this.storeSessionLocally(
          domain,
          startTime,
          endTime,
          duration,
          category
        );
        return;
      }

      console.log(
        `Attempting to save session for ${domain} to backend:`,
        payload
      );

      const response = await backendFetch("/api/time-data/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `Backend sync failed for ${domain} on ${currentDate}: ${response.status} - ${errorText}. Storing locally.`
        );
        await this.storeSessionLocally(
          domain,
          startTime,
          endTime,
          duration,
          category
        );
      } else {
        let responseBody;
        try {
          responseBody = await response.json();
          console.log(
            `Session saved successfully for ${domain} on ${currentDate}. Response:`,
            responseBody
          );
        } catch (jsonError) {
          console.warn(
            `Response was successful but not JSON for ${domain}:`,
            jsonError.message
          );
          console.log(
            `Session saved successfully for ${domain} on ${currentDate}.`
          );
        }
      }
    } catch (error) {
      console.error(`Critical error saving session for ${domain}:`, error);
      await this.storeSessionLocally(
        domain,
        startTime,
        endTime,
        duration,
        category
      );
    }
  }

  async storeSessionLocally(
    domain,
    start,
    end,
    duration,
    category = null,
    timezone = new Date().getTimezoneOffset()
  ) {
    try {
      // Also add domain validation here, just in case
      if (
        !domain ||
        typeof domain !== "string" ||
        domain.trim() === "" ||
        typeof duration !== "number" ||
        duration <= 0
      ) {
        console.warn(
          `Skipping storeSessionLocally for domain '${domain}': Invalid domain (empty/not string) or non-positive duration (${duration}).`
        );
        return;
      }

      // Cap unrealistic session duration (max 12 hours per session)
      const MAX_SESSION_DURATION = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
      if (duration > MAX_SESSION_DURATION) {
        console.warn(
          `Capping extremely long local session duration for ${domain}: ${duration}ms -> ${MAX_SESSION_DURATION}ms`
        );
        duration = MAX_SESSION_DURATION;
      }

      // Local date (previously UTC) for consistent aggregation with new logic
      const currentDate = new Date(
        start - new Date().getTimezoneOffset() * 60000
      )
        .toISOString()
        .split("T")[0];
      const { timeData = {} } = await chrome.storage.local.get(["timeData"]);
      const effectiveCategory =
        category || this.siteCategories[domain] || "Other";

      if (!timeData[currentDate]) timeData[currentDate] = {};
      if (!timeData[currentDate][domain]) {
        timeData[currentDate][domain] = {
          sessions: [],
          category: effectiveCategory,
        };
      } else if (!Array.isArray(timeData[currentDate][domain].sessions)) {
        console.warn(
          `Correcting corrupted 'sessions' data for ${domain} on ${currentDate}. It was not an array.`
        );
        timeData[currentDate][domain].sessions = [];
      }

      timeData[currentDate][domain].sessions.push({
        startTime: start,
        endTime: end,
        duration,
      });
      timeData[currentDate][domain].category = effectiveCategory;

      await chrome.storage.local.set({ timeData });
      console.log(
        `Stored session locally for ${domain} on ${currentDate}, category: ${effectiveCategory}`
      );
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
      if (
        domain &&
        typeof domain === "string" &&
        domain.trim() !== "" &&
        duration > 0
      ) {
        await this.saveSession(domain, startTime, now, duration);
      } else {
        console.log(
          `Skipping ending session for '${
            domain || "[EMPTY/INVALID DOMAIN]"
          }' (Tab ID: ${tabId}) due to invalid domain or non-positive duration: ${duration}`
        );
      }
      delete this.activeSessions[tabId];
    }

    await chrome.storage.local.set({ activeSessions: this.activeSessions });
    console.log("All active sessions ended and cleared.");
  }

  async syncPendingData() {
    try {
      const {
        timeData = {},
        userEmail,
        tm_auth_token,
      } = await chrome.storage.local.get([
        "timeData",
        "userEmail",
        "tm_auth_token",
      ]);

      if (!userEmail || !tm_auth_token) {
        console.warn("Sync pending data skipped: User not authenticated.");
        return;
      }

      if (Object.keys(timeData).length === 0) {
        console.log("No pending time data to sync.");
        return;
      }

      console.log("Starting to sync pending time data...");

      const dataToSync = { ...timeData };

      for (const date in dataToSync) {
        if (!dataToSync[date] || typeof dataToSync[date] !== "object") {
          console.warn(
            `Skipping malformed data for date: ${date}. Expected object, got ${typeof dataToSync[
              date
            ]}`
          );
          delete dataToSync[date];
          continue;
        }

        for (const domain in dataToSync[date]) {
          const entry = dataToSync[date][domain];

          // Enhanced validation for domain within local storage entries
          if (
            !domain ||
            typeof domain !== "string" ||
            domain.trim() === "" ||
            !entry ||
            !Array.isArray(entry.sessions)
          ) {
            console.error(
              `Sync skipped for date: ${date}, domain: '${
                domain || "[EMPTY/INVALID DOMAIN]"
              }'. Missing or invalid critical fields for entry. (domain: '${domain}', entry_exists: ${!!entry}, sessions_is_array: ${Array.isArray(
                entry?.sessions
              )}).`
            );
            // Delete the problematic entry so it doesn't keep causing errors
            delete dataToSync[date][domain];
            continue;
          }

          const category =
            entry.category || this.siteCategories[domain] || "Other";

          const payload = {
            userEmail,
            date,
            domain,
            sessions: entry.sessions,
            category,
          };

          console.log(
            `Attempting to sync payload for ${domain} on ${date}:`,
            payload
          );

          const response = await backendFetch("/api/time-data/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            let responseBody;
            try {
              responseBody = await response.json();
              console.log(
                `Successfully synced ${domain} on ${date}, category: ${category}. Response:`,
                responseBody
              );
            } catch (jsonError) {
              console.warn(
                `Response was successful but not JSON for ${domain} on ${date}:`,
                jsonError.message
              );
              console.log(
                `Successfully synced ${domain} on ${date}, category: ${category}.`
              );
            }
            delete dataToSync[date][domain]; // Remove successfully synced data
          } else {
            const errorText = await response.text();
            console.error(
              `Sync failed for ${domain} on ${date}: ${response.status} - ${errorText}. Payload sent:`,
              payload
            );
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

    // New: minute-level incremental flush so active tabs sync every ~1 minute
    chrome.alarms.clear("activeFlush");
    chrome.alarms.create("activeFlush", { periodInMinutes: 1 });

    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === "periodicSync") {
        this.syncPendingData();
      } else if (alarm.name === "endAllSessions") {
        this.endAllSessions();
      } else if (alarm.name === "activeFlush") {
        this.flushActiveLongSessions();
      }
    });

    console.log("Periodic sync and end session alarms scheduled.");
  }

  async flushActiveLongSessions() {
    const FLUSH_INTERVAL_MS = 60 * 1000; // 1 minute
    const now = Date.now();
    const entries = Object.entries(this.activeSessions);
    if (!entries.length) return;
    for (const [tabId, { domain, startTime }] of entries) {
      if (!domain || typeof domain !== "string" || domain.trim() === "")
        continue;
      const elapsed = now - startTime;
      if (elapsed >= FLUSH_INTERVAL_MS) {
        // Flush this 1+ minute slice
        await this.saveSession(domain, startTime, now, elapsed);
        // Reset start time to now for continued accumulation
        this.activeSessions[tabId].startTime = Date.now();
      }
    }
    await chrome.storage.local.set({ activeSessions: this.activeSessions });
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
    if (
      domain &&
      typeof domain === "string" &&
      domain.trim() !== "" &&
      duration > 0
    ) {
      await tracker.saveSession(domain, startTime, Date.now(), duration);
    } else {
      console.log(
        `Skipping ending session for removed tab ${tabIdStr} ('${
          domain || "[EMPTY/INVALID DOMAIN]"
        }') due to invalid domain or non-positive duration: ${duration}`
      );
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
        console.log(
          "Browser is active, but no active tab URL found to resume tracking."
        );
      }
    });
  }
});

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === "updateCategory") {
    const { domain, category, userEmail, date } = request;

    if (
      !domain ||
      typeof domain !== "string" ||
      domain.trim() === "" ||
      !category ||
      !userEmail ||
      !date
    ) {
      console.error("Missing or invalid required fields for updateCategory:", {
        domain,
        category,
        userEmail,
        date,
      });
      sendResponse({
        status: "error",
        error: "Missing or invalid required fields",
      });
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

      // Respond immediately for UI responsiveness
      sendResponse({ status: "success" });

      const payload = { userEmail, date, domain, category };
      const response = await backendFetch("/api/time-data/category", {
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
    const base = await resolveBackendUrl();
    fetch(`${base}/api/feedback/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, userEmail }),
    })
      .then((r) => r.json())
      .then((data) => sendResponse(data))
      .catch((error) =>
        sendResponse({ status: "error", error: error.message })
      );
    return true;
  }

  if (request.action === "forceFlushSessions") {
    try {
      await tracker.endAllSessions();
      await tracker.syncPendingData();
      sendResponse({ status: "flushed" });
    } catch (e) {
      console.error("forceFlushSessions error:", e);
      sendResponse({ status: "error", error: e.message });
    }
    return true;
  }
  if (request.action === "triggerImmediateSync") {
    try {
      console.log("Immediate sync requested after authentication");
      await tracker.endAllSessions();
      await tracker.syncPendingData();
      sendResponse({ status: "synced" });
    } catch (e) {
      console.error("Immediate sync error:", e);
      sendResponse({ status: "error", error: e.message });
    }
    return true;
  }
  if (request.action === "authSuccess") {
    try {
      // Clear badge when authenticated
      if (chrome.action) {
        chrome.action.setBadgeText({ text: "" });
      }
      // Perform immediate sync
      await tracker.endAllSessions();
      await tracker.syncPendingData();
      sendResponse({ status: "ok" });
    } catch (e) {
      sendResponse({ status: "error", error: e.message });
    }
    return true;
  }
  // Allow popup/UI to request a background-driven daily report send
  if (request.action === "sendDailyReport") {
    (async () => {
      try {
        const ok = await sendScheduledReportFromBackground(/*force*/ true);
        sendResponse({ status: ok ? "sent" : "skipped" });
      } catch (err) {
        console.error("Background sendDailyReport error:", err);
        sendResponse({ status: "error", error: err?.message || String(err) });
      }
    })();
    return true;
  }
});

// ================= Scheduled Email Reports (Background) =================

// Reuseable helpers (pure functions)
function formatDurationBg(milliseconds) {
  if (isNaN(milliseconds) || milliseconds < 0) return "0m";
  const MAX = 24 * 60 * 60 * 1000;
  if (milliseconds > MAX) milliseconds = MAX;
  const totalSeconds = Math.floor(milliseconds / 1000);
  if (totalSeconds === 0) return "0m";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function buildQuickChartUrlBg(config, { w = 700, h = 360, bkg = "white", devicePixelRatio = 2 } = {}) {
  const c = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?w=${w}&h=${h}&bkg=${encodeURIComponent(bkg)}&devicePixelRatio=${devicePixelRatio}&c=${c}`;
}

function generateEmailReportBg(timeData, date) {
  if (!Array.isArray(timeData) || timeData.length === 0) {
    return `TimeMachine Daily Report - ${new Date(date).toLocaleDateString()}\n\nNo activity tracked for today.\n\nStay productive!\nTimeMachine Extension`;
  }
  const categoryData = { Work: 0, Social: 0, Entertainment: 0, Professional: 0, Other: 0 };
  let totalTime = 0;
  const domainTimes = [];
  timeData.forEach((entry) => {
    if (entry && entry.domain && entry.totalTime) {
      const time = entry.totalTime;
      totalTime += time;
      domainTimes.push({ domain: entry.domain, time, category: entry.category || "Other" });
      categoryData[entry.category || "Other"] += time;
    }
  });
  domainTimes.sort((a, b) => b.time - a.time);
  const productiveTime = categoryData.Work + categoryData.Professional + categoryData.Other * 0.5;
  const productivityScore = totalTime > 0 ? Math.round((productiveTime / totalTime) * 100) : 0;
  let report = `TimeMachine Daily Report - ${new Date(date).toLocaleDateString()}\n\n` +
    `📊 DAILY SUMMARY:\n` +
    `Total Time Online: ${formatDurationBg(totalTime)}\n` +
    `Productivity Score: ${productivityScore}%\n` +
    `Unique Sites: ${domainTimes.length}\n\n` +
    `🏆 TOP SITES:`;
  domainTimes.slice(0, 5).forEach((site, index) => {
    const percentage = totalTime > 0 ? ((site.time / totalTime) * 100).toFixed(1) : 0;
    report += `\n${index + 1}. ${site.domain}: ${formatDurationBg(site.time)} (${percentage}%)`;
  });
  report += `\n\n📈 BY CATEGORY:`;
  Object.entries(categoryData).forEach(([category, time]) => {
    if (time > 0) {
      const percentage = ((time / totalTime) * 100).toFixed(1);
      report += `\n${category}: ${formatDurationBg(time)} (${percentage}%)`;
    }
  });
  const insight = productivityScore >= 70
    ? "🎉 Great job! You had a highly productive day."
    : productivityScore >= 40
    ? "💪 Good work! There's room for improvement."
    : "🎯 Focus time! Try to spend more time on productive activities.";
  report += `\n\n💡 INSIGHT: ${insight}\n\nKeep tracking your time to improve your productivity!\n\nSent via TimeMachine Extension`;
  return report;
}

function generateEmailHtmlReportBg(timeData, date) {
  const hasData = Array.isArray(timeData) && timeData.length > 0;
  const displayDate = new Date(date).toLocaleDateString();
  if (!hasData) {
    return `<div style="font-family:Segoe UI,Roboto,Arial,sans-serif;color:#111;line-height:1.5">\n        <h2 style="margin:0 0 6px">TimeMachine Daily Report</h2>\n        <div style="color:#666;font-size:12px;margin:0 0 12px">${displayDate}</div>\n        <p>No activity tracked for today.</p>\n        <p style="margin-top:16px;color:#666;font-size:12px">Sent via TimeMachine</p>\n      </div>`;
  }
  const categoryData = { Work: 0, Social: 0, Entertainment: 0, Professional: 0, Other: 0 };
  const domains = [];
  let totalTime = 0;
  let totalSessions = 0;
  let longestSession = 0;
  let firstStart = null;
  let lastEnd = null;
  timeData.forEach(entry => {
    const t = entry?.totalTime || 0;
    totalTime += t;
    const cat = entry?.category || 'Other';
    categoryData[cat] = (categoryData[cat] || 0) + t;
    domains.push({ domain: entry.domain, time: t, category: cat, sessions: entry.sessions || [] });
    const sess = Array.isArray(entry.sessions) ? entry.sessions : [];
    totalSessions += sess.length;
    sess.forEach(s => {
      const dur = s?.duration || 0;
      if (dur > longestSession) longestSession = dur;
      const st = s?.startTime ? new Date(s.startTime) : null;
      const en = s?.endTime ? new Date(s.endTime) : null;
      if (st && (!firstStart || st < firstStart)) firstStart = st;
      if (en && (!lastEnd || en > lastEnd)) lastEnd = en;
    });
  });
  domains.sort((a, b) => b.time - a.time);
  const topDomains = domains.slice(0, 10);
  const productiveTime = categoryData.Work + categoryData.Professional + categoryData.Other * 0.5;
  const productivityScore = totalTime > 0 ? Math.round((productiveTime / totalTime) * 100) : 0;
  const uniqueDomains = domains.length;
  const spanText = firstStart && lastEnd ? `${firstStart.toLocaleTimeString()} – ${lastEnd.toLocaleTimeString()}` : '—';
  const palette = { work: "#3b82f6", social: "#ef4444", entertainment: "#8b5cf6", professional: "#10b981", other: "#6b7280" };
  const doughnutCfg = {
    type: 'doughnut',
    data: { labels: Object.keys(categoryData), datasets: [{ data: Object.values(categoryData), backgroundColor: [palette.work, palette.social, palette.entertainment, palette.professional, palette.other], borderWidth: 0 }]},
    options: { plugins: { legend: { display: true, position: 'right' } }, cutout: '60%' }
  };
  const barCfg = {
    type: 'bar',
    data: { labels: topDomains.map(d => d.domain), datasets: [{ label: 'Time (min)', data: topDomains.map(d => Math.round((d.time || 0) / 60000)), backgroundColor: '#3b82f6', borderWidth: 0 }]},
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { display: false } } } }
  };
  const doughnutUrl = buildQuickChartUrlBg(doughnutCfg, { w: 640, h: 320, bkg: 'white', devicePixelRatio: 2 });
  const barUrl = buildQuickChartUrlBg(barCfg, { w: 700, h: 400, bkg: 'white', devicePixelRatio: 2 });
  const catRows = Object.entries(categoryData).filter(([_, v]) => v > 0).map(([k, v]) => {
    const pct = totalTime ? ((v / totalTime) * 100).toFixed(1) : '0.0';
    return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;color:#111">${k}</td><td style=\"padding:6px 8px;border-bottom:1px solid #eee;color:#111\">${formatDurationBg(v)}</td><td style=\"padding:6px 8px;border-bottom:1px solid #eee;color:#111\">${pct}%</td></tr>`;
  }).join('');
  const domainRows = topDomains.map((d, i) => {
    const pct = totalTime ? ((d.time / totalTime) * 100).toFixed(1) : '0.0';
    return `<tr>\n        <td style=\"padding:6px 8px;border-bottom:1px solid #eee;color:#111\">${i + 1}</td>\n        <td style=\"padding:6px 8px;border-bottom:1px solid #eee;color:#111\">${d.domain}</td>\n        <td style=\"padding:6px 8px;border-bottom:1px solid #eee;color:#111\">${formatDurationBg(d.time)}</td>\n        <td style=\"padding:6px 8px;border-bottom:1px solid #eee;color:#111\">${d.category}</td>\n        <td style=\"padding:6px 8px;border-bottom:1px solid #eee;color:#111\">${pct}%</td>\n      </tr>`;
  }).join('');
  const insight = productivityScore >= 70 ? 'Great job! Highly productive day.' : productivityScore >= 40 ? 'Good work! There\'s room for improvement.' : 'Focus time! Try to spend more time on productive activities.';
  return `\n      <div style=\"font-family:Segoe UI,Roboto,Arial,sans-serif;color:#111;line-height:1.5\">\n        <h2 style=\"margin:0 0 6px\">TimeMachine Daily Report</h2>\n        <div style=\"color:#666;font-size:12px;margin:0 0 12px\">${displayDate}</div>\n        <table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 12px\">\n          <tr>\n            <td style=\"padding:6px 8px;background:#f8fafc;border:1px solid #e5e7eb\">Total Time</td>\n            <td style=\"padding:6px 8px;border:1px solid #e5e7eb\">${formatDurationBg(totalTime)}</td>\n            <td style=\"padding:6px 8px;background:#f8fafc;border:1px solid #e5e7eb\">Productivity</td>\n            <td style=\"padding:6px 8px;border:1px solid #e5e7eb\">${productivityScore}%</td>\n          </tr>\n          <tr>\n            <td style=\"padding:6px 8px;background:#f8fafc;border:1px solid #e5e7eb\">Unique Domains</td>\n            <td style=\"padding:6px 8px;border:1px solid #e5e7eb\">${uniqueDomains}</td>\n            <td style=\"padding:6px 8px;background:#f8fafc;border:1px solid #e5e7eb\">Sessions</td>\n            <td style=\"padding:6px 8px;border:1px solid #e5e7eb\">${totalSessions}</td>\n          </tr>\n          <tr>\n            <td style=\"padding:6px 8px;background:#f8fafc;border:1px solid #e5e7eb\">Longest Session</td>\n            <td style=\"padding:6px 8px;border:1px solid #e5e7eb\">${formatDurationBg(longestSession)}</td>\n            <td style=\"padding:6px 8px;background:#f8fafc;border:1px solid #e5e7eb\">Active Span</td>\n            <td style=\"padding:6px 8px;border:1px solid #e5e7eb\">${spanText}</td>\n          </tr>\n        </table>\n\n        <div style=\"display:block;margin:12px 0 8px;font-weight:600\">Category Distribution</div>\n        <img src=\"${doughnutUrl}\" alt=\"Category Chart\" width=\"640\" height=\"320\" style=\"display:block;border:1px solid #eee;border-radius:6px\" />\n\n        <div style=\"display:block;margin:16px 0 8px;font-weight:600\">Top Domains</div>\n        <img src=\"${barUrl}\" alt=\"Top Domains Chart\" width=\"700\" height=\"400\" style=\"display:block;border:1px solid #eee;border-radius:6px\" />\n\n        <div style=\"display:block;margin:18px 0 6px;font-weight:600\">Top Domains Table</div>\n        <table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse\">\n          <thead>\n            <tr>\n              <th align=\"left\" style=\"padding:6px 8px;background:#f1f5f9;border-bottom:1px solid #e5e7eb;color:#111;font-size:12px\">#</th>\n              <th align=\"left\" style=\"padding:6px 8px;background:#f1f5f9;border-bottom:1px solid #e5e7eb;color:#111;font-size:12px\">Domain</th>\n              <th align=\"left\" style=\"padding:6px 8px;background:#f1f5f9;border-bottom:1px solid #e5e7eb;color:#111;font-size:12px\">Time</th>\n              <th align=\"left\" style=\"padding:6px 8px;background:#f1f5f9;border-bottom:1px solid #e5e7eb;color:#111;font-size:12px\">Category</th>\n              <th align=\"left\" style=\"padding:6px 8px;background:#f1f5f9;border-bottom:1px solid #e5e7eb;color:#111;font-size:12px\">Share</th>\n            </tr>\n          </thead>\n          <tbody>\n            ${domainRows}\n          </tbody>\n        </table>\n\n        <div style=\"margin-top:14px;padding:10px 12px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;color:#0f172a\">\n          <strong>Insight:</strong> ${insight}\n        </div>\n\n        <p style=\"margin-top:16px;color:#666;font-size:12px\">Charts are rendered via QuickChart. Images may be hidden by your email client until you click “display images”.</p>\n        <p style=\"margin-top:6px;color:#666;font-size:12px\">Sent via TimeMachine</p>\n      </div>`;
}

async function emailJsSendBg(templateParams, settings) {
  if (!settings || !settings.serviceId || !settings.templateId || !settings.publicKey) {
    throw new Error("EmailJS not configured");
  }
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: settings.serviceId,
      template_id: settings.templateId,
      user_id: settings.publicKey,
      template_params: templateParams
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`EmailJS ${res.status}: ${t}`);
  }
}

async function checkForTodayActivityBg(userEmail) {
  try {
    if (!userEmail) return false;
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const timezone = today.getTimezoneOffset();
    const resp = await backendFetch(`/api/time-data/report/${encodeURIComponent(userEmail)}?date=${dateStr}&endDate=${dateStr}&timezone=${timezone}`);
    if (!resp.ok) return false;
    const arr = await resp.json();
    return Array.isArray(arr) && arr.length > 0;
  } catch (e) {
    console.error('checkForTodayActivityBg error:', e);
    return false;
  }
}

async function sendScheduledReportFromBackground(force = false) {
  // Guard: only one sender at a time
  const { reportSending } = await chrome.storage.local.get(["reportSending"]);
  if (reportSending) {
    console.log("Report send already in progress; skipping");
    return false;
  }
  await chrome.storage.local.set({ reportSending: true });
  try {
    const { userEmail, emailConfig, lastReportSent, reportScheduleSettings } = await chrome.storage.local.get([
      'userEmail', 'emailConfig', 'lastReportSent', 'reportScheduleSettings'
    ]);
    if (!userEmail || !emailConfig || !emailConfig.enabled || emailConfig.service !== 'emailjs') {
      return false;
    }
    // Skip if not force and already sent today
    if (!force && lastReportSent) {
      const last = new Date(lastReportSent);
      const now = new Date();
      if (last.toDateString() === now.toDateString()) return false;
    }
    // Optionally skip inactive days
    const includeInactive = !!reportScheduleSettings?.includeInactive;
    if (!includeInactive) {
      const has = await checkForTodayActivityBg(userEmail);
      if (!has) return false;
    }
    // Fetch data
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const timezone = today.getTimezoneOffset();
    const resp = await backendFetch(`/api/time-data/report/${encodeURIComponent(userEmail)}?date=${dateStr}&endDate=${dateStr}&timezone=${timezone}`);
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Failed to fetch report data: ${resp.status} - ${errText}`);
    }
    const timeData = await resp.json();
    const arr = Array.isArray(timeData) ? timeData : [];
    const html = generateEmailHtmlReportBg(arr, dateStr);
    const text = generateEmailReportBg(arr, dateStr);
    await emailJsSendBg({
      to_email: userEmail,
      subject: `TimeMachine Daily Report - ${new Date(dateStr).toLocaleDateString()}`,
      message: html,
      message_text: text
    }, emailConfig.settings);
    // Notify and persist
    try { notify('tm_report_sent', 'TimeMachine', 'Daily report sent to your email.'); } catch(_) {}
    const nowIso = new Date().toISOString();
    await chrome.storage.local.set({ lastReportSent: nowIso });
    return true;
  } catch (e) {
    console.error('sendScheduledReportFromBackground error:', e);
    return false;
  } finally {
    await chrome.storage.local.set({ reportSending: false });
  }
}

function withinScheduledWindow(now, scheduledTime, windowMinutes = 60) {
  // Build a Date for today's scheduled time in local time
  const [hh, mm] = (scheduledTime || '18:00').split(':').map(Number);
  const sched = new Date(now);
  sched.setHours(hh || 18, mm || 0, 0, 0);
  const diffMs = now - sched; // positive if now after scheduled
  return diffMs >= 0 && diffMs <= windowMinutes * 60000;
}

async function reportScheduleTick() {
  try {
    const { reportScheduleSettings, lastReportSent } = await chrome.storage.local.get([
      'reportScheduleSettings', 'lastReportSent'
    ]);
    const settings = reportScheduleSettings || {};
    if (!settings.enabled) return;
    const now = new Date();
  if (!withinScheduledWindow(now, settings.time || '18:00')) return;
    if (settings.frequency === 'weekly' && now.getDay() !== Number(settings.day || 1)) return;
    if (settings.frequency === 'monthly' && now.getDate() !== Number(settings.day || 1)) return;
    if (lastReportSent) {
      const last = new Date(lastReportSent);
      if (last.toDateString() === now.toDateString()) return; // already sent today
    }
  await sendScheduledReportFromBackground();
  } catch (e) {
    console.error('reportScheduleTick error:', e);
  }
}

// Create a periodic alarm for report schedule checks
try {
  chrome.alarms.clear('reportScheduleCheck');
  chrome.alarms.create('reportScheduleCheck', { periodInMinutes: 5 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'reportScheduleCheck') {
      reportScheduleTick();
    }
  });
  console.log('Report schedule check alarm scheduled.');
} catch (e) {
  console.warn('Failed to set report schedule alarm:', e);
}
