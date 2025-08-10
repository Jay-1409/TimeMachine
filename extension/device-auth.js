// Authentication and multi-device support for the extension

// Store device information in localStorage
const DEVICE_ID_KEY = 'timemachine_device_id';
const DEVICE_NAME_KEY = 'timemachine_device_name';

// Generate a random device ID if one doesn't exist
function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  
  if (!deviceId) {
    deviceId = generateRandomId();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  
  return deviceId;
}

// Generate a random device ID
function generateRandomId() {
  return Array.from(window.crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Get or create device name
function getOrCreateDeviceName() {
  let deviceName = localStorage.getItem(DEVICE_NAME_KEY);
  
  if (!deviceName) {
    // Create a device name based on browser and platform
    const browser = getBrowserName();
    const platform = navigator.platform || 'Unknown';
    deviceName = `${browser} on ${platform}`;
    localStorage.setItem(DEVICE_NAME_KEY, deviceName);
  }
  
  return deviceName;
}

// Get browser name from user agent
function getBrowserName() {
  const userAgent = navigator.userAgent;
  let browser = 'Unknown';
  
  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Safari')) browser = 'Safari';
  else if (userAgent.includes('Edge')) browser = 'Edge';
  else if (userAgent.includes('Opera')) browser = 'Opera';
  
  return browser;
}

// Add device info to authentication requests
async function authenticateWithEmail(email) {
  const deviceId = getOrCreateDeviceId();
  const deviceName = getOrCreateDeviceName();
  
  // First, request a verification code
  const requestCodeResponse = await fetch(`${API_BASE_URL}/auth/request-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  
  if (!requestCodeResponse.ok) {
    const errorData = await requestCodeResponse.json();
    throw new Error(errorData.error || 'Failed to request verification code');
  }
  
  // Show verification code input UI
  const verificationCode = await promptForVerificationCode();
  
  if (!verificationCode) {
    throw new Error('Verification cancelled');
  }
  
  // Verify the code and include device information
  const verifyResponse = await fetch(`${API_BASE_URL}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      verificationCode,
      deviceId,
      deviceName
    })
  });
  
  if (!verifyResponse.ok) {
    const errorData = await verifyResponse.json();
    throw new Error(errorData.error || 'Invalid verification code');
  }
  
  const authData = await verifyResponse.json();
  
  // Store auth token and device info
  localStorage.setItem('auth_token', authData.token);
  localStorage.setItem('user_email', authData.user.email);
  
  return authData;
}

// UI function to prompt for verification code
function promptForVerificationCode() {
  return new Promise((resolve) => {
    // Create a modal dialog
    const modal = document.createElement('div');
    modal.className = 'verification-modal';
    modal.innerHTML = `
      <div class="verification-container">
        <h2>Email Verification</h2>
        <p>Please enter the 6-digit verification code sent to your email.</p>
        <input type="text" id="verification-code" placeholder="Enter 6-digit code" maxlength="6" pattern="[0-9]{6}">
        <div class="button-container">
          <button id="verify-button">Verify</button>
          <button id="cancel-button">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Add event listeners
    document.getElementById('verify-button').addEventListener('click', () => {
      const code = document.getElementById('verification-code').value;
      if (code && code.length === 6) {
        modal.remove();
        resolve(code);
      } else {
        alert('Please enter a valid 6-digit code');
      }
    });
    
    document.getElementById('cancel-button').addEventListener('click', () => {
      modal.remove();
      resolve(null);
    });
    
    // Focus on the input field
    document.getElementById('verification-code').focus();
  });
}

// Function to make authenticated API requests
async function authenticatedFetch(url, options = {}) {
  const token = localStorage.getItem('auth_token');
  
  if (!token) {
    throw new Error('No authentication token found. Please log in.');
  }
  
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };
  
  const response = await fetch(url, {
    ...options,
    headers
  });
  
  // Handle authentication errors
  if (response.status === 401) {
    // Token expired or invalid
    localStorage.removeItem('auth_token');
    throw new Error('Authentication expired. Please log in again.');
  }
  
  return response;
}

// Function to get device list
async function getDeviceList() {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/device/devices`);
    if (!response.ok) throw new Error('Failed to fetch devices');
    
    const data = await response.json();
    return data.devices || [];
  } catch (error) {
    console.error('Error fetching devices:', error);
    return [];
  }
}

// Function to deactivate a device
async function deactivateDevice(deviceId) {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/device/deactivate-device/${deviceId}`, {
      method: 'POST'
    });
    
    if (!response.ok) throw new Error('Failed to deactivate device');
    
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error deactivating device:', error);
    return false;
  }
}
