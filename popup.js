document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const splashScreen = document.getElementById("splashScreen");
  const statsContainer = document.getElementById("statsContainer");
  const enterBtn = document.getElementById("enterBtn");
  const backBtn = document.getElementById("backBtn");
  const refreshBtn = document.getElementById("refreshBtn");
  const feedbackToast = document.getElementById("feedbackToast");
  const emailStatus = document.getElementById("emailStatus");
  const emailDisplay = document.getElementById("emailDisplay");
  const userEmailInput = document.getElementById("userEmail");
  const saveEmailBtn = document.getElementById("saveEmailBtn");
  const editEmailBtn = document.getElementById("editEmailBtn");
  const testEmailBtn = document.getElementById("testEmailBtn");
  const feedbackMessage = document.getElementById("feedbackMessage");
  const sendFeedbackBtn = document.getElementById("sendFeedbackBtn");
  const charCount = document.getElementById("charCount");
  const focusScoreElement = document.getElementById("focusScore");
  const totalTimeElement = document.getElementById("totalTime");
  const sessionCountElement = document.getElementById("sessionCount");
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContent = document.getElementById("tabContent");
  
  // State
  let currentTab = "daily";
  let siteCategories = {};
  let chartInstance = null;

  // Initialize
  initTheme();
  initEmail();
  setupEventListeners();
  
  function initTheme() {
    const themeToggle = document.getElementById("themeToggle");
    chrome.storage.local.get(["theme"], (result) => {
      const isDark = result.theme === "dark";
      document.body.classList.toggle("dark", isDark);
      themeToggle.checked = isDark;
    });

    themeToggle.addEventListener("change", (e) => {
      document.body.classList.toggle("dark", e.target.checked);
      chrome.storage.local.set({ theme: e.target.checked ? "dark" : "light" });
    });
  }
  
  function initEmail() {
    chrome.storage.local.get(["userEmail"], (result) => {
      updateEmailUI(result.userEmail);
    });
  }
  
  function setupEventListeners() {
    // Navigation
    enterBtn.addEventListener("click", showDashboard);
    backBtn.addEventListener("click", showSplashScreen);
    refreshBtn.addEventListener("click", refreshData);
    
    // Email settings
    saveEmailBtn.addEventListener("click", saveEmail);
    editEmailBtn.addEventListener("click", () => {
      emailDisplay.classList.add("hidden");
      userEmailInput.classList.remove("hidden");
      saveEmailBtn.classList.remove("hidden");
      editEmailBtn.classList.add("hidden");
      userEmailInput.focus();
    });
    testEmailBtn.addEventListener("click", sendTestEmail);
    
    // Feedback
    feedbackMessage.addEventListener("input", updateCharCount);
    sendFeedbackBtn.addEventListener("click", sendFeedback);
    
    // Tabs
    tabButtons.forEach(btn => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });
  }
  
  function showDashboard() {
    splashScreen.classList.add("hidden");
    statsContainer.classList.remove("hidden");
    loadStats();
  }
  
  function showSplashScreen() {
    statsContainer.classList.add("hidden");
    splashScreen.classList.remove("hidden");
  }
  
  function refreshData() {
    showFeedback("Refreshing data...");
    loadStats();
  }
  
  function switchTab(tab) {
    currentTab = tab;
    
    // Update active tab button
    tabButtons.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    
    // For now we'll just show the same content for all tabs
    // In a real implementation you'd load different data for weekly/monthly
    loadStats();
  }
  
  async function loadStats() {
    try {
      const statsDiv = document.getElementById("stats");
      statsDiv.innerHTML = '<div class="loading-text"><span class="loader"></span> Loading data...</div>';

      // Get data from background script
      const response = await chrome.runtime.sendMessage({ action: "getStats" });
      
      if (response?.status !== "success") {
        throw new Error(response?.error || "Failed to load data");
      }
      
      const { data, insights, categories } = response;
      siteCategories = categories || {};
      
      updateEmailUI();
      updateEmailStatus();
      updateProductivityScore(insights);
      
      if (!data || Object.keys(data).length === 0) {
        statsDiv.innerHTML = '<p class="empty-state">No browsing data yet today. Visit some websites to track time!</p>';
        return;
      }
      
      renderSiteList(data);
      renderChart(data, insights);
    } catch (error) {
      console.error("Failed to load stats:", error);
      showFeedback("Error loading data", true);
    }
  }
  
  function renderSiteList(data) {
    const statsDiv = document.getElementById("stats");
    let html = '<div class="site-list">';
    
    for (const [domain, sessions] of Object.entries(data)) {
      const totalDuration = sessions.reduce((sum, session) => sum + session.duration, 0);
      const currentCategory = siteCategories[domain] || "Other";
      
      html += `
        <div class="site-item">
          <div class="site-info">
            <span class="site-domain" title="${domain}">${domain}</span>
            <div class="category-editor">
              <select class="category-select" data-domain="${domain}">
                <option value="Work" ${currentCategory === "Work" ? "selected" : ""}>Work</option>
                <option value="Social" ${currentCategory === "Social" ? "selected" : ""}>Social</option>
                <option value="Entertainment" ${currentCategory === "Entertainment" ? "selected" : ""}>Entertainment</option>
                <option value="Professional" ${currentCategory === "Professional" ? "selected" : ""}>Professional</option>
                <option value="Other" ${currentCategory === "Other" ? "selected" : ""}>Other</option>
              </select>
            </div>
          </div>
          <div class="site-time">${formatDuration(totalDuration)}</div>
        </div>
      `;
    }
    
    html += "</div>";
    statsDiv.innerHTML = html;
    
    // Add event listeners to category selects
    document.querySelectorAll(".category-select").forEach((select) => {
      select.addEventListener("change", (e) => {
        const domain = e.target.dataset.domain;
        const category = e.target.value;
        updateCategory(domain, category);
      });
    });
  }
  
  function renderChart(data, insights) {
    const ctx = document.getElementById("statsChart").getContext("2d");
    
    // Destroy previous chart if exists
    if (chartInstance) {
      chartInstance.destroy();
    }
    
    if (!ctx || typeof Chart === "undefined") {
      console.error("Chart.js not loaded or canvas context not found");
      return;
    }
    
    const labels = [];
    const chartData = [];
    const backgroundColors = [];
    const colorPalette = [
      "#3b82f6", // Work (blue)
      "#ef4444", // Social (red)
      "#f59e0b", // Entertainment (yellow)
      "#10b981", // Professional (green)
      "#8b5cf6", // Other (purple)
      "#ec4899", // Additional colors
      "#f97316",
      "#14b8a6"
    ];
    
    let totalDuration = 0;
    
    // Aggregate time by category
    const categoryTimes = {};
    Object.entries(data).forEach(([domain, sessions]) => {
      const duration = sessions.reduce((sum, s) => sum + s.duration, 0);
      const category = siteCategories[domain] || "Other";
      categoryTimes[category] = (categoryTimes[category] || 0) + duration;
      totalDuration += duration;
    });
    
    // Convert to chart format
    Object.entries(categoryTimes).forEach(([category, duration], i) => {
      labels.push(category);
      chartData.push(duration / 60); // Convert seconds to minutes
      backgroundColors.push(colorPalette[i % colorPalette.length]);
    });
    
    chartInstance = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data: chartData,
          backgroundColor: backgroundColors,
          borderWidth: 1,
          borderColor: "var(--bg-card)",
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "65%",
        plugins: {
          legend: {
            position: "right",
            labels: {
              font: { size: 12 },
              color: "var(--text-primary)",
              boxWidth: 12,
              padding: 16,
              usePointStyle: true,
              pointStyle: "circle"
            }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const mins = ctx.raw;
                const hours = Math.floor(mins / 60);
                const minutes = Math.round(mins % 60);
                const percentage = ((mins * 60) / totalDuration * 100).toFixed(1);
                return `${ctx.label}: ${hours > 0 ? `${hours}h ` : ""}${minutes}m (${percentage}%)`;
              }
            }
          }
        }
      }
    });
    
    // Update the focus score circle
    if (insights?.focusScore) {
      const score = insights.focusScore;
      focusScoreElement.style.background = `conic-gradient(var(--accent) ${score}%, var(--bg-secondary) ${score}%)`;
    }
  }
  
  function updateProductivityScore(insights) {
    if (!insights) return;
    
    // Update focus score
    const scoreElement = focusScoreElement.querySelector(".score-value");
    scoreElement.textContent = `${insights.focusScore}%`;
    
    // Update total time and session count
    if (insights.categoryBreakdown) {
      const totalTime = insights.categoryBreakdown.reduce((total, cat) => {
        return total + parseDuration(cat.time);
      }, 0);
      
      totalTimeElement.textContent = formatDuration(totalTime);
    }
    
    // For session count, we'd need to track this in the background script
    // For now we'll just show a placeholder
    sessionCountElement.textContent = "N/A";
  }
  
  function updateEmailUI(email) {
    if (email) {
      emailDisplay.textContent = email;
      emailDisplay.classList.remove("hidden");
      userEmailInput.classList.add("hidden");
      saveEmailBtn.classList.add("hidden");
      editEmailBtn.classList.remove("hidden");
      userEmailInput.value = email;
    } else {
      emailDisplay.classList.add("hidden");
      userEmailInput.classList.remove("hidden");
      saveEmailBtn.classList.remove("hidden");
      editEmailBtn.classList.add("hidden");
      userEmailInput.value = "";
    }
  }
  
  function updateEmailStatus() {
    chrome.storage.local.get(["emailHistory"], (result) => {
      const currentDate = new Date().toISOString().split("T")[0];
      const emailHistory = result.emailHistory || {};
      
      if (emailHistory[currentDate]) {
        const sentTime = new Date(emailHistory[currentDate]);
        emailStatus.innerHTML = `
          <span style="color: #10b981; display: flex; align-items: center; gap: 5px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            Email sent today at ${sentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        `;
      } else {
        emailStatus.innerHTML = `
          <span style="color: var(--text-secondary);">
            No email sent yet today (scheduled for noon)
          </span>
        `;
      }
    });
  }
  
  function saveEmail() {
    const email = userEmailInput.value.trim();
    if (!validateEmail(email)) {
      showFeedback("Please enter a valid email", true);
      return;
    }

    chrome.storage.local.set({ userEmail: email }, () => {
      showFeedback("Email saved successfully!");
      updateEmailUI(email);
    });
  }
  
  async function sendTestEmail() {
    showFeedback("Sending test email...");
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "testEmail" }, resolve);
      });

      if (response?.status === "success") {
        showFeedback("Test email sent successfully!");
        updateEmailStatus();
      } else {
        showFeedback(response?.error || "Failed to send test email", true);
      }
    } catch (error) {
      console.error("Test email failed:", error);
      showFeedback("Failed to send test email", true);
    }
  }
  
  function updateCategory(domain, category) {
    chrome.runtime.sendMessage(
      { action: "updateCategory", domain, category },
      (response) => {
        if (response?.status === "success") {
          showFeedback(`Category updated for ${domain}`);
          // Refresh the chart with new categories
          loadStats();
        } else {
          showFeedback("Failed to update category", true);
        }
      }
    );
  }
  
  function updateCharCount() {
    const count = feedbackMessage.value.length;
    charCount.textContent = `${count}/500`;
  }
  
  function sendFeedback() {
    const message = feedbackMessage.value.trim();
    if (!message) {
      showFeedback("Please enter feedback message", true);
      return;
    }
    
    if (message.length > 500) {
      showFeedback("Feedback cannot exceed 500 characters", true);
      return;
    }
    
    chrome.storage.local.get(["userEmail"], ({ userEmail }) => {
      if (!userEmail) {
        showFeedback("Please configure an email in settings first", true);
        return;
      }

      showFeedback("Sending feedback...");
      sendFeedbackBtn.disabled = true;
      
      chrome.runtime.sendMessage(
        { action: "sendFeedback", message, userEmail },
        (response) => {
          sendFeedbackBtn.disabled = false;
          
          if (response?.status === "success") {
            showFeedback("Feedback sent successfully!");
            feedbackMessage.value = "";
            updateCharCount();
          } else {
            showFeedback(response?.error || "Failed to send feedback", true);
          }
        }
      );
    });
  }
  
  function showFeedback(message, isError = false) {
    if (!feedbackToast) return;
    
    feedbackToast.textContent = message;
    feedbackToast.className = `feedback-toast ${isError ? "error" : "success"}`;
    
    setTimeout(() => {
      feedbackToast.className = "feedback-toast";
    }, 5000);
  }
  
  function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }
  
  function parseDuration(durationStr) {
    if (!durationStr) return 0;
    if (durationStr.includes('h')) {
      const parts = durationStr.split(' ');
      let totalSeconds = 0;
      for (const part of parts) {
        if (part.includes('h')) {
          totalSeconds += parseInt(part) * 3600;
        } else if (part.includes('m')) {
          totalSeconds += parseInt(part) * 60;
        }
      }
      return totalSeconds;
    }
    return parseInt(durationStr) * 60; // Assuming minutes if no unit
  }
  
  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }
  
  // Error handling
  window.addEventListener("error", (event) => {
    showFeedback("An unexpected error occurred", true);
    console.error("Popup error:", event);
  });

  window.addEventListener("unhandledrejection", (event) => {
    showFeedback("An unexpected error occurred", true);
    console.error("Popup unhandled rejection:", event.reason);
  });
});