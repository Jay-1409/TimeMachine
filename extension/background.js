console.log('Background script loaded');

class TimeTracker {
  constructor() {
    this.activeSessions = {};
    this.siteCategories = {
      'github.com': 'Work',
      'stackoverflow.com': 'Work',
      'leetcode.com': 'Work',
      'youtube.com': 'Entertainment',
      'instagram.com': 'Social',
      'chatgpt.com': 'Work',
      'reddit.com': 'Social',
      'twitter.com': 'Social',
      'linkedin.com': 'Professional',
      'netflix.com': 'Entertainment',
    };
    this.emailHistory = {};
    this.initialize();
  }

  async initialize() {
    const data = await chrome.storage.local.get(['siteCategories', 'emailHistory', 'activeSessions']);
    this.siteCategories = data.siteCategories || this.siteCategories;
    this.emailHistory = data.emailHistory || {};
    this.activeSessions = data.activeSessions || {};
    console.log('Initialized TimeTracker with sessions:', this.activeSessions);
    this.startPeriodicSync();
  }

  async handleTabChange(tab) {
    if (!tab.url || tab.url.startsWith('chrome://') || !tab.active) return;

    const url = new URL(tab.url);
    const domain = url.hostname;
    const tabId = tab.id.toString();
    const now = Date.now();

    console.log(`Tab changed: ${domain} (Tab ID: ${tabId})`);

    // Save any existing session for this tab
    if (this.activeSessions[tabId]) {
      await this.saveSession(this.activeSessions[tabId].domain, this.activeSessions[tabId].startTime, now, tabId);
    }

    // Start new session
    this.activeSessions[tabId] = { domain, startTime: now };
    await chrome.storage.local.set({ activeSessions: this.activeSessions });
  }

  async saveSession(domain, start, end, tabId) {
    const duration = Math.floor((end - start) / 1000); // Duration in seconds
    if (duration < 5) { // Minimum 5 seconds to avoid noise
      console.log(`Skipping session for ${domain}: duration too short (${duration}s)`);
      return;
    }

    const currentDate = new Date(start).toISOString().split('T')[0];
    const session = {
      start: new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      end: new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      duration,
    };

    const userEmail = (await chrome.storage.local.get(['userEmail'])).userEmail || 'devh9933@gmail.com';

    console.log(`Saving session for ${domain}: ${session.start} - ${session.end} (${duration}s)`);

    try {
      const response = await fetch('http://localhost:3000/api/time-data/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userEmail, date: currentDate, domain, sessions: [session] }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (tabId) {
        delete this.activeSessions[tabId];
        await chrome.storage.local.set({ activeSessions: this.activeSessions });
      }
    } catch (error) {
      console.error('Error syncing session:', error);
      // Fallback to local storage
      const timeData = (await chrome.storage.local.get(['timeData'])).timeData || {};
      if (!timeData[currentDate]) timeData[currentDate] = {};
      if (!timeData[currentDate][domain]) timeData[currentDate][domain] = [];
      timeData[currentDate][domain].push(session);
      await chrome.storage.local.set({ timeData });
    }
  }

  async endAllSessions() {
    const now = Date.now();
    for (const tabId in this.activeSessions) {
      const { domain, startTime } = this.activeSessions[tabId];
      await this.saveSession(domain, startTime, now, tabId);
    }
    this.activeSessions = {};
    await chrome.storage.local.set({ activeSessions: this.activeSessions });
  }

  async syncPendingData() {
    const timeData = (await chrome.storage.local.get(['timeData'])).timeData || {};
    const userEmail = (await chrome.storage.local.get(['userEmail'])).userEmail || 'devh9933@gmail.com';

    for (const date in timeData) {
      for (const domain in timeData[date]) {
        const sessions = timeData[date][domain];
        try {
          const response = await fetch('http://localhost:3000/api/time-data/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userEmail, date, domain, sessions }),
          });
          if (response.ok) {
            delete timeData[date][domain];
            if (Object.keys(timeData[date]).length === 0) {
              delete timeData[date];
            }
          }
        } catch (error) {
          console.error('Error syncing pending data:', error);
        }
      }
    }
    await chrome.storage.local.set({ timeData });
  }

  startPeriodicSync() {
    setInterval(() => this.syncPendingData(), 5 * 60 * 1000); // Sync every 5 minutes
    setInterval(() => this.endAllSessions(), 15 * 60 * 1000); // Save sessions every 15 minutes
  }

  async saveSiteCategories() {
    await chrome.storage.local.set({ siteCategories: this.siteCategories });
  }

  async backupData() {
    const backup = await chrome.storage.local.get();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupKey = `backup_${timestamp}`;
    await chrome.storage.local.set({ [backupKey]: backup });

    const allKeys = Object.keys(await chrome.storage.local.get(null));
    const backupKeys = allKeys.filter(k => k.startsWith('backup_'));
    if (backupKeys.length > 7) {
      await chrome.storage.local.remove(backupKeys.sort().slice(0, backupKeys.length - 7));
    }
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
    console.log('Scheduling next email at:', new Date(nextNoon).toLocaleString());
    chrome.alarms.create('dailyEmail', {
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
    chrome.alarms.onAlarm.addListener(alarm => {
      if (alarm.name === 'dailyEmail') {
        console.log('Sending daily summary...');
        this.sendDailySummary();
      }
    });
  }

  async sendDailySummary() {
    const currentDate = new Date().toISOString().split('T')[0];
    if (this.tracker.emailHistory[currentDate]) {
      console.log('Email already sent today');
      return;
    }

    const userEmail = (await chrome.storage.local.get(['userEmail'])).userEmail || 'devh9933@gmail.com';

    try {
      await this.tracker.endAllSessions(); // Save all active sessions
      const response = await fetch(`http://localhost:3000/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: currentDate, userEmail }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      this.tracker.emailHistory[currentDate] = { timestamp: new Date().toISOString(), status: 'sent' };
      await chrome.storage.local.set({ emailHistory: this.tracker.emailHistory });
      console.log('Summary sent successfully');
    } catch (error) {
      console.error('Email send failed:', error);
      this.tracker.emailHistory[currentDate] = { error: error.message, timestamp: new Date().toISOString(), status: 'failed' };
      await chrome.storage.local.set({ emailHistory: this.tracker.emailHistory });
    }
  }
}

const tracker = new TimeTracker();
const emailScheduler = new EmailScheduler(tracker);

chrome.runtime.onStartup.addListener(async () => {
  console.log('Browser started, restoring sessions');
  await tracker.endAllSessions(); // Save any sessions from before shutdown
  await tracker.syncPendingData(); // Sync any pending local data
});

chrome.runtime.onSuspend.addListener(async () => {
  console.log('Extension unloading, saving sessions');
  await tracker.endAllSessions();
});

chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, tab => tracker.handleTabChange(tab));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) tracker.handleTabChange(tab);
});

chrome.tabs.onCreated.addListener(tab => {
  if (tab.active) tracker.handleTabChange(tab);
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const tabIdStr = tabId.toString();
  if (tracker.activeSessions[tabIdStr]) {
    const { domain, startTime } = tracker.activeSessions[tabIdStr];
    await tracker.saveSession(domain, startTime, Date.now(), tabIdStr);
  }
});

chrome.idle.setDetectionInterval(60); // Increased to 60s to avoid premature session end
chrome.idle.onStateChanged.addListener(async state => {
  console.log(`Idle state: ${state}`);
  if (state === 'idle' || state === 'locked') {
    await tracker.endAllSessions();
  } else if (state === 'active') {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.url) tracker.handleTabChange(tabs[0]);
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'testEmail') {
    emailScheduler.sendDailySummary()
      .then(() => sendResponse({ status: 'success' }))
      .catch(error => sendResponse({ status: 'error', error: error.message }));
    return true;
  }

  if (request.action === 'updateCategory') {
    const { domain, category } = request;
    tracker.siteCategories[domain] = category;
    tracker.saveSiteCategories();
    console.log(`Updated category for ${domain}: ${category}`);
    sendResponse({ status: 'success' });
    return true;
  }

  if (request.action === 'sendFeedback') {
    const { message, userEmail } = request;
    console.log('Feedback received:', message);

    fetch('http://localhost:3000/api/feedback/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, userEmail }),
    })
      .then(response => response.json())
      .then(data => sendResponse(data.success ? { status: 'success' } : { status: 'error', error: data.error }))
      .catch(error => sendResponse({ status: 'error', error: error.message }));
    return true;
  }
});

setInterval(() => tracker.backupData(), 7 * 24 * 60 * 60 * 1000);