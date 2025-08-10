// Extension updates to support JWT authentication

// Add this to config.js
const AUTH_CONFIG = {
  tokenStorageKey: "timemachine_auth_token",
  tokenExpiry: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
};

// Add these utility functions to handle authentication
function getAuthToken() {
  return localStorage.getItem(AUTH_CONFIG.tokenStorageKey);
}

function setAuthToken(token) {
  localStorage.setItem(AUTH_CONFIG.tokenStorageKey, token);
  // Set token expiry
  const expiry = new Date().getTime() + AUTH_CONFIG.tokenExpiry;
  localStorage.setItem(AUTH_CONFIG.tokenStorageKey + "_expiry", expiry);
}

function clearAuthToken() {
  localStorage.removeItem(AUTH_CONFIG.tokenStorageKey);
  localStorage.removeItem(AUTH_CONFIG.tokenStorageKey + "_expiry");
}

function isTokenExpired() {
  const expiry = localStorage.getItem(AUTH_CONFIG.tokenStorageKey + "_expiry");
  if (!expiry) return true;
  return new Date().getTime() > parseInt(expiry);
}

// Update your API calls to include the token in the headers
async function apiRequest(endpoint, method, data) {
  const token = getAuthToken();
  const headers = {
    "Content-Type": "application/json",
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: method,
    headers: headers,
    body: data ? JSON.stringify(data) : null,
  });
  
  // Check for authentication errors
  if (response.status === 401 || response.status === 403) {
    // Token is invalid or expired
    clearAuthToken();
    // Redirect to login page or show login modal
    showLoginModal();
    return null;
  }
  
  return await response.json();
}

// Add this to popup.js - Authentication UI
function showLoginModal() {
  // Create a modal for email verification
  const modal = document.createElement("div");
  modal.className = "auth-modal";
  modal.innerHTML = `
    <div class="auth-modal-content">
      <h2>Verification Required</h2>
      <p>Please verify your email to continue:</p>
      <div class="auth-step-1">
        <input type="email" id="auth-email" placeholder="Enter your email" />
        <button id="request-code-btn">Request Code</button>
      </div>
      <div class="auth-step-2" style="display: none;">
        <p>Please enter the verification code sent to your email:</p>
        <input type="text" id="verification-code" placeholder="6-digit code" />
        <button id="verify-code-btn">Verify</button>
      </div>
      <p id="auth-message"></p>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Add event listeners
  document.getElementById("request-code-btn").addEventListener("click", requestVerificationCode);
  document.getElementById("verify-code-btn").addEventListener("click", verifyCode);
}

// Request verification code
async function requestVerificationCode() {
  const email = document.getElementById("auth-email").value;
  if (!email || !email.includes("@")) {
    showAuthMessage("Please enter a valid email", "error");
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/auth/request-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Show verification code input
      document.querySelector(".auth-step-1").style.display = "none";
      document.querySelector(".auth-step-2").style.display = "block";
      showAuthMessage("Verification code sent! Check your email.", "success");
      
      // Store email for verification step
      localStorage.setItem("temp_verification_email", email);
    } else {
      showAuthMessage(data.error || "Failed to send verification code", "error");
    }
  } catch (error) {
    showAuthMessage("Network error. Please try again.", "error");
  }
}

// Verify code and complete authentication
async function verifyCode() {
  const email = localStorage.getItem("temp_verification_email");
  const verificationCode = document.getElementById("verification-code").value;
  
  if (!verificationCode || verificationCode.length !== 6) {
    showAuthMessage("Please enter a valid 6-digit code", "error");
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, verificationCode }),
    });
    
    const data = await response.json();
    
    if (data.success && data.token) {
      // Save the JWT token
      setAuthToken(data.token);
      
      // Close the modal and refresh data
      document.querySelector(".auth-modal").remove();
      localStorage.removeItem("temp_verification_email");
      
      // Reload extension data
      loadUserData();
    } else {
      showAuthMessage(data.error || "Invalid verification code", "error");
    }
  } catch (error) {
    showAuthMessage("Network error. Please try again.", "error");
  }
}

function showAuthMessage(message, type) {
  const messageEl = document.getElementById("auth-message");
  messageEl.textContent = message;
  messageEl.className = `message ${type}`;
}
