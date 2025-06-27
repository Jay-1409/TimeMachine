document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const emailPrompt = document.getElementById('emailPrompt');
  const dashboard = document.getElementById('dashboard');
  const userEmailInput = document.getElementById('userEmailInput');
  const saveEmailBtn = document.getElementById('saveEmailBtn');
  const emailError = document.getElementById('emailError');
  const refreshBtn = document.getElementById('refreshBtn');
  const toggleThemeBtn = document.getElementById('toggleThemeBtn');
  const feedbackToast = document.getElementById('feedbackToast');
  const emailStatus = document.getElementById('emailStatus');
  const emailDisplay = document.getElementById('emailDisplay');
  const userEmailSettings = document.getElementById('userEmail');
  const updateEmailBtn = document.getElementById('updateEmailBtn');
  const editEmailBtn = document.getElementById('editEmailBtn');
  const testEmailBtn = document.getElementById('testEmailBtn');
  const feedbackMessage = document.getElementById('feedbackMessage');
  const sendFeedbackBtn = document.getElementById('sendFeedbackBtn');
  const charCount = document.getElementById('charCount');
  const focusScoreElement = document.getElementById('focusScore');
  const totalTimeElement = document.getElementById('totalTime');
  const sessionCountElement = document.getElementById('sessionCount');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContent = document.getElementById('tabContent');

  // State
  let currentTab = 'daily';
  let siteCategories = {};
  let chartInstance = null;
  let currentTheme = localStorage.getItem('theme') || 'light';

  // Initialize
  initTheme();
  initEmailPrompt();
  setupEventListeners();

  function initTheme() {
    document.body.className = currentTheme;
    toggleThemeBtn.querySelector('svg').innerHTML = currentTheme === 'light' ?
      '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"></path>' :
      '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
  }

  function initEmailPrompt() {
    chrome.storage.local.get(['userEmail'], async ({ userEmail }) => {
      if (userEmail) {
        try {
          const response = await fetch(`http://localhost:3000/api/user/get-email/${userEmail}`);
          const data = await response.json();
          if (data.email) {
            emailPrompt.classList.add('hidden');
            dashboard.classList.remove('hidden');
            updateEmailUI(userEmail);
            loadStats();
          } else {
            chrome.storage.local.remove(['userEmail']);
            emailPrompt.classList.remove('hidden');
            dashboard.classList.add('hidden');
          }
        } catch (error) {
          showFeedback('Error verifying email', true);
          emailPrompt.classList.remove('hidden');
          dashboard.classList.add('hidden');
        }
      } else {
        emailPrompt.classList.remove('hidden');
        dashboard.classList.add('hidden');
      }
    });
  }

  function setupEventListeners() {
    saveEmailBtn.addEventListener('click', saveEmail);
    refreshBtn.addEventListener('click', refreshData);
    toggleThemeBtn.addEventListener('click', toggleTheme);
    updateEmailBtn.addEventListener('click', updateEmail);
    editEmailBtn.addEventListener('click', () => {
      emailDisplay.classList.add('hidden');
      userEmailSettings.classList.remove('hidden');
      updateEmailBtn.classList.remove('hidden');
      editEmailBtn.classList.add('hidden');
      userEmailSettings.focus();
    });
    testEmailBtn.addEventListener('click', sendTestEmail);
    feedbackMessage.addEventListener('input', updateCharCount);
    sendFeedbackBtn.addEventListener('click', sendFeedback);
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
  }

  function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', currentTheme);
    initTheme();
    loadStats(); // Refresh chart to update colors
  }

  async function saveEmail() {
    const email = userEmailInput.value.trim();
    if (!validateEmail(email)) {
      emailError.textContent = 'Please enter a valid email';
      emailError.classList.remove('hidden');
      return;
    }

    try {
      const response = await fetch('http://localhost:3000/api/user/save-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (data.success) {
        chrome.storage.local.set({ userEmail: email }, () => {
          emailPrompt.classList.add('hidden');
          dashboard.classList.remove('hidden');
          showFeedback('Email saved successfully!');
          updateEmailUI(email);
          loadStats();
        });
      } else {
        emailError.textContent = data.error || 'Failed to save email';
        emailError.classList.remove('hidden');
      }
    } catch (error) {
      emailError.textContent = 'Error saving email';
      emailError.classList.remove('hidden');
    }
  }

  async function updateEmail() {
    const email = userEmailSettings.value.trim();
    if (!validateEmail(email)) {
      showFeedback('Please enter a valid email', true);
      return;
    }

    try {
      const response = await fetch('http://localhost:3000/api/user/save-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (data.success) {
        chrome.storage.local.set({ userEmail: email }, () => {
          showFeedback('Email updated successfully!');
          updateEmailUI(email);
          loadStats();
        });
      } else {
        showFeedback(data.error || 'Failed to update email', true);
      }
    } catch (error) {
      showFeedback('Error updating email', true);
    }
  }

  function refreshData() {
    showFeedback('Refreshing data...');
    loadStats();
  }

  function switchTab(tab) {
    currentTab = tab;
    tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    loadStats();
  }

  async function loadStats() {
    try {
      const statsDiv = document.getElementById('stats');
      statsDiv.innerHTML = '<div class="loading-text"><span class="loader"></span> Loading data...</div>';

      const userEmail = (await chrome.storage.local.get(['userEmail'])).userEmail || 'devh9933@gmail.com';
      const date = getDateForTab(currentTab);

      const response = await fetch(`http://localhost:3000/api/time-data/${userEmail}/${date}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const timeData = await response.json();
      siteCategories = await chrome.storage.local.get(['siteCategories']).then(res => res.siteCategories || {});

      const data = aggregateData(timeData);
      const insights = calculateInsights(data);

      updateEmailStatus();
      updateProductivityScore(insights);

      if (!data || Object.keys(data).length === 0) {
        statsDiv.innerHTML = '<p class="empty-state">No browsing data yet. Visit some websites to track time!</p>';
        return;
      }

      renderSiteList(data);
      renderChart(data, insights);
    } catch (error) {
      console.error('Failed to load stats:', error);
      showFeedback('Error loading data', true);
    }
  }

  function aggregateData(timeData) {
    const data = {};
    timeData.forEach(entry => {
      data[entry.domain] = entry.sessions;
    });
    return data;
  }

  function getDateForTab(tab) {
    const today = new Date().toISOString().split('T')[0];
    if (tab === 'daily') return today;
    if (tab === 'weekly') {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      return start.toISOString().split('T')[0];
    }
    if (tab === 'monthly') {
      const start = new Date();
      start.setMonth(start.getMonth() - 1);
      return start.toISOString().split('T')[0];
    }
    return today;
  }

  function renderSiteList(data) {
    const statsDiv = document.getElementById('stats');
    let html = '<div class="site-list">';

    for (const [domain, sessions] of Object.entries(data)) {
      const totalDuration = sessions.reduce((sum, session) => sum + session.duration, 0);
      const currentCategory = siteCategories[domain] || 'Other';

      html += `
        <div class="site-item">
          <div class="site-info">
            <span class="site-domain" title="${domain}">${domain}</span>
            <div class="category-editor">
              <select class="category-select" data-domain="${domain}">
                <option value="Work" ${currentCategory === 'Work' ? 'selected' : ''}>Work</option>
                <option value="Social" ${currentCategory === 'Social' ? 'selected' : ''}>Social</option>
                <option value="Entertainment" ${currentCategory === 'Entertainment' ? 'selected' : ''}>Entertainment</option>
                <option value="Professional" ${currentCategory === 'Professional' ? 'selected' : ''}>Professional</option>
                <option value="Other" ${currentCategory === 'Other' ? 'selected' : ''}>Other</option>
              </select>
            </div>
          </div>
          <div class="site-time">${formatDuration(totalDuration)}</div>
        </div>
      `;
    }

    html += '</div>';
    statsDiv.innerHTML = html;

    document.querySelectorAll('.category-select').forEach(select => {
      select.addEventListener('change', e => {
        const domain = e.target.dataset.domain;
        const category = e.target.value;
        updateCategory(domain, category);
      });
    });
  }

  function renderChart(data, insights) {
    const ctx = document.getElementById('statsChart').getContext('2d');
    if (chartInstance) {
      chartInstance.destroy();
    }

    if (!ctx || typeof Chart === 'undefined') {
      console.error('Chart.js not loaded or canvas context not found');
      return;
    }

    const labels = [];
    const chartData = [];
    const backgroundColors = [
      '#10b981', // Work
      '#ef4444', // Social
      '#f59e0b', // Entertainment
      '#3b82f6', // Professional
      '#8b5cf6', // Other
    ];

    let totalDuration = 0;

    const categoryTimes = {};
    Object.entries(data).forEach(([domain, sessions]) => {
      const duration = sessions.reduce((sum, s) => sum + s.duration, 0);
      const category = siteCategories[domain] || 'Other';
      categoryTimes[category] = (categoryTimes[category] || 0) + duration;
      totalDuration += duration;
    });

    Object.entries(categoryTimes).forEach(([category, duration], i) => {
      labels.push(category);
      chartData.push(duration / 60); // Convert to minutes
      backgroundColors.push(backgroundColors[i % backgroundColors.length]);
    });

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Time Spent (minutes)',
          data: chartData,
          backgroundColor: backgroundColors,
          borderColor: backgroundColors,
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Time (minutes)',
              color: currentTheme === 'light' ? 'var(--text-primary-light)' : 'var(--text-primary-dark)',
            },
            grid: {
              color: currentTheme === 'light' ? 'var(--border-light)' : 'var(--border-dark)',
            },
          },
          x: {
            title: {
              display: true,
              text: 'Categories',
              color: currentTheme === 'light' ? 'var(--text-primary-light)' : 'var(--text-primary-dark)',
            },
            grid: { display: false },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const mins = ctx.raw;
                const hours = Math.floor(mins / 60);
                const minutes = Math.round(mins % 60);
                const percentage = totalDuration > 0 ? ((mins * 60) / totalDuration * 100).toFixed(1) : 0;
                return `${ctx.label}: ${hours > 0 ? `${hours}h ` : ''}${minutes}m (${percentage}%)`;
              },
            },
          },
        },
        animation: {
          duration: 1000,
          easing: 'easeOutQuart',
        },
      },
    });

    if (insights?.focusScore) {
      focusScoreElement.style.background = `conic-gradient(${
        currentTheme === 'light' ? 'var(--accent-light)' : 'var(--accent-dark)'
      } ${insights.focusScore}%, ${
        currentTheme === 'light' ? 'var(--bg-secondary-light)' : 'var(--bg-secondary-dark)'
      } ${insights.focusScore}%)`;
    }
  }

  function calculateInsights(data) {
    let totalTime = 0;
    const categoryTimes = {};

    Object.entries(data).forEach(([domain, sessions]) => {
      const duration = sessions.reduce((sum, s) => sum + s.duration, 0);
      totalTime += duration;
      const category = siteCategories[domain] || 'Other';
      categoryTimes[category] = (categoryTimes[category] || 0) + duration;
    });

    const focusScore = totalTime > 0 ? Math.round((categoryTimes.Work || 0) / totalTime * 100) : 0;

    return {
      focusScore,
      categoryBreakdown: Object.entries(categoryTimes).map(([cat, time]) => ({
        category: cat,
        time: formatDuration(time),
        percentage: totalTime > 0 ? Math.round((time / totalTime) * 100) : 0,
      })),
      sessionCount: Object.values(data).reduce((sum, sessions) => sum + sessions.length, 0),
    };
  }

  function updateProductivityScore(insights) {
    if (!insights) return;

    const scoreElement = focusScoreElement.querySelector('.score-value');
    scoreElement.textContent = `${insights.focusScore}%`;

    const totalTime = insights.categoryBreakdown.reduce((total, cat) => total + parseDuration(cat.time), 0);
    totalTimeElement.textContent = formatDuration(totalTime);
    sessionCountElement.textContent = insights.sessionCount || 'N/A';
  }

  function updateEmailUI(email) {
    if (email) {
      emailDisplay.textContent = email;
      emailDisplay.classList.remove('hidden');
      userEmailSettings.classList.add('hidden');
      updateEmailBtn.classList.add('hidden');
      editEmailBtn.classList.remove('hidden');
      userEmailSettings.value = email;
    } else {
      emailDisplay.classList.add('hidden');
      userEmailSettings.classList.remove('hidden');
      updateEmailBtn.classList.remove('hidden');
      editEmailBtn.classList.add('hidden');
      userEmailSettings.value = '';
    }
  }

  async function updateEmailStatus() {
    const { emailHistory } = await chrome.storage.local.get(['emailHistory']);
    const currentDate = new Date().toISOString().split('T')[0];

    if (emailHistory?.[currentDate]) {
      const sentTime = new Date(emailHistory[currentDate].timestamp || emailHistory[currentDate]);
      emailStatus.innerHTML = `
        <span style="color: ${currentTheme === 'light' ? 'var(--accent-light)' : 'var(--accent-dark)'}; display: flex; align-items: center; gap: 5px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          Email sent today at ${sentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      `;
    } else {
      emailStatus.innerHTML = `
        <span style="color: ${currentTheme === 'light' ? 'var(--text-secondary-light)' : 'var(--text-secondary-dark)'};">
          No email sent yet today (scheduled for noon)
        </span>
      `;
    }
  }

  async function sendTestEmail() {
    showFeedback('Sending test email...');
    try {
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'testEmail' }, resolve);
      });

      if (response?.status === 'success') {
        showFeedback('Test email sent successfully!');
        updateEmailStatus();
      } else {
        showFeedback(response?.error || 'Failed to send test email', true);
      }
    } catch (error) {
      console.error('Test email failed:', error);
      showFeedback('Failed to send test email', true);
    }
  }

  function updateCategory(domain, category) {
    chrome.runtime.sendMessage(
      { action: 'updateCategory', domain, category },
      response => {
        if (response?.status === 'success') {
          siteCategories[domain] = category;
          chrome.storage.local.set({ siteCategories });
          showFeedback(`Category updated for ${domain}`);
          loadStats();
        } else {
          showFeedback('Failed to update category', true);
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
      showFeedback('Please enter feedback message', true);
      return;
    }

    if (message.length > 500) {
      showFeedback('Feedback cannot exceed 500 characters', true);
      return;
    }

    chrome.storage.local.get(['userEmail'], ({ userEmail }) => {
      if (!userEmail) {
        showFeedback('Please configure an email in settings first', true);
        return;
      }

      showFeedback('Sending feedback...');
      sendFeedbackBtn.disabled = true;

      chrome.runtime.sendMessage(
        { action: 'sendFeedback', message, userEmail },
        response => {
          sendFeedbackBtn.disabled = false;
          if (response?.status === 'success') {
            showFeedback('Feedback sent successfully!');
            feedbackMessage.value = '';
            updateCharCount();
          } else {
            showFeedback(response?.error || 'Failed to send feedback', true);
          }
        }
      );
    });
  }

  function showFeedback(message, isError = false) {
    if (!feedbackToast) return;
    feedbackToast.textContent = message;
    feedbackToast.className = `feedback-toast ${isError ? 'error' : 'success'}`;
    setTimeout(() => {
      feedbackToast.className = 'feedback-toast';
    }, 5000);
  }

  function formatDuration(seconds) {
    if (isNaN(seconds) || seconds <= 0) return '0m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  }

  function parseDuration(durationStr) {
    if (!durationStr) return 0;
    let totalSeconds = 0;
    const parts = durationStr.split(' ');
    for (const part of parts) {
      if (part.includes('h')) {
        totalSeconds += parseInt(part) * 3600;
      } else if (part.includes('m')) {
        totalSeconds += parseInt(part) * 60;
      } else if (part.includes('s')) {
        totalSeconds += parseInt(part);
      }
    }
    return totalSeconds;
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  window.addEventListener('error', event => {
    showFeedback('An unexpected error occurred', true);
    console.error('Popup error:', event);
  });

  window.addEventListener('unhandledrejection', event => {
    showFeedback('An unexpected error occurred', true);
    console.error('Popup unhandled rejection:', event.reason);
  });
});