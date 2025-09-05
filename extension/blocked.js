document.addEventListener('DOMContentLoaded', () => {
  const ELEMENTS = {
    blockedDomain: 'blockedDomain',
    blockReason: 'blockReason',
    infoReason: 'infoReason',
    infoRule: 'infoRule',
    infoFocus: 'infoFocus',
    infoLocalTime: 'infoLocalTime'
  };

  const THEME_CLASSES = {
    light: 'theme-light',
    dark: 'theme-dark',
    cyberpunk: 'theme-cyberpunk',
    minimal: 'theme-minimal',
    ocean: 'theme-ocean',
    sunset: 'theme-sunset',
    forest: 'theme-forest'
  };

  const getElement = id => document.getElementById(id);

  // Parse URL parameters
  const params = new URLSearchParams(window.location.search);
  const domain = params.get('domain') || 'this site';
  const blockType = params.get('type') || 'site';
  const blockItem = params.get('item') || domain;

  // Update title and content
  document.title = `Blocked: ${domain}`;
  const domainEl = getElement(ELEMENTS.blockedDomain);
  if (domainEl) domainEl.textContent = domain;
  const reasonEl = getElement(ELEMENTS.blockReason);
  const reasonText = blockType === 'keyword' ? `Blocked because it matches keyword: "${blockItem}"` : 'This website is on your blocked list.';
  if (reasonEl) reasonEl.textContent = reasonText;
  const infoReason = getElement(ELEMENTS.infoReason);
  if (infoReason) infoReason.textContent = reasonText;
  const infoRule = getElement(ELEMENTS.infoRule);
  if (infoRule) infoRule.textContent = blockType === 'keyword' ? `Keyword: ${blockItem}` : `Site: ${domain}`;

  // Apply theme
  const theme = localStorage.getItem('theme') || 'light';
  const body = document.body;
  Object.values(THEME_CLASSES).forEach(cls => body.classList.remove(cls));
  body.classList.add(THEME_CLASSES[theme] || THEME_CLASSES.light);

  // Close tab behavior
  const closeThisTab = () => {
    if (chrome?.tabs?.getCurrent) {
      chrome.tabs.getCurrent(tab => {
        if (tab?.id && chrome?.tabs?.remove) {
          chrome.tabs.create({ url: 'chrome://newtab/' });
          chrome.tabs.remove(tab.id);
        } else {
          chrome.tabs.create({ url: 'chrome://newtab/' });
          window.close();
        }
      });
    } else {
      window.close();
    }
  };

  // Keydown handler for ESC/Backspace
  window.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName.toLowerCase();
    if ((e.key === 'Escape' || e.key === 'Backspace') && tag !== 'input' && tag !== 'textarea') {
      e.preventDefault();
      closeThisTab();
    }
  });

  // Update local time
  const infoLocalTime = getElement(ELEMENTS.infoLocalTime);
  const tickLocalTime = () => {
    if (infoLocalTime) infoLocalTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  };
  tickLocalTime();
  setInterval(tickLocalTime, 30000);

  // Update focus status
  const infoFocus = getElement(ELEMENTS.infoFocus);
  if (infoFocus && chrome?.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ action: 'getPomodoroState' }, response => {
      if (!response?.state) {
        infoFocus.textContent = 'No active focus session';
        return;
      }
      const { running, endsAt } = response.state;
      if (running && endsAt) {
        const mins = Math.max(0, Math.ceil((endsAt - Date.now()) / 60000));
        infoFocus.textContent = `Focus running (${mins}m left)`;
      } else {
        infoFocus.textContent = 'No active focus session';
      }
    });
  }
});