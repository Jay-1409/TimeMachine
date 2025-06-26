console.log("Background script loaded");

// Enhanced error handling
const errorHandler = {
  init() {
    self.addEventListener('error', e => this.logError(e.error || e));
    self.addEventListener("unhandledrejection", e => this.logError(e.reason));
  },
  
  logError(error) {
    const errorData = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };
    
    console.error("Background error:", errorData);
    
    // Save error to storage
    chrome.storage.local.get(['errors'], result => {
      const errors = result.errors || [];
      errors.push(errorData);
      chrome.storage.local.set({ errors });
    });
  }
};
errorHandler.init();

// State management
class TimeTracker {
  constructor() {
    this.currentTab = null;
    this.startTime = null;
    this.timeData = {};
    this.emailHistory = {};
    this.siteCategories = {};
    this.initialize();
  }
  
  async initialize() {
    const data = await chrome.storage.local.get(["timeData", "emailHistory", "siteCategories"]);
    this.timeData = data.timeData || {};
    this.emailHistory = data.emailHistory || {};
    
    // Initialize default categories if none exist
    this.siteCategories = data.siteCategories || {
      "github.com": "Work",
      "stackoverflow.com": "Work",
      "leetcode.com": "Work",
      "youtube.com": "Entertainment",
      "instagram.com": "Social",
      "chatgpt.com": "Work",
      "reddit.com": "Social",
      "twitter.com": "Social",
      "linkedin.com": "Professional",
      "netflix.com": "Entertainment"
    };
    
    console.log("Initialized TimeTracker");
  }
  
  handleTabChange(tab) {
    if (!tab.url || tab.url.startsWith("chrome://")) return;
    
    const url = new URL(tab.url);
    const domain = url.hostname;
    const currentDate = new Date().toISOString().split("T")[0];

    console.log(`Tab changed to: ${domain}`);

    // Save previous session
    if (this.currentTab && this.startTime) {
      this.saveSession(this.currentTab, this.startTime, Date.now());
    }

    // Start new session
    this.currentTab = domain;
    this.startTime = Date.now();

    // Initialize storage
    if (!this.timeData[currentDate]) this.timeData[currentDate] = {};
    if (!this.timeData[currentDate][domain]) this.timeData[currentDate][domain] = [];
  }
  
  saveSession(domain, start, end) {
    const duration = Math.floor((end - start) / 1000);
    if (duration < 1) return;
    
    const currentDate = new Date(start).toISOString().split("T")[0];
    const session = {
      start: new Date(start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      end: new Date(end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      duration
    };

    // Ensure data structure exists
    if (!this.timeData[currentDate]) this.timeData[currentDate] = {};
    if (!this.timeData[currentDate][domain]) this.timeData[currentDate][domain] = [];
    
    this.timeData[currentDate][domain].push(session);
    chrome.storage.local.set({ timeData: this.timeData });
  }
  
  async saveSiteCategories() {
    await chrome.storage.local.set({ siteCategories: this.siteCategories });
  }
  
  async backupData() {
    const backup = await chrome.storage.local.get();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupKey = `backup_${timestamp}`;
    await chrome.storage.local.set({ [backupKey]: backup });
    
    // Keep only last 7 backups
    const allKeys = await chrome.storage.local.get(null);
    const backupKeys = Object.keys(allKeys).filter(k => k.startsWith('backup_'));
    if (backupKeys.length > 7) {
      const oldest = backupKeys.sort().slice(0, backupKeys.length - 7);
      await chrome.storage.local.remove(oldest);
    }
  }
}

const tracker = new TimeTracker();

// Tab event listeners
chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, tab => tracker.handleTabChange(tab));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) tracker.handleTabChange(tab);
});

// Idle detection
chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener(state => {
  console.log(`Idle state: ${state}`);
  
  if (state === "idle" || state === "locked") {
    if (tracker.currentTab && tracker.startTime) {
      tracker.saveSession(tracker.currentTab, tracker.startTime, Date.now());
      tracker.currentTab = null;
      tracker.startTime = null;
    }
  } else if (state === "active" && !tracker.currentTab) {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.url) tracker.handleTabChange(tabs[0]);
    });
  }
});

// Email scheduling system
class EmailScheduler {
  constructor() {
    this.scheduleDailyEmail();
    this.setupAlarmListener();
  }
  
  scheduleDailyEmail() {
    const nextNoon = this.getNextNoon();
    console.log("Scheduling next email at:", new Date(nextNoon).toLocaleString());
    
    chrome.alarms.create("dailyEmail", {
      when: nextNoon,
      periodInMinutes: 24 * 60
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
      console.log("Alarm triggered:", alarm.name);
      if (alarm.name === "dailyEmail") {
        console.log("Sending daily summary...");
        this.sendDailySummary();
      }
    });
  }
  
  async sendDailySummary() {
    const currentDate = new Date().toISOString().split("T")[0];
    
    // Don't send if already sent today
    if (tracker.emailHistory[currentDate]) {
      console.log("Email already sent today");
      return;
    }
    
    const data = tracker.timeData[currentDate] || {};
    const insights = this.calculateInsights(tracker.timeData);

    const summary = Object.entries(data).map(([domain, sessions]) => {
      const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
      return {
        domain,
        totalTime: this.formatDuration(totalDuration),
        sessions: sessions.map(s => ({
          start: s.start,
          end: s.end,
          duration: this.formatDuration(s.duration)
        }))
      };
    });

    try {
      const { userEmail = "devh9933@gmail.com" } = await chrome.storage.local.get(["userEmail"]);
      
      console.log("Sending email to backend...");
      const response = await fetch("http://localhost:3000/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: currentDate, summary, insights, userEmail })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, ${errorText}`);
      }
      
      // Record successful send
      tracker.emailHistory[currentDate] = new Date().toISOString();
      await chrome.storage.local.set({ emailHistory: tracker.emailHistory });
      
      console.log("Summary sent successfully");
    } catch (error) {
      console.error("Email send failed:", error);
      
      // Record failed attempt
      tracker.emailHistory[currentDate] = {
        error: error.message,
        timestamp: new Date().toISOString()
      };
      await chrome.storage.local.set({ emailHistory: tracker.emailHistory });
    }
  }
  
  calculateInsights(data) {
    const currentDate = new Date().toISOString().split("T")[0];
    const todayData = data[currentDate] || {};
    
    const categoryTimes = {};
    let totalTime = 0;

    Object.entries(todayData).forEach(([domain, sessions]) => {
      const duration = sessions.reduce((sum, s) => sum + s.duration, 0);
      totalTime += duration;
      
      const category = tracker.siteCategories[domain] || "Other";
      categoryTimes[category] = (categoryTimes[category] || 0) + duration;
    });

    const focusScore = totalTime > 0 ? 
      Math.round((categoryTimes.Work || 0) / totalTime * 100) : 0;

    return {
      focusScore,
      categoryBreakdown: Object.entries(categoryTimes).map(([cat, time]) => ({
        category: cat,
        time: this.formatDuration(time),
        percentage: Math.round((time / totalTime) * 100)
      }))
    };
  }
  
  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }
}

const emailScheduler = new EmailScheduler();

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Test email request
  if (request.action === "testEmail") {
    console.log("Test email requested");
    emailScheduler.sendDailySummary()
      .then(() => sendResponse({ status: "success" }))
      .catch(error => sendResponse({ status: "error", error: error.message }));
    return true;
  }
  
  // Update category request
  if (request.action === "updateCategory") {
    const { domain, category } = request;
    tracker.siteCategories[domain] = category;
    tracker.saveSiteCategories();
    console.log(`Updated category for ${domain}: ${category}`);
    sendResponse({ status: "success" });
    return true;
  }
  
  // Send feedback request
  if (request.action === "sendFeedback") {
    const { message, userEmail } = request;
    console.log("Feedback received:", message);
    
    // Send to backend
    fetch("http://localhost:3000/send-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, userEmail })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        sendResponse({ status: "success" });
      } else {
        sendResponse({ status: "error", error: data.error || "Failed to send feedback" });
      }
    })
    .catch(error => {
      console.error("Feedback error:", error);
      sendResponse({ status: "error", error: error.message });
    });
    
    return true;
  }
  
  // Get stats request
  if (request.action === "getStats") {
    const currentDate = new Date().toISOString().split("T")[0];
    const todayData = tracker.timeData[currentDate] || {};
    const insights = emailScheduler.calculateInsights(tracker.timeData);
    
    sendResponse({
      status: "success",
      data: todayData,
      insights,
      categories: tracker.siteCategories
    });
    return true;
  }
});

// Weekly backup
setInterval(() => tracker.backupData(), 7 * 24 * 60 * 60 * 1000);

// Keep service worker alive
setInterval(() => {
  console.log("Background active");
  // Also check if we missed any scheduled emails
  const now = new Date();
  if (now.getHours() === 12 && now.getMinutes() < 5) {
    emailScheduler.sendDailySummary();
  }
}, 4 * 60 * 1000);