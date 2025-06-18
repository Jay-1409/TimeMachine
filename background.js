console.log("Background script loaded");

// Error handling
self.addEventListener('error', e => console.error("Background error:", e));
self.addEventListener("unhandledrejection", e => console.error("Unhandled rejection:", e.reason));

let currentTab = null;
let startTime = null;
let timeData = {};
let emailHistory = {};
let siteCategories = {};

// Load saved data
chrome.storage.local.get(["timeData", "emailHistory", "siteCategories"], result => {
  timeData = result.timeData || {};
  emailHistory = result.emailHistory || {};
  
  // Initialize default categories if none exist
  siteCategories = result.siteCategories || {
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
  
  console.log("Loaded siteCategories:", siteCategories);
  console.log("Loaded timeData:", timeData);
  console.log("Email history:", emailHistory);
});

// Save categories to storage
function saveSiteCategories() {
  chrome.storage.local.set({ siteCategories });
}

// Tab change handler
const handleTabChange = tab => {
  if (!tab.url || tab.url.startsWith("chrome://")) return;
  
  const url = new URL(tab.url);
  const domain = url.hostname;
  const currentDate = new Date().toISOString().split("T")[0];

  console.log(`Tab changed to: ${domain}`);

  // Save previous session
  if (currentTab && startTime) {
    saveSession(currentTab, startTime, Date.now());
  }

  // Start new session
  currentTab = domain;
  startTime = Date.now();

  // Initialize storage
  if (!timeData[currentDate]) timeData[currentDate] = {};
  if (!timeData[currentDate][domain]) timeData[currentDate][domain] = [];
};

// Session management
function saveSession(domain, start, end) {
  const duration = Math.floor((end - start) / 1000);
  if (duration < 1) return;
  
  const currentDate = new Date(start).toISOString().split("T")[0];
  const session = {
    start: new Date(start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
    end: new Date(end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
    duration
  };

  // Ensure data structure exists
  if (!timeData[currentDate]) timeData[currentDate] = {};
  if (!timeData[currentDate][domain]) timeData[currentDate][domain] = [];
  
  timeData[currentDate][domain].push(session);
  chrome.storage.local.set({ timeData });
}

// Tab event listeners
chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, handleTabChange);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) handleTabChange(tab);
});

// Idle detection
chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener(state => {
  console.log(`Idle state: ${state}`);
  
  if (state === "idle" || state === "locked") {
    if (currentTab && startTime) {
      saveSession(currentTab, startTime, Date.now());
      currentTab = null;
      startTime = null;
    }
  } else if (state === "active" && !currentTab) {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.url) handleTabChange(tabs[0]);
    });
  }
});

// Email scheduling system
function scheduleDailyEmail() {
  const nextNoon = getNextNoon();
  console.log("Scheduling next email at:", new Date(nextNoon).toLocaleString());
  
  chrome.alarms.create("dailyEmail", {
    when: nextNoon,
    periodInMinutes: 24 * 60
  });
}

// Initialize scheduling
scheduleDailyEmail();

chrome.alarms.onAlarm.addListener(alarm => {
  console.log("Alarm triggered:", alarm.name);
  if (alarm.name === "dailyEmail") {
    console.log("Sending daily summary...");
    sendDailySummary();
  }
});

function getNextNoon() {
  const now = new Date();
  const noon = new Date(now);
  noon.setHours(12, 0, 0, 0);
  
  if (now > noon) {
    noon.setDate(noon.getDate() + 1);
  }
  
  return noon.getTime();
}

// Data processing
function calculateInsights(data) {
  const currentDate = new Date().toISOString().split("T")[0];
  const todayData = data[currentDate] || {};
  
  const categoryTimes = {};
  let totalTime = 0;

  Object.entries(todayData).forEach(([domain, sessions]) => {
    const duration = sessions.reduce((sum, s) => sum + s.duration, 0);
    totalTime += duration;
    
    const category = siteCategories[domain] || "Other";
    categoryTimes[category] = (categoryTimes[category] || 0) + duration;
  });

  const focusScore = totalTime > 0 ? 
    Math.round((categoryTimes.Work || 0) / totalTime * 100) : 0;

  return {
    focusScore,
    categoryBreakdown: Object.entries(categoryTimes).map(([cat, time]) => ({
      category: cat,
      time: formatDuration(time),
      percentage: Math.round((time / totalTime) * 100)
    }))
  };
}

// Email sending
async function sendDailySummary() {
  const currentDate = new Date().toISOString().split("T")[0];
  
  // Don't send if already sent today
  if (emailHistory[currentDate]) {
    console.log("Email already sent today");
    return;
  }
  
  const data = timeData[currentDate] || {};
  const insights = calculateInsights(timeData);

  const summary = Object.entries(data).map(([domain, sessions]) => {
    const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
    return {
      domain,
      totalTime: formatDuration(totalDuration),
      sessions: sessions.map(s => ({
        start: s.start,
        end: s.end,
        duration: formatDuration(s.duration)
      }))
    };
  });

  return new Promise(async (resolve, reject) => {
    chrome.storage.local.get(["userEmail"], async result => {
      const userEmail = result.userEmail || "devh9933@gmail.com";
      
      try {
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
        emailHistory[currentDate] = new Date().toISOString();
        chrome.storage.local.set({ emailHistory });
        
        console.log("Summary sent successfully");
        resolve();
      } catch (error) {
        console.error("Email send failed:", error);
        
        // Record failed attempt
        emailHistory[currentDate] = {
          error: error.message,
          timestamp: new Date().toISOString()
        };
        chrome.storage.local.set({ emailHistory });
        reject(error);
      }
    });
  });
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Test email request
  if (request.action === "testEmail") {
    console.log("Test email requested");
    sendDailySummary()
      .then(() => sendResponse({ status: "success" }))
      .catch(error => sendResponse({ status: "error", error: error.message }));
    return true; // Indicates async response
  }
  
  // Update category request
  if (request.action === "updateCategory") {
    const { domain, category } = request;
    siteCategories[domain] = category;
    saveSiteCategories();
    console.log(`Updated category for ${domain}: ${category}`);
    sendResponse({ status: "success" });
    return true;
  }
  
  // Send feedback request
  if (request.action === "sendFeedback") {
    const { message } = request;
    console.log("Feedback received:", message);
    
    // Send to backend
    fetch("http://localhost:3000/send-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        sendResponse({ status: "success" });
      } else {
        sendResponse({ status: "error", error: "Failed to send feedback" });
      }
    })
    .catch(error => {
      sendResponse({ status: "error", error: error.message });
    });
    
    return true; // Indicates async response
  }
});

// Helper function
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

// Keep service worker alive
setInterval(() => console.log("Background active"), 4 * 60 * 1000);