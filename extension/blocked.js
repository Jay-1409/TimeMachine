// Blocked page functionality
document.addEventListener('DOMContentLoaded', function() {
    // Get parameters from URL
    const urlParams = new URLSearchParams(window.location.search);
    const domain = urlParams.get('domain') || 'unknown site';
    const blockType = urlParams.get('type') || 'site';
    const blockItem = urlParams.get('item') || domain;
    
    // Update domain display
    const domainElement = document.getElementById('blockedDomain');
    if (domainElement) {
        domainElement.textContent = domain;
    }
    
    // Update block reason
    const reasonElement = document.getElementById('blockReason');
    if (reasonElement) {
        if (blockType === 'keyword') {
            reasonElement.textContent = `This page was blocked because it contains the keyword: "${blockItem}"`;
        } else {
            reasonElement.textContent = `This website is in your blocked sites list.`;
        }
    }
    
    // Update page title
    document.title = `Blocked: ${domain}`;

    function goBack() {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = 'chrome://newtab/';
        }
    }

    function startFocus() {
        // Send message to background script to start focus timer
        if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ action: 'togglePomodoro' });
            
            // Show timer
            const focusTimer = document.getElementById('focusTimer');
            if (focusTimer) {
                focusTimer.style.display = 'block';
            }
            
            // Update button
            const button = event.target;
            button.textContent = 'Focus Started!';
            button.disabled = true;
        }
    }

    // Add event listeners
    const goBackBtn = document.querySelector('.btn-primary');
    if (goBackBtn) {
        goBackBtn.addEventListener('click', goBack);
    }

    const startFocusBtn = document.querySelector('.btn-secondary');
    if (startFocusBtn) {
        startFocusBtn.addEventListener('click', startFocus);
    }

    // Check if focus timer is already running
    if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'getPomodoroState' }, (response) => {
            if (response && response.state && response.state.running) {
                const focusTimer = document.getElementById('focusTimer');
                if (focusTimer) {
                    focusTimer.style.display = 'block';
                    updateTimer(response.state);
                }
            }
        });
    }

    function updateTimer(state) {
        if (!state.running) return;
        
        const remaining = state.endsAt - Date.now();
        if (remaining > 0) {
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            const timerDisplay = document.getElementById('timerDisplay');
            if (timerDisplay) {
                timerDisplay.textContent = 
                    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            
            setTimeout(() => updateTimer(state), 1000);
        }
    }

    // Theme sync from popup/localStorage
    (function syncTheme() {
      try {
        const stored = localStorage.getItem('theme') || 'light';
        const body = document.body;
        body.classList.remove('theme-light','theme-dark','theme-cyberpunk','minimal','theme-ocean','theme-sunset','theme-forest');
        // normalize class names
        const classMap = {
          light: 'theme-light',
          dark: 'theme-dark',
          cyberpunk: 'theme-cyberpunk',
          minimal: 'theme-minimal',
          ocean: 'theme-ocean',
          sunset: 'theme-sunset',
          forest: 'theme-forest',
        };
        body.classList.add(classMap[stored] || 'theme-light');
      } catch {}
    })();

    // Enhance actions
    (function wireActions(){
      const backBtn = document.getElementById('goBackBtn');
      const startBtn = document.getElementById('startFocusBtn');
      const openBtn = document.getElementById('openAppBtn');

      if (backBtn) backBtn.addEventListener('click', () => {
        if (history.length > 1) history.back(); else location.href = 'chrome://newtab/';
      });

      if (startBtn) startBtn.addEventListener('click', (event) => {
        if (chrome?.runtime?.sendMessage) chrome.runtime.sendMessage({ action: 'togglePomodoro' });
        const ft = document.getElementById('focusTimer');
        if (ft) ft.classList.remove('hidden');
        const btn = event.currentTarget;
        if (btn) { btn.textContent = 'Focus Started'; btn.disabled = true; }
      });

      if (openBtn) openBtn.addEventListener('click', () => {
        // Try open popup.html in a new tab (accessible as resource)
        const url = chrome.runtime.getURL('popup.html');
        if (chrome?.tabs?.create) chrome.tabs.create({ url }); else location.href = url;
      });
    })();

    // Existing initialization
});
