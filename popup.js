document.addEventListener("DOMContentLoaded", () => {
  // Site categories
  let siteCategories = {};

  const splashScreen = document.getElementById("splashScreen");
  const statsContainer = document.getElementById("statsContainer");
  const enterBtn = document.getElementById("enterBtn");
  const backBtn = document.getElementById("backBtn");
  const feedbackToast = document.getElementById("feedbackToast");
  const emailStatus = document.getElementById("emailStatus");

  // Navigation
  enterBtn.addEventListener("click", () => {
    splashScreen.classList.add("hidden");
    statsContainer.classList.remove("hidden");
    loadStats();
  });

  backBtn.addEventListener("click", () => {
    statsContainer.classList.add("hidden");
    splashScreen.classList.remove("hidden");
  });

  // Theme toggle
  const themeToggle = document.getElementById("themeToggle");
  chrome.storage.local.get(["theme"], result => {
    const isDark = result.theme === "dark";
    document.body.classList.toggle("dark", isDark);
    themeToggle.checked = isDark;
  });

  themeToggle.addEventListener("change", e => {
    document.body.classList.toggle("dark", e.target.checked);
    chrome.storage.local.set({ theme: e.target.checked ? "dark" : "light" });
  });

  // Email handling
  document.getElementById("saveEmailBtn").addEventListener("click", saveEmail);
  document.getElementById("testEmailBtn").addEventListener("click", sendTestEmail);
  document.getElementById("sendFeedbackBtn").addEventListener("click", sendFeedback);
  
  // Utility functions
  function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  function showFeedback(message, isError = false) {
    if (!feedbackToast) return;
    
    feedbackToast.textContent = message;
    feedbackToast.className = `feedback-toast ${isError ? 'error' : 'success'}`;
    
    setTimeout(() => {
      feedbackToast.className = "feedback-toast";
    }, 3000);
  }

  async function loadStats() {
    try {
      const statsDiv = document.getElementById("stats");
      statsDiv.innerHTML = '<div class="loader">Loading data...</div>';
      
      // Load categories
      const { siteCategories: storedCategories } = await chrome.storage.local.get(["siteCategories"]);
      siteCategories = storedCategories || {};
      
      const { timeData, emailHistory, userEmail } = await chrome.storage.local.get([
        "timeData", 
        "emailHistory",
        "userEmail"
      ]);
      
      const currentDate = new Date().toISOString().split("T")[0];
      const todayData = timeData?.[currentDate] || {};
      
      // Set email if exists
      if (userEmail) document.getElementById("userEmail").value = userEmail;
      
      // Show email status
      if (emailHistory?.[currentDate]) {
        const sentTime = new Date(emailHistory[currentDate]);
        emailStatus.innerHTML = `
          <span style="color: #10b981; display: flex; align-items: center; gap: 5px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            Email sent today at ${sentTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
          </span>
        `;
      } else {
        emailStatus.innerHTML = `
          <span style="color: #64748b;">
            No email sent yet today (scheduled for noon)
          </span>
        `;
      }
      
      // Display stats
      if (Object.keys(todayData).length === 0) {
        statsDiv.innerHTML = '<p class="empty-state">No browsing data yet today. Visit some websites to track time!</p>';
        document.getElementById("statsChart").closest('.card').style.display = 'none';
        return;
      }
      
      let html = '<div class="site-list">';
      for (const [domain, sessions] of Object.entries(todayData)) {
        const totalDuration = sessions.reduce((sum, session) => sum + session.duration, 0);
        const currentCategory = siteCategories[domain] || "Other";
        
        html += `
          <div class="site-item">
            <div class="site-info">
              <span class="site-domain">${domain}</span>
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
      
      // Add event listeners to category selectors
      document.querySelectorAll('.category-select').forEach(select => {
        select.addEventListener('change', (e) => {
          const domain = e.target.dataset.domain;
          const category = e.target.value;
          updateCategory(domain, category);
        });
      });
      
      // Render chart
      renderChart(todayData);
    } catch (error) {
      console.error("Failed to load stats:", error);
      showFeedback("Error loading data", true);
      document.getElementById("statsChart").closest('.card').style.display = 'none';
    }
  }

  function renderChart(todayData) {
    const ctx = document.getElementById("statsChart").getContext("2d");
    if (!ctx) {
      console.error("Canvas context not found");
      return;
    }
    
    const labels = [];
    const data = [];
    const backgroundColors = [];
    
    const colorPalette = [
      "#60a5fa", "#f87171", "#facc15", "#4ade80", 
      "#a78bfa", "#fb7185", "#fdba74", "#34d399"
    ];
    
    Object.entries(todayData).forEach(([domain], i) => {
      labels.push(domain);
      const totalDuration = todayData[domain].reduce((sum, s) => sum + s.duration, 0);
      data.push(totalDuration / 60); // Convert to minutes
      backgroundColors.push(colorPalette[i % colorPalette.length]);
    });
    
    // Ensure Chart is available
    if (typeof Chart === 'undefined') {
      console.error("Chart.js not loaded");
      document.getElementById("statsChart").closest('.card').style.display = 'none';
      return;
    }
    
    new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: backgroundColors,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "right" },
          tooltip: {
            callbacks: {
              label: ctx => {
                const mins = ctx.raw;
                const hours = Math.floor(mins / 60);
                const minutes = Math.round(mins % 60);
                return `${ctx.label}: ${hours > 0 ? `${hours}h ` : ""}${minutes}m`;
              }
            }
          }
        }
      }
    });
  }

  function saveEmail() {
    const email = document.getElementById("userEmail").value.trim();
    if (!validateEmail(email)) {
      showFeedback("Please enter a valid email", true);
      return;
    }
    
    chrome.storage.local.set({ userEmail: email }, () => {
      showFeedback("Email saved successfully!");
    });
  }

  async function sendTestEmail() {
    showFeedback("Sending test email...");
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: "testEmail" }, 
          resolve
        );
      });
      
      if (response?.status === "success") {
        showFeedback("Test email sent successfully!");
        
        // Update status
        const currentDate = new Date().toISOString().split("T")[0];
        emailStatus.innerHTML = `
          <span style="color: #10b981;">
            ✓ Test email sent successfully
          </span>
        `;
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
      response => {
        if (response?.status === "success") {
          showFeedback(`Category updated for ${domain}`);
        } else {
          showFeedback("Failed to update category", true);
        }
      }
    );
  }
  
  function sendFeedback() {
    const message = document.getElementById("feedbackMessage").value.trim();
    if (!message) {
      showFeedback("Please enter feedback message", true);
      return;
    }
    
    showFeedback("Sending feedback...");
    
    chrome.runtime.sendMessage(
      { action: "sendFeedback", message },
      response => {
        if (response?.status === "success") {
          showFeedback("Feedback sent successfully!");
          document.getElementById("feedbackMessage").value = "";
        } else {
          showFeedback(response?.error || "Failed to send feedback", true);
        }
      }
    );
  }

  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }
});