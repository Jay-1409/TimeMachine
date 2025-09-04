import reportScheduler from './report-scheduler.js';
import { resolveBackendUrl as sharedResolveBackendUrl, apiCall as sharedApiCall } from './modules/api.js';
import { formatDuration as sharedFormatDuration } from './modules/utils.js';
import { AnalyticsTab } from './modules/analytics-tab.js';
import { FocusTab } from './modules/focus-tab.js';
import { GuardTab } from './modules/guard-tab.js';
import { SummaryTab } from './modules/summary-tab.js';
import { SolverTab } from './modules/solver-tab.js';

const CONFIG = {
  EMAIL_CONFIG: {
    enabled: false,
    service: null,
    settings: {}
  },
  CHART_COLORS: {
    light: {
      work: "#3b82f6",
      social: "#ef4444", 
      entertainment: "#8b5cf6",
      professional: "#10b981",
      other: "#6b7280",
    },
    dark: {
      work: "#60a5fa",
      social: "#f87171",
      entertainment: "#a78bfa", 
      professional: "#34d399",
      other: "#9ca3af",
    },
    cyberpunk: {
      work: "#00ff9f",
      social: "#ff0080",
      entertainment: "#00d4ff",
      professional: "#ffff00",
      other: "#8000ff",
    },
    minimal: {
      work: "#1f2937",
      social: "#7c3aed",
      entertainment: "#059669", 
      professional: "#dc2626",
      other: "#64748b",
    },
    ocean: {
      work: "#0ea5e9",
      social: "#06b6d4",
      entertainment: "#3b82f6",
      professional: "#0891b2",
      other: "#64748b",
    },
    sunset: {
      work: "#f59e0b",
      social: "#ef4444",
      entertainment: "#f97316",
      professional: "#eab308",
      other: "#6b7280",
    },
    forest: {
      work: "#059669",
      social: "#dc2626", 
      entertainment: "#16a34a",
      professional: "#15803d",
      other: "#6b7280",
    },
  },
};

let timeChart = null;

// Cache for backend URL to avoid repeated expensive lookups
let __backendUrlCache = { value: null, ts: 0 };
const BACKEND_URL_TTL = 5 * 60 * 1000; // 5 minutes

// Use shared utility for formatting durations
const formatDuration = sharedFormatDuration;

const CHART_CONFIG = {
  type: "doughnut",
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "right",
        labels: {
          font: {
            family: "inherit",
          },
        },
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            return `${context.label}: ${formatDuration(context.raw)}`;
          },
        },
      },
    },
    cutout: "65%",
  },
};

async function resolveBackendUrl() {
  // Keep a light cache in popup to reduce calls; delegate to shared resolver
  const now = Date.now();
  if (__backendUrlCache.value && (now - __backendUrlCache.ts) < BACKEND_URL_TTL) {
    return __backendUrlCache.value;
  }
  const url = await sharedResolveBackendUrl();
  __backendUrlCache = { value: url, ts: now };
  return url;
}

async function apiCall(endpoint, options = {}) {
  return sharedApiCall(endpoint, options);
}

// Make functions available globally for scheduler
window.resolveBackendUrl = resolveBackendUrl;

document.addEventListener("DOMContentLoaded", () => {
  const elements = {
    emailPrompt: document.getElementById("emailPrompt"),
    mainApp: document.getElementById("mainApp"),
    userEmailInput: document.getElementById("userEmailInput"),
    userPasswordInput: document.getElementById("userPasswordInput"),
    toggleAuthMode: document.getElementById("toggleAuthMode"),
    saveEmailBtn: document.getElementById("saveEmailBtn"),
    emailError: document.getElementById("emailError"),
    errorDisplay: document.getElementById("errorDisplay"),
    toggleThemeBtn: document.getElementById("toggleThemeBtn"),
    themeDropdown: document.getElementById("themeDropdown"),
    themeOptions: document.querySelectorAll(".theme-option"),
    updateNotification: document.getElementById("updateNotification"),
    closeNotification: document.getElementById("closeNotification"),
    updateMessage: document.getElementById("updateMessage"),
    feedbackToast: document.getElementById("feedbackToast"),
    emailDisplay: document.getElementById("emailDisplay"),
    userEmailSettings: document.getElementById("userEmail"),
    updateEmailBtn: document.getElementById("updateEmailBtn"),
    helpBtn: document.getElementById("helpBtn"),
    editEmailBtn: document.getElementById("editEmailBtn"),
    downloadReportBtn: document.getElementById("downloadReport"),
    testEmailBtn: document.getElementById("testEmailBtn"),
    feedbackMessage: document.getElementById("feedbackMessage"),
    sendFeedbackBtn: document.getElementById("sendFeedbackBtn"),
    charCount: document.getElementById("charCount"),
    tabButtons: document.querySelectorAll(".nav-pill"),
    mainTabButtons: document.querySelectorAll(".main-tab-btn, .main-tab"),
    insightsTabContent: document.getElementById("analyticsTabContent"),
    settingsTabContent: document.getElementById("settingsTabContent"),
    statsDiv: document.getElementById("stats"),
    productivityScore: document.getElementById("productivityScore"),
    dateRangeDisplay: document.getElementById("dateRangeDisplay"),
    siteList: document.querySelector(".site-list"),
    sendReportBtn: document.getElementById("sendReportBtn"),
    emailServiceSelect: document.getElementById("emailServiceSelect"),
    emailjsConfig: document.getElementById("emailjsConfig"),
    emailjsServiceId: document.getElementById("emailjsServiceId"),
    emailjsTemplateId: document.getElementById("emailjsTemplateId"),
    emailjsPublicKey: document.getElementById("emailjsPublicKey"),
    saveEmailConfig: document.getElementById("saveEmailConfig"),
    pomodoroToggle: document.getElementById("pomodoroToggle"),
    pomodoroStatus: document.getElementById("pomodoroStatus"),
    settingsBtn: document.getElementById("settingsBtn"),
    backToInsightsBtn: document.getElementById("backToInsightsBtn"),
    // New focus and blocking elements
    dailyFocusTime: document.getElementById("dailyFocusTime"),
    timerLabel: document.getElementById("timerLabel"),
    focusProgressBar: document.getElementById("focusProgressBar"),
    focusSettings: document.getElementById("focusSettingsBtn"),
    focusSessionsList: document.getElementById("focusSessionsList"),
  // Guard elements are handled by GuardTab
    // Stopwatch elements
    stopwatchTabContent: document.getElementById("stopwatchTabContent"),
    activeSessionCard: document.getElementById("activeSessionCard"),
    newSessionCard: document.getElementById("newSessionCard"),
    // Solver tab elements (redesigned)
    sessionTitle: document.getElementById("sessionTitle"),
    sessionCategory: document.getElementById("sessionCategory"),
    sessionSite: document.getElementById("sessionSite"),
    stopwatchTime: document.getElementById("stopwatchTime"),
    pauseResumeBtn: document.getElementById("pauseResumeBtn"),
    completeBtn: document.getElementById("completeBtn"),
    abandonBtn: document.getElementById("abandonBtn"),
    startSessionBtn: document.getElementById("startSessionBtn"),
    sessionHistory: document.getElementById("sessionHistory"),
    historyFilter: document.getElementById("historyFilter"),
    quickCategory: document.getElementById("quickCategory"),
    detectedTitle: document.getElementById("detectedTitle"),
    detectedUrl: document.getElementById("detectedUrl"),
    // New Solver tab elements
    sessionsList: document.getElementById("sessionsList"),
    dailyProblems: document.getElementById("dailyProblems"),
    dailyTime: document.getElementById("dailyTime"),
    completedCount: document.getElementById("completedCount"),
    totalTime: document.getElementById("totalTime"),
    streakCount: document.getElementById("streakCount"),
    // Summary tab elements
    summaryDate: document.getElementById("summaryDate"),
  };

  const themes = ["light", "dark", "cyberpunk", "minimal", "ocean", "sunset", "forest"];
  let currentSubTab = "daily";
  let currentMainTab = "analytics";
  let siteCategories = {};
  let currentTheme = localStorage.getItem("theme") || "light";
  let currentThemeIndex = themes.indexOf(currentTheme);
  
  // Stopwatch state moved into SolverTab module

  if (!CONFIG.CHART_COLORS[currentTheme]) {
    console.warn(
      `Invalid theme '${currentTheme}' detected. Defaulting to 'light'.`
    );
    currentTheme = "light";
    currentThemeIndex = 0;
    localStorage.setItem("theme", currentTheme);
  }

  initTheme();
  initEmailPrompt();
  setupEventListeners();
  
  // Initialize authentication
  try {
    if (typeof Auth !== 'undefined') {
      console.log('Authentication system initialized');
    } else {
      console.warn('Auth not found. Authentication will use fallback methods.');
    }
  } catch (error) {
    console.warn('Auth initialization error:', error);
  }
  
  // Initialize report scheduler
  initReportScheduler();

  function initTheme() {
    document.body.className = `theme-${currentTheme}`;
  try { AnalyticsTab.updateChartTheme(); } catch (_) {}
    updateThemeDropdownUI();

    // Update focus sessions UI theme if manager exists
    if (typeof FocusSessionsManager !== 'undefined') {
      FocusSessionsManager.forceSync().catch(console.error);
    }
  }

  function getLegendColor() {
    switch (currentTheme) {
      case "light":
        return "#1e293b";
      case "dark":
        return "#f1f5f9";
      case "cyberpunk":
        return "#e0e7ff";
      case "minimal":
        return "#1e293b";
      case "ocean":
        return "#0f172a";
      case "sunset":
        return "#451a03";
      case "forest":
        return "#1a2e05";
      default:
        return "#1e293b";
    }
  }

  function setupEventListeners() {
    elements.saveEmailBtn.addEventListener("click", saveEmail);
    elements.toggleAuthMode.addEventListener("click", toggleAuthMode);
    elements.toggleThemeBtn.addEventListener("click", toggleThemeDropdown);
    elements.themeOptions.forEach(option => {
      option.addEventListener("click", () => selectTheme(option.dataset.theme));
    });
    elements.closeNotification?.addEventListener("click", hideUpdateNotification);
    
    // Set up navigation pill buttons (daily, weekly, monthly)
    document.querySelectorAll('.nav-pill').forEach(pill => {
      pill.addEventListener('click', () => switchSubTab(pill.dataset.tab));
    });
    
    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".theme-selector")) {
        elements.themeDropdown.classList.add("hidden");
      }
    });
    elements.updateEmailBtn.addEventListener("click", updateEmail);
    elements.editEmailBtn.addEventListener("click", () => {
      elements.emailDisplay.classList.add("hidden");
      elements.userEmailSettings.classList.remove("hidden");
      elements.updateEmailBtn.classList.remove("hidden");
      elements.editEmailBtn.classList.add("hidden");
      elements.userEmailSettings.focus();
    });
    elements.downloadReportBtn.addEventListener("click", downloadReport);
    elements.testEmailBtn.addEventListener("click", sendTestEmail);
    elements.sendReportBtn.addEventListener("click", sendDailyReport);
    elements.feedbackMessage.addEventListener("input", updateCharCount);
    elements.sendFeedbackBtn.addEventListener("click", sendFeedback);
    elements.emailServiceSelect.addEventListener("change", handleEmailServiceChange);
    elements.saveEmailConfig.addEventListener("click", saveEmailConfiguration);
    // Removed old pomodoroToggle listener - handled in initializeModalEvents
    
  // Guard events handled by GuardTab

  // Focus preset buttons moved to FocusTab

  // Focus session events handled in initializeModalEvents
    
    // Modal close event listeners with correct IDs
  document.getElementById('closeAddSiteModal')?.addEventListener('click', () => hideModal('addSiteModal'));
  document.getElementById('cancelAddSiteModal')?.addEventListener('click', () => hideModal('addSiteModal'));
    document.getElementById('cancelConfirmModal')?.addEventListener('click', () => hideModal('confirmModal'));
    
    // Navigation between main tabs
    elements.settingsBtn?.addEventListener("click", () => {
      if (currentMainTab === "settings") {
        switchMainTab("analytics");
      } else {
        switchMainTab("settings");
      }
    });
    
    elements.helpBtn?.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('user_guide.html') });
    });
    elements.backToInsightsBtn?.addEventListener("click", () => switchMainTab("analytics"));

    elements.tabButtons.forEach((btn) =>
      btn.addEventListener("click", () => switchSubTab(btn.dataset.tab))
    );

  // Quick block current site functionality
    const quickBlockBtn = document.getElementById('quickBlock');
    if (quickBlockBtn) {
      quickBlockBtn.addEventListener('click', async () => {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && tab.url) {
            const url = new URL(tab.url);
            const domain = url.hostname.replace(/^www\./, '');

      // Use GuardTab API
      await GuardTab.addSite(domain);
      showFeedback(`Blocked ${domain}`, false);
      await GuardTab.loadItems();
      await GuardTab.updateStats();
          }
        } catch (error) {
          console.error('Error quick blocking site:', error);
          showFeedback('Error blocking site', true);
        }
      });
    }

    // Add event listeners for new main tabs
    document.querySelectorAll('.main-tab').forEach((btn) => {
      btn.addEventListener("click", () => switchMainTab(btn.dataset.maintab));
    });

    elements.mainTabButtons.forEach((btn) =>
      btn.addEventListener("click", () => switchMainTab(btn.dataset.mainTab || btn.dataset.maintab))
    );

  // Event delegation for blocked item delete buttons to avoid re-binding on every render
    const blockedItemsListEl = document.getElementById('blockedItemsList');
    if (blockedItemsListEl) {
      blockedItemsListEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.action-btn.delete');
        if (!btn) return;
        const type = btn.dataset.type;
        if (type === 'site' && btn.dataset.domain) {
      GuardTab.removeSite(btn.dataset.domain);
        } else if (type === 'keyword' && btn.dataset.keyword) {
      GuardTab.removeKeyword(btn.dataset.keyword);
        }
      });
    }
  }

  // manualRefresh removed

  function toggleThemeDropdown() {
    elements.themeDropdown.classList.toggle("hidden");
    updateThemeDropdownUI();
  }

  function selectTheme(themeName) {
    currentTheme = themeName;
    currentThemeIndex = themes.indexOf(themeName);
    localStorage.setItem("theme", currentTheme);
    initTheme();
    updateThemeDropdownUI();
    elements.themeDropdown.classList.add("hidden");
    
    if (currentMainTab === "analytics") {
      AnalyticsTab.load(currentSubTab).catch(console.error);
    }
  }

  function updateThemeDropdownUI() {
    elements.themeOptions.forEach(option => {
      if (option.dataset.theme === currentTheme) {
        option.classList.add("active");
      } else {
        option.classList.remove("active");
      }
    });
  }

  // Focus timer/refresh are handled by FocusTab

  // Update notification system
  function checkForUpdates() {
    const lastVersion = localStorage.getItem("lastKnownVersion") || "1.0.0";
    const currentVersion = "1.3.0"; // Update when features ship
    
    if (lastVersion !== currentVersion) {
      showUpdateNotification("HTML email reports with charts + improved scheduler");
      localStorage.setItem("lastKnownVersion", currentVersion);
    }
  }

  function showUpdateNotification(message) {
    if (elements.updateNotification && elements.updateMessage) {
      elements.updateMessage.textContent = message;
      elements.updateNotification.classList.remove("hidden");
    }
  }

  function hideUpdateNotification() {
    if (elements.updateNotification) {
      elements.updateNotification.classList.add("hidden");
    }
  }
  
  function toggleAuthMode() {
    const isCurrentlyLogin = elements.saveEmailBtn.textContent === "Sign In";
    
    // Toggle button text and header
    elements.saveEmailBtn.textContent = isCurrentlyLogin ? "Create Account" : "Sign In";
    
    // Toggle helper text
    elements.toggleAuthMode.textContent = isCurrentlyLogin 
      ? "Already have an account? Sign in" 
      : "Don't have an account? Sign up";
    
    // Clear inputs and error
    elements.emailError.classList.add("hidden");
    elements.userPasswordInput.value = "";
  }

  async function saveEmail() {
    const email = elements.userEmailInput.value.trim();
    const password = elements.userPasswordInput.value;
    const isSignupMode = elements.saveEmailBtn.textContent === "Create Account";
    
    if (!validateEmail(email)) {
      showError("Please enter a valid email", elements.emailError);
      return;
    }
    
    if (!password) {
      showError("Please enter your password", elements.emailError);
      return;
    }

    try {
      elements.saveEmailBtn.disabled = true;
      elements.saveEmailBtn.textContent = isSignupMode ? "Creating Account..." : "Signing In...";
      
      // Check if it's an existing user from the old system
      let success = isSignupMode 
        ? await Auth.signup(email, password)
        : await Auth.login(email, password);
        
      if (!success) {
        throw new Error(isSignupMode 
          ? "Could not create account. Try a different email." 
          : "Invalid email or password");
      }
      
  // No separate save-email endpoint now; email already stored in auth token context

      await chrome.storage.local.set({ userEmail: email });
      elements.emailPrompt.classList.add("hidden");
      elements.mainApp.classList.remove("hidden");
      showFeedback(isSignupMode ? "Account created successfully!" : "Signed in successfully!");
      updateEmailUI(email);
      switchMainTab("analytics");
    } catch (error) {
      console.error("Error during authentication:", error);
      showError(error.message, elements.emailError);
    } finally {
      elements.saveEmailBtn.disabled = false;
      elements.saveEmailBtn.textContent = isSignupMode ? "Create Account" : "Sign In";
    }
  }

  async function updateEmail() {
    const email = elements.userEmailSettings.value.trim();
    if (!validateEmail(email)) {
      showError("Please enter a valid email");
      return;
    }

    try {
      // Verify authentication for the user
      const isAuthenticated = await Auth.isAuthenticated();
      if (!isAuthenticated) {
        // Show login UI
        const authSuccess = await Auth.authenticateUser();
        if (!authSuccess) {
          showError("Authentication required to update email");
          return;
        }
      }
      
  // Deprecated save-email endpoint removed; simply update local storage

      await chrome.storage.local.set({ userEmail: email });
      showFeedback("Email updated successfully!");
      updateEmailUI(email);
    } catch (error) {
      console.error("Error updating email:", error);
      showError(error.message);
    }
  }

  async function sendTestEmail() {
    try {
      const { userEmail, emailConfig } = await chrome.storage.local.get(["userEmail", "emailConfig"]);
      if (!userEmail) {
        showError("Please set an email first");
        elements.emailPrompt.classList.remove("hidden");
        elements.mainApp.classList.add("hidden");
        return;
      }

      if (!emailConfig || !emailConfig.enabled) {
        showFeedback("Email not configured. Set up your own email service in settings or download PDF reports instead.", false);
        return;
      }

      showFeedback("Sending test email using your configuration...", false);
      
      if (emailConfig.service === 'emailjs') {
        const html = `
          <div style="font-family:Segoe UI,Roboto,Arial,sans-serif;color:#111;line-height:1.5">
            <h2 style="margin:0 0 6px">TimeMachine Email Test</h2>
            <p style="margin:0 0 10px">Your EmailJS configuration works. You will receive full HTML reports with charts when you click <em>Send Report Now</em> or when scheduling is enabled.</p>
            <p style="margin:14px 0 0;font-size:12px;color:#666">If you see raw HTML in emails, edit your EmailJS template and use triple braces for the message variable: <code>{{{message}}}</code>.</p>
          </div>`;

        await sendEmailViaEmailJS({
          to_email: userEmail,
          subject: "TimeMachine Test Email",
          message: html,
          message_text: "TimeMachine test: Your EmailJS configuration works."
        }, emailConfig.settings);
        showFeedback("Test email sent successfully!");
      } else {
        showFeedback("SMTP and other services coming soon. Use EmailJS for now.", false);
      }
    } catch (error) {
      console.error("Error sending test email:", error);
      showError("Error sending test email: " + error.message);
    }
  }

  async function sendDailyReport() {
    try {
      const { userEmail, emailConfig } = await chrome.storage.local.get(['userEmail', 'emailConfig']);
      if (!userEmail) return showFeedback('Set email first');
      if (!emailConfig || !emailConfig.enabled || emailConfig.service !== 'emailjs') {
        return showFeedback('Configure EmailJS in Settings to email reports');
      }

      // Prepare date range for TODAY in local time
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      const timezone = today.getTimezoneOffset();

      const backend = await resolveBackendUrl();
      const deviceId = typeof Auth !== 'undefined' ? Auth.getDeviceId() : null;
      const { token } = await TokenStorage.getToken();

      // Fetch today time data to build summary
      const resp = await fetch(
        `${backend}/api/time-data/report/${encodeURIComponent(userEmail)}?date=${dateStr}&endDate=${dateStr}&timezone=${timezone}&useUserTimezone=true`,
        { headers: { 'X-Device-ID': deviceId || 'unknown', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) } }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        return showError(err.error || 'Failed to fetch data for report');
      }
      const timeData = await resp.json();

      const dataArray = Array.isArray(timeData) ? timeData : [];
      const html = generateEmailHtmlReport(dataArray, dateStr, currentSubTab);
      const text = generateEmailReport(dataArray, dateStr, currentSubTab);

      await sendEmailViaEmailJS({
        to_email: userEmail,
        subject: `TimeMachine Daily Report - ${new Date(dateStr).toLocaleDateString()}`,
        message: html,
        message_text: text
      }, emailConfig.settings);

      showFeedback('Daily report emailed!');
      return true;
    } catch (e) {
      console.error('sendDailyReport error:', e);
      showError('Failed to email report: ' + (e?.message || e));
    }
  }
  
  // Make sendDailyReport available globally for the scheduler
  window.sendDailyReport = sendDailyReport;

  // Helper function to send email via user's EmailJS configuration
  async function sendEmailViaEmailJS(templateParams, userSettings) {
    if (!userSettings || !userSettings.serviceId || !userSettings.templateId || !userSettings.publicKey) {
      throw new Error("EmailJS not configured. Please set up your EmailJS credentials in settings.");
    }

    // Send email using EmailJS REST API directly
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_id: userSettings.serviceId,
        template_id: userSettings.templateId,
        user_id: userSettings.publicKey,
        template_params: templateParams
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`EmailJS failed with status: ${response.status} - ${errorText}`);
    }
    
    return response;
  }

  // Helper function to generate email report content
  function generateEmailReport(timeData, date, timeframe = 'daily') {
    const reportTitle = timeframe === 'weekly' ? 'Weekly Report' : 
                       timeframe === 'monthly' ? 'Monthly Report' : 
                       'Daily Report';
    
    const dateText = timeframe === 'daily' ? new Date(date).toLocaleDateString() : 
                    getDateRangeDisplayText(timeframe);
    
    if (!Array.isArray(timeData) || timeData.length === 0) {
      const periodText = timeframe === 'weekly' ? 'this week' : 
                        timeframe === 'monthly' ? 'this month' : 
                        'today';
      return `TimeMachine ${reportTitle} - ${dateText}

No activity tracked ${periodText}.

Stay productive!
TimeMachine Extension`;
    }

    const categoryData = {
      Work: 0,
      Social: 0,
      Entertainment: 0,
      Professional: 0,
      Other: 0,
    };

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

    const summaryLabel = timeframe === 'weekly' ? 'WEEKLY SUMMARY' : 
                        timeframe === 'monthly' ? 'MONTHLY SUMMARY' : 
                        'DAILY SUMMARY';

    let report = `TimeMachine ${reportTitle} - ${dateText}

📊 ${summaryLabel}:
Total Time Online: ${formatDuration(totalTime)}
Productivity Score: ${productivityScore}%
Unique Sites: ${domainTimes.length}

🏆 TOP SITES:`;

    domainTimes.slice(0, 5).forEach((site, index) => {
      const percentage = totalTime > 0 ? ((site.time / totalTime) * 100).toFixed(1) : 0;
      report += `\n${index + 1}. ${site.domain}: ${formatDuration(site.time)} (${percentage}%)`;
    });

    report += `\n\n📈 BY CATEGORY:`;
    Object.entries(categoryData).forEach(([category, time]) => {
      if (time > 0) {
        const percentage = ((time / totalTime) * 100).toFixed(1);
        report += `\n${category}: ${formatDuration(time)} (${percentage}%)`;
      }
    });

    const periodText = timeframe === 'weekly' ? 'week' : 
                      timeframe === 'monthly' ? 'period' : 
                      'day';
    const insight = productivityScore >= 70 
      ? `🎉 Great job! You had a highly productive ${periodText}.`
      : productivityScore >= 40 
      ? `💪 Good work! There's room for improvement.`
      : `🎯 Focus time! Try to spend more time on productive activities.`;

    report += `\n\n💡 INSIGHT: ${insight}

Keep tracking your time to improve your productivity!

Sent via TimeMachine Extension`;

    return report;
  }

  // Build a QuickChart URL for Chart.js config
  function buildQuickChartUrl(config, { w = 700, h = 360, bkg = 'white', devicePixelRatio = 2 } = {}) {
    const c = encodeURIComponent(JSON.stringify(config));
    return `https://quickchart.io/chart?w=${w}&h=${h}&bkg=${encodeURIComponent(bkg)}&devicePixelRatio=${devicePixelRatio}&c=${c}`;
  }

  // Generate an HTML email with charts similar to the PDF
  function generateEmailHtmlReport(timeData, date, timeframe = 'daily') {
    const hasData = Array.isArray(timeData) && timeData.length > 0;
    const reportTitle = timeframe === 'weekly' ? 'Weekly Report' : 
                       timeframe === 'monthly' ? 'Monthly Report' : 
                       'Daily Report';
    const displayDate = timeframe === 'daily' ? new Date(date).toLocaleDateString() : 
                       getDateRangeDisplayText(timeframe);

    if (!hasData) {
      const periodText = timeframe === 'weekly' ? 'this week' : 
                        timeframe === 'monthly' ? 'this month' : 
                        'today';
      return `<div style="font-family:Segoe UI,Roboto,Arial,sans-serif;color:#111;line-height:1.5">
        <h2 style="margin:0 0 6px">TimeMachine ${reportTitle}</h2>
        <div style="color:#666;font-size:12px;margin:0 0 12px">${displayDate}</div>
        <p>No activity tracked ${periodText}.</p>
        <p style="margin-top:16px;color:#666;font-size:12px">Sent via TimeMachine</p>
      </div>`;
    }

    // Aggregate
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

    // Charts
    const palette = CONFIG.CHART_COLORS.light; // fixed palette for email
    const doughnutCfg = {
      type: 'doughnut',
      data: {
        labels: Object.keys(categoryData),
        datasets: [{
          data: Object.values(categoryData),
          backgroundColor: [palette.work, palette.social, palette.entertainment, palette.professional, palette.other],
          borderWidth: 0,
        }]
      },
      options: { plugins: { legend: { display: true, position: 'right' } }, cutout: '60%' }
    };

    const barCfg = {
      type: 'bar',
      data: {
        labels: topDomains.map(d => d.domain),
        datasets: [{
          label: 'Time (min)',
          data: topDomains.map(d => Math.round((d.time || 0) / 60000)),
          backgroundColor: '#3b82f6',
          borderWidth: 0,
        }]
      },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { display: false } } } }
    };

    const doughnutUrl = buildQuickChartUrl(doughnutCfg, { w: 640, h: 320, bkg: 'white', devicePixelRatio: 2 });
    const barUrl = buildQuickChartUrl(barCfg, { w: 700, h: 400, bkg: 'white', devicePixelRatio: 2 });

    // Helper rows
    const catRows = Object.entries(categoryData)
      .filter(([_, v]) => v > 0)
      .map(([k, v]) => {
        const pct = totalTime ? ((v / totalTime) * 100).toFixed(1) : '0.0';
        return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;color:#111">${k}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;color:#111">${formatDuration(v)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;color:#111">${pct}%</td></tr>`;
      }).join('');

    const domainRows = topDomains.map((d, i) => {
      const pct = totalTime ? ((d.time / totalTime) * 100).toFixed(1) : '0.0';
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;color:#111">${i + 1}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;color:#111">${d.domain}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;color:#111">${formatDuration(d.time)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;color:#111">${d.category}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;color:#111">${pct}%</td>
      </tr>`;
    }).join('');

    const periodText = timeframe === 'weekly' ? 'week' : 
                      timeframe === 'monthly' ? 'period' : 
                      'day';
    const insight = productivityScore >= 70 
      ? `Great job! Highly productive ${periodText}.`
      : productivityScore >= 40 
      ? 'Good work! There\'s room for improvement.'
      : 'Focus time! Try to spend more time on productive activities.';

    // Email HTML
    return `
      <div style="font-family:Segoe UI,Roboto,Arial,sans-serif;color:#111;line-height:1.5">
        <h2 style="margin:0 0 6px">TimeMachine ${reportTitle}</h2>
        <div style="color:#666;font-size:12px;margin:0 0 12px">${displayDate}</div>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 12px">
          <tr>
            <td style="padding:6px 8px;background:#f8fafc;border:1px solid #e5e7eb">Total Time</td>
            <td style="padding:6px 8px;border:1px solid #e5e7eb">${formatDuration(totalTime)}</td>
            <td style="padding:6px 8px;background:#f8fafc;border:1px solid #e5e7eb">Productivity</td>
            <td style="padding:6px 8px;border:1px solid #e5e7eb">${productivityScore}%</td>
          </tr>
          <tr>
            <td style="padding:6px 8px;background:#f8fafc;border:1px solid #e5e7eb">Unique Domains</td>
            <td style="padding:6px 8px;border:1px solid #e5e7eb">${uniqueDomains}</td>
            <td style="padding:6px 8px;background:#f8fafc;border:1px solid #e5e7eb">Sessions</td>
            <td style="padding:6px 8px;border:1px solid #e5e7eb">${totalSessions}</td>
          </tr>
          <tr>
            <td style="padding:6px 8px;background:#f8fafc;border:1px solid #e5e7eb">Longest Session</td>
            <td style="padding:6px 8px;border:1px solid #e5e7eb">${formatDuration(longestSession)}</td>
            <td style="padding:6px 8px;background:#f8fafc;border:1px solid #e5e7eb">Active Span</td>
            <td style="padding:6px 8px;border:1px solid #e5e7eb">${spanText}</td>
          </tr>
        </table>

        <div style="display:block;margin:12px 0 8px;font-weight:600">Category Distribution</div>
        <img src="${doughnutUrl}" alt="Category Chart" width="640" height="320" style="display:block;border:1px solid #eee;border-radius:6px" />

        <div style="display:block;margin:16px 0 8px;font-weight:600">Top Domains</div>
        <img src="${barUrl}" alt="Top Domains Chart" width="700" height="400" style="display:block;border:1px solid #eee;border-radius:6px" />

        <div style="display:block;margin:18px 0 6px;font-weight:600">Top Domains Table</div>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse">
          <thead>
            <tr>
              <th align="left" style="padding:6px 8px;background:#f1f5f9;border-bottom:1px solid #e5e7eb;color:#111;font-size:12px">#</th>
              <th align="left" style="padding:6px 8px;background:#f1f5f9;border-bottom:1px solid #e5e7eb;color:#111;font-size:12px">Domain</th>
              <th align="left" style="padding:6px 8px;background:#f1f5f9;border-bottom:1px solid #e5e7eb;color:#111;font-size:12px">Time</th>
              <th align="left" style="padding:6px 8px;background:#f1f5f9;border-bottom:1px solid #e5e7eb;color:#111;font-size:12px">Category</th>
              <th align="left" style="padding:6px 8px;background:#f1f5f9;border-bottom:1px solid #e5e7eb;color:#111;font-size:12px">Share</th>
            </tr>
          </thead>
          <tbody>
            ${domainRows}
          </tbody>
        </table>

        <div style="margin-top:14px;padding:10px 12px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;color:#0f172a">
          <strong>Insight:</strong> ${insight}
        </div>

        <p style="margin-top:16px;color:#666;font-size:12px">Charts are rendered via QuickChart. Images may be hidden by your email client until you click “display images”.</p>
        <p style="margin-top:6px;color:#666;font-size:12px">Sent via TimeMachine</p>
      </div>`;
  }

  async function downloadReport() {
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (!userEmail) return showFeedback('Set email first');
      const backend = await resolveBackendUrl();
      const today = new Date().toISOString().split('T')[0];
      // Get the device ID for authentication
      const deviceId = typeof Auth !== 'undefined' ? Auth.getDeviceId() : null;
      
      const { token } = await TokenStorage.getToken();
      const res = await fetch(`${backend}/api/report/generate`, {
        method: 'POST', 
        headers: { 
          'Content-Type': 'application/json',
          'X-Device-ID': deviceId || 'unknown',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }, 
        body: JSON.stringify({ date: today, userEmail, useUserTimezone: true })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to generate report');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `daily_report_${today}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showFeedback("Report downloaded!");
    } catch (error) {
      console.error("Error downloading report:", error);
      showError("Error downloading report: " + error.message);
    }
  }

  function updateCharCount() {
    const count = elements.feedbackMessage.value.length;
    elements.charCount.textContent = `${count}/500`;
    elements.charCount.classList.toggle("text-red-500", count > 500);
    elements.sendFeedbackBtn.disabled = count === 0 || count > 500;
  }

  async function sendFeedback() {
    try {
      const message = elements.feedbackMessage.value.trim();
      if (!message) return showFeedback('Enter feedback');
      
      // Check if authenticated first
      if (!await Auth.isAuthenticated()) {
        return showFeedback('Please log in to submit feedback', false);
      }
      
      const result = await apiCall('/api/feedback/submit', {
        method: 'POST',
        body: JSON.stringify({ message })
      });

      if (result) {
        elements.feedbackMessage.value = "";
        updateCharCount();
        showFeedback("Feedback sent successfully!");
      }
    } catch (error) {
      console.error("Error sending feedback:", error);
      showError("Error sending feedback: " + error.message);
    }
  }

  // Auto-refresh function called when switching tabs
  function refreshData() {
    if (currentMainTab === "insights") {
  AnalyticsTab.load(currentSubTab).catch(console.error);
    }
  }

  function switchSubTab(tab) {
    currentSubTab = tab;
    elements.tabButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    
  try { AnalyticsTab.updateDateRangeDisplay(currentSubTab); } catch(_) {}
  elements.siteList.innerHTML = '<div class="loading-text"><span class="loader"></span>Loading data...</div>';
  AnalyticsTab.load(currentSubTab).catch(console.error);
  }

  function switchMainTab(mainTab) {
    currentMainTab = mainTab;

    // Hide all main tab contents by removing active class
    const allTabContents = document.querySelectorAll('.main-tab-content');
    allTabContents.forEach(content => content.classList.remove('active'));
    
    // Hide settings tab content
    elements.settingsTabContent.classList.add("hidden");

    // Show the selected tab content by adding active class
    if (mainTab === "analytics") {
      document.getElementById('analyticsTabContent').classList.add('active');
  AnalyticsTab.load(currentSubTab).catch(console.error);
    } else if (mainTab === "stopwatch") {
      // Delegate to SolverTab module
      SolverTab.show().catch(console.error);
    } else if (mainTab === "summary") {
  // Delegate to SummaryTab module
  SummaryTab.show().catch(console.error);
    } else if (mainTab === "focus") {
      // Delegate to FocusTab module
      FocusTab.show().catch(console.error);
    } else if (mainTab === "guard") {
      // Delegate to GuardTab module
      GuardTab.show().catch(console.error);
    } else if (mainTab === "settings") {
      elements.settingsTabContent.classList.remove("hidden");
    }

    // Update main tab button states
    document.querySelectorAll('.main-tab').forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.maintab === mainTab);
    });
    
    // Update legacy main tab buttons if they exist
    elements.mainTabButtons?.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mainTab === mainTab);
    });
  }

  // Initialize with analytics tab
  function initializeApp() {
    switchMainTab("analytics");
    if (typeof FocusSessionsManager !== 'undefined') {
      FocusSessionsManager.init();
    }
  }

  // Focus stats are handled by FocusTab.updateStats

  // Update guard stats display (moved to GuardTab.updateStats)

  // Update insights overview
  function updateInsightsOverview(timeData = {}) {
    // Update total time today
    const totalTimeElement = document.getElementById('totalTimeToday');
    if (totalTimeElement && timeData.totalTime) {
      totalTimeElement.textContent = formatDuration(timeData.totalTime);
    }

    // Update productivity score
    const productivityScoreElement = document.getElementById('productivityScore');
    if (productivityScoreElement) {
      // Use existing productivity score element or calculate
      const existingScore = elements.productivityScore?.textContent || '0%';
      productivityScoreElement.textContent = existingScore;
    }

    // Update sites visited
    const sitesVisitedElement = document.getElementById('sitesVisited');
    if (sitesVisitedElement && timeData.domainTimes) {
      const siteCount = Object.keys(timeData.domainTimes).length;
      sitesVisitedElement.textContent = siteCount.toString();
    }
  }

  async function initEmailPrompt() {
    try {
      // Check if already authenticated
      const { userEmail, emailConfig } = await chrome.storage.local.get(["userEmail", "emailConfig"]);
      
      let isAuthenticated = false;
      try {
        if (typeof Auth !== 'undefined') {
          isAuthenticated = await Auth.isAuthenticated();
        }
      } catch (authError) {
        console.warn('Auth check failed:', authError);
        // Fallback: check if token exists
        const { tm_auth_token } = await chrome.storage.local.get(["tm_auth_token"]);
        isAuthenticated = !!tm_auth_token;
      }
      
      // Temporary bypass for testing - if Auth is undefined, just check for email
      if (typeof Auth === 'undefined' && userEmail && validateEmail(userEmail)) {
        console.log('Auth module not available, using email-only auth');
        isAuthenticated = true;
      }
      
      if (isAuthenticated && userEmail && validateEmail(userEmail)) {
        // User is already authenticated and has email set
        elements.emailPrompt.classList.add("hidden");
        elements.mainApp.classList.remove("hidden");
        updateEmailUI(userEmail);
        loadEmailConfiguration(emailConfig);
        switchMainTab("analytics");
        checkForUpdates(); // Check for updates when app loads

        // Initialize focus sessions module if available
        if (typeof FocusSessionsManager !== 'undefined') {
          FocusSessionsManager.handleAuthChanged(true);
        }
      } else {
        // User needs to authenticate
        elements.emailPrompt.classList.remove("hidden");
        elements.mainApp.classList.add("hidden");

        // Handle focus sessions for unauthenticated state
        if (typeof FocusSessionsManager !== 'undefined') {
          FocusSessionsManager.handleAuthChanged(false);
        }
      }
    } catch (error) {
      console.error("Error initializing email prompt:", error);
      // Fallback: show login form
      elements.emailPrompt.classList.remove("hidden");
      elements.mainApp.classList.add("hidden");
    }
  }

  function handleEmailServiceChange() {
    const service = elements.emailServiceSelect.value;
    elements.emailjsConfig.classList.toggle("hidden", service !== "emailjs");
  }

  async function saveEmailConfiguration() {
    const service = elements.emailServiceSelect.value;
    
    if (service === "emailjs") {
      const serviceId = elements.emailjsServiceId.value.trim();
      const templateId = elements.emailjsTemplateId.value.trim();
      const publicKey = elements.emailjsPublicKey.value.trim();
      
      if (!serviceId || !templateId || !publicKey) {
        showError("Please fill in all EmailJS fields");
        return;
      }
      
      const emailConfig = {
        enabled: true,
        service: "emailjs",
        settings: {
          serviceId,
          templateId,
          publicKey
        }
      };
      
      await chrome.storage.local.set({ emailConfig });
      showFeedback("EmailJS configuration saved! You can now send email reports.");
    } else {
      await chrome.storage.local.set({ emailConfig: { enabled: false } });
      showFeedback("Email service disabled.");
    }
  }

  function loadEmailConfiguration(emailConfig) {
    if (emailConfig && emailConfig.enabled) {
      elements.emailServiceSelect.value = emailConfig.service || "";
      
      if (emailConfig.service === "emailjs" && emailConfig.settings) {
        elements.emailjsServiceId.value = emailConfig.settings.serviceId || "";
        elements.emailjsTemplateId.value = emailConfig.settings.templateId || "";
        elements.emailjsPublicKey.value = emailConfig.settings.publicKey || "";
        elements.emailjsConfig.classList.remove("hidden");
      }
    }
  }

  // Focus sessions list is rendered by FocusTab

  // Analytics data is handled by AnalyticsTab

  // Analytics rendering handled by AnalyticsTab

  // Quick insights handled by AnalyticsTab

  async function updateSiteCategory(domain, category) {
    try {
      const validCategories = [
        "Work",
        "Social",
        "Entertainment",
        "Professional",
        "Other",
      ];
      if (!validCategories.includes(category)) {
        showError("Invalid category selected");
        return;
      }

      const { userEmail } = await chrome.storage.local.get(["userEmail"]);
      if (!userEmail) {
        showError("Please set an email first");
        return;
      }

      const categorySelect = document.querySelector(
        `.category-select[data-domain="${domain}"]`
      );
      categorySelect.disabled = true;
      showFeedback(`Updating ${domain} category...`, false);

      // Use SiteTracker to update category
  const tracker = window.SiteTracker || SiteTracker;
      const response = await tracker.updateSiteCategory(domain, category);

      if (response?.status !== "success") {
        throw new Error(response?.error || "Failed to update category");
      }

      siteCategories[domain] = category;
      await chrome.storage.local.set({ siteCategories });

      categorySelect.disabled = false;
      showFeedback(`Category for ${domain} updated to ${category}`);
  AnalyticsTab.load(currentSubTab).catch(console.error);
    } catch (error) {
      console.error("Error updating site category:", error);
      const categorySelect = document.querySelector(
        `.category-select[data-domain="${domain}"]`
      );
      if (categorySelect) categorySelect.disabled = false;
      if (error.message.includes("The message port closed")) {
        showFeedback(`Category for ${domain} updated to ${category}`);
        loadStats();
      } else {
        showError("Failed to update category: " + error.message);
      }
    }
  }

  // Date calculation handled by AnalyticsTab

  // Date display text handled by AnalyticsTab

  // Date range display handled by AnalyticsTab

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function updateEmailUI(email) {
    elements.emailDisplay.textContent = email;
    elements.userEmailSettings.value = email;
    elements.emailDisplay.classList.remove("hidden");
    elements.userEmailSettings.classList.add("hidden");
    elements.updateEmailBtn.classList.add("hidden");
    elements.editEmailBtn.classList.remove("hidden");
  }

  function showFeedback(message, isError = false) {
    elements.feedbackToast.textContent = message;
    elements.feedbackToast.className = `feedback-toast ${
      isError ? "error" : "success"
    }`;
    setTimeout(() => {
      elements.feedbackToast.className = "feedback-toast";
    }, 3000);
  }

  function showError(message, element = elements.errorDisplay) {
    element.textContent = message;
    element.classList.remove("hidden");
  }

  // Initialize character count
  updateCharCount();
  
  // Report Scheduler Functions
  async function initReportScheduler() {
    // Initialize the scheduler backend
    const settings = await reportScheduler.initialize();
    
    // Get UI elements
    const scheduleToggle = document.getElementById('scheduleToggle');
    const scheduleOptions = document.getElementById('scheduleOptions');
    const scheduleFrequency = document.getElementById('scheduleFrequency');
    const daySelector = document.getElementById('daySelector');
    const scheduleDay = document.getElementById('scheduleDay');
    const scheduleTime = document.getElementById('scheduleTime');
    const scheduleInactiveToggle = document.getElementById('scheduleInactiveToggle');
    const nextScheduled = document.getElementById('nextScheduled');
    
    if (!scheduleToggle) return; // Exit if elements not found
    
    // Set initial UI state based on settings
    if (settings.enabled) {
      scheduleToggle.classList.add('active');
      scheduleOptions.classList.remove('hidden');
    } else {
      scheduleToggle.classList.remove('active');
      scheduleOptions.classList.add('hidden');
    }
    
    scheduleFrequency.value = settings.frequency;
    scheduleTime.value = settings.time;
    
    if (settings.includeInactive) {
      scheduleInactiveToggle.classList.add('active');
    }
    
    // Configure day selector based on frequency
    updateDaySelector(settings.frequency, settings.day);
    
    // Update next scheduled time
    updateNextScheduledDisplay();
    
    // Event handlers
    scheduleToggle.addEventListener('click', async () => {
      const isEnabled = scheduleToggle.classList.toggle('active');
      if (isEnabled) {
        scheduleOptions.classList.remove('hidden');
      } else {
        scheduleOptions.classList.add('hidden');
      }
      await reportScheduler.saveSettings({ enabled: isEnabled });
      updateNextScheduledDisplay();
    });
    
    scheduleFrequency.addEventListener('change', async () => {
      const frequency = scheduleFrequency.value;
      updateDaySelector(frequency, 1); // Reset to default day when changing frequency
      await reportScheduler.saveSettings({ frequency });
      updateNextScheduledDisplay();
    });
    
    scheduleDay.addEventListener('change', async () => {
      const day = parseInt(scheduleDay.value, 10);
      await reportScheduler.saveSettings({ day });
      updateNextScheduledDisplay();
    });
    
    scheduleTime.addEventListener('change', async () => {
      const time = scheduleTime.value;
      await reportScheduler.saveSettings({ time });
      updateNextScheduledDisplay();
    });
    
    scheduleInactiveToggle.addEventListener('click', async () => {
      const includeInactive = scheduleInactiveToggle.classList.toggle('active');
      await reportScheduler.saveSettings({ includeInactive });
    });
  }
  
  // Helper function to update the day selector based on frequency
  function updateDaySelector(frequency, selectedDay) {
    const daySelector = document.getElementById('daySelector');
    const scheduleDay = document.getElementById('scheduleDay');
    
    if (!daySelector || !scheduleDay) return;
    
    // Clear existing options
    scheduleDay.innerHTML = '';
    
    if (frequency === 'daily') {
      daySelector.classList.add('hidden');
      return;
    }
    
    daySelector.classList.remove('hidden');
    
    if (frequency === 'weekly') {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      days.forEach((day, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = day;
        scheduleDay.appendChild(option);
      });
      scheduleDay.value = selectedDay || 1; // Default to Monday
    } 
    else if (frequency === 'monthly') {
      for (let i = 1; i <= 28; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Day ${i}`;
        scheduleDay.appendChild(option);
      }
      scheduleDay.value = selectedDay || 1; // Default to 1st day of month
    }
  }
  
  // Update the display showing the next scheduled report time
  function updateNextScheduledDisplay() {
    const nextScheduled = document.getElementById('nextScheduled');
    if (!nextScheduled) return;
    
    const nextTime = reportScheduler.getNextScheduledTime();
    
    if (!nextTime) {
      nextScheduled.textContent = '';
      nextScheduled.classList.add('hidden');
      return;
    }
    
    const formattedDate = nextTime.toLocaleString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    nextScheduled.textContent = `Next report: ${formattedDate}`;
    nextScheduled.classList.remove('hidden');
  }
  
  // Focus Session Functions
  // Focus sessions list handled entirely by FocusTab module.

  function showFocusSettings() {
    // Use the quick time buttons instead of prompts - no dialogues needed
    console.log('Focus settings managed through time buttons');
  }

  // Website Blocking: moved to GuardTab module

  function showToast(message, type = 'success') {
    // Remove any existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
      existingToast.remove();
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    // Add to body
    document.body.appendChild(toast);
    
    // Show toast
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Hide and remove toast
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Expose minimal UI helpers for tab modules
  window.showToast = showToast;
  window.showModal = showModal;
  window.hideModal = hideModal;
  window.showConfirmModal = showConfirmModal;

  // Modal functions
  function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
      const firstInput = modal.querySelector('.form-input');
      if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
      }
    }
  }

  function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  // Make closeModal available globally for onclick handlers
  window.hideModal = hideModal;
  window.closeModal = hideModal;

  function hideAllModals() {
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => modal.classList.add('hidden'));
  }

  // Guard: add-site modal is opened by GuardTab

  // Guard quick-input add is now handled inside GuardTab

  // Guard add-site modal submission handled by GuardTab.handleAddSite

  // Focus settings and start handlers are managed by FocusTab

  function showConfirmModal(title, message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const confirmBtn = document.getElementById('confirmButton');
    
    if (!modal || !titleEl || !messageEl || !confirmBtn) {
      console.error('Confirm modal elements not found');
      return;
    }
    
    titleEl.textContent = title;
    messageEl.textContent = message;
    
    // Remove any existing event listeners
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    // Add new event listener
    newConfirmBtn.addEventListener('click', () => {
      hideModal('confirmModal');
      if (onConfirm) onConfirm();
    });
    
    showModal('confirmModal');
  }

  // Guard-specific add/toggle/remove moved to GuardTab

  // Legacy Pomodoro timer removed; FocusTab drives timer UI

  // Initialize enhanced features (Guard only; Focus handled by FocusTab)
  function initializeEnhancedFeatures() {
    Auth.isAuthenticated().then(authed => {
      if (authed) {
        GuardTab.loadSitesFromDatabase?.();
      }
    });
    GuardTab.loadItems?.();
  }

  function loadFocusSettings() {
    chrome.storage.local.get(['focusSettings'], (result) => {
      const settings = result.focusSettings || {
        focusDuration: 25,
        breakDuration: 5,
        notificationSounds: true,
        blockWebsitesDuringFocus: false
      };
      
      // Set default duration in the start session modal
      const focusDurationInput = document.getElementById('focusDuration');
      if (focusDurationInput) {
        focusDurationInput.value = settings.focusDuration;
      }
      
      // Update timer display if not running
      const pomodoroStatus = document.getElementById('pomodoroStatus');
      if (pomodoroStatus && pomodoroStatus.textContent === '25:00') {
        const minutes = settings.focusDuration;
        const display = `${minutes}:00`;
        pomodoroStatus.textContent = display;
      }
    });
  }

  // Modal event listeners
  function initializeModalEvents() {
    // Close modal when clicking outside
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          hideAllModals();
        }
      });
    });

    // Close modal buttons
    document.querySelectorAll('.modal-close, .btn-cancel').forEach(btn => {
      btn.addEventListener('click', hideAllModals);
    });

    // Add site modal
  const addSiteBtn = document.getElementById('addSiteBtn');
  if (addSiteBtn) { addSiteBtn.addEventListener('click', () => GuardTab.handleAddSite()); }

  // Focus session modal events are handled by FocusTab

  // Quick time buttons handled by FocusTab module

  // Focus controls are handled by FocusTab

    // Timer editing disabled - use quick time buttons instead
    const pomodoroStatus = document.getElementById('pomodoroStatus');
    if (pomodoroStatus) {
      // Remove click handler to prevent editing dialogues
      pomodoroStatus.style.cursor = 'default';
      pomodoroStatus.removeAttribute('title');
    }

  // Focus history actions handled by FocusTab

    // ESC key to close modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideAllModals();
      }
    });

    // Form submission on Enter key
    document.querySelectorAll('.form-input').forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const modal = input.closest('.modal-overlay');
          if (modal) {
            const submitBtn = modal.querySelector('.btn-primary');
            if (submitBtn) {
              submitBtn.click();
            }
          }
        }
      });
    });
  }

  // Legacy Focus timer/history functions removed; FocusTab is authoritative


  // Call initialization for enhanced features and modals
  initializeEnhancedFeatures();
  initializeModalEvents();
  try { AnalyticsTab.updateDateRangeDisplay(currentSubTab); } catch(_) {}

  // Initialize all components
  initTheme();
  
  // Guard tab setup handled by GuardTab.show() when selected

  // Add sample focus sessions for testing (only if none exist)
  // Removed sample session injection to prevent false data.

  // GuardTab initialization (lazy)
  GuardTab.init?.();
});
