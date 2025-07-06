const CONFIG = {
  BACKEND_URL: 'http://localhost:3000',
  CHART_COLORS: {
    light: {
      work: '#3b82f6',
      social: '#ef4444',
      entertainment: '#60a5fa',
      professional: '#10b981',
      other: '#d1d5db'
    },
    dark: {
      work: '#8b5cf6',
      social: '#f472b6',
      entertainment: '#a78bfa',
      professional: '#22d3ee',
      other: '#6b7280'
    },
    glass: {
      work: '#22d3ee',
      social: '#ec4899',
      entertainment: '#4dd4f7',
      professional: '#06b6d4',
      other: '#bae6fd'
    },
    neumorphic: {
      work: '#10b981',
      social: '#ef4444',
      entertainment: '#34d399',
      professional: '#059669',
      other: '#a7f3d0'
    },
    vivid: {
      work: '#ec4899',
      social: '#f472b6',
      entertainment: '#db2777',
      professional: '#9333ea',
      other: '#d8b4fe'
    }
  }
};

let timeChart = null;

// Define formatDuration before CHART_CONFIG
function formatDuration(seconds) {
  if (isNaN(seconds) || seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

const CHART_CONFIG = {
  type: 'doughnut',
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          font: {
            family: 'inherit'
          }
        }
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            return `${context.label}: ${formatDuration(context.raw)}`;
          }
        }
      }
    },
    cutout: '65%'
  }
};

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const elements = {
    emailPrompt: document.getElementById('emailPrompt'),
    mainApp: document.getElementById('mainApp'),
    userEmailInput: document.getElementById('userEmailInput'),
    saveEmailBtn: document.getElementById('saveEmailBtn'),
    emailError: document.getElementById('emailError'),
    errorDisplay: document.getElementById('errorDisplay'),
    refreshBtn: document.getElementById('refreshBtn'),
    toggleThemeBtn: document.getElementById('toggleThemeBtn'),
    feedbackToast: document.getElementById('feedbackToast'),
    emailDisplay: document.getElementById('emailDisplay'),
    userEmailSettings: document.getElementById('userEmail'),
    updateEmailBtn: document.getElementById('updateEmailBtn'),
    editEmailBtn: document.getElementById('editEmailBtn'),
    downloadReportBtn: document.getElementById('downloadReport'),
    testEmailBtn: document.getElementById('testEmailBtn'),
    feedbackMessage: document.getElementById('feedbackMessage'),
    sendFeedbackBtn: document.getElementById('sendFeedbackBtn'),
    charCount: document.getElementById('charCount'),
    tabButtons: document.querySelectorAll('.tab-btn'),
    mainTabButtons: document.querySelectorAll('.main-tab-btn'),
    insightsTabContent: document.getElementById('insightsTabContent'),
    settingsTabContent: document.getElementById('settingsTabContent'),
    statsDiv: document.getElementById('stats'),
    productivityScore: document.getElementById('productivityScore'),
    siteList: document.querySelector('.site-list')
  };

  // State
  const themes = ['light', 'dark', 'glass', 'neumorphic', 'vivid'];
  let currentSubTab = 'daily';
  let currentMainTab = 'insights';
  let siteCategories = {};
  let currentTheme = localStorage.getItem('theme') || 'light';
  let currentThemeIndex = themes.indexOf(currentTheme);

  // Validate theme
  if (!CONFIG.CHART_COLORS[currentTheme]) {
    console.warn(`Invalid theme '${currentTheme}' detected. Defaulting to 'light'.`);
    currentTheme = 'light';
    currentThemeIndex = 0;
    localStorage.setItem('theme', currentTheme);
  }

  // Initialize
  initTheme();
  initEmailPrompt();
  setupEventListeners();

  function initTheme() {
    document.body.className = `theme-${currentTheme}`;
    if (timeChart) {
      timeChart.options.plugins.legend.labels.color = getLegendColor();
      timeChart.update();
    }
  }

  function getLegendColor() {
    switch (currentTheme) {
      case 'light': return '#1e293b';
      case 'dark': return '#f1f5f9';
      case 'glass': return '#1e293b';
      case 'neumorphic': return '#374151';
      case 'vivid': return '#f5f3ff';
      default: return '#1e293b';
    }
  }

  function setupEventListeners() {
    elements.saveEmailBtn.addEventListener('click', saveEmail);
    elements.refreshBtn.addEventListener('click', refreshData);
    elements.toggleThemeBtn.addEventListener('click', toggleTheme);
    elements.updateEmailBtn.addEventListener('click', updateEmail);
    elements.editEmailBtn.addEventListener('click', () => {
      elements.emailDisplay.classList.add('hidden');
      elements.userEmailSettings.classList.remove('hidden');
      elements.updateEmailBtn.classList.remove('hidden');
      elements.editEmailBtn.classList.add('hidden');
      elements.userEmailSettings.focus();
    });
    elements.downloadReportBtn.addEventListener('click', downloadReport);
    elements.testEmailBtn.addEventListener('click', testEmail);
    elements.feedbackMessage.addEventListener('input', updateCharCount);
    elements.sendFeedbackBtn.addEventListener('click', sendFeedback);

    // Event listeners for sub-tabs (Daily, Weekly, Monthly)
    elements.tabButtons.forEach(btn =>
      btn.addEventListener('click', () => switchSubTab(btn.dataset.tab))
    );

    // Event listeners for main tabs (Insights, Settings)
    elements.mainTabButtons.forEach(btn =>
      btn.addEventListener('click', () => switchMainTab(btn.dataset.mainTab))
    );
  }

  function toggleTheme() {
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    currentTheme = themes[currentThemeIndex];
    localStorage.setItem('theme', currentTheme);
    initTheme();
    // Only reload stats if the insights tab is active
    if (currentMainTab === 'insights' && timeChart) {
      loadStats();
    }
  }

  async function saveEmail() {
    const email = elements.userEmailInput.value.trim();
    if (!validateEmail(email)) {
      showError('Please enter a valid email', elements.emailError);
      return;
    }

    try {
      const response = await fetch(`${CONFIG.BACKEND_URL}/api/user/save-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save email');
      }

      await chrome.storage.local.set({ userEmail: email });
      elements.emailPrompt.classList.add('hidden');
      elements.mainApp.classList.remove('hidden'); // Show main app
      showFeedback('Email saved successfully!');
      updateEmailUI(email);
      switchMainTab('insights'); // Default to Insights tab after email is set
    } catch (error) {
      console.error('Error saving email:', error);
      showError(error.message, elements.emailError);
    }
  }

  async function updateEmail() {
    const email = elements.userEmailSettings.value.trim();
    if (!validateEmail(email)) {
      showError('Please enter a valid email');
      return;
    }

    try {
      const response = await fetch(`${CONFIG.BACKEND_URL}/api/user/save-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update email');
      }

      await chrome.storage.local.set({ userEmail: email });
      showFeedback('Email updated successfully!');
      updateEmailUI(email);
      // No need to loadStats here, as it's part of the Insights tab
    } catch (error) {
      console.error('Error updating email:', error);
      showError(error.message);
    }
  }

  async function downloadReport() {
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (!userEmail) {
        showError('Please set an email first');
        elements.emailPrompt.classList.remove('hidden');
        elements.mainApp.classList.add('hidden');
        return;
      }

      const date = new Date().toISOString().split('T')[0];
      const response = await fetch(`${CONFIG.BACKEND_URL}/api/report/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, userEmail })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `daily_report_${date}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showFeedback('Report downloaded!');
    } catch (error) {
      console.error('Error downloading report:', error);
      showError('Error downloading report: ' + error.message);
    }
  }

  async function testEmail() {
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (!userEmail) {
        showError('Please set an email first');
        elements.emailPrompt.classList.remove('hidden');
        elements.mainApp.classList.add('hidden');
        return;
      }

      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'testEmail' }, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.status === 'error') {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });

      showFeedback('Test email sent!');
    } catch (error) {
      console.error('Error sending test email:', error);
      showError('Error sending test email: ' + error.message);
    }
  }

  function updateCharCount() {
    const count = elements.feedbackMessage.value.length;
    elements.charCount.textContent = `${count}/500`;
    elements.charCount.classList.toggle('text-red-500', count > 500);
    elements.sendFeedbackBtn.disabled = count === 0 || count > 500;
  }

  async function sendFeedback() {
    const message = elements.feedbackMessage.value.trim();
    const { userEmail } = await chrome.storage.local.get(['userEmail']);

    if (!userEmail) {
      showError('Please set an email first');
      elements.emailPrompt.classList.remove('hidden');
      elements.mainApp.classList.add('hidden');
      return;
    }

    if (message.length === 0 || message.length > 500) {
      showError('Feedback must be 1-500 characters');
      return;
    }

    try {
      const response = await fetch(`${CONFIG.BACKEND_URL}/api/feedback/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, userEmail })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send feedback');
      }

      elements.feedbackMessage.value = '';
      updateCharCount();
      showFeedback('Feedback sent successfully!');
    } catch (error) {
      console.error('Error sending feedback:', error);
      showError('Error sending feedback: ' + error.message);
    }
  }

  function refreshData() {
    // Only refresh data if on the Insights tab
    if (currentMainTab === 'insights') {
      showFeedback('Refreshing data...');
      loadStats();
    } else {
      showFeedback('Data refresh is only available on the Insights tab.');
    }
  }

  function switchSubTab(tab) {
    currentSubTab = tab;
    elements.tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    loadStats(); // Load stats when sub-tab changes
  }

  function switchMainTab(mainTab) {
    currentMainTab = mainTab;

    // Hide all main tab content
    elements.insightsTabContent.classList.add('hidden');
    elements.settingsTabContent.classList.add('hidden');

    // Show the selected main tab content
    if (mainTab === 'insights') {
      elements.insightsTabContent.classList.remove('hidden');
      loadStats(); // Load stats when Insights tab is activated
    } else if (mainTab === 'settings') {
      elements.settingsTabContent.classList.remove('hidden');
    }

    // Update active class for main tab buttons
    elements.mainTabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mainTab === mainTab);
    });
  }

  async function initEmailPrompt() {
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (userEmail && validateEmail(userEmail)) {
        elements.emailPrompt.classList.add('hidden');
        elements.mainApp.classList.remove('hidden'); // Show main app container
        updateEmailUI(userEmail);
        switchMainTab('insights'); // Default to Insights tab
      } else {
        elements.emailPrompt.classList.remove('hidden');
        elements.mainApp.classList.add('hidden'); // Ensure main app is hidden
      }
    } catch (error) {
      console.error('Error initializing email prompt:', error);
      showError('Error checking email');
    }
  }

  async function loadStats() {
    // Only load stats if the current main tab is 'insights'
    if (currentMainTab !== 'insights') {
      return;
    }

    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (!userEmail) {
        showError('Please set an email first');
        elements.emailPrompt.classList.remove('hidden');
        elements.mainApp.classList.add('hidden');
        return;
      }

      elements.siteList.innerHTML = '<div class="loading-text"><span class="loader"></span>Loading data...</div>'; // Update loading text location
      elements.errorDisplay.classList.add('hidden');

      const { startDate } = getDateRangeForTab(currentSubTab); // Use currentSubTab
      const response = await fetch(`${CONFIG.BACKEND_URL}/api/time-data/report/${encodeURIComponent(userEmail)}?date=${startDate}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load data');
      }

      const timeData = await response.json();
      if (!Array.isArray(timeData)) {
        console.warn('Received non-array timeData:', timeData);
        throw new Error('Invalid data format received from server');
      }

      const { siteCategories: storedCategories } = await chrome.storage.local.get(['siteCategories']);
      siteCategories = storedCategories || {};

      renderSiteList(timeData);
    } catch (error) {
      console.error('Failed to load stats:', error);
      elements.siteList.innerHTML = '<div class="empty-state">Error loading data</div>'; // Update error text location
      showError(`Error loading data: ${error.message}`);
    }
  }

  function renderSiteList(timeData) {
    if (timeChart) {
      timeChart.destroy();
      timeChart = null;
    }

    if (!Array.isArray(timeData) || timeData.length === 0) {
      elements.siteList.innerHTML = '<div class="empty-state">No data available</div>';
      return;
    }

    const categoryData = {
      Work: 0,
      Social: 0,
      Entertainment: 0,
      Professional: 0,
      Other: 0
    };

    const domainTimes = {};

    timeData.forEach(entry => {
      if (!entry || typeof entry !== 'object' || !entry.domain) {
        console.warn('Invalid timeData entry:', entry);
        return;
      }
      const totalTime = entry.totalTime ||
        (entry.sessions ? entry.sessions.reduce((sum, session) => sum + (session.duration || 0), 0) : 0);
      const category = siteCategories[entry.domain] || 'Other';
      categoryData[category] += totalTime;
      domainTimes[entry.domain] = { time: totalTime, category };
    });

    if (Object.keys(domainTimes).length === 0) {
      elements.siteList.innerHTML = '<div class="empty-state">No valid data to display</div>';
      return;
    }

    if (!CONFIG.CHART_COLORS[currentTheme]) {
      console.error(`Theme '${currentTheme}' not found in CHART_COLORS. Defaulting to 'light'.`);
      currentTheme = 'light';
      currentThemeIndex = 0;
      localStorage.setItem('theme', currentTheme);
      initTheme();
    }

    // Sort all domains by time spent
    const sortedDomainTimes = Object.entries(domainTimes)
      .sort((a, b) => b[1].time - a[1].time);

    // Generate HTML for all sites, highlighting the top 3
    elements.siteList.innerHTML = sortedDomainTimes
      .map(([domain, data], index) => `
        <div class="site-item ${index < 3 ? 'top-site' : ''}">
          <div class="site-info">
            <span class="site-domain">${domain}</span>
            <select class="category-select" data-domain="${domain}">
              <option value="Work" ${data.category === 'Work' ? 'selected' : ''}>Work</option>
              <option value="Social" ${data.category === 'Social' ? 'selected' : ''}>Social</option>
              <option value="Entertainment" ${data.category === 'Entertainment' ? 'selected' : ''}>Entertainment</option>
              <option value="Professional" ${data.category === 'Professional' ? 'selected' : ''}>Professional</option>
              <option value="Other" ${data.category === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </div>
          <span class="site-time">${formatDuration(data.time)}</span>
        </div>
      `).join('');

    const ctx = document.getElementById('timeChart').getContext('2d');
    const colors = CONFIG.CHART_COLORS[currentTheme];

    timeChart = new Chart(ctx, {
      ...CHART_CONFIG,
      data: {
        labels: Object.keys(categoryData),
        datasets: [{
          data: Object.values(categoryData),
          backgroundColor: [
            colors.work,
            colors.social,
            colors.entertainment,
            colors.professional,
            colors.other
          ],
          borderWidth: 0
        }]
      },
      options: {
        ...CHART_CONFIG.options,
        plugins: {
          ...CHART_CONFIG.options.plugins,
          legend: {
            ...CHART_CONFIG.options.plugins.legend,
            labels: {
              ...CHART_CONFIG.options.plugins.legend.labels,
              color: getLegendColor()
            }
          }
        }
      }
    });

    // Add event listeners for category changes
    document.querySelectorAll('.category-select').forEach(select => {
      select.addEventListener('change', async (event) => {
        const domain = event.target.dataset.domain;
        const newCategory = event.target.value;
        await updateSiteCategory(domain, newCategory);
      });
    });
  }

  async function updateSiteCategory(domain, category) {
    try {
      // Validate category
      const validCategories = ['Work', 'Social', 'Entertainment', 'Professional', 'Other'];
      if (!validCategories.includes(category)) {
        showError('Invalid category selected');
        return;
      }

      // Update siteCategories
      siteCategories[domain] = category;
      await chrome.storage.local.set({ siteCategories });

      // Show feedback and refresh stats
      showFeedback(`Category for ${domain} updated to ${category}`);
      loadStats(); // Reload stats to reflect category change in chart
    } catch (error) {
      console.error('Error updating site category:', error);
      showError('Failed to update category');
    }
  }

  function getDateRangeForTab(tab) {
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];
    let startDate = endDate;

    if (tab === 'weekly') {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      startDate = start.toISOString().split('T')[0];
    } else if (tab === 'monthly') {
      const start = new Date(today);
      start.setMonth(today.getMonth() - 1);
      startDate = start.toISOString().split('T')[0];
    }

    return { startDate, endDate };
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function updateEmailUI(email) {
    elements.emailDisplay.textContent = email;
    elements.userEmailSettings.value = email;
    elements.emailDisplay.classList.remove('hidden');
    elements.userEmailSettings.classList.add('hidden');
    elements.updateEmailBtn.classList.add('hidden');
    elements.editEmailBtn.classList.remove('hidden');
  }

  function showFeedback(message, isError = false) {
    elements.feedbackToast.textContent = message;
    elements.feedbackToast.className = `feedback-toast ${isError ? 'error' : 'success'}`;
    setTimeout(() => {
      elements.feedbackToast.className = 'feedback-toast';
    }, 3000);
  }

  function showError(message, element = elements.errorDisplay) {
    element.textContent = message;
    element.classList.remove('hidden');
  }

  // Initialize character count
  updateCharCount();
});
