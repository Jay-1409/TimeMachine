import reportScheduler from './report-scheduler.js';

const CONFIG = {
  // BACKEND_URL removed in favor of dynamic TMConfig
  EMAIL_CONFIG: {
    enabled: false,
    service: null, // 'emailjs' or 'smtp'
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

function formatDuration(milliseconds) {
  // Ensure input is a valid positive number
  if (isNaN(milliseconds) || milliseconds < 0) {
    return "0m";
  }
  
  // Cap unrealistic durations (maximum 24 hours)
  const MAX_DISPLAY_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  if (milliseconds > MAX_DISPLAY_DURATION) {
    console.warn(`Capping displayed duration from ${milliseconds}ms to ${MAX_DISPLAY_DURATION}ms`);
    milliseconds = MAX_DISPLAY_DURATION;
  }

  const totalSeconds = Math.floor(milliseconds / 1000); // First, convert milliseconds to seconds

  if (totalSeconds === 0) {
    return "0m"; // Handle very small durations
  }

  const hours = Math.floor(totalSeconds / 3600); // Calculate hours from total seconds
  const minutes = Math.floor((totalSeconds % 3600) / 60); // Calculate remaining minutes
  const seconds = totalSeconds % 60; // Calculate remaining seconds

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    // If less than an hour, display minutes and seconds
    return `${minutes}m ${seconds}s`;
  }
  // If less than a minute, display only seconds
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

// Dynamically resolve backend base URL (production vs development)
async function resolveBackendUrl() {
  try {
    if (window.TMConfig) {
      await window.TMConfig.loadOverrides();
      return window.TMConfig.current.backendBaseUrl;
    }
  } catch (e) {
    console.warn("resolveBackendUrl fallback due to error:", e);
  }
  // Fallback chain
  return "https://timemachine-1.onrender.com";
}

// Enhanced API helper function with authentication and error handling
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
    tabButtons: document.querySelectorAll(".tab-btn"),
    mainTabButtons: document.querySelectorAll(".main-tab-btn"),
    insightsTabContent: document.getElementById("insightsTabContent"),
    settingsTabContent: document.getElementById("settingsTabContent"),
    statsDiv: document.getElementById("stats"),
    productivityScore: document.getElementById("productivityScore"),
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
  };

  const themes = ["light", "dark", "cyberpunk", "minimal", "ocean", "sunset", "forest"];
  let currentSubTab = "daily";
  let currentMainTab = "insights";
  let siteCategories = {};
  let currentTheme = localStorage.getItem("theme") || "light";
  let currentThemeIndex = themes.indexOf(currentTheme);

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
  if (typeof Auth !== 'undefined') {
    console.log('Authentication system initialized');
  } else {
    console.warn('Auth not found. Authentication will not be available.');
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
    elements.pomodoroToggle?.addEventListener('click', togglePomodoro);
  // Manual refresh button removed; background auto-flush keeps data fresh
    
    // Navigation between main tabs
    elements.settingsBtn?.addEventListener("click", () => {
      if (currentMainTab === "settings") {
        switchMainTab("insights");
      } else {
        switchMainTab("settings");
      }
    });
    
    elements.helpBtn?.addEventListener("click", () => {
      // Open the User Guide in a new tab
      chrome.tabs.create({ url: chrome.runtime.getURL("../User_Guide.html") });
    });
    elements.backToInsightsBtn?.addEventListener("click", () => switchMainTab("insights"));

    elements.tabButtons.forEach((btn) =>
      btn.addEventListener("click", () => switchSubTab(btn.dataset.tab))
    );

    elements.mainTabButtons.forEach((btn) =>
      btn.addEventListener("click", () => switchMainTab(btn.dataset.mainTab))
    );
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
    
    if (currentMainTab === "insights" && timeChart) {
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

  async function togglePomodoro() {
    await chrome.runtime.sendMessage({ action: 'togglePomodoro' });
    refreshPomodoro();
  }

  setInterval(refreshPomodoro, 1000);
  refreshPomodoro();

  // Update notification system
  function checkForUpdates() {
    const lastVersion = localStorage.getItem("lastKnownVersion") || "1.0.0";
    const currentVersion = "1.2.0"; // Update this when you add new features
    
    if (lastVersion !== currentVersion) {
      showUpdateNotification("NEW: Scheduled Reports! Set daily, weekly or monthly automated reports");
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
      switchMainTab("insights");
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
        await sendEmailViaEmailJS({
          to_email: userEmail,
          subject: "TimeMachine Test Email",
          message: "Test email sent successfully from your TimeMachine extension!"
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
    const { userEmail } = await chrome.storage.local.get(['userEmail']);
    if (!userEmail) return showFeedback('Set email first');
  const backend = await resolveBackendUrl();
    const today = new Date().toISOString().split('T')[0];
    
    // Get the device ID for authentication
    const deviceId = typeof Auth !== 'undefined' ? Auth.getDeviceId() : null;
    
      const auth = await Auth.isAuthenticated();
      const { token } = await TokenStorage.getToken();
      const res = await fetch(`${backend}/api/report/generate`, { 
        method:'POST', 
        headers:{
          'Content-Type':'application/json',
          'X-Device-ID': deviceId || 'unknown',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }, 
        body: JSON.stringify({ date: today, userEmail }) 
      });
    
    if (!res.ok) {
      const errorData = await res.json();
      return showError(errorData.error || 'Failed to send daily report');
    }
    
    showFeedback('Daily report sent!');
    return true;
  }
  
  // Make sendDailyReport available globally for the scheduler
  window.sendDailyReport = sendDailyReport;
  window.resolveBackendUrl = resolveBackendUrl;

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
  function generateEmailReport(timeData, date) {
    if (!Array.isArray(timeData) || timeData.length === 0) {
      return `TimeMachine Daily Report - ${new Date(date).toLocaleDateString()}

No activity tracked for today.

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

    let report = `TimeMachine Daily Report - ${new Date(date).toLocaleDateString()}

📊 DAILY SUMMARY:
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

    const insight = productivityScore >= 70 
      ? "🎉 Great job! You had a highly productive day."
      : productivityScore >= 40 
      ? "💪 Good work! There's room for improvement."
      : "🎯 Focus time! Try to spend more time on productive activities.";

    report += `\n\n💡 INSIGHT: ${insight}

Keep tracking your time to improve your productivity!

Sent via TimeMachine Extension`;

    return report;
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
    
    // Show loading state before fetching data
    elements.siteList.innerHTML = '<div class="loading-text"><span class="loader"></span>Loading data...</div>';
    loadStats();
  }

  function switchMainTab(mainTab) {
    currentMainTab = mainTab;

    elements.insightsTabContent.classList.add("hidden");
    elements.settingsTabContent.classList.add("hidden");

    if (mainTab === "insights") {
      elements.insightsTabContent.classList.remove("hidden");
      loadStats();
    } else if (mainTab === "settings") {
      elements.settingsTabContent.classList.remove("hidden");
    }

    elements.mainTabButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mainTab === mainTab);
    });
  }

  async function initEmailPrompt() {
    try {
      // Check if already authenticated
      const isAuthenticated = await Auth.isAuthenticated();
      const { userEmail, emailConfig } = await chrome.storage.local.get(["userEmail", "emailConfig"]);
      
      if (isAuthenticated && userEmail && validateEmail(userEmail)) {
        // User is already authenticated and has email set
        elements.emailPrompt.classList.add("hidden");
        elements.mainApp.classList.remove("hidden");
        updateEmailUI(userEmail);
        loadEmailConfiguration(emailConfig);
        switchMainTab("insights");
        checkForUpdates(); // Check for updates when app loads
      } else {
        // User needs to authenticate
        elements.emailPrompt.classList.remove("hidden");
        elements.mainApp.classList.add("hidden");
      }
    } catch (error) {
      console.error("Error initializing email prompt:", error);
      showError("Error checking authentication state");
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
    if (currentMainTab !== 'insights') return;
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
      if (!Array.isArray(timeData)) {
        console.warn("Received non-array timeData:", timeData);
        throw new Error("Invalid data format received from server");
      }

      const { siteCategories: storedCategories } =
        await chrome.storage.local.get(["siteCategories"]);
      siteCategories = storedCategories || {};

      renderSiteList(timeData);
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
      domainTimes[entry.domain] = { time: totalTime, category };
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
      container.innerHTML = '<div class="qi-empty">No activity yet</div>';
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
    const trendMsg = productivityScore >= 75 ? 'High productivity' : productivityScore >= 50 ? 'Moderate productivity' : 'Low productivity';
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
      start.setDate(today.getDate() - 6);
      startDate = start.toISOString().split("T")[0];
    } else if (tab === "monthly") {
      const start = new Date(today);
      start.setMonth(today.getMonth() - 1);
      startDate = start.toISOString().split("T")[0];
    }

    return { 
      startDate, 
      endDate,
      timezone: today.getTimezoneOffset() // Include timezone offset in minutes
    };
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
});
