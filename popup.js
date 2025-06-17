document.addEventListener("DOMContentLoaded", () => {
  // Site categories
  const siteCategories = {
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

  const splashScreen = document.getElementById("splashScreen");
  const statsContainer = document.getElementById("statsContainer");
  const enterBtn = document.getElementById("enterBtn");
  const backBtn = document.getElementById("backBtn");
  const feedbackToast = document.getElementById("feedbackToast");

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
      
      const { timeData } = await chrome.storage.local.get(["timeData"]);
      const currentDate = new Date().toISOString().split("T")[0];
      const todayData = timeData?.[currentDate] || {};
      
      // Set email if exists
      const { userEmail } = await chrome.storage.local.get(["userEmail"]);
      if (userEmail) document.getElementById("userEmail").value = userEmail;
      
      // Display stats
      if (Object.keys(todayData).length === 0) {
        statsDiv.innerHTML = '<p class="empty-state">No browsing data yet today. Visit some websites to track time!</p>';
        document.getElementById("statsChart").closest('.card').style.display = 'none';
        return;
      }
      
      let html = '<div class="site-list">';
      for (const [domain, sessions] of Object.entries(todayData)) {
        const totalDuration = sessions.reduce((sum, session) => sum + session.duration, 0);
        const category = siteCategories[domain] || "Other";
        
        html += `
          <div class="site-item">
            <div class="site-info">
              <span class="site-domain">${domain}</span>
              <span class="site-category ${category.toLowerCase()}">${category}</span>
            </div>
            <div class="site-time">${formatDuration(totalDuration)}</div>
          </div>
        `;
      }
      html += "</div>";
      statsDiv.innerHTML = html;
      
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
      await chrome.runtime.sendMessage({ action: "testEmail" });
      showFeedback("Test email sent successfully!");
    } catch (error) {
      console.error("Test email failed:", error);
      showFeedback("Failed to send test email", true);
    }
  }

  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }
});