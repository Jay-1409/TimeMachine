console.log("Background script loaded");

class TimeTracker {
  constructor() {
    this.activeSessions = {};
    this.siteCategories = {
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
    };
    this.emailHistory = {};
    this.initialize();
  }

  async initialize() {
    const data = await chrome.storage.local.get([
      "siteCategories",
      "emailHistory",
      "activeSessions",
    ]);
    this.siteCategories = data.siteCategories || this.siteCategories;
    this.emailHistory = data.emailHistory || {};
    this.activeSessions = data.activeSessions || {};
    console.log("TimeTracker initialized with sessions:", this.activeSessions);
    this.startPeriodicSync();
  }

  async handleTabChange(tab) {
    if (!tab?.url || tab.url.startsWith("chrome://") || !tab.active) return;

    try {
      const url = new URL(tab.url);
      const domain = url.hostname.replace(/^www\./, "");
      const tabId = tab.id.toString();
      const now = Date.now();

      console.log(`Tab changed to ${domain} (Tab ID: ${tabId})`);

      // End previous session if exists
      if (this.activeSessions[tabId]) {
        await this.saveSession(
          this.activeSessions[tabId].domain,
          this.activeSessions[tabId].startTime,
          now,
          tabId
        );
      }

      // Start new session
      this.activeSessions[tabId] = { domain, startTime: now };
      await chrome.storage.local.set({ activeSessions: this.activeSessions });
    } catch (error) {
      console.error("Error handling tab change:", error);
    }
  }

  async saveSession(domain, start, end, tabId) {
    const duration = Math.floor((end - start) / 1000);
    if (duration < 5) {
      console.log(`Skipping short session for ${domain}: ${duration}s`);
      return;
    }

    try {
      const currentDate = new Date(start).toISOString().split("T")[0];
      const { userEmail } = await chrome.storage.local.get(["userEmail"]);

      if (!userEmail) {
        console.warn("No user email found, skipping sync");
        return;
      }

      const session = {
        startTime: start,
        endTime: end,
        duration,
      };

      console.log(`Saving session for ${domain}: ${duration}s`);

      const response = await fetch("http://localhost:3000/api/time-data/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmail,
          date: currentDate,
          domain,
          sessions: [session],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      console.log(`Session saved for ${domain}`);

      if (tabId) {
        delete this.activeSessions[tabId];
        await chrome.storage.local.set({ activeSessions: this.activeSessions });
      }
    } catch (error) {
      console.error(`Error saving session for ${domain}:`, error);
      await this.storeSessionLocally(domain, start, end, duration);
    }
  }

  async storeSessionLocally(domain, start, end, duration) {
    try {
      const currentDate = new Date(start).toISOString().split("T")[0];
      const { timeData = {} } = await chrome.storage.local.get(["timeData"]);

      if (!timeData[currentDate]) timeData[currentDate] = {};
      if (!timeData[currentDate][domain])
        timeData[currentDate][domain] = { sessions: [] };

      timeData[currentDate][domain].sessions.push({
        startTime: start,
        endTime: end,
        duration,
      });

      await chrome.storage.local.set({ timeData });
      console.log(`Stored session locally for ${domain}`);
    } catch (error) {
      console.error("Error storing session locally:", error);
    }
  }

  async endAllSessions() {
    const now = Date.now();
    const sessionsToEnd = { ...this.activeSessions };

    for (const tabId in sessionsToEnd) {
      const { domain, startTime } = sessionsToEnd[tabId];
      await this.saveSession(domain, startTime, now, tabId);
    }

    this.activeSessions = {};
    await chrome.storage.local.set({ activeSessions: this.activeSessions });
  }

  async syncPendingData() {
    try {
      const { timeData = {}, userEmail } = await chrome.storage.local.get([
        "timeData",
        "userEmail",
      ]);

      if (!userEmail || !timeData || Object.keys(timeData).length === 0) {
        return;
      }

      console.log("Syncing pending time data...");

      for (const date in timeData) {
        for (const domain in timeData[date]) {
          const sessions = timeData[date][domain];

          try {
            const response = await fetch(
              "http://localhost:3000/api/time-data/sync",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  userEmail,
                  date,
                  domain,
                  sessions,
                }),
              }
            );

            if (response.ok) {
              delete timeData[date][domain];
              if (Object.keys(timeData[date]).length === 0) {
                delete timeData[date];
              }
              await chrome.storage.local.set({ timeData });
            }
          } catch (error) {
            console.error(`Error syncing ${domain} on ${date}:`, error);
          }
        }
      }
    } catch (error) {
      console.error("Error in syncPendingData:", error);
    }
  }

  startPeriodicSync() {
    setInterval(() => this.syncPendingData(), 5 * 60 * 1000); // Every 5 minutes
    setInterval(() => this.endAllSessions(), 15 * 60 * 1000); // Every 15 minutes
  }

  async saveSiteCategories() {
    await chrome.storage.local.set({ siteCategories: this.siteCategories });
  }
}

class EmailScheduler {
  constructor(tracker) {
    this.tracker = tracker;
    this.scheduleDailyEmail();
    this.setupAlarmListener();
  }

  scheduleDailyEmail() {
    const nextNoon = this.getNextNoon();
    console.log(
      "Scheduling next email at:",
      new Date(nextNoon).toLocaleString()
    );
    chrome.alarms.create("dailyEmail", {
      when: nextNoon,
      periodInMinutes: 24 * 60,
    });
  }

  getNextNoon() {
    const now = new Date();
    const noon = new Date(now);
    noon.setHours(12, 0, 0, 0);
    if (now > noon) {
      noon.setDate(noon.getDate() + 1);
    }
    return noon.getTime();
  }

  setupAlarmListener() {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === "dailyEmail") {
        this.sendDailySummary();
      }
    });
  }

  async sendDailySummary() {
    try {
      const currentDate = new Date().toISOString().split("T")[0];
      const { userEmail, emailHistory = {} } = await chrome.storage.local.get([
        "userEmail",
        "emailHistory",
      ]);

      if (!userEmail) {
        console.warn("No user email found, skipping email");
        return;
      }

      if (emailHistory[currentDate]) {
        console.log("Email already sent today");
        return;
      }

      await this.tracker.endAllSessions();
      await this.tracker.syncPendingData();

      const response = await fetch("http://localhost:3000/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: currentDate, userEmail }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      this.tracker.emailHistory[currentDate] = {
        timestamp: new Date().toISOString(),
        status: "sent",
      };
      await chrome.storage.local.set({
        emailHistory: this.tracker.emailHistory,
      });
      console.log("Daily summary sent successfully");
    } catch (error) {
      console.error("Error sending daily summary:", error);
      const currentDate = new Date().toISOString().split("T")[0];
      this.tracker.emailHistory[currentDate] = {
        error: error.message,
        timestamp: new Date().toISOString(),
        status: "failed",
      };
      await chrome.storage.local.set({
        emailHistory: this.tracker.emailHistory,
      });
    }
  }
}

const tracker = new TimeTracker();
const emailScheduler = new EmailScheduler(tracker);

// Event Listeners
chrome.runtime.onStartup.addListener(async () => {
  console.log("Browser started, restoring sessions");
  await tracker.endAllSessions();
  await tracker.syncPendingData();
});

chrome.runtime.onSuspend.addListener(async () => {
  console.log("Extension unloading, saving sessions");
  await tracker.endAllSessions();
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => tracker.handleTabChange(tab));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    tracker.handleTabChange(tab);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.active) tracker.handleTabChange(tab);
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const tabIdStr = tabId.toString();
  if (tracker.activeSessions[tabIdStr]) {
    const { domain, startTime } = tracker.activeSessions[tabIdStr];
    await tracker.saveSession(domain, startTime, Date.now(), tabIdStr);
  }
});

chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener(async (state) => {
  console.log(`Idle state changed to: ${state}`);
  if (state === "idle" || state === "locked") {
    await tracker.endAllSessions();
  } else if (state === "active") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) tracker.handleTabChange(tabs[0]);
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "testEmail") {
    emailScheduler
      .sendDailySummary()
      .then(() => sendResponse({ status: "success" }))
      .catch((error) =>
        sendResponse({ status: "error", error: error.message })
      );
    return true;
  }

  if (request.action === "updateCategory") {
    const { domain, category } = request;
    tracker.siteCategories[domain] = category;
    tracker.saveSiteCategories();
    sendResponse({ status: "success" });
    return true;
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
    return true;
  }
});
