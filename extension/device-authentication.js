// Device Authentication for TimeMachine Extension
// This module provides secure device-based authentication to prevent unauthorized access
// when the same email is used across multiple devices

// Constants for local storage
const STORAGE_KEYS = {
  DEVICE_ID: 'tm_device_id',
  DEVICE_AUTH_TOKEN: 'tm_device_auth_token',
  USER_EMAIL: 'userEmail', // maintaining compatibility with existing key
  AUTH_EMAIL_VERIFIED: 'tm_email_verified',
  VERIFICATION_IN_PROGRESS: 'tm_verification_in_progress'
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
  
  return {
    browser,
    operatingSystem: os,
    deviceType: /Mobi|Android/.test(userAgent) ? 'Mobile' : 'Desktop',
    deviceName: `${browser} on ${os}`
  };
}

// Check if the device is authorized for the given email
async function isDeviceAuthorized(email) {
  const deviceId = getOrCreateDeviceId();
  const verified = localStorage.getItem(STORAGE_KEYS.AUTH_EMAIL_VERIFIED);
  
  // If we have a verified record for this email on this device
  if (verified && verified === email) {
    return true;
  }
  
  // Check with the server if this device is registered for this email
  try {
    const backendUrl = await resolveBackendUrl();
    const response = await fetch(`${backendUrl}/api/device-management/verify-device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email, 
        deviceId 
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.verified) {
        // Store that this device is verified for this email
        localStorage.setItem(STORAGE_KEYS.AUTH_EMAIL_VERIFIED, email);
        return true;
      }
    }
  } catch (error) {
    console.error('Error verifying device:', error);
  }
  
  return false;
}

// Create and show the verification UI modal
function createVerificationUI(email, onComplete) {
  // Remove any existing verification UI
  const existingModal = document.getElementById('tm-verification-modal');
  if (existingModal) {
    existingModal.remove();
  }

  // Create modal container
  const modal = document.createElement('div');
  modal.id = 'tm-verification-modal';
  modal.className = 'verification-modal';

  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.className = 'verification-content';

  // Create header
  const header = document.createElement('h2');
  header.textContent = 'Device Verification Required';
  header.className = 'verification-title';

  // Create explanation text
  const explanation = document.createElement('p');
  explanation.textContent = `For security reasons, we need to verify this device for your email (${email}). We've sent a verification code to your email address.`;
  explanation.className = 'verification-text';

  // Create input for verification code
  const codeInput = document.createElement('input');
  codeInput.type = 'text';
  codeInput.placeholder = 'Enter verification code';
  codeInput.className = 'verification-input';

  // Create error message element (hidden by default)
  const errorMsg = document.createElement('div');
  errorMsg.className = 'verification-error';

  // Create button container
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'verification-button-container';

  // Create verify button
  const verifyButton = document.createElement('button');
  verifyButton.textContent = 'Verify';
  verifyButton.className = 'btn primary';

  // Create cancel button
  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancel';
  cancelButton.className = 'btn secondary';

  // Create resend code link
  const resendLink = document.createElement('button');
  resendLink.textContent = 'Resend verification code';
  resendLink.className = 'verification-resend';

  // Event listeners
  verifyButton.addEventListener('click', async () => {
    const code = codeInput.value.trim();
    if (!code) {
      showError('Please enter the verification code from your email');
      return;
    }

    try {
      verifyButton.disabled = true;
      verifyButton.textContent = 'Verifying...';
      const verified = await verifyCode(email, code);
      if (verified) {
        modal.remove();
        localStorage.removeItem(STORAGE_KEYS.VERIFICATION_IN_PROGRESS);
        if (onComplete) onComplete(true);
      } else {
        showError('Invalid verification code. Please try again.');
      }
    } catch (error) {
      showError(error.message || 'Verification failed. Please try again.');
    } finally {
      verifyButton.disabled = false;
      verifyButton.textContent = 'Verify';
    }
  });

  cancelButton.addEventListener('click', () => {
    modal.remove();
    localStorage.removeItem(STORAGE_KEYS.VERIFICATION_IN_PROGRESS);
    if (onComplete) onComplete(false);
  });

  resendLink.addEventListener('click', async () => {
    resendLink.disabled = true;
    resendLink.textContent = 'Sending...';
    try {
      await requestVerificationCode(email);
      resendLink.textContent = 'Code sent!';
      setTimeout(() => {
        resendLink.disabled = false;
        resendLink.textContent = 'Resend verification code';
      }, 30000); // 30s cooldown
    } catch (error) {
      showError(error.message || 'Failed to send verification code');
      resendLink.disabled = false;
      resendLink.textContent = 'Resend verification code';
    }
  });

  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
  }

  // Assemble modal
  buttonContainer.appendChild(verifyButton);
  buttonContainer.appendChild(cancelButton);
  
  modalContent.appendChild(header);
  modalContent.appendChild(explanation);
  modalContent.appendChild(codeInput);
  modalContent.appendChild(errorMsg);
  modalContent.appendChild(buttonContainer);
  modalContent.appendChild(resendLink);
  
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
  
  // Focus on the input field
  setTimeout(() => codeInput.focus(), 100);
  
  return modal;
}

// Request a verification code for a new device
async function requestVerificationCode(email) {
  try {
    const deviceId = getOrCreateDeviceId();
    const deviceInfo = getDeviceInfo();
    const backendUrl = await resolveBackendUrl();
    
    const response = await fetch(`${backendUrl}/api/device-management/request-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        deviceId,
        ...deviceInfo
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to request verification code');
    }
    
    // Mark that verification is in progress
    localStorage.setItem(STORAGE_KEYS.VERIFICATION_IN_PROGRESS, email);
    return true;
  } catch (error) {
    console.error('Error requesting verification code:', error);
    throw error;
  }
}

// Verify a code for device registration
async function verifyCode(email, code) {
  try {
    const deviceId = getOrCreateDeviceId();
    const deviceInfo = getDeviceInfo();
    const backendUrl = await resolveBackendUrl();
    
    const response = await fetch(`${backendUrl}/api/device-management/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        code,
        deviceId,
        ...deviceInfo
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Invalid verification code');
    }
    
    const data = await response.json();
    
    // If verification was successful, update local storage
    if (data.verified) {
      localStorage.setItem(STORAGE_KEYS.AUTH_EMAIL_VERIFIED, email);
      localStorage.setItem(STORAGE_KEYS.USER_EMAIL, email);
      
      // Store auth token if provided
      if (data.token) {
        localStorage.setItem(STORAGE_KEYS.DEVICE_AUTH_TOKEN, data.token);
      }
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error verifying code:', error);
    throw error;
  }
}

// Main verification function to use in popup.js
async function verifyDevice(email) {
  if (!email) {
    throw new Error('Email is required for device verification');
  }
  
  // Check if device is already authorized for this email
  const isAuthorized = await isDeviceAuthorized(email);
  if (isAuthorized) {
    return true;
  }
  
  // If verification isn't already in progress, request a code
  const verificationInProgress = localStorage.getItem(STORAGE_KEYS.VERIFICATION_IN_PROGRESS);
  if (!verificationInProgress || verificationInProgress !== email) {
    await requestVerificationCode(email);
  }
  
  // Return a promise that resolves when verification is complete
  return new Promise((resolve) => {
    const modal = createVerificationUI(email, (result) => {
      resolve(result);
    });
  });
}

// Get the current device auth status
function getDeviceAuthStatus() {
  const deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
  const verifiedEmail = localStorage.getItem(STORAGE_KEYS.AUTH_EMAIL_VERIFIED);
  const token = localStorage.getItem(STORAGE_KEYS.DEVICE_AUTH_TOKEN);
  
  return {
    deviceId,
    verifiedEmail,
    hasToken: !!token,
    isVerified: !!verifiedEmail
  };
}

// Clear device authentication
function clearDeviceAuth() {
  localStorage.removeItem(STORAGE_KEYS.AUTH_EMAIL_VERIFIED);
  localStorage.removeItem(STORAGE_KEYS.DEVICE_AUTH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.VERIFICATION_IN_PROGRESS);
  // Note: We don't remove the device ID as it's used to identify this device
}

// Init function to ensure we have a device ID
function init() {
  if (!localStorage.getItem(STORAGE_KEYS.DEVICE_ID)) {
    localStorage.setItem(STORAGE_KEYS.DEVICE_ID, generateDeviceId());
    console.log('New device ID generated');
  }
  return getDeviceId();
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
window.DeviceAuth = {
  init,
  verifyDevice,
  getDeviceAuthStatus,
  clearDeviceAuth,
  getDeviceInfo,
  getDeviceId
};
