// TimeMachine Authentication Module
// Provides simple email/password authentication for TimeMachine extension

// Constants for local storage
const STORAGE_KEYS = {
  USER_EMAIL: 'userEmail',
  AUTH_TOKEN: 'tm_auth_token',
  DEVICE_ID: 'tm_device_id'
};

// Helper functions for token storage management
const TokenStorage = {
  // Set token in both localStorage and chrome.storage.local
  async setToken(token, email) {
    localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.USER_EMAIL, email);
    
    try {
      await chrome.storage.local.set({ 
        tm_auth_token: token,
        userEmail: email
      });
    } catch (chromeErr) {
      console.warn('Could not store token in chrome.storage:', chromeErr);
    }
  },

  // Get token from either storage
  async getToken() {
    let token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    let email = localStorage.getItem(STORAGE_KEYS.USER_EMAIL);
    
    if (!token || !email) {
      try {
        const storage = await chrome.storage.local.get(['tm_auth_token', 'userEmail']);
        token = token || storage.tm_auth_token;
        email = email || storage.userEmail;
        
        // Sync to localStorage if found in chrome.storage
        if (token && email) {
          localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
          localStorage.setItem(STORAGE_KEYS.USER_EMAIL, email);
        }
      } catch (chromeErr) {
        console.warn('Could not access chrome.storage:', chromeErr);
      }
    }
    
    return { token, email };
  },

  // Clear token from both storages
  async clearToken() {
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER_EMAIL);
    
    try {
      await chrome.storage.local.remove(['tm_auth_token', 'userEmail']);
    } catch (chromeErr) {
      console.warn('Could not remove token from chrome.storage:', chromeErr);
    }
  }
};

// Generate a unique device identifier
function generateDeviceId() {
  return Array.from(window.crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Get the existing device ID or create a new one
function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
  if (!deviceId) {
    deviceId = generateDeviceId();
    localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
  }
  return deviceId;
}

// Get information about the current device
function getDeviceInfo() {
  const userAgent = navigator.userAgent;
  let browser = 'Unknown';
  let os = 'Unknown';
  
  // Detect browser
  if (/Chrome/.test(userAgent) && !/Chromium|Edge/.test(userAgent)) browser = 'Chrome';
  else if (/Firefox/.test(userAgent)) browser = 'Firefox';
  else if (/Safari/.test(userAgent) && !/Chrome/.test(userAgent)) browser = 'Safari';
  else if (/Edge/.test(userAgent)) browser = 'Edge';
  else if (/Opera|OPR/.test(userAgent)) browser = 'Opera';
  
  // Detect OS
  if (/Windows/.test(userAgent)) os = 'Windows';
  else if (/Macintosh|Mac OS X/.test(userAgent)) os = 'macOS';
  else if (/Linux/.test(userAgent)) os = 'Linux';
  else if (/Android/.test(userAgent)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(userAgent)) os = 'iOS';
  
  // Make sure deviceType matches the enum values in User-secure.js model
  const deviceType = /Mobi|Android/.test(userAgent) ? 'mobile' : 'desktop';
  
  return {
    browser,
    operatingSystem: os,
    deviceType: deviceType,
    deviceName: `${browser} on ${os}`
  };
}

// Create and show the login/signup UI modal
function createAuthUI(initialMode = 'login', onComplete) {
  // Remove any existing auth UI
  const existingModal = document.getElementById('tm-auth-modal');
  if (existingModal) {
    existingModal.remove();
  }

  // Create modal container
  const modal = document.createElement('div');
  modal.id = 'tm-auth-modal';
  modal.className = 'verification-modal';

  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.className = 'verification-content';

  // Create header
  const header = document.createElement('h2');
  header.textContent = initialMode === 'login' ? 'Sign In' : 'Create Account';
  header.className = 'verification-title';

  // Create explanation text
  const explanation = document.createElement('p');
  explanation.textContent = initialMode === 'login' 
    ? 'Sign in to access your TimeMachine data' 
    : 'Create an account to start using TimeMachine';
  explanation.className = 'verification-text';

  // Create email input
  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.placeholder = 'Email address';
  emailInput.className = 'verification-input';
  emailInput.id = 'tm-auth-email';

  // Create password input
  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.placeholder = 'Password';
  passwordInput.className = 'verification-input';
  passwordInput.id = 'tm-auth-password';

  // Create error message element (hidden by default)
  const errorMsg = document.createElement('div');
  errorMsg.className = 'verification-error';

  // Create button container
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'verification-button-container';

  // Create primary action button
  const primaryButton = document.createElement('button');
  primaryButton.textContent = initialMode === 'login' ? 'Sign In' : 'Create Account';
  primaryButton.className = 'btn primary';
  primaryButton.id = 'tm-auth-primary';

  // Create cancel button
  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancel';
  cancelButton.className = 'btn secondary';

  // Create toggle link
  const toggleLink = document.createElement('button');
  toggleLink.textContent = initialMode === 'login' 
    ? "Don't have an account? Sign up" 
    : 'Already have an account? Sign in';
  toggleLink.className = 'verification-resend';
  toggleLink.id = 'tm-auth-toggle';

  // Function to show error messages
  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
  }

  // Function to toggle between login and signup
  function toggleMode() {
    const isCurrentlyLogin = header.textContent === 'Sign In';
    
    header.textContent = isCurrentlyLogin ? 'Create Account' : 'Sign In';
    explanation.textContent = isCurrentlyLogin 
      ? 'Create an account to start using TimeMachine' 
      : 'Sign in to access your TimeMachine data';
    primaryButton.textContent = isCurrentlyLogin ? 'Create Account' : 'Sign In';
    toggleLink.textContent = isCurrentlyLogin 
      ? 'Already have an account? Sign in' 
      : "Don't have an account? Sign up";
    
    // Clear errors and inputs when switching modes
    errorMsg.style.display = 'none';
    emailInput.value = '';
    passwordInput.value = '';
  }

  // Event listeners
  primaryButton.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const isLoginMode = primaryButton.textContent === 'Sign In';
    
    if (!email) {
      showError('Please enter your email address');
      return;
    }
    
    if (!password) {
      showError('Please enter your password');
      return;
    }
    
    try {
      primaryButton.disabled = true;
      primaryButton.textContent = isLoginMode ? 'Signing In...' : 'Creating Account...';
      
      const success = isLoginMode 
        ? await login(email, password)
        : await signup(email, password);
      
      if (success) {
        localStorage.setItem(STORAGE_KEYS.USER_EMAIL, email);
        modal.remove();
        if (onComplete) onComplete(true, email);
      } else {
        showError(isLoginMode 
          ? 'Invalid email or password' 
          : 'Could not create account. Try a different email.'
        );
      }
    } catch (error) {
      showError(error.message || 'Authentication failed. Please try again.');
    } finally {
      primaryButton.disabled = false;
      primaryButton.textContent = isLoginMode ? 'Sign In' : 'Create Account';
    }
  });

  cancelButton.addEventListener('click', () => {
    modal.remove();
    if (onComplete) onComplete(false);
  });

  toggleLink.addEventListener('click', toggleMode);

  // Assemble modal
  buttonContainer.appendChild(primaryButton);
  buttonContainer.appendChild(cancelButton);
  
  modalContent.appendChild(header);
  modalContent.appendChild(explanation);
  modalContent.appendChild(emailInput);
  modalContent.appendChild(passwordInput);
  modalContent.appendChild(errorMsg);
  modalContent.appendChild(buttonContainer);
  modalContent.appendChild(toggleLink);
  
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
  
  // Focus on the input field
  setTimeout(() => emailInput.focus(), 100);
  
  return modal;
}

// Login with email/password
async function login(email, password) {
  try {
    const deviceId = getOrCreateDeviceId();
    const deviceInfo = getDeviceInfo();
    const backendUrl = await resolveBackendUrl();
    
    const response = await fetch(`${backendUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        deviceId,
        ...deviceInfo
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      // Provide specific error messages based on backend response
      throw new Error(data.message || data.error || 'Login failed');
    }
    
    // Store auth token using unified helper
    if (data.token) {
      await TokenStorage.setToken(data.token, email);
      return true;
    }
    
    throw new Error('No authentication token received');
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

// Sign up with email/password
async function signup(email, password, isMigration = false) {
  try {
    const deviceId = getOrCreateDeviceId();
    const deviceInfo = getDeviceInfo();
    const backendUrl = await resolveBackendUrl();
    
    const endpoint = 'signup'; // Simplified - we now only have signup
    
    const response = await fetch(`${backendUrl}/api/auth/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        deviceId,
        ...deviceInfo
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      // Provide specific error messages based on backend response
      throw new Error(data.message || data.error || 'Signup failed');
    }
    
    // Store auth token using unified helper
    if (data.token) {
      await TokenStorage.setToken(data.token, email);
      return true;
    }
    
    throw new Error('No authentication token received');
  } catch (error) {
    console.error('Signup error:', error);
    throw error;
  }
}

// Check if user is authenticated
async function isAuthenticated() {
  // Get token from unified storage
  const { token, email } = await TokenStorage.getToken();
  
  if (!token || !email) {
    return false;
  }
  
  // Verify token with backend
  try {
    const backendUrl = await resolveBackendUrl();
    const response = await fetch(`${backendUrl}/api/auth/verify`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      return true;
    } else {
      const errorData = await response.json();
      console.warn('Token verification failed:', errorData);
      
      // If token is expired or invalid, clear it
      if (errorData.code === 'TOKEN_EXPIRED' || errorData.code === 'INVALID_TOKEN') {
        await TokenStorage.clearToken();
      }
    }
  } catch (error) {
    console.error('Token verification error:', error);
  }
  
  return false;
}

// Main authentication function to use in popup.js
async function authenticateUser(callback) {
  // Check if already authenticated
  if (await isAuthenticated()) {
    const { email } = await TokenStorage.getToken();
    if (callback) callback(true, email);
    return true;
  }
  
  // Show login UI
  return new Promise((resolve) => {
    createAuthUI('login', (success, email) => {
      if (callback) callback(success, email);
      resolve(success);
    });
  });
}

// Logout user
async function logout() {
  await TokenStorage.clearToken();
}

// Get the current device ID
function getDeviceId() {
  return localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
}

// Use TMConfig to get the backend URLs
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

// Expose the main functions
window.Auth = {
  authenticateUser,
  login,
  signup,
  logout,
  getDeviceInfo,
  getDeviceId,
  isAuthenticated
};
