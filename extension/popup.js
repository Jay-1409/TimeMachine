import reportScheduler from './report-scheduler.js';

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

function formatDuration(milliseconds) {
  if (isNaN(milliseconds) || milliseconds < 0) {
    return "0m";
  }
  
  const MAX_DISPLAY_DURATION = 24 * 60 * 60 * 1000;
  if (milliseconds > MAX_DISPLAY_DURATION) {
    console.warn(`Capping displayed duration from ${milliseconds}ms to ${MAX_DISPLAY_DURATION}ms`);
    milliseconds = MAX_DISPLAY_DURATION;
  }

  const totalSeconds = Math.floor(milliseconds / 1000);

  if (totalSeconds === 0) {
    return "0m";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

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
  try {
    const now = Date.now();
    if (__backendUrlCache.value && (now - __backendUrlCache.ts) < BACKEND_URL_TTL) {
      return __backendUrlCache.value;
    }
    if (window.TMConfig) {
      await window.TMConfig.loadOverrides();
      const url = window.TMConfig.current.backendBaseUrl;
      __backendUrlCache = { value: url, ts: now };
      return url;
    }
  } catch (e) {
    console.warn("resolveBackendUrl fallback due to error:", e);
  }
  // Fallback default
  const fallback = "https://timemachine-1.onrender.com";
  __backendUrlCache = { value: fallback, ts: Date.now() };
  return fallback;
}

async function apiCall(endpoint, options = {}) {
  try {
    const backendUrl = await resolveBackendUrl();
    const url = `${backendUrl}${endpoint}`;
    
    // Get authentication token
    const token = localStorage.getItem('tm_auth_token');
    
    // Set default headers
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    // Add authentication if token exists
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(url, {
      ...options,
      headers
    });
    
    const data = await response.json();
    
    // Handle authentication errors
    if (response.status === 401) {
      if (data.code === 'TOKEN_EXPIRED' || data.code === 'AUTH_REQUIRED') {
        // Clear expired token and redirect to login
        await Auth.logout();
        showError('Your session has expired. Please login again.');
        return null;
      }
    }
    
    if (!response.ok) {
      throw new Error(data.message || data.error || `HTTP ${response.status}`);
    }
    
    return data;
  } catch (error) {
    console.error(`API call to ${endpoint} failed:`, error);
    throw error;
  }
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
    addBlockedSite: document.getElementById("addBlockedSite"),
    blockedSitesList: document.getElementById("blockedSitesList"),
    blockingStatus: document.getElementById("blockingStatus"),
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
  
  // Stopwatch state
  let activeSession = null;
  let stopwatchInterval = null;
  let sessionStartTime = null;
  let pausedDuration = 0;

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
    if (timeChart) {
      timeChart.options.plugins.legend.labels.color = getLegendColor();
      timeChart.update();
    }
    updateThemeDropdownUI();
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
    
    // Focus and blocking event listeners
    elements.focusSettings?.addEventListener('click', showFocusSettings);
    elements.addBlockedSite?.addEventListener('click', showAddBlockedSiteModal);
    
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
            const domain = url.hostname;
            
            // Add to blocked sites
            const { blockedSites = [] } = await chrome.storage.local.get(['blockedSites']);
            if (!blockedSites.find(site => site.url === domain)) {
              blockedSites.push({
                url: domain,
                addedAt: new Date().toISOString(),
                timeRestrictions: {}
              });
              await chrome.storage.local.set({ blockedSites });
              showFeedback(`Blocked ${domain}`, false);
              loadBlockedSites();
              updateGuardStats();
            } else {
              showFeedback(`${domain} is already blocked`, true);
            }
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
          window.removeBlockedSite(btn.dataset.domain);
        } else if (type === 'keyword' && btn.dataset.keyword) {
          removeBlockedKeyword(btn.dataset.keyword);
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
    
    if (currentMainTab === "analytics" && timeChart) {
      loadStats();
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

  // Pomodoro integration (Phase 1 scaffold)
  async function refreshPomodoro() {
    try {
      const state = await chrome.runtime.sendMessage({ action: 'getPomodoroState' });
      if (!state || !elements.pomodoroStatus) return;
      const { state: s, defaults } = state;
      
      const timerEl = document.querySelector('.timer-label');
      const card = document.getElementById('pomodoroCard');
      
      if (!s.running) {
        // Default display when idle
        elements.pomodoroStatus.textContent = `${defaults.workMinutes.toString().padStart(2, '0')}:00`;
        elements.pomodoroToggle.textContent = 'Start Focus';
        if (timerEl) timerEl.textContent = 'Focus Session';
        card.classList.remove('break-mode', 'active-timer');
      } else {
        // Active timer display
        const remaining = Math.max(0, s.endsAt - Date.now());
        const mm = Math.floor(remaining/60000).toString().padStart(2,'0');
        const ss = Math.floor((remaining%60000)/1000).toString().padStart(2,'0');
        elements.pomodoroStatus.textContent = `${mm}:${ss}`;
        elements.pomodoroToggle.textContent = 'Stop';
        
        // Update mode display with appropriate labels
        if (timerEl) {
          if (s.mode === 'work') {
            timerEl.textContent = 'Focus Session';
          } else {
            timerEl.textContent = 'Break Time';
          }
        }
        
        // Apply special styling for break/work modes
        card.classList.add('active-timer');
        if (s.mode === 'break') {
          card.classList.add('break-mode');
        } else {
          card.classList.remove('break-mode');
        }
      }
    } catch (e) {
      console.log('Error refreshing pomodoro:', e);
    }
  }

  // Old pomodoro code removed - using new focus session system
  
  // Old pomodoro refresh disabled - using new focus session system
  // setInterval(refreshPomodoro, 1000);
  // refreshPomodoro();

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
        `${backend}/api/time-data/report/${encodeURIComponent(userEmail)}?date=${dateStr}&endDate=${dateStr}&timezone=${timezone}`,
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
        body: JSON.stringify({ date: today, userEmail })
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
      loadStats();
    }
  }

  function switchSubTab(tab) {
    currentSubTab = tab;
    elements.tabButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    
    // Update date range display
    updateDateRangeDisplay();
    
    // Show loading state before fetching data
    elements.siteList.innerHTML = '<div class="loading-text"><span class="loader"></span>Loading data...</div>';
    loadStats();
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
      loadStats();
    } else if (mainTab === "stopwatch") {
      document.getElementById('stopwatchTabContent').classList.add('active');
      initializeStopwatch();
    } else if (mainTab === "summary") {
      const summaryTab = document.getElementById('summaryTabContent');
      summaryTab.classList.add('active');
      initializeSummaryTab();
    } else if (mainTab === "focus") {
      const focusTab = document.getElementById('focusTabContent');
      focusTab.classList.add('active');
      loadFocusSessions();
      updateFocusStats();
    } else if (mainTab === "guard") {
      const guardTab = document.getElementById('guardTabContent');
      guardTab.classList.add('active');
      loadBlockedSites();
      updateGuardStats();
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
  }

  // Update focus stats display
  function updateFocusStats() {
    // Update daily focus time
    const dailyFocusElement = document.getElementById('dailyFocusTime');
    if (dailyFocusElement) {
      // Get from storage or calculate
      chrome.storage.local.get(['focusSessions'], (result) => {
        const sessions = result.focusSessions || [];
        const today = new Date().toDateString();
        const todaySessions = sessions.filter(session => 
          new Date(session.startTime).toDateString() === today && session.completed
        );
        const totalTime = todaySessions.reduce((total, session) => total + session.duration, 0);
        const hours = Math.floor(totalTime / 60);
        const minutes = totalTime % 60;
        dailyFocusElement.textContent = `${hours}h ${minutes}m`;
      });
    }

    // Update focus streak
    const streakElement = document.getElementById('focusStreak');
    if (streakElement) {
      // Calculate streak logic here
      streakElement.textContent = '0'; // Placeholder
    }

    // Update completed sessions
    const completedElement = document.getElementById('completedSessions');
    if (completedElement) {
      chrome.storage.local.get(['focusSessions'], (result) => {
        const sessions = result.focusSessions || [];
        const today = new Date().toDateString();
        const todaySessions = sessions.filter(session => 
          new Date(session.startTime).toDateString() === today && session.completed
        );
        completedElement.textContent = todaySessions.length.toString();
      });
    }
  }

  // Update guard stats display
  function updateGuardStats() {
    // Update blocked sites count
    const blockedCountElement = document.getElementById('blockedSitesCount');
    if (blockedCountElement) {
      chrome.storage.local.get(['blockedSites'], (result) => {
        const blockedSites = result.blockedSites || [];
        blockedCountElement.textContent = blockedSites.length.toString();
      });
    }

    // Update blocked today count
    const blockedTodayElement = document.getElementById('blockedToday');
    if (blockedTodayElement) {
      // This would come from tracking blocked attempts
      blockedTodayElement.textContent = '0'; // Placeholder
    }

    // Update time saved
    const timeSavedElement = document.getElementById('timeSaved');
    if (timeSavedElement) {
      // Calculate time saved from blocked attempts
      timeSavedElement.textContent = '0m'; // Placeholder
    }
  }

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
      } else {
        // User needs to authenticate
        elements.emailPrompt.classList.remove("hidden");
        elements.mainApp.classList.add("hidden");
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

  async function loadStats() {
    if (currentMainTab !== 'analytics') return;
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (!userEmail) {
        showError('Please set an email first');
        elements.emailPrompt.classList.remove('hidden');
        elements.mainApp.classList.add('hidden');
        return;
      }
      elements.siteList.innerHTML = '<div class="loading-text"><span class="loader"></span>Loading data...</div>';
      elements.errorDisplay.classList.add('hidden');
      const backend = await resolveBackendUrl();
      const { startDate, endDate, timezone } = getDateRangeForTab(currentSubTab);
      
      // Debug logging for date ranges
      console.log(`[TimeMachine] Loading ${currentSubTab} data:`, {
        startDate,
        endDate,
        timezone,
        userEmail
      });
      
      // Get the device ID for authentication
      const deviceId = typeof Auth !== 'undefined' ? Auth.getDeviceId() : null;
      
      const { token } = await TokenStorage.getToken();
      const response = await fetch(
        `${backend}/api/time-data/report/${encodeURIComponent(userEmail)}?date=${startDate}&endDate=${endDate}&timezone=${timezone}`,
        {
          headers: {
            'X-Device-ID': deviceId || 'unknown',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to load data");
      }

      const timeData = await response.json();
      
      // Debug logging for received data
      console.log(`[TimeMachine] Received ${currentSubTab} data:`, {
        dataType: Array.isArray(timeData) ? 'array' : typeof timeData,
        dataCount: Array.isArray(timeData) ? timeData.length : 'N/A',
        dataStructure: timeData?.data ? 'wrapped' : 'direct',
        sample: Array.isArray(timeData) ? timeData[0] : timeData
      });
      
      // Handle wrapped response format
      const actualData = timeData?.data || timeData;
      
      if (!Array.isArray(actualData)) {
        console.warn("Received non-array timeData:", timeData);
        throw new Error("Invalid data format received from server");
      }

      const { siteCategories: storedCategories } =
        await chrome.storage.local.get(["siteCategories"]);
      siteCategories = storedCategories || {};

      renderSiteList(actualData);
    } catch (error) {
      console.error("Failed to load stats:", error);
      elements.siteList.innerHTML =
        '<div class="empty-state">Error loading data</div>';
      showError(`Error loading data: ${error.message}`);
    }
  }

  function renderSiteList(timeData) {
    if (timeChart) {
      timeChart.destroy();
      timeChart = null;
    }
    
    // Debug logging for data aggregation
    console.log(`[TimeMachine] Rendering ${currentSubTab} data:`, {
      rawDataCount: timeData?.length || 0,
      sampleEntry: timeData?.[0],
      timeframe: currentSubTab
    });

    if (!Array.isArray(timeData) || timeData.length === 0) {
      // Show more informative message based on current tab
      let message = 'No data available';
      if (currentSubTab === 'weekly') {
        message = 'No data available for the past 7 days. Start browsing to track your activity.';
      } else if (currentSubTab === 'monthly') {
        message = 'No data available for the past 30 days. Continue using TimeMachine to build your productivity insights.';
      } else {
        message = 'No activity tracked today. Start browsing to collect data.';
      }
      
      elements.siteList.innerHTML =
        `<div class="empty-state">${message}</div>`;
      elements.productivityScore.textContent = "0%";
      return;
    }

    const categoryData = {
      Work: 0,
      Social: 0,
      Entertainment: 0,
      Professional: 0,
      Other: 0,
    };

    const domainTimes = {};

    timeData.forEach((entry) => {
      if (!entry || typeof entry !== "object" || !entry.domain) {
        console.warn("Invalid timeData entry:", entry);
        return;
      }
      const totalTime = (entry.totalTime || 0);
      const category =
        siteCategories[entry.domain] || entry.category || "Other";
      categoryData[category] += totalTime;
      
      // Aggregate domain times (for weekly/monthly, sum up same domains from different days)
      if (domainTimes[entry.domain]) {
        domainTimes[entry.domain].time += totalTime;
      } else {
        domainTimes[entry.domain] = { time: totalTime, category };
      }
    });
    
    // Debug logging for aggregated data
    const totalAggregatedTime = Object.values(categoryData).reduce((sum, time) => sum + time, 0);
    console.log(`[TimeMachine] Aggregated ${currentSubTab} data:`, {
      totalDomains: Object.keys(domainTimes).length,
      totalTime: totalAggregatedTime,
      categoryBreakdown: categoryData,
      topDomains: Object.entries(domainTimes)
        .sort((a, b) => b[1].time - a[1].time)
        .slice(0, 3)
        .map(([domain, data]) => ({ domain, time: data.time }))
    });

    if (Object.keys(domainTimes).length === 0) {
      elements.siteList.innerHTML =
        '<div class="empty-state">No valid data to display</div>';
      elements.productivityScore.textContent = "0%";
      return;
    }

    const totalTime = Object.values(categoryData).reduce(
      (sum, time) => sum + time,
      0
    );
    let productiveTime =
      categoryData.Work + categoryData.Professional + categoryData.Other * 0.5;
    const productivityScore =
      totalTime > 0 ? Math.round((productiveTime / totalTime) * 100) : 0;
    elements.productivityScore.textContent = `${productivityScore}%`;

    elements.productivityScore.className = `score-badge ${
      productivityScore >= 70
        ? "bg-green-500"
        : productivityScore >= 40
        ? "bg-yellow-500"
        : "bg-red-500"
    }`;

    const sortedDomainTimes = Object.entries(domainTimes).sort((a, b) => b[1].time - a[1].time);

    // Build quick insights summary
    buildQuickInsights({
      totalTime,
      productivityScore,
      categoryData,
      sortedDomainTimes,
      timeframe: currentSubTab
    });

    // Update insights overview cards
    updateInsightsOverview({
      totalTime,
      productivityScore,
      domainTimes,
      categoryData
    });

    elements.siteList.innerHTML = sortedDomainTimes
      .map(
        ([domain, data], index) => `
        <div class="site-item ${index < 3 ? "top-site" : ""}">
          <div class="site-info">
            <span class="site-domain">${domain}</span>
            <select class="category-select" data-domain="${domain}">
              <option value="Work" ${
                data.category === "Work" ? "selected" : ""
              }>Work</option>
              <option value="Social" ${
                data.category === "Social" ? "selected" : ""
              }>Social</option>
              <option value="Entertainment" ${
                data.category === "Entertainment" ? "selected" : ""
              }>Entertainment</option>
              <option value="Professional" ${
                data.category === "Professional" ? "selected" : ""
              }>Professional</option>
              <option value="Other" ${
                data.category === "Other" ? "selected" : ""
              }>Other</option>
            </select>
          </div>
          <span class="site-time">${formatDuration(data.time)}</span>
        </div>
      `
      )
      .join("");

    const ctx = document.getElementById("timeChart").getContext("2d");
    const colors = CONFIG.CHART_COLORS[currentTheme];

    timeChart = new Chart(ctx, {
      ...CHART_CONFIG,
      data: {
        labels: Object.keys(categoryData),
        datasets: [
          {
            data: Object.values(categoryData),
            backgroundColor: [
              colors.work,
              colors.social,
              colors.entertainment,
              colors.professional,
              colors.other,
            ],
            borderWidth: 0,
          },
        ],
      },
      options: {
        ...CHART_CONFIG.options,
        plugins: {
          ...CHART_CONFIG.options.plugins,
          legend: {
            ...CHART_CONFIG.options.plugins.legend,
            labels: {
              ...CHART_CONFIG.options.plugins.legend.labels,
              color: getLegendColor(),
            },
          },
        },
      },
    });

    document.querySelectorAll(".category-select").forEach((select) => {
      select.addEventListener("change", async (event) => {
        const domain = event.target.dataset.domain;
        const newCategory = event.target.value;
        await updateSiteCategory(domain, newCategory);
      });
    });
  }

  function buildQuickInsights({ totalTime, productivityScore, categoryData, sortedDomainTimes, timeframe }) {
    const container = document.getElementById('quickInsights');
    if (!container) return;
    if (!totalTime) {
      const emptyMsg = timeframe === 'weekly' ? 'No activity this week' : 
                     timeframe === 'monthly' ? 'No activity this month' : 
                     'No activity today';
      container.innerHTML = `<div class="qi-empty">${emptyMsg}</div>`;
      return;
    }
    const topEntry = sortedDomainTimes[0];
    const secondEntry = sortedDomainTimes[1];
    const topPct = topEntry ? ((topEntry[1].time / totalTime) * 100).toFixed(1) : 0;
    const secondPct = secondEntry ? ((secondEntry[1].time / totalTime) * 100).toFixed(1) : 0;
    const focusTime = (categoryData.Work + categoryData.Professional);
    const focusPct = totalTime ? ((focusTime/ totalTime) * 100).toFixed(1) : 0;
    const leisureTime = categoryData.Entertainment + categoryData.Social;
    const leisurePct = totalTime ? ((leisureTime / totalTime) * 100).toFixed(1) : 0;
    // Balance score (ideal focus 55-70%) -> penalty away from midpoint 62.5
    let balanceScore = 100 - Math.min(100, Math.abs(62.5 - parseFloat(focusPct || '0')) * 2.4);
    balanceScore = Math.max(0, Math.min(100, Math.round(balanceScore)));
    const dominance = topPct >= 50 ? `${topEntry[0]} dominates (${topPct}%)` : topPct>=35? `High concentration on ${topEntry[0]}` : 'Balanced domain usage';
    
    // Timeframe-specific messaging
    const timeframePeriod = timeframe === 'weekly' ? 'this week' : 
                           timeframe === 'monthly' ? 'this month' : 
                           'today';
    const trendMsg = productivityScore >= 75 ? `High productivity ${timeframePeriod}` : 
                    productivityScore >= 50 ? `Moderate productivity ${timeframePeriod}` : 
                    `Low productivity ${timeframePeriod}`;
    
    const categoryBreak = Object.entries(categoryData).filter(([_,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([c,v])=> `${c} ${(v/totalTime*100).toFixed(1)}%`).join(', ');
    container.innerHTML = `
      <div class="qi-card">
        <div class="qi-label">Top Site</div>
        <div class="qi-value">${topEntry ? topEntry[0] : '—'}</div>
        <div class="qi-sub">${topPct}%${secondEntry? ` · Next ${secondPct}%`:''}</div>
      </div>
      <div class="qi-card">
        <div class="qi-label">Focus Time</div>
        <div class="qi-value">${formatDuration(focusTime)}</div>
        <div class="qi-sub">${focusPct}% (Work+Prof)</div>
      </div>
      <div class="qi-card">
        <div class="qi-label">Leisure</div>
        <div class="qi-value">${formatDuration(leisureTime)}</div>
        <div class="qi-sub">${leisurePct}% Social+Ent</div>
      </div>
      <div class="qi-card">
        <div class="qi-label">Balance</div>
        <div class="qi-value">${balanceScore}</div>
        <div class="qi-sub">${trendMsg}</div>
      </div>
      <div class="qi-card wide">
        <div class="qi-label">Category Mix</div>
        <div class="qi-value small">${categoryBreak || '—'}</div>
        <div class="qi-sub">${dominance}</div>
      </div>`;
  }

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

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error("Message timeout: No response from background script")
            ),
          10000
        );
      });

      const response = await Promise.race([
        new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            {
              action: "updateCategory",
              domain,
              category,
              userEmail,
              date: new Date().toISOString().split("T")[0],
            },
            (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            }
          );
        }),
        timeoutPromise,
      ]);

      if (response?.status !== "success") {
        throw new Error(response?.error || "Failed to update category");
      }

      siteCategories[domain] = category;
      await chrome.storage.local.set({ siteCategories });

      categorySelect.disabled = false;
      showFeedback(`Category for ${domain} updated to ${category}`);
      loadStats();
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

  function getDateRangeForTab(tab) {
    // Get user's local date, considering timezone
    const today = new Date();
    const endDate = today.toISOString().split("T")[0];
    let startDate = endDate;

    if (tab === "weekly") {
      const start = new Date(today);
      start.setDate(today.getDate() - 6); // 7 days total (today + 6 previous)
      startDate = start.toISOString().split("T")[0];
    } else if (tab === "monthly") {
      const start = new Date(today);
      // Go back exactly 30 days to avoid month-end issues
      start.setDate(today.getDate() - 29); // 30 days total (today + 29 previous)
      startDate = start.toISOString().split("T")[0];
    }

    return { 
      startDate, 
      endDate,
      timezone: today.getTimezoneOffset() // Include timezone offset in minutes
    };
  }

  function getDateRangeDisplayText(tab) {
    const today = new Date();
    
    if (tab === "daily") {
      return today.toLocaleDateString();
    } else if (tab === "weekly") {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - 6);
      return `${weekStart.toLocaleDateString()} - ${today.toLocaleDateString()}`;
    } else if (tab === "monthly") {
      const monthStart = new Date(today);
      monthStart.setDate(today.getDate() - 29);
      return `${monthStart.toLocaleDateString()} - ${today.toLocaleDateString()}`;
    }
    return "";
  }

  function updateDateRangeDisplay() {
    if (elements.dateRangeDisplay) {
      const dateText = getDateRangeDisplayText(currentSubTab);
      const periodInfo = currentSubTab === 'weekly' ? ' (7 days)' : 
                        currentSubTab === 'monthly' ? ' (30 days)' : '';
      elements.dateRangeDisplay.textContent = dateText + periodInfo;
    }
  }

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
  async function loadFocusSessions() {
    try {
      // Get focus sessions from local storage where they're actually stored
      chrome.storage.local.get(['focusHistory'], (result) => {
        const sessions = result.focusHistory || [];
        console.log('loadFocusSessions: Found sessions in storage:', sessions);
        
        // If no sessions exist, create some sample data for testing
        if (sessions.length === 0) {
          console.log('loadFocusSessions: No sessions found, creating sample data for testing');
          const sampleSessions = [
            {
              duration: 25 * 60 * 1000, // 25 minutes in milliseconds
              startTime: Date.now() - (2 * 60 * 60 * 1000), // 2 hours ago
              endTime: Date.now() - (2 * 60 * 60 * 1000) + (25 * 60 * 1000),
              status: 'completed',
              date: new Date().toDateString(),
              sessionType: 'focus'
            },
            {
              duration: 15 * 60 * 1000, // 15 minutes in milliseconds
              startTime: Date.now() - (4 * 60 * 60 * 1000), // 4 hours ago
              endTime: Date.now() - (4 * 60 * 60 * 1000) + (15 * 60 * 1000),
              status: 'completed',
              date: new Date().toDateString(),
              sessionType: 'focus'
            }
          ];
          
          // Save sample sessions to storage
          chrome.storage.local.set({ focusHistory: sampleSessions }, () => {
            displayFocusSessions(sampleSessions);
            updateDailyFocusTime(sampleSessions);
          });
        } else {
          displayFocusSessions(sessions);
          updateDailyFocusTime(sessions);
        }
      });
    } catch (error) {
      console.error('Error loading focus sessions:', error);
    }
  }

  function displayFocusSessions(sessions) {
    console.log('displayFocusSessions: Called with sessions:', sessions);
    if (!elements.focusSessionsList) {
      console.error('displayFocusSessions: focusSessionsList element not found');
      return;
    }

    const today = new Date().toDateString();
    const todaySessions = sessions.filter(session => {
      const sessionDate = session.date || new Date(session.startTime).toDateString();
      return sessionDate === today;
    }).slice(0, 5);

    console.log('displayFocusSessions: Today sessions:', todaySessions);

    if (todaySessions.length === 0) {
      elements.focusSessionsList.innerHTML = `
        <div class="empty-history">
          <div class="empty-graphic">🧘</div>
          <div class="empty-message">No focus sessions today</div>
          <div class="empty-hint">Start your first focus session!</div>
        </div>
      `;
      return;
    }

    elements.focusSessionsList.innerHTML = todaySessions.map((session, index) => {
      // Normalize duration: stored data may be in minutes; sample data is in ms
      const raw = Number(session.duration) || 0;
      const ms = raw < 1000 ? raw * 60 * 1000 : raw;
      const human = formatDuration(ms);
      const start = session.startTime ? new Date(session.startTime) : new Date();
      const end = session.endTime ? new Date(session.endTime) : null;
      const startStr = start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const endStr = end ? end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
      const timeRange = end ? `${startStr} – ${endStr}` : `Started ${startStr}`;
      const status = (session.status || 'completed').toLowerCase();
      const statusLabel = status === 'completed' ? 'Completed' : status === 'interrupted' ? 'Interrupted' : status;
      const minutesVal = Math.max(1, Math.round(ms / 60000));
      const actionBtn = status === 'interrupted'
        ? `<button class="chip-btn resume-session-btn" data-duration="${minutesVal}" title="Resume with same duration">Resume</button>`
        : `<button class="chip-btn repeat-session-btn" data-duration="${minutesVal}" title="Start a new session with same duration">Repeat</button>`;
      
      // Relative time
      const ref = end ? end.getTime() : start.getTime();
      const delta = Math.max(0, Date.now() - ref);
      const agoH = Math.floor(delta / 3600000);
      const agoM = Math.floor((delta % 3600000) / 60000);
      const ago = agoH >= 24 ? `${Math.floor(agoH/24)}d ago` : (agoH > 0 ? `${agoH}h ago` : `${agoM}m ago`);

      return `
        <div class="session-item" data-session-index="${index}">
          <div class="session-left">
            <div class="session-top">
              <span class="session-duration">${human}</span>
              <span class="status-badge status-${status}">${statusLabel}</span>
            </div>
            <div class="session-meta">
              <span class="session-time-range">${timeRange}</span>
              <span class="session-sep">•</span>
              <span class="session-ago">${ago}</span>
            </div>
          </div>
          <div class="session-actions">
            ${actionBtn}
            <button class="delete-session-btn" data-session-index="${index}" title="Delete this session" aria-label="Delete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Unified event delegation
    elements.focusSessionsList.removeEventListener('click', handleSessionDelete);
    elements.focusSessionsList.removeEventListener('click', handleSessionListClick);
    elements.focusSessionsList.addEventListener('click', handleSessionListClick);
  }

  // Handle session deletion with event delegation
  function handleSessionDelete(event) {
    if (event.target.closest('.delete-session-btn')) {
      const button = event.target.closest('.delete-session-btn');
      const sessionIndex = parseInt(button.dataset.sessionIndex);
      deleteFocusSession(sessionIndex);
    }
  }

  // Delete individual focus session
  function deleteFocusSession(sessionIndex) {
    chrome.storage.local.get(['focusHistory'], (result) => {
      const sessions = result.focusHistory || [];
      const today = new Date().toDateString();
      const todaySessions = sessions.filter(session => {
        const sessionDate = session.date || new Date(session.startTime).toDateString();
        return sessionDate === today;
      });
      
      if (sessionIndex >= 0 && sessionIndex < todaySessions.length) {
        const sessionToDelete = todaySessions[sessionIndex];
        
        // Find and remove the session from the full history
        const fullSessionIndex = sessions.findIndex(session => 
          session.startTime === sessionToDelete.startTime && 
          session.duration === sessionToDelete.duration
        );
        
        if (fullSessionIndex !== -1) {
          sessions.splice(fullSessionIndex, 1);
          chrome.storage.local.set({ focusHistory: sessions }, () => {
            showToast('Session deleted');
            loadFocusSessions(); // Refresh the display
            updateDailyStats(); // Update stats
          });
        }
      }
    });
  }

  function updateDailyFocusTime(sessions) {
    if (!elements.dailyFocusTime) return;

    const today = new Date().toDateString();
    const todayTotalTime = sessions
      .filter(session => new Date(session.startTime).toDateString() === today)
      .reduce((total, session) => total + session.duration, 0);

    elements.dailyFocusTime.textContent = formatDuration(todayTotalTime);
  }

  function showFocusSettings() {
    // Use the quick time buttons instead of prompts - no dialogues needed
    console.log('Focus settings managed through time buttons');
  }

  // Website Blocking Functions
  async function loadBlockedItems() {
    console.log('loadBlockedItems: Starting to load blocked sites and keywords...');
    try {
      // Load both sites and keywords from background
      const sitesPromise = new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getBlockedSites' }, (response) => {
          resolve(response?.sites || []);
        });
      });
      
      const keywordsPromise = new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getBlockedKeywords' }, (response) => {
          resolve(response?.keywords || []);
        });
      });

      const [sites, keywords] = await Promise.all([sitesPromise, keywordsPromise]);
      
      console.log('loadBlockedItems: Sites:', sites, 'Keywords:', keywords);
      displayBlockedItems(sites, keywords);
      
      // Update stats
      const blockedSitesCount = document.getElementById('blockedSitesCount');
      if (blockedSitesCount) {
        blockedSitesCount.textContent = sites.length + keywords.length;
      }

      // Then sync with database if user is authenticated
      console.log('loadBlockedItems: Loading from database...');
      await loadBlockedSitesFromDatabase();
    } catch (error) {
      console.error('loadBlockedItems: Error loading blocked items:', error);
    }
  }

  // Keep old function name for compatibility
  const loadBlockedSites = loadBlockedItems;

  async function loadBlockedSitesFromDatabase() {
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) return;

    try {
      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      
      const response = await fetch(`${backend}/api/blocked-sites`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-user-email': userEmail
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        // Convert database format to extension format and sync
        const sitesMap = new Map();
        data.blockedSites.forEach(site => {
          sitesMap.set(site.domain, {
            enabled: site.enabled,
            blockType: site.blockType,
            blockDuring: site.blockDuring,
            redirectUrl: site.redirectUrl
          });
        });

        // Update extension storage and background script
        chrome.runtime.sendMessage({
          action: 'syncBlockedSites',
          sites: Array.from(sitesMap.entries())
        }, (response) => {
          if (response && response.sites) {
            displayBlockedSites(response.sites);
            updateBlockingStatus(response.sites);
          }
        });
      }
    } catch (error) {
      console.error('Error loading blocked sites from database:', error);
    }
  }

  function displayBlockedItems(sites, keywords) {
    console.log('displayBlockedItems: Sites:', sites, 'Keywords:', keywords);
    
  const blockedItemsList = document.getElementById('blockedItemsList');
  const blockedCount = document.getElementById('blockedCount');
  const blockedSitesCountEl = document.getElementById('blockedSitesCount');
    
    if (!blockedItemsList) {
      console.error('blockedItemsList element not found!');
      return;
    }

  const totalItems = sites.length + keywords.length;
    
    // Update count
  if (blockedCount) blockedCount.textContent = totalItems;
  if (blockedSitesCountEl) blockedSitesCountEl.textContent = totalItems;

    if (totalItems === 0) {
      blockedItemsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-graphic" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
          </div>
          <div>No blocked items yet</div>
          <div>Add a website or keyword above</div>
        </div>
      `;
      return;
    }

    let html = '';
    
    // Add sites
    sites.forEach(([domain, config]) => {
      html += `
        <div class="blocked-item">
          <div class="blocked-item-info">
            <span class="block-badge url">Website</span>
            <span class="blocked-item-name">${domain}</span>
          </div>
          <div class="blocked-item-actions">
            <button class="action-btn delete" data-domain="${domain}" data-type="site" title="Remove">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c0 1 1 2 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    });
    
    // Add keywords
    keywords.forEach(([keyword, config]) => {
      html += `
        <div class="blocked-item">
          <div class="blocked-item-info">
            <span class="block-badge keyword">Keyword</span>
            <span class="blocked-item-name">${keyword}</span>
          </div>
          <div class="blocked-item-actions">
            <button class="action-btn delete" data-keyword="${keyword}" data-type="keyword" title="Remove">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c0 1 1 2 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    });
    
  blockedItemsList.innerHTML = html;
  }

  // Keep old function for backward compatibility
  function displayBlockedSites(sites) {
    displayBlockedItems(sites, []);
  }

  function toggleBlockedKeyword(keyword) {
    chrome.runtime.sendMessage({
      action: 'toggleBlockedKeyword',
      keyword: keyword
    }, (response) => {
      if (response && response.success) {
        showToast(`Keyword "${keyword}" ${response.enabled ? 'blocked' : 'unblocked'}`);
        loadBlockedSites();
      }
    });
  }

  function removeBlockedKeyword(keyword) {
    showConfirmModal(
      'Remove Keyword',
      `Remove keyword "${keyword}" from blocked list?`,
      () => {
        chrome.runtime.sendMessage({
          action: 'removeBlockedKeyword',
          keyword: keyword
        }, (response) => {
          if (response && response.success) {
            showToast(`Keyword "${keyword}" removed from blocked list`);
            loadBlockedSites();
          } else {
            showToast('Failed to remove keyword', 'error');
          }
        });
      }
    );
  }

  function updateBlockingStatus(sites) {
    if (!elements.blockingStatus) return;

    const activeSites = sites.filter(([domain, config]) => config.enabled).length;
    
    if (activeSites > 0) {
      elements.blockingStatus.textContent = `${activeSites} site(s) currently blocked`;
      elements.blockingStatus.className = 'blocking-status';
    } else {
      elements.blockingStatus.textContent = 'No sites currently blocked';
      elements.blockingStatus.className = 'blocking-status inactive';
    }
  }

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

  function showAddBlockedSiteModal() {
    showModal('addSiteModal');
  }

  // Make function globally accessible for onclick handler
  window.showAddBlockedSiteModal = showAddBlockedSiteModal;

  // Simple Guard Tab Initialization
  function initializeGuard() {
    console.log('Initializing Guard tab...');
    
    const blockInput = document.getElementById('blockInput');
    const addBlockBtn = document.getElementById('addBlockBtn');
    
    // Add block button handler
    if (addBlockBtn) {
      addBlockBtn.addEventListener('click', handleAddBlock);
    }

    // Enter key handler
    if (blockInput) {
      blockInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          handleAddBlock();
        }
      });
    }

    // Load existing blocked items
    loadBlockedItems();
    console.log('Guard tab initialized');
  }

  // Simple add block handler
  function handleAddBlock() {
    const blockInput = document.getElementById('blockInput');
    const addBlockBtn = document.getElementById('addBlockBtn');
    
    if (!blockInput) return;
    
    const value = blockInput.value.trim();
    if (!value) {
      showToast('Please enter a website or keyword', 'error');
      return;
    }

    // Add loading state
    if (addBlockBtn) {
      addBlockBtn.disabled = true;
      addBlockBtn.textContent = 'Adding...';
    }

    // Determine if it's a website or keyword
    const isWebsite = value.includes('.') && !value.includes(' ');
    
    if (isWebsite) {
      // Clean up domain
      let domain = value.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '').toLowerCase();
      
      chrome.runtime.sendMessage({
        action: 'addBlockedSite',
        domain: domain,
        config: { enabled: true }
      }, handleAddResponse);
    } else {
      // Add as keyword
      chrome.runtime.sendMessage({
        action: 'addBlockedKeyword',
        keyword: value.toLowerCase(),
        config: { enabled: true }
      }, handleAddResponse);
    }

    function handleAddResponse(response) {
      // Reset button state
      if (addBlockBtn) {
        addBlockBtn.disabled = false;
        addBlockBtn.textContent = 'Block';
      }
      
      if (response && response.success) {
        showToast(`Successfully blocked: ${value}`, 'success');
        blockInput.value = '';
        loadBlockedItems();
      } else {
        showToast('Failed to add block', 'error');
      }
    }
  }

  function handleAddSite() {
    const blockTypeUrl = document.getElementById('blockTypeUrl');
    const blockTypeKeyword = document.getElementById('blockTypeKeyword');
    const urlInput = document.getElementById('addSiteUrl');
    const keywordInput = document.getElementById('addSiteKeyword');
    const nameInput = document.getElementById('addSiteName');
    const scheduleInput = document.getElementById('addSiteSchedule');
    
    const isUrl = blockTypeUrl.checked;
    const value = isUrl ? urlInput.value.trim() : keywordInput.value.trim();
    const name = nameInput.value.trim() || value;
    const schedule = scheduleInput.checked;
    
    if (!value) {
      showToast(isUrl ? 'Please enter a URL' : 'Please enter a keyword', 'error');
      (isUrl ? urlInput : keywordInput).focus();
      return;
    }
    
    if (isUrl) {
      // Clean up the domain
      let domain = value.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '');
      addBlockedSite(domain.toLowerCase());
    } else {
      // Add keyword block
      addBlockedKeyword(value.toLowerCase());
    }
    
    hideModal('addSiteModal');
    // Clear form
    urlInput.value = '';
    keywordInput.value = '';
    nameInput.value = '';
    scheduleInput.checked = false;
    // Reset to URL type
    blockTypeUrl.checked = true;
    document.getElementById('urlGroup').classList.remove('hidden');
    document.getElementById('keywordGroup').classList.add('hidden');
  }

  function showFocusSessionModal() {
    showModal('focusSessionModal');
  }

  function showFocusSettingsModal() {
    // Load current settings
    chrome.storage.local.get(['focusSettings'], (result) => {
      const settings = result.focusSettings || {
        focusDuration: 25,
        breakDuration: 5,
        notificationSounds: true,
        blockWebsitesDuringFocus: false
      };
      
      document.getElementById('focusDurationSetting').value = settings.focusDuration;
      document.getElementById('breakDuration').value = settings.breakDuration;
      document.getElementById('notificationSounds').checked = settings.notificationSounds;
      document.getElementById('blockWebsitesDuringFocus').checked = settings.blockWebsitesDuringFocus;
      
      showModal('focusSettingsModal');
    });
  }

  function saveFocusSettings() {
    const settings = {
      focusDuration: parseInt(document.getElementById('focusDurationSetting').value) || 25,
      breakDuration: parseInt(document.getElementById('breakDuration').value) || 5,
      notificationSounds: document.getElementById('notificationSounds').checked,
      blockWebsitesDuringFocus: document.getElementById('blockWebsitesDuringFocus').checked
    };
    
    // Validate settings
    if (settings.focusDuration < 5 || settings.focusDuration > 120) {
      showToast('Focus duration must be between 5-120 minutes', 'error');
      return;
    }
    
    if (settings.breakDuration < 1 || settings.breakDuration > 30) {
      showToast('Break duration must be between 1-30 minutes', 'error');
      return;
    }
    
    chrome.storage.local.set({ focusSettings: settings }, () => {
      hideModal('focusSettingsModal');
      // Update the default duration in the start session modal
      document.getElementById('focusDuration').value = settings.focusDuration;
      showToast('Focus settings saved!');
    });
  }

  function handleStartFocusSession() {
    const durationInput = document.getElementById('focusDuration');
    const blockAllInput = document.getElementById('blockAllSites');
    
    const duration = parseInt(durationInput.value);
    
    if (!duration || duration < 1 || duration > 480) {
      showToast('Please enter a valid duration (1-480 minutes)', 'error');
      durationInput.focus();
      return;
    }
    
    // Get focus settings for additional options
    chrome.storage.local.get(['focusSettings'], (result) => {
      const settings = result.focusSettings || {};
      
      const sessionData = {
        duration: duration,
        blockAll: blockAllInput.checked || settings.blockWebsitesDuringFocus,
        startTime: Date.now(),
        notificationSounds: settings.notificationSounds !== false
      };
      
      startFocusSession(sessionData);
      
      hideModal('focusSessionModal');
      // Reset form to default from settings
      durationInput.value = settings.focusDuration || 25;
      blockAllInput.checked = false;
    });
  }

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

  async function addBlockedSite(domain) {
    // Remove www. prefix if present
    domain = domain.replace(/^www\./, '');
    
    // First add to extension storage
    chrome.runtime.sendMessage({
      action: 'addBlockedSite',
      domain: domain,
      config: {
        enabled: true,
        blockType: 'focus-only',
        blockDuring: {
          focusSessions: true,
          breakTime: false
        },
        redirectUrl: 'chrome://newtab'
      }
    }, async (response) => {
      if (response && response.success) {
        showToast(`${domain} added to blocked sites`);
        loadBlockedSites();
        
        // Sync with database if user is authenticated
        await syncBlockedSiteToDatabase(domain, {
          enabled: true,
          blockType: 'focus-only',
          blockDuring: {
            focusSessions: true,
            breakTime: false
          },
          redirectUrl: 'chrome://newtab'
        });
      } else {
        showToast('Failed to add blocked site', 'error');
      }
    });
  }

  async function syncBlockedSiteToDatabase(domain, config) {
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) return;

    try {
      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      
      await fetch(`${backend}/api/blocked-sites`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-user-email': userEmail
        },
        body: JSON.stringify({
          domain,
          enabled: config.enabled,
          blockType: config.blockType || 'focus-only',
          blockDuring: config.blockDuring,
          redirectUrl: config.redirectUrl
        })
      });
    } catch (error) {
      console.error('Error syncing blocked site to database:', error);
    }
  }

  async function addBlockedKeyword(keyword) {
    // First add to extension storage
    chrome.runtime.sendMessage({
      action: 'addBlockedKeyword',
      keyword: keyword,
      config: {
        enabled: true,
        blockType: 'focus-only',
        blockDuring: {
          focusSessions: true,
          breakTime: false
        },
        redirectUrl: 'chrome://newtab'
      }
    }, async (response) => {
      if (response && response.success) {
        showToast(`Keyword "${keyword}" added to block list`);
        loadBlockedSites(); // This will need to be updated to load both sites and keywords
        
        // Sync with database if user is authenticated
        await syncBlockedKeywordToDatabase(keyword, {
          enabled: true,
          blockType: 'focus-only',
          blockDuring: {
            focusSessions: true,
            breakTime: false
          },
          redirectUrl: 'chrome://newtab'
        });
      } else {
        showToast('Failed to add blocked keyword', 'error');
      }
    });
  }

  async function syncBlockedKeywordToDatabase(keyword, config) {
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) return;

    try {
      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      
      await fetch(`${backend}/api/blocked-keywords`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-user-email': userEmail
        },
        body: JSON.stringify({
          keyword,
          enabled: config.enabled,
          blockType: config.blockType || 'focus-only',
          blockDuring: config.blockDuring,
          redirectUrl: config.redirectUrl
        })
      });
    } catch (error) {
      console.error('Error syncing blocked keyword to database:', error);
    }
  }

  window.toggleBlockedSite = function(domain) {
    chrome.runtime.sendMessage({
      action: 'toggleBlockedSite',
      domain: domain
    }, (response) => {
      if (response && response.success) {
        showToast(`${domain} ${response.enabled ? 'blocked' : 'unblocked'}`);
        loadBlockedSites();
      }
    });
  };

  window.removeBlockedSite = function(domain) {
    showConfirmModal(
      'Remove Website',
      `Remove ${domain} from blocked sites?`,
      () => {
        chrome.runtime.sendMessage({
          action: 'removeBlockedSite',
          domain: domain
        }, (response) => {
          if (response && response.success) {
            showToast(`${domain} removed from blocked sites`);
            loadBlockedSites();
          } else {
            showToast('Failed to remove site', 'error');
          }
        });
      }
    );
  };

  // Enhanced Pomodoro Timer with Progress
  let timerInterval;

  function updatePomodoroTimer() {
    chrome.runtime.sendMessage({ action: 'getPomodoroState' }, (response) => {
      if (response && response.state) {
        const { state } = response;
        
        if (state.running) {
          const remaining = Math.max(0, state.endsAt - Date.now());
          const total = response.defaults[state.mode === 'work' ? 'workMinutes' : 'breakMinutes'] * 60000;
          const progress = Math.max(0, (total - remaining) / total * 100);
          
          const minutes = Math.floor(remaining / 60000);
          const seconds = Math.floor((remaining % 60000) / 1000);
          
          if (elements.pomodoroStatus) {
            elements.pomodoroStatus.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            elements.pomodoroStatus.classList.add('counting');
            
            if (state.mode === 'break') {
              elements.pomodoroStatus.classList.add('break-time');
            } else {
              elements.pomodoroStatus.classList.remove('break-time');
            }
          }
          
          if (elements.timerLabel) {
            elements.timerLabel.textContent = state.mode === 'work' ? 'Focus Session' : 'Break Time';
          }
          
          if (elements.focusProgressBar) {
            elements.focusProgressBar.style.width = `${progress}%`;
          }
          
          if (elements.pomodoroToggle) {
            elements.pomodoroToggle.textContent = 'Stop';
          }
        } else {
          if (elements.pomodoroStatus) {
            elements.pomodoroStatus.textContent = `${response.defaults.workMinutes}:00`;
            elements.pomodoroStatus.classList.remove('counting', 'break-time');
          }
          
          if (elements.timerLabel) {
            elements.timerLabel.textContent = 'Focus Session';
          }
          
          if (elements.focusProgressBar) {
            elements.focusProgressBar.style.width = '0%';
          }
          
          if (elements.pomodoroToggle) {
            elements.pomodoroToggle.textContent = 'Start Focus';
          }
        }
      }
    });
  }

  // Initialize enhanced features
  function initializeEnhancedFeatures() {
    loadFocusSessions();
    loadBlockedSites();
    // updatePomodoroTimer(); // Disabled - using new focus session system
    loadFocusSettings();
    displayFocusHistory();
    updateDailyStats();
    
    // Load focus sessions from database if user is authenticated
    loadFocusSessionsFromDatabase();
    
    // Load blocked sites from database if user is authenticated
    loadBlockedSitesFromDatabase();
    
    // Check for active focus session on startup
    chrome.storage.local.get(['focusSession'], (result) => {
      if (result.focusSession) {
        currentSession = result.focusSession;
        
        if (result.focusSession.isActive) {
          // Calculate remaining time and continue timer
          const elapsed = Date.now() - result.focusSession.startTime;
          const totalDuration = result.focusSession.duration * 60 * 1000;
          const remaining = Math.max(0, totalDuration - elapsed);
          
          if (remaining > 0) {
            updateSessionUI('active');
            startTimer(Math.ceil(remaining / 1000));
          } else {
            // Session should have completed
            completeFocusSession();
          }
        } else if (result.focusSession.isPaused) {
          // Session is paused
          updateSessionUI('paused');
          
          // Update timer display with paused time
          const elapsed = result.focusSession.pausedAt - result.focusSession.startTime;
          const totalDuration = result.focusSession.duration * 60 * 1000;
          const remaining = Math.max(0, totalDuration - elapsed);
          
          const minutes = Math.floor(remaining / 60000);
          const seconds = Math.floor((remaining % 60000) / 1000);
          const pomodoroStatus = document.getElementById('pomodoroStatus');
          if (pomodoroStatus) {
            pomodoroStatus.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
          }
        }
      } else {
        // No active session, ensure UI is in idle state
        updateSessionUI('idle');
      }
    });
    
    // Update timer every second when active - DISABLED for new focus session system
    // if (timerInterval) clearInterval(timerInterval);
    // timerInterval = setInterval(updatePomodoroTimer, 1000);
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
    if (addSiteBtn) {
      addSiteBtn.addEventListener('click', handleAddSite);
    }

    // Focus session modal
    const startFocusBtn = document.getElementById('startFocusBtn');
    if (startFocusBtn) {
      startFocusBtn.addEventListener('click', handleStartFocusSession);
    }

    // Focus settings modal
    const saveFocusSettingsBtn = document.getElementById('saveFocusSettingsBtn');
    if (saveFocusSettingsBtn) {
      saveFocusSettingsBtn.addEventListener('click', saveFocusSettings);
    }

    // Focus settings button
    const focusSettingsBtn = document.getElementById('focusSettingsBtn');
    if (focusSettingsBtn) {
      focusSettingsBtn.addEventListener('click', showFocusSettingsModal);
    }

    // Quick time buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Remove active class from all buttons
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        // Add active class to clicked button
        e.target.classList.add('active');
        
        const time = parseInt(e.target.dataset.time);
        updateTimerDisplay(time);
      });
    });

    // Main focus start button
    const pomodoroToggle = document.getElementById('pomodoroToggle');
    if (pomodoroToggle) {
      pomodoroToggle.addEventListener('click', handleFocusToggle);
    }

    // Focus stop button
    const pomodoroStop = document.getElementById('pomodoroStop');
    if (pomodoroStop) {
      pomodoroStop.addEventListener('click', handleFocusStop);
    }

    // Timer editing disabled - use quick time buttons instead
    const pomodoroStatus = document.getElementById('pomodoroStatus');
    if (pomodoroStatus) {
      // Remove click handler to prevent editing dialogues
      pomodoroStatus.style.cursor = 'default';
      pomodoroStatus.removeAttribute('title');
    }

    // Clear history button
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', clearFocusHistory);
    }

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

  // Simplified Focus Functions
  let focusTimer = null;
  let currentSession = null;

  function handleFocusToggle() {
    if (currentSession && currentSession.isActive) {
      // Session is running, pause it
      pauseFocusSession();
    } else if (currentSession && currentSession.isPaused) {
      // Session is paused, resume it
      resumeFocusSession();
    } else {
      // No active session, start new one
      startFocusSession();
    }
  }

  function handleFocusStop() {
    if (currentSession) {
      showConfirmModal(
        'Stop Session',
        'Are you sure you want to stop the current focus session? This will end the session permanently.',
        () => {
          endFocusSession();
        }
      );
    }
  }

  // Make timer display editable
  function makeTimerEditable() {
    const pomodoroStatus = document.getElementById('pomodoroStatus');
    if (!pomodoroStatus) return;
    
    const currentText = pomodoroStatus.textContent;
    const currentMinutes = parseInt(currentText.split(':')[0]);
    
    // Create input field
    const input = document.createElement('input');
    input.type = 'number';
    input.value = currentMinutes;
    input.min = '1';
    input.max = '120';
    input.className = 'timer-input';
    input.style.cssText = `
      width: 60px;
      padding: 4px 8px;
      border: 2px solid var(--primary-color);
      border-radius: 4px;
      background: var(--card-bg);
      color: var(--text-color);
      text-align: center;
      font-size: 2.5rem;
      font-weight: 700;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;
    
    // Replace timer display with input
    pomodoroStatus.style.display = 'none';
    pomodoroStatus.parentNode.insertBefore(input, pomodoroStatus);
    input.focus();
    input.select();
    
    function finishEditing() {
      const newMinutes = parseInt(input.value) || 25;
      const clampedMinutes = Math.max(1, Math.min(120, newMinutes));
      
      // Update timer display
      updateTimerDisplay(clampedMinutes);
      
      // Update active time button if it matches
      document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.time) === clampedMinutes) {
          btn.classList.add('active');
        }
      });
      
      // Remove input and show timer
      input.remove();
      pomodoroStatus.style.display = 'block';
      pomodoroStatus.classList.remove('editing');
    }
    
    // Handle input events
    input.addEventListener('blur', finishEditing);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        finishEditing();
      } else if (e.key === 'Escape') {
        input.remove();
        pomodoroStatus.style.display = 'block';
        pomodoroStatus.classList.remove('editing');
      }
    });
    
    // Add editing class for visual feedback
    pomodoroStatus.classList.add('editing');
  }

  function updateTimerDisplay(minutes) {
    const pomodoroStatus = document.getElementById('pomodoroStatus');
    if (pomodoroStatus) {
      pomodoroStatus.textContent = `${minutes}:00`;
    }
  }

  function startFocusSession() {
    // Get selected time
    const activeTimeBtn = document.querySelector('.preset-btn.active');
    const duration = activeTimeBtn ? parseInt(activeTimeBtn.dataset.time) : 25;
    
    currentSession = {
      duration: duration,
      startTime: Date.now(),
      isActive: true,
      isPaused: false
    };
    
    // Update UI
    updateSessionUI('active');
    
    // Start countdown
    startTimer(duration * 60);
    
    // Save session
    chrome.storage.local.set({ focusSession: currentSession });
    
    showToast('Focus session started! 🎯');
  }

  function pauseFocusSession() {
    if (focusTimer) {
      clearInterval(focusTimer);
      focusTimer = null;
    }
    
    currentSession.isPaused = true;
    currentSession.isActive = false;
    currentSession.pausedAt = Date.now();
    
    updateSessionUI('paused');
    chrome.storage.local.set({ focusSession: currentSession });
    
    showToast('Session paused ⏸️');
  }

  function resumeFocusSession() {
    // Calculate remaining time
    const elapsed = currentSession.pausedAt - currentSession.startTime;
    const totalDuration = currentSession.duration * 60 * 1000;
    const remaining = Math.max(0, totalDuration - elapsed);
    
    if (remaining > 0) {
      currentSession.isActive = true;
      currentSession.isPaused = false;
      currentSession.startTime = Date.now() - elapsed; // Adjust start time
      
      updateSessionUI('active');
      startTimer(Math.ceil(remaining / 1000));
      
      chrome.storage.local.set({ focusSession: currentSession });
      showToast('Session resumed! 🎯');
    } else {
      // Time's up
      completeFocusSession();
    }
  }

  function updateSessionUI(state) {
    const pomodoroToggle = document.getElementById('pomodoroToggle');
    const pomodoroStop = document.getElementById('pomodoroStop');
    const timerStatus = document.getElementById('timerLabel');

    const setToggle = (label, cls) => {
      if (!pomodoroToggle) return;
      const labelSpan = pomodoroToggle.querySelector('.control-label');
      if (labelSpan) {
        labelSpan.textContent = label;
      } else {
        pomodoroToggle.textContent = label;
      }
      pomodoroToggle.className = `control-button ${cls}`;
    };

    switch (state) {
      case 'active':
        setToggle('Pause', 'pause-control');
        if (pomodoroStop) pomodoroStop.classList.remove('hidden');
        if (timerStatus) timerStatus.textContent = 'Focus Active';
        // Disable quick time buttons during session
        document.querySelectorAll('.preset-btn').forEach(btn => {
          btn.disabled = true;
          btn.style.opacity = '0.5';
        });
        break;

      case 'paused':
        setToggle('Resume', 'resume-control');
        if (pomodoroStop) pomodoroStop.classList.remove('hidden');
        if (timerStatus) timerStatus.textContent = 'Session Paused';
        break;

      case 'idle':
      default:
        setToggle('Start', 'start-control');
        if (pomodoroStop) pomodoroStop.classList.add('hidden');
        if (timerStatus) timerStatus.textContent = 'Ready to Focus';
        // Re-enable quick time buttons
        document.querySelectorAll('.preset-btn').forEach(btn => {
          btn.disabled = false;
          btn.style.opacity = '1';
        });
        break;
    }
  }

  function startTimer(seconds) {
    const pomodoroStatus = document.getElementById('pomodoroStatus');
    const progressFill = document.querySelector('.progress-indicator');
    const totalSeconds = seconds;
    
    focusTimer = setInterval(() => {
      seconds--;
      
      // Update display - add null check
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      if (pomodoroStatus) {
        pomodoroStatus.textContent = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
      
      // Update progress bar - add null check
      const progress = ((totalSeconds - seconds) / totalSeconds) * 100;
      if (progressFill) {
        progressFill.style.width = `${progress}%`;
      }
      
      // Check if completed
      if (seconds <= 0) {
        completeFocusSession();
      }
    }, 1000);
  }

  function endFocusSession() {
    if (focusTimer) {
      clearInterval(focusTimer);
      focusTimer = null;
    }
    
    // Update UI immediately
    const progressFill = document.querySelector('.progress-indicator');
    
    updateSessionUI('idle');
    progressFill.style.width = '0%';
    
    // Add to history as interrupted if there was a session
    if (currentSession) {
      addSessionToHistory(currentSession, 'interrupted');
    }
    
    // Clear session completely
    currentSession = null;
    chrome.storage.local.remove('focusSession');
    
    // Reset timer display immediately
    const activeTimeBtn = document.querySelector('.preset-btn.active');
    const minutes = activeTimeBtn ? parseInt(activeTimeBtn.dataset.time) : 25;
    updateTimerDisplay(minutes);
    
    // Send message to background script to stop any blocking
    chrome.runtime.sendMessage({
      action: 'stopFocusSession'
    });
    
    showToast('Focus session stopped');
  }

  function completeFocusSession() {
    if (focusTimer) {
      clearInterval(focusTimer);
      focusTimer = null;
    }
    
    // Update UI
    const progressFill = document.querySelector('.progress-indicator');
    const timerStatus = document.getElementById('timerLabel');
    
    updateSessionUI('idle');
    timerStatus.textContent = 'Session Complete! 🎉';
    progressFill.style.width = '100%';
    
    // Add to history
    if (currentSession) {
      addSessionToHistory(currentSession, 'completed');
    }
    
    // Clear session
    currentSession = null;
    chrome.storage.local.remove('focusSession');
    
    // Send completion message to background
    chrome.runtime.sendMessage({
      action: 'completeFocusSession'
    });
    
    showToast('Focus session completed! Great work! 🎉');
    
    // Reset after 3 seconds
    setTimeout(() => {
      const timerStatus = document.getElementById('timerLabel');
      const progressFill = document.querySelector('.progress-indicator');
      timerStatus.textContent = 'Ready to Focus';
      progressFill.style.width = '0%';
      
      // Reset timer display
      const activeTimeBtn = document.querySelector('.preset-btn.active');
      const minutes = activeTimeBtn ? parseInt(activeTimeBtn.dataset.time) : 25;
      updateTimerDisplay(minutes);
    }, 3000);
  }

  function addSessionToHistory(sessionData, status) {
    const session = {
      duration: sessionData.duration,
      startTime: sessionData.startTime,
      endTime: Date.now(),
      status: status,
      date: new Date().toDateString(),
      sessionType: 'focus'
    };
    
    // Save to local storage
    chrome.storage.local.get(['focusHistory'], (result) => {
      const history = result.focusHistory || [];
      history.unshift(session);
      
      // Keep only last 5 sessions for the popup
      if (history.length > 5) {
        history.splice(5);
      }
      
      chrome.storage.local.set({ focusHistory: history }, () => {
        displayFocusHistory();
        updateDailyStats();
      });
    });
    
    // Send to database
    sendSessionToDatabase(session);
  }

  function sendSessionToDatabase(sessionData) {
    // Get user authentication
    chrome.storage.local.get(['userToken', 'userId'], (result) => {
      if (!result.userToken || !result.userId) {
        console.log('User not authenticated, session saved locally only');
        return;
      }
      
      // Prepare session data for backend
      const sessionPayload = {
        userId: result.userId,
        duration: sessionData.duration,
        startTime: new Date(sessionData.startTime).toISOString(),
        endTime: new Date(sessionData.endTime).toISOString(),
        status: sessionData.status,
        sessionType: sessionData.sessionType || 'focus'
      };
      
      // Send to backend
      fetch('http://localhost:3000/api/focus-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${result.userToken}`
        },
        body: JSON.stringify(sessionPayload)
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          console.log('Focus session saved to database');
        } else {
          console.log('Failed to save session to database:', data.message);
        }
      })
      .catch(error => {
        console.log('Database error:', error);
      });
    });
  }

  function loadFocusSessionsFromDatabase() {
    chrome.storage.local.get(['userToken', 'userId'], (result) => {
      if (!result.userToken || !result.userId) {
        return; // User not authenticated
      }
      
      // Fetch recent sessions from database
      fetch(`http://localhost:3000/api/focus-sessions/${result.userId}?limit=10`, {
        headers: {
          'Authorization': `Bearer ${result.userToken}`
        }
      })
      .then(response => response.json())
      .then(data => {
        if (data.success && data.sessions) {
          // Merge with local sessions
          const remoteSessions = data.sessions.map(session => ({
            duration: session.duration,
            startTime: new Date(session.startTime).getTime(),
            endTime: new Date(session.endTime).getTime(),
            status: session.status,
            date: new Date(session.startTime).toDateString(),
            sessionType: session.sessionType
          }));
          
          // Update local storage with merged data
          chrome.storage.local.get(['focusHistory'], (localResult) => {
            const localHistory = localResult.focusHistory || [];
            
            // Combine and deduplicate sessions
            const allSessions = [...remoteSessions, ...localHistory];
            const uniqueSessions = allSessions.filter((session, index, self) => 
              index === self.findIndex(s => s.startTime === session.startTime)
            );
            
            // Sort by start time (newest first) and keep only last 10
            uniqueSessions.sort((a, b) => b.startTime - a.startTime);
            const recentSessions = uniqueSessions.slice(0, 10);
            
            chrome.storage.local.set({ focusHistory: recentSessions }, () => {
              displayFocusHistory();
              updateDailyStats();
            });
          });
        }
      })
      .catch(error => {
        console.log('Error loading sessions from database:', error);
      });
    });
  }

  function displayFocusHistory() {
    const sessionsList = document.getElementById('focusSessionsList');
    if (!sessionsList) return;
    
    chrome.storage.local.get(['focusHistory'], (result) => {
      const history = result.focusHistory || [];
      
      if (history.length === 0) {
        sessionsList.innerHTML = `
          <div class="empty-message">
            <p>No sessions yet. Start your first focus session!</p>
          </div>
        `;
        return;
      }
      
      sessionsList.innerHTML = history.map((session, index) => {
        const start = new Date(session.startTime);
        const end = session.endTime ? new Date(session.endTime) : null;
        const startStr = start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const endStr = end ? end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
        const timeRange = end ? `${startStr} – ${endStr}` : `Started ${startStr}`;

        // Duration normalization (minutes or ms)
        const raw = Number(session.duration) || 0;
        const ms = raw < 1000 ? raw * 60 * 1000 : raw;
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const human = hours > 0 ? `${hours}h ${minutes}m` : (minutes > 0 ? `${minutes}m` : `${seconds}s`);

        // Relative time (ago)
        const ref = end ? end.getTime() : start.getTime();
        const delta = Math.max(0, Date.now() - ref);
        const agoH = Math.floor(delta / 3600000);
        const agoM = Math.floor((delta % 3600000) / 60000);
        const ago = agoH >= 24
          ? `${Math.floor(agoH / 24)}d ago`
          : (agoH > 0 ? `${agoH}h ago` : `${agoM}m ago`);

        const status = (session.status || 'completed').toLowerCase();
        const statusLabel = status === 'completed' ? 'Completed' : status === 'interrupted' ? 'Interrupted' : status;

        // Action button (Resume for interrupted, Repeat for completed)
        const minutesVal = Math.max(1, Math.round(ms / 60000));
        const actionBtn = status === 'interrupted'
          ? `<button class="chip-btn resume-session-btn" data-duration="${minutesVal}" title="Resume with same duration">Resume</button>`
          : `<button class="chip-btn repeat-session-btn" data-duration="${minutesVal}" title="Start a new session with same duration">Repeat</button>`;

        return `
          <div class="session-item" data-history-index="${index}">
            <div class="session-left">
              <div class="session-top">
                <span class="session-duration">${human}</span>
                <span class="status-badge status-${status}">${statusLabel}</span>
              </div>
              <div class="session-meta">
                <span class="session-time-range">${timeRange}</span>
                <span class="session-sep">•</span>
                <span class="session-ago">${ago}</span>
              </div>
            </div>
            <div class="session-actions">
              ${actionBtn}
              <button class="delete-session-btn" data-history-index="${index}" title="Delete this session" aria-label="Delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                  <line x1="10" y1="11" x2="10" y2="17"/>
                  <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
              </button>
            </div>
          </div>
        `;
      }).join('');

      // Wire actions
      sessionsList.removeEventListener('click', handleSessionListClick);
      sessionsList.addEventListener('click', handleSessionListClick);
    });
  }

  function handleSessionListClick(event) {
    const resumeBtn = event.target.closest('.resume-session-btn');
    const repeatBtn = event.target.closest('.repeat-session-btn');
    const deleteBtn = event.target.closest('.delete-session-btn');

    if (resumeBtn || repeatBtn) {
      const mins = parseInt((resumeBtn || repeatBtn).dataset.duration, 10);
      if (!isNaN(mins)) {
        quickStartFocusWithMinutes(mins);
      }
      return;
    }

    if (deleteBtn) {
      const idx = parseInt(deleteBtn.dataset.historyIndex, 10);
      if (!isNaN(idx)) deleteFocusHistoryAtIndex(idx);
    }
  }

  function quickStartFocusWithMinutes(minutes) {
    // Set the matching preset as active, or just update the label
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.time, 10) === minutes);
    });
    // If no preset matches, nothing is active; startFocusSession will use default, so override by creating a temp active
    if (!document.querySelector('.preset-btn.active')) {
      const first = document.querySelector('.preset-btn');
      if (first) {
        first.classList.add('active');
        first.dataset.time = String(minutes);
        first.textContent = `${minutes}m`;
      }
    }
    // Update timer display immediately
    const pomodoroStatus = document.getElementById('pomodoroStatus');
    if (pomodoroStatus) pomodoroStatus.textContent = `${minutes.toString().padStart(2,'0')}:00`;
    // Start a new session
    startFocusSession();
  }

  function deleteFocusHistoryAtIndex(index) {
    chrome.storage.local.get(['focusHistory'], (result) => {
      const history = result.focusHistory || [];
      if (index >= 0 && index < history.length) {
        history.splice(index, 1);
        chrome.storage.local.set({ focusHistory: history }, () => {
          showToast('Session deleted');
          displayFocusHistory();
          updateDailyStats();
        });
      }
    });
  }

  function updateDailyStats() {
    chrome.storage.local.get(['focusHistory'], (result) => {
      const history = result.focusHistory || [];
      const today = new Date().toDateString();
      const todaySessions = history.filter(s => s.date === today && s.status === 'completed');
      
      const totalMinutes = todaySessions.reduce((sum, s) => sum + s.duration, 0);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      
      // Update daily time in header
      const dailyFocusTime = document.getElementById('dailyFocusTime');
      if (dailyFocusTime) {
        dailyFocusTime.textContent = `${hours}h ${minutes}m today`;
      }
      
      // Update stats
      const completedSessions = document.getElementById('completedSessions');
      const totalFocusTimeEl = document.getElementById('totalFocusTime');
      const productivityScore = document.getElementById('productivityScore');
      
      if (completedSessions) {
        completedSessions.textContent = todaySessions.length.toString();
      }
      
      if (totalFocusTimeEl) {
        totalFocusTimeEl.textContent = totalMinutes >= 60 ? `${hours}h ${minutes}m` : `${totalMinutes}m`;
      }
      
      if (productivityScore) {
        const score = Math.min(100, Math.round((totalMinutes / 120) * 100)); // 120 min = 100%
        productivityScore.textContent = `${score}%`;
      }
    });
  }

  function clearFocusHistory() {
    showConfirmModal(
      'Clear History',
      'Are you sure you want to clear all focus session history?',
      () => {
        chrome.storage.local.remove('focusHistory', () => {
          displayFocusHistory();
          updateDailyStats();
          showToast('Focus history cleared');
        });
      }
    );
  }

  // ==================== PROBLEM SOLVER FUNCTIONS ====================
  
  async function initializeStopwatch() {
    // Auto-detect current page info
    await detectCurrentPage();
    
    // Load solver stats and data
    await loadDailyStats();
    await loadProgressStats();
    
    // Check for active session on load
    await loadActiveSession();
    await loadSessionHistory();
    
    // Set up event listeners
    if (elements.startSessionBtn) {
      elements.startSessionBtn.addEventListener('click', startNewSession);
    }
    
    if (elements.pauseResumeBtn) {
      elements.pauseResumeBtn.addEventListener('click', pauseResumeSession);
    }
    
    if (elements.completeBtn) {
      elements.completeBtn.addEventListener('click', completeSession);
    }
    
    if (elements.abandonBtn) {
      elements.abandonBtn.addEventListener('click', abandonSession);
    }
    
    if (elements.historyFilter) {
      elements.historyFilter.addEventListener('change', () => {
        loadSessionHistory();
        loadProgressStats();
      });
    }
  }

  async function loadDailyStats() {
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (!userEmail) return;

      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      
      const today = new Date().toISOString().split('T')[0];
      const response = await fetch(`${backend}/api/problem-sessions?date=${today}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const sessions = await response.json();
        const todaySessions = sessions.filter(session => 
          new Date(session.startTime).toDateString() === new Date().toDateString()
        );
        
        const completedToday = todaySessions.filter(s => s.completed).length;
        const totalTimeToday = todaySessions.reduce((total, session) => {
          return total + (session.totalTime || 0);
        }, 0);

        // Update daily stats display
        if (elements.dailyProblems) {
          elements.dailyProblems.textContent = completedToday;
        }
        if (elements.dailyTime) {
          elements.dailyTime.textContent = formatDuration(totalTimeToday);
        }
      }
    } catch (error) {
      console.error('Error loading daily stats:', error);
    }
  }

  async function loadProgressStats() {
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (!userEmail) return;

      const filter = elements.historyFilter?.value || 'week';
      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      
      let startDate = new Date();
      if (filter === 'today') {
        startDate.setHours(0, 0, 0, 0);
      } else if (filter === 'week') {
        startDate.setDate(startDate.getDate() - 7);
      } else if (filter === 'month') {
        startDate.setMonth(startDate.getMonth() - 1);
      }

      const response = await fetch(`${backend}/api/problem-sessions?since=${startDate.toISOString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const sessions = await response.json();
        
        const completed = sessions.filter(s => s.completed).length;
        const totalTime = sessions.reduce((total, session) => {
          return total + (session.totalTime || 0);
        }, 0);
        
        // Calculate streak (simplified)
        const streak = await calculateStreak(sessions);

        // Update progress display
        if (elements.completedCount) {
          elements.completedCount.textContent = completed;
        }
        if (elements.totalTime) {
          elements.totalTime.textContent = formatDuration(totalTime);
        }
        if (elements.streakCount) {
          elements.streakCount.textContent = streak;
        }
      }
    } catch (error) {
      console.error('Error loading progress stats:', error);
    }
  }

  async function calculateStreak(sessions) {
    // Simple streak calculation based on consecutive days with completed sessions
    const completedSessions = sessions.filter(s => s.completed);
    if (completedSessions.length === 0) return 0;

    const uniqueDays = [...new Set(completedSessions.map(s => 
      new Date(s.startTime).toDateString()
    ))].sort();

    let streak = 1;
    const today = new Date().toDateString();
    
    // Check if today has a completed session
    if (!uniqueDays.includes(today)) return 0;

    // Count consecutive days backwards from today
    for (let i = uniqueDays.length - 2; i >= 0; i--) {
      const currentDay = new Date(uniqueDays[i]);
      const nextDay = new Date(uniqueDays[i + 1]);
      const diffDays = (nextDay - currentDay) / (1000 * 60 * 60 * 24);
      
      if (diffDays === 1) {
        streak++;
      } else {
        break;
      }
    }
    
    return streak;
  }

  function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  async function detectCurrentPage() {
    try {
      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab) {
        const title = extractProblemTitle(tab.title, tab.url);
        const site = extractSiteName(tab.url);
        
        // Update UI with detected info
        const titleElement = document.getElementById('detectedTitle');
        const urlElement = document.getElementById('detectedUrl');
        
        if (titleElement) {
          titleElement.textContent = title || 'Click "Start" to track current problem';
        }
        
        if (urlElement) {
          urlElement.textContent = site || 'Auto-detect from current tab';
        }
        
        // Store detected info for session creation
        window.detectedPageInfo = {
          title: title || tab.title || 'Problem Session',
          url: tab.url,
          site: site,
          favicon: tab.favIconUrl
        };
      }
    } catch (error) {
      console.error('Error detecting page:', error);
    }
  }

  function extractProblemTitle(title, url) {
    // LeetCode
    if (url.includes('leetcode.com')) {
      const match = title.match(/(\d+\.\s+.*?)\s*-\s*LeetCode/);
      return match ? match[1] : 'LeetCode Problem';
    }
    
    // HackerRank
    if (url.includes('hackerrank.com')) {
      const match = title.match(/(.*?)\s*\|\s*HackerRank/);
      return match ? match[1] : 'HackerRank Challenge';
    }
    
    // CodePen
    if (url.includes('codepen.io')) {
      return 'CodePen Project';
    }
    
    // GitHub
    if (url.includes('github.com')) {
      const match = title.match(/^(.*?)\s*·\s*GitHub/);
      return match ? match[1] : 'GitHub Project';
    }
    
    // Stack Overflow
    if (url.includes('stackoverflow.com')) {
      const match = title.match(/^(.*?)\s*-\s*Stack Overflow/);
      return match ? match[1] : 'Stack Overflow Question';
    }
    
    // YouTube
    if (url.includes('youtube.com')) {
      const match = title.match(/^(.*?)\s*-\s*YouTube/);
      return match ? match[1] : 'YouTube Tutorial';
    }
    
    // Default: use first part of title
    return title.split(' - ')[0].split(' | ')[0].substring(0, 50);
  }

  function extractSiteName(url) {
    try {
      const domain = new URL(url).hostname;
      
      // Map known coding sites
      const siteMap = {
        'leetcode.com': 'LeetCode',
        'hackerrank.com': 'HackerRank', 
        'codepen.io': 'CodePen',
        'github.com': 'GitHub',
        'stackoverflow.com': 'StackOverflow',
        'youtube.com': 'YouTube',
        'medium.com': 'Medium',
        'dev.to': 'Dev.to'
      };
      
      for (const [key, value] of Object.entries(siteMap)) {
        if (domain.includes(key)) return value;
      }
      
      // Default: capitalize domain
      return domain.replace('www.', '').split('.')[0];
    } catch {
      return 'Website';
    }
  }

  async function startNewSession() {
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (!userEmail) {
        showError('Please set your email first');
        return;
      }

      const pageInfo = window.detectedPageInfo || {};
      const category = document.getElementById('quickCategory').value;

      const sessionData = {
        userEmail,
        title: pageInfo.title,
        url: pageInfo.url,
        site: pageInfo.site,
        category: category,
        difficulty: 'Medium', // Default
        timezone: new Date().getTimezoneOffset(),
        timezoneName: Intl.DateTimeFormat().resolvedOptions().timeZone
      };

      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      
      const response = await fetch(`${backend}/api/problem-sessions/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sessionData)
      });

      if (response.ok) {
        const data = await response.json();
        activeSession = data.session;
        
        showActiveSession();
        startStopwatchTimer();
        showToast('Session started!');
      } else {
        const error = await response.json();
        showError(error.error || 'Failed to start session');
      }
    } catch (error) {
      console.error('Error starting session:', error);
      showError('Failed to start session');
    }
  }

  async function pauseResumeSession() {
    if (!activeSession) return;

    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      
      const response = await fetch(`${backend}/api/problem-sessions/${activeSession.id}/pause`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          userEmail,
          reason: activeSession.status === 'active' ? 'Manual pause' : 'Manual resume'
        })
      });

      if (response.ok) {
        const data = await response.json();
        activeSession.status = data.session.status;
        updateStopwatchStatus();
        
        if (activeSession.status === 'paused') {
          stopStopwatchTimer();
          showToast('Session paused');
        } else {
          startStopwatchTimer();
          showToast('Session resumed');
        }
      }
    } catch (error) {
      console.error('Error pausing/resuming session:', error);
      showError('Failed to update session');
    }
  }

  async function completeSession() {
    if (!activeSession) return;

    const completionNotes = elements.sessionNotes.value.trim();
    
    // Show completion dialog
    showConfirmModal(
      'Complete Session',
      'Mark this session as completed successfully?',
      async () => {
        try {
          const { userEmail } = await chrome.storage.local.get(['userEmail']);
          const backend = await resolveBackendUrl();
          const { token } = await TokenStorage.getToken();
          
          const response = await fetch(`${backend}/api/problem-sessions/${activeSession.id}/complete`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              userEmail,
              completionNotes,
              wasSuccessful: true
            })
          });

          if (response.ok) {
            const data = await response.json();
            stopStopwatchTimer();
            activeSession = null;
            showNewSessionForm();
            await loadSessionHistory();
            showToast(`Session completed! Duration: ${formatDuration(data.session.duration)}`);
          }
        } catch (error) {
          console.error('Error completing session:', error);
          showError('Failed to complete session');
        }
      }
    );
  }

  async function abandonSession() {
    if (!activeSession) return;

    showConfirmModal(
      'Abandon Session',
      'Are you sure you want to abandon this session? This action cannot be undone.',
      async () => {
        try {
          const { userEmail } = await chrome.storage.local.get(['userEmail']);
          const backend = await resolveBackendUrl();
          const { token } = await TokenStorage.getToken();
          
          const response = await fetch(`${backend}/api/problem-sessions/${activeSession.id}/abandon`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              userEmail,
              reason: 'User abandoned session'
            })
          });

          if (response.ok) {
            stopStopwatchTimer();
            activeSession = null;
            showNewSessionForm();
            await loadSessionHistory();
            showToast('Session abandoned');
          }
        } catch (error) {
          console.error('Error abandoning session:', error);
          showError('Failed to abandon session');
        }
      }
    );
  }

  function showActiveSession() {
    if (!activeSession || !elements.activeSessionCard || !elements.newSessionCard) return;

    elements.activeSessionCard.classList.remove('hidden');
    elements.newSessionCard.classList.add('hidden');
    
    elements.sessionTitle.textContent = activeSession.title;
    elements.sessionCategory.textContent = activeSession.category;
    if (elements.sessionSite) {
      elements.sessionSite.textContent = activeSession.site || 'Website';
    }
    
    updateStopwatchStatus();
  }

  function showNewSessionForm() {
    if (!elements.activeSessionCard || !elements.newSessionCard) return;
    
    elements.activeSessionCard.classList.add('hidden');
    elements.newSessionCard.classList.remove('hidden');
  }

  async function loadActiveSession() {
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (!userEmail) return;

      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      
      const response = await fetch(`${backend}/api/problem-sessions/current/${encodeURIComponent(userEmail)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.activeSession) {
          activeSession = data.activeSession;
          showActiveSession();
          startStopwatchTimer();
        } else {
          showNewSessionForm();
        }
      }
    } catch (error) {
      console.error('Error loading active session:', error);
      showNewSessionForm();
    }
  }

  async function loadSessionHistory() {
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (!userEmail) return;

      const filter = elements.historyFilter ? elements.historyFilter.value : 'today';
      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      
      const response = await fetch(`${backend}/api/problem-sessions/history/${encodeURIComponent(userEmail)}?filter=${filter}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        displayCompactHistory(data.sessions || []);
      }
    } catch (error) {
      console.error('Error loading session history:', error);
    }
  }

  function displayCompactHistory(sessions) {
    if (!elements.sessionsList) return;
    
    if (sessions.length === 0) {
      elements.sessionsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">•</div>
          <div class="empty-text">No sessions yet</div>
          <div class="empty-subtext">Start your first problem-solving session!</div>
        </div>
      `;
      return;
    }

    const html = sessions.slice(0, 5).map(session => {
      const statusIcon = session.completed ? '✓' : session.status === 'paused' ? '⏸' : '×';
      const statusClass = session.completed ? 'completed' : session.status === 'paused' ? 'paused' : 'abandoned';
      const duration = formatDuration(session.totalTime || session.duration || 0);
      const timeAgo = getTimeAgo(new Date(session.startTime));
      
      return `
        <div class="session-item ${statusClass}">
          <div class="session-info">
            <div class="session-name">
              <span class="session-status-icon">${statusIcon}</span>
              <span class="session-title-text">${session.title || 'Problem Session'}</span>
            </div>
            <div class="session-meta">
              <span class="session-site-badge">${session.site || 'Website'}</span>
              <span class="session-category-badge">${session.category || 'Coding'}</span>
            </div>
          </div>
          <div class="session-stats">
            <div class="session-duration">${duration}</div>
            <div class="session-time">${timeAgo}</div>
          </div>
        </div>
      `;
    }).join('');

    elements.sessionsList.innerHTML = html;
  }

  function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffHours > 24) {
      return Math.floor(diffHours / 24) + 'd ago';
    } else if (diffHours > 0) {
      return diffHours + 'h ago';
    } else if (diffMinutes > 0) {
      return diffMinutes + 'm ago';
    } else {
      return 'Just now';
    }
  }

  function updateStopwatchStatus() {
    if (!activeSession || !elements.pauseResumeBtn) return;
    
    const btnIcon = elements.pauseResumeBtn.querySelector('.btn-icon');
    const btnText = elements.pauseResumeBtn.querySelector('.btn-text');
    
    if (activeSession.status === 'paused') {
      if (btnIcon) btnIcon.textContent = '▶';
      if (btnText) btnText.textContent = 'Resume';
      elements.pauseResumeBtn.title = 'Resume session';
    } else {
      if (btnIcon) btnIcon.textContent = '⏸';
      if (btnText) btnText.textContent = 'Pause';
      elements.pauseResumeBtn.title = 'Pause session';
    }
  }

  function updateStopwatchDisplay() {
    if (!activeSession || !elements.stopwatchTime) return;
    
    const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
    const totalTime = (activeSession.duration || 0) + elapsed;
    
    elements.stopwatchTime.textContent = formatTimeDisplay(totalTime);
  }

  function formatTimeDisplay(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function startStopwatchTimer() {
    if (stopwatchInterval) {
      clearInterval(stopwatchInterval);
    }
    
    sessionStartTime = Date.now() - (pausedDuration || 0);
    
    stopwatchInterval = setInterval(() => {
      if (activeSession && activeSession.status === 'active') {
        updateStopwatchDisplay();
      }
    }, 1000);
  }

  function stopStopwatchTimer() {
    if (stopwatchInterval) {
      clearInterval(stopwatchInterval);
      stopwatchInterval = null;
    }
  }

  function updateStopwatchDisplay() {
    if (!activeSession || !elements.stopwatchTime) return;
    
    const now = Date.now();
    const sessionStart = new Date(activeSession.startTime).getTime();
    const elapsed = now - sessionStart - (activeSession.pausedDuration || 0);
    
    const hours = Math.floor(elapsed / (1000 * 60 * 60));
    const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);
    
    elements.stopwatchTime.textContent = 
      `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  function updateStopwatchStatus() {
    if (!activeSession || !elements.stopwatchStatus || !elements.pauseResumeBtn) return;
    
    if (activeSession.status === 'active') {
      elements.stopwatchStatus.textContent = 'Running';
      elements.pauseResumeBtn.innerHTML = '⏸️ Pause';
      elements.pauseResumeBtn.className = 'btn secondary';
    } else if (activeSession.status === 'paused') {
      elements.stopwatchStatus.textContent = 'Paused';
      elements.pauseResumeBtn.innerHTML = '▶️ Resume';
      elements.pauseResumeBtn.className = 'btn primary';
    }
  }

  async function saveSessionNotes() {
    if (!activeSession || !elements.sessionNotes) return;
    
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      
      await fetch(`${backend}/api/problem-sessions/${activeSession.id}/update`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          userEmail,
          notes: elements.sessionNotes.value.trim()
        })
      });
    } catch (error) {
      console.error('Error saving notes:', error);
    }
  }

  // Utility function for debouncing
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // ==================== DAILY ACTIVITY SUMMARY FUNCTIONS ====================
  
  function initializeDailySummary() {
    // Set default date to today
    if (elements.summaryDate) {
      elements.summaryDate.value = new Date().toISOString().split('T')[0];
      elements.summaryDate.addEventListener('change', loadDailySummary);
      
      // Load today's summary by default
      loadDailySummary();
    }
  }

  async function loadDailySummary() {
    if (!elements.dailySummaryContent || !elements.summaryDate) return;
    
    const selectedDate = elements.summaryDate.value;
    if (!selectedDate) return;
    
    elements.dailySummaryContent.innerHTML = '<div class="summary-loading"><span class="loader"></span><span>Loading daily summary...</span></div>';
    
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (!userEmail) {
        elements.dailySummaryContent.innerHTML = '<div class="no-activity"><h4>Please set your email first</h4></div>';
        return;
      }

      // Load both browsing data and problem sessions for the selected date
      const [browsingData, problemSessions] = await Promise.all([
        loadBrowsingDataForDate(selectedDate, userEmail),
        loadProblemSessionsForDate(selectedDate, userEmail)
      ]);

      displayDailySummary(selectedDate, browsingData, problemSessions);
    } catch (error) {
      console.error('Error loading daily summary:', error);
      elements.dailySummaryContent.innerHTML = '<div class="no-activity"><h4>Error loading daily summary</h4><p>Please try again later</p></div>';
    }
  }

  async function loadBrowsingDataForDate(date, userEmail) {
    try {
      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      const timezone = new Date().getTimezoneOffset();
      
      const response = await fetch(
        `${backend}/api/time-data/report/${encodeURIComponent(userEmail)}?date=${date}&endDate=${date}&timezone=${timezone}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data?.data || data || [];
      }
      return [];
    } catch (error) {
      console.error('Error loading browsing data:', error);
      return [];
    }
  }

  async function loadProblemSessionsForDate(date, userEmail) {
    try {
      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      
      const response = await fetch(
        `${backend}/api/problem-sessions/history/${encodeURIComponent(userEmail)}?date=${date}&endDate=${date}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data.sessions || [];
      }
      return [];
    } catch (error) {
      console.error('Error loading problem sessions:', error);
      return [];
    }
  }

  function displayDailySummary(date, browsingData, problemSessions) {
    if (!elements.dailySummaryContent) return;
    
    const hasActivity = browsingData.length > 0 || problemSessions.length > 0;
    
    if (!hasActivity) {
      elements.dailySummaryContent.innerHTML = `
        <div class="no-activity">
          <h4>No activity recorded</h4>
          <p>No browsing or problem-solving activity found for ${new Date(date).toLocaleDateString()}</p>
        </div>
      `;
      return;
    }

    // Calculate summary statistics
    const totalBrowsingTime = browsingData.reduce((sum, entry) => sum + (entry.totalTime || 0), 0);
    const totalProblemTime = problemSessions.reduce((sum, session) => sum + (session.duration || 0), 0);
    const completedProblems = problemSessions.filter(s => s.status === 'completed').length;
    const uniqueDomains = new Set(browsingData.map(entry => entry.domain)).size;

    // Create timeline from both data sources
    const timeline = createActivityTimeline(browsingData, problemSessions);
    
    elements.dailySummaryContent.innerHTML = `
      <div class="activity-summary">
        <div class="summary-stat">
          <span class="summary-stat-value">${formatDuration(totalBrowsingTime)}</span>
          <span class="summary-stat-label">Browsing Time</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value">${formatDuration(totalProblemTime)}</span>
          <span class="summary-stat-label">Problem Solving</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value">${completedProblems}</span>
          <span class="summary-stat-label">Problems Solved</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value">${uniqueDomains}</span>
          <span class="summary-stat-label">Websites Visited</span>
        </div>
      </div>
      
      <h4>Activity Timeline</h4>
      <div class="activity-timeline">
        ${timeline.map(item => `
          <div class="timeline-item">
            <div class="timeline-time">${item.time}</div>
            <div class="timeline-content">
              <h4>${item.title}</h4>
              <p>${item.description}</p>
              <div class="timeline-meta">
                ${item.tags.map(tag => `<span class="timeline-tag">${tag}</span>`).join('')}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function createActivityTimeline(browsingData, problemSessions) {
    const timeline = [];
    
    // Add problem sessions to timeline
    problemSessions.forEach(session => {
      const startTime = new Date(session.startTime);
      timeline.push({
        time: startTime.toLocaleTimeString(),
        timestamp: startTime.getTime(),
        title: `Problem: ${session.title}`,
        description: `${session.category} • ${session.difficulty} • Duration: ${formatDuration(session.duration)}`,
        tags: [session.status, session.category, session.difficulty].concat(session.tags || []),
        type: 'problem'
      });
    });
    
    // Add significant browsing activities (sessions > 5 minutes)
    const significantBrowsing = browsingData.filter(entry => entry.totalTime > 300000); // 5 minutes
    significantBrowsing.forEach(entry => {
      if (entry.sessions && entry.sessions.length > 0) {
        const firstSession = entry.sessions[0];
        const startTime = new Date(firstSession.startTime);
        timeline.push({
          time: startTime.toLocaleTimeString(),
          timestamp: startTime.getTime(),
          title: `Browsing: ${entry.domain}`,
          description: `Total time: ${formatDuration(entry.totalTime)} • ${entry.sessions.length} session(s)`,
          tags: [entry.category || 'Other', `${entry.sessions.length} sessions`],
          type: 'browsing'
        });
      }
    });
    
    // Sort timeline by timestamp
    timeline.sort((a, b) => a.timestamp - b.timestamp);
    
    return timeline;
  }

  // Call initialization
  initializeEnhancedFeatures();
  initializeModalEvents();
  updateDateRangeDisplay(); // Initialize date range display

  // ==================== SUMMARY TAB FUNCTIONS ====================
  
  async function initializeSummaryTab() {
    // Set today's date by default
    const today = new Date().toISOString().split('T')[0];
    const summaryDate = document.getElementById('summaryDate');
    if (summaryDate) {
      summaryDate.value = today;
      summaryDate.addEventListener('change', handleDateChange);
    }

    // Add navigation button event listeners
    const prevDayBtn = document.getElementById('prevDayBtn');
    const nextDayBtn = document.getElementById('nextDayBtn');
    const todayBtn = document.getElementById('todayBtn');
    
    if (prevDayBtn) {
      prevDayBtn.addEventListener('click', navigateToPreviousDay);
    }
    
    if (nextDayBtn) {
      nextDayBtn.addEventListener('click', navigateToNextDay);
    }
    
    if (todayBtn) {
      todayBtn.addEventListener('click', navigateToToday);
    }
    
    // Add keyboard navigation support
    document.addEventListener('keydown', handleSummaryKeyNavigation);
    
    await loadSummaryForDate();
    updateNavigationButtons();
  }

  function handleSummaryKeyNavigation(event) {
    // Only handle keyboard navigation when Summary tab is active
    const summaryTab = document.querySelector('[data-maintab="summary"]');
    if (!summaryTab || !summaryTab.classList.contains('active')) return;
    
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      navigateToPreviousDay();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      const nextDayBtn = document.getElementById('nextDayBtn');
      if (nextDayBtn && !nextDayBtn.disabled) {
        navigateToNextDay();
      }
    }
  }

  function navigateToPreviousDay() {
    const summaryDate = document.getElementById('summaryDate');
    if (!summaryDate) return;
    
    const currentDate = new Date(summaryDate.value);
    currentDate.setDate(currentDate.getDate() - 1);
    summaryDate.value = currentDate.toISOString().split('T')[0];
    
    handleDateChange();
  }

  function navigateToNextDay() {
    const summaryDate = document.getElementById('summaryDate');
    if (!summaryDate) return;
    
    const currentDate = new Date(summaryDate.value);
    currentDate.setDate(currentDate.getDate() + 1);
    summaryDate.value = currentDate.toISOString().split('T')[0];
    
    handleDateChange();
  }

  function navigateToToday() {
    const summaryDate = document.getElementById('summaryDate');
    if (!summaryDate) return;
    
    const today = new Date().toISOString().split('T')[0];
    summaryDate.value = today;
    
    handleDateChange();
  }

  function updateNavigationButtons() {
    const summaryDate = document.getElementById('summaryDate');
    const nextDayBtn = document.getElementById('nextDayBtn');
    const todayBtn = document.getElementById('todayBtn');
    const summaryTitle = document.getElementById('summaryTitle');
    
    if (!summaryDate) return;
    
    const selectedDate = new Date(summaryDate.value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Disable next button if selected date is today or future
    if (nextDayBtn) {
      nextDayBtn.disabled = selectedDate >= today;
    }
    
    // Disable today button if already viewing today
    if (todayBtn) {
      todayBtn.disabled = selectedDate.toDateString() === today.toDateString();
    }
    
    // Update title to show the selected date
    if (summaryTitle) {
      const isToday = selectedDate.toDateString() === today.toDateString();
      const isYesterday = selectedDate.toDateString() === new Date(today.getTime() - 24 * 60 * 60 * 1000).toDateString();
      
      if (isToday) {
        summaryTitle.textContent = 'Today\'s Activity Summary';
      } else if (isYesterday) {
        summaryTitle.textContent = 'Yesterday\'s Activity Summary';
      } else {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const dateStr = selectedDate.toLocaleDateString('en-US', options);
        summaryTitle.textContent = `${dateStr} Summary`;
      }
    }
  }

  async function handleDateChange() {
    await loadSummaryForDate();
    updateNavigationButtons();
  }

  async function loadSummaryForDate() {
    const summaryDate = document.getElementById('summaryDate');
    const selectedDate = summaryDate ? summaryDate.value : new Date().toISOString().split('T')[0];
    
    // Show loading indicator
    showSummaryLoading();
    
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (!userEmail) {
        hideSummaryLoading();
        return;
      }

      const backend = await resolveBackendUrl();
      const { token } = await TokenStorage.getToken();
      
      // Fetch browsing data
      const browsingResponse = await fetch(`${backend}/api/time-data/user/${encodeURIComponent(userEmail)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // Fetch problem sessions
      const sessionsResponse = await fetch(`${backend}/api/problem-sessions/history/${encodeURIComponent(userEmail)}?date=${selectedDate}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      let browsingData = [];
      let problemSessions = [];

      if (browsingResponse.ok) {
        const browsingResult = await browsingResponse.json();
        browsingData = browsingResult.data || [];
      }

      if (sessionsResponse.ok) {
        const sessionsResult = await sessionsResponse.json();
        problemSessions = sessionsResult.sessions || [];
      }

      // Filter browsing data for selected date
      const targetDate = new Date(selectedDate);
      const filteredBrowsing = browsingData.filter(item => {
        const itemDate = new Date(item.date);
        return itemDate.toDateString() === targetDate.toDateString();
      });

      // Combine and sort activities by time spent
      const allActivities = [
        ...filteredBrowsing.map(item => ({
          title: item.site,
          time: item.totalTime,
          type: 'browsing',
          category: item.category || 'Other'
        })),
        ...problemSessions.map(session => ({
          title: session.title,
          time: session.duration || 0,
          type: 'problem',
          category: session.category || 'Coding'
        }))
      ];

      // Sort by time spent (highest to lowest)
      allActivities.sort((a, b) => b.time - a.time);

      // Update insights
      updateSummaryInsights(filteredBrowsing, problemSessions, allActivities, selectedDate);
      
      // Show empty state if no data
      if (allActivities.length === 0) {
        showEmptyState(selectedDate);
      } else {
        hideEmptyState();
      }

    } catch (error) {
      console.error('Error loading summary:', error);
    } finally {
      // Always hide loading indicator
      hideSummaryLoading();
    }
  }

  function showSummaryLoading() {
    const loadingIndicator = document.getElementById('summaryLoading');
    if (loadingIndicator) {
      loadingIndicator.classList.remove('hidden');
    }
  }

  function hideSummaryLoading() {
    const loadingIndicator = document.getElementById('summaryLoading');
    if (loadingIndicator) {
      loadingIndicator.classList.add('hidden');
    }
  }

  function updateTopPerformers(activities) {
    const rank1Title = document.getElementById('rank1Title');
    const rank1Time = document.getElementById('rank1Time');
    const rank2Title = document.getElementById('rank2Title');
    const rank2Time = document.getElementById('rank2Time');
    const rank3Title = document.getElementById('rank3Title');
    const rank3Time = document.getElementById('rank3Time');

    // Clear previous data
    [rank1Title, rank2Title, rank3Title].forEach(el => {
      if (el) el.textContent = '-';
    });
    [rank1Time, rank2Time, rank3Time].forEach(el => {
      if (el) el.textContent = '-';
    });

    // Update with top 3 activities
    activities.slice(0, 3).forEach((activity, index) => {
      const titleElement = [rank1Title, rank2Title, rank3Title][index];
      const timeElement = [rank1Time, rank2Time, rank3Time][index];
      
      if (titleElement && timeElement) {
        titleElement.textContent = activity.title.substring(0, 15) + (activity.title.length > 15 ? '...' : '');
        timeElement.textContent = formatDuration(activity.time);
      }
    });
  }

  function updateSummaryStats(browsingData, problemSessions, selectedDate) {
    const totalBrowsingTime = browsingData.reduce((total, item) => total + item.totalTime, 0);
    const totalSolvingTime = problemSessions.reduce((total, session) => total + (session.duration || 0), 0);
    const problemsSolved = problemSessions.filter(session => session.status === 'completed').length;
    const sitesVisited = browsingData.length;

    const browsingElement = document.getElementById('totalBrowsingTime');
    const solvingElement = document.getElementById('totalSolvingTime');
    const problemsElement = document.getElementById('problemsSolved');
    const sitesElement = document.getElementById('sitesVisited');

    if (browsingElement) browsingElement.textContent = formatDuration(totalBrowsingTime);
    if (solvingElement) solvingElement.textContent = formatDuration(totalSolvingTime);
    if (problemsElement) problemsElement.textContent = problemsSolved.toString();
    if (sitesElement) sitesElement.textContent = sitesVisited.toString();
  }

  function updateActivityList(activities) {
    const activityItems = document.getElementById('activityItems');
    if (!activityItems) return;

    if (activities.length === 0) {
      activityItems.innerHTML = '<div class="loading-text">No activities found for this date</div>';
      return;
    }

    const html = activities.map(activity => `
      <div class="activity-item">
        <div class="activity-info">
          <div class="activity-title">${activity.title}</div>
          <div class="activity-type">${activity.type} • ${activity.category}</div>
        </div>
        <div class="activity-time">${formatDuration(activity.time)}</div>
      </div>
    `).join('');

    activityItems.innerHTML = html;
  }

  function formatDuration(seconds) {
    // Handle both seconds and milliseconds input
    let totalSeconds = seconds;
    if (seconds > 100000) {
      // Likely milliseconds, convert to seconds
      totalSeconds = Math.floor(seconds / 1000);
    }
    
    if (totalSeconds < 60) {
      return `${totalSeconds}s`;
    } else if (totalSeconds < 3600) {
      const minutes = Math.floor(totalSeconds / 60);
      return `${minutes}m`;
    } else {
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
  }

  // ==================== NEW SUMMARY INSIGHTS FUNCTIONS ====================
  
  function updateSummaryInsights(browsingData, problemSessions, allActivities, selectedDate) {
    // Update key metrics
    updateKeyMetrics(browsingData, problemSessions);
    
    // Update top 3 sites by time spent
    updateTopSites(browsingData);
    
    // Calculate and update productivity insights
    updateProductivityInsights(browsingData, problemSessions, selectedDate);
  }

  function updateKeyMetrics(browsingData, problemSessions) {
    // Total focus sessions
    const totalFocusSessions = problemSessions.length;
    const focusSessionsElement = document.getElementById('totalFocusSessions');
    if (focusSessionsElement) {
      focusSessionsElement.textContent = totalFocusSessions;
    }

    // Total sites visited
    const totalSitesVisited = browsingData.length;
    const sitesVisitedElement = document.getElementById('totalSitesVisited');
    if (sitesVisitedElement) {
      sitesVisitedElement.textContent = totalSitesVisited;
    }

    // Total active time (browsing + problem solving)
    const totalBrowsingTime = browsingData.reduce((total, item) => total + item.totalTime, 0);
    const totalSolvingTime = problemSessions.reduce((total, session) => total + (session.duration || 0), 0);
    const totalActiveTime = totalBrowsingTime + totalSolvingTime;
    const activeTimeElement = document.getElementById('totalActiveTime');
    if (activeTimeElement) {
      activeTimeElement.textContent = formatDuration(totalActiveTime);
    }

    // Problems solved
    const problemsSolved = problemSessions.filter(session => session.status === 'completed').length;
    const problemsSolvedElement = document.getElementById('problemsSolved');
    if (problemsSolvedElement) {
      problemsSolvedElement.textContent = problemsSolved;
    }
  }

  function updateTopSites(browsingData) {
    // Sort sites by time spent
    const sortedSites = [...browsingData].sort((a, b) => b.totalTime - a.totalTime);
    
    // Update top 3 sites
    for (let i = 1; i <= 3; i++) {
      const nameElement = document.getElementById(`topSite${i}Name`);
      const timeElement = document.getElementById(`topSite${i}Time`);
      
      if (nameElement && timeElement) {
        if (sortedSites[i - 1]) {
          const site = sortedSites[i - 1];
          const label = site.site || site.domain || site.name || '—';
          nameElement.textContent = label;
          timeElement.textContent = formatDuration(site.totalTime || 0);
        } else {
          nameElement.textContent = '-';
          timeElement.textContent = '-';
        }
      }
    }
  }

  function updateProductivityInsights(browsingData, problemSessions, selectedDate) {
    // Calculate productivity score
    const totalBrowsingTime = browsingData.reduce((total, item) => total + item.totalTime, 0);
    const totalSolvingTime = problemSessions.reduce((total, session) => total + (session.duration || 0), 0);
    const totalTime = totalBrowsingTime + totalSolvingTime;
    
    let productivityScore = 0;
    let scoreDescription = 'No activity';
    
    if (totalTime > 0) {
      const solvingRatio = totalSolvingTime / totalTime;
      productivityScore = Math.round(solvingRatio * 100);
      
      if (productivityScore >= 70) {
        scoreDescription = 'Excellent focus!';
      } else if (productivityScore >= 50) {
        scoreDescription = 'Good balance';
      } else if (productivityScore >= 25) {
        scoreDescription = 'Room for improvement';
      } else {
        scoreDescription = 'Mostly browsing';
      }
    }
    
    const productivityScoreElement = document.getElementById('productivityScore');
    const scoreDescriptionElement = document.getElementById('scoreDescription');
    
    if (productivityScoreElement) {
      productivityScoreElement.textContent = totalTime > 0 ? `${productivityScore}%` : '-';
    }
    if (scoreDescriptionElement) {
      scoreDescriptionElement.textContent = scoreDescription;
    }
    
    // Calculate focus quality
    const completedSessions = problemSessions.filter(session => session.status === 'completed').length;
    const totalSessions = problemSessions.length;
    
    let focusQuality = '-';
    let qualityDescription = 'No focus sessions';
    
    if (totalSessions > 0) {
      const completionRate = (completedSessions / totalSessions) * 100;
      focusQuality = `${Math.round(completionRate)}%`;
      
      if (completionRate >= 80) {
        qualityDescription = 'Outstanding!';
      } else if (completionRate >= 60) {
        qualityDescription = 'Good completion';
      } else if (completionRate >= 40) {
        qualityDescription = 'Needs focus';
      } else {
        qualityDescription = 'Low completion';
      }
    }
    
    const focusQualityElement = document.getElementById('focusQuality');
    const qualityDescriptionElement = document.getElementById('qualityDescription');
    
    if (focusQualityElement) {
      focusQualityElement.textContent = focusQuality;
    }
    if (qualityDescriptionElement) {
      qualityDescriptionElement.textContent = qualityDescription;
    }
  }

  function showEmptyState(selectedDate) {
    // Reset all metrics to show no activity
    const elements = [
      'totalFocusSessions', 'totalSitesVisited', 'totalActiveTime', 'problemsSolved',
      'topSite1Name', 'topSite2Name', 'topSite3Name',
      'topSite1Time', 'topSite2Time', 'topSite3Time',
      'productivityScore', 'focusQuality'
    ];
    
    elements.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        if (id.includes('Time') || id.includes('Score') || id.includes('Quality')) {
          element.textContent = '-';
        } else if (id.includes('Name')) {
          element.textContent = 'No activity';
        } else {
          element.textContent = '0';
        }
      }
    });
    
    // Update descriptions for empty state
    const scoreDesc = document.getElementById('scoreDescription');
    const qualityDesc = document.getElementById('qualityDescription');
    
    if (scoreDesc) scoreDesc.textContent = 'No activity recorded';
    if (qualityDesc) qualityDesc.textContent = 'No focus sessions';
    
    // Create empty state message
    const isToday = selectedDate === new Date().toISOString().split('T')[0];
    const emptyMessage = isToday 
      ? 'Start browsing or solving problems to see your insights here!'
      : 'No activity recorded for this date.';
    
    console.log('Empty state:', emptyMessage);
  }

  function hideEmptyState() {
    // Remove any empty state overlays if they exist
    // This is a placeholder for potential future empty state UI
  }

  // Initialize all components
  initTheme();
  
  // Initialize Guard tab if it's the current tab or ensure it's ready
  if (currentMainTab === 'guard') {
    loadBlockedSites();
    updateGuardStats();
  }

  // Add sample focus sessions for testing (only if none exist)
  chrome.storage.local.get(['focusHistory'], (result) => {
    if (!result.focusHistory || result.focusHistory.length === 0) {
      const sampleSessions = [
        {
          duration: 25 * 60 * 1000, // 25 minutes
          startTime: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
          endTime: Date.now() - 2 * 60 * 60 * 1000 + 25 * 60 * 1000,
          status: 'completed',
          date: new Date().toDateString(),
          sessionType: 'focus'
        },
        {
          duration: 15 * 60 * 1000, // 15 minutes
          startTime: Date.now() - 1 * 60 * 60 * 1000, // 1 hour ago
          endTime: Date.now() - 1 * 60 * 60 * 1000 + 15 * 60 * 1000,
          status: 'interrupted',
          date: new Date().toDateString(),
          sessionType: 'focus'
        }
      ];
      chrome.storage.local.set({ focusHistory: sampleSessions });
    }
  });

  // Initialize Guard functionality
  initializeGuard();
});
