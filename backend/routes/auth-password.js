const express = require('express');
const router = express.Router();
const SecureUser = require('../models/User-secure');
const jwt = require('jsonwebtoken');
const CryptoJS = require('crypto-js');
const crypto = require('crypto');
const { authenticateToken } = require('./auth');

// Secret for JWT (should be in environment variables)
const JWT_SECRET = process.env.JWT_SECRET || 'timemachine-development-secret';

// Secret for password hashing (should be in environment variables)
const PASSWORD_SECRET = process.env.PASSWORD_SECRET || 'timemachine-password-secret';

// Helper to validate email format
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Helper to validate password strength
function isValidPassword(password) {
  return password && password.length >= 6;
}

// Get device info from request
function getDeviceInfo(req) {
  const userAgent = req.headers['user-agent'] || '';
  
  // Extract browser info
  let browser = 'Unknown';
  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Safari')) browser = 'Safari';
  else if (userAgent.includes('Edge')) browser = 'Edge';
  
  // Extract OS info
  let os = 'Unknown';
  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac')) os = 'MacOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iOS')) os = 'iOS';
  
  // Determine device type - ensure it matches the enum in User-secure.js model
  // Valid values: ['desktop', 'laptop', 'mobile', 'tablet', 'other']
  let deviceType = 'desktop';
  if (userAgent.includes('Mobile')) deviceType = 'mobile';
  else if (userAgent.includes('Tablet')) deviceType = 'tablet';
  
  return {
    deviceId: req.body.deviceId || crypto.randomBytes(16).toString('hex'),
    deviceName: req.body.deviceName || `${browser} on ${os}`,
    deviceType,
    browser,
    operatingSystem: os
  };
}

// Sign up route - create a new user with email/password
router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    // Check if user already exists
    const existingUser = await SecureUser.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    
    // Get device info
    const deviceInfo = req.body.browser && req.body.operatingSystem 
      ? req.body 
      : getDeviceInfo(req);
    
    // Hash the password with CryptoJS
    const hashedPassword = CryptoJS.PBKDF2(password, PASSWORD_SECRET, { 
      keySize: 512/32, 
      iterations: 1000 
    }).toString();
    
    // Create the user with email and password
    const user = await SecureUser.createSecureUser(email, deviceInfo);
    
    // Add password to the user
    user.password = hashedPassword;
    await user.save();
    
    // Create JWT token
    const token = jwt.sign(
      { 
        id: user._id,
        email: email,
        role: user.role || 'user' 
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.status(201).json({
      message: 'User created successfully',
      token,
      email
    });
    
  } catch (error) {
    console.error('Sign up error:', error);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// Login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user by email
    const user = await SecureUser.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Check if user has a password (for users created before this feature)
    if (!user.password) {
      return res.status(401).json({ error: 'Account requires password reset' });
    }
    
    // Verify password
    const hashedPassword = CryptoJS.PBKDF2(password, PASSWORD_SECRET, { 
      keySize: 512/32, 
      iterations: 1000 
    }).toString();
    
    if (hashedPassword !== user.password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Get device info
    const deviceInfo = req.body.browser && req.body.operatingSystem 
      ? req.body 
      : getDeviceInfo(req);
    
    // Update or add device
    await user.addDevice(deviceInfo);
    
    // Create JWT token
    const token = jwt.sign(
      { 
        id: user._id,
        email: email,
        role: user.role || 'user' 
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.status(200).json({
      message: 'Login successful',
      token,
      email
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Verify token route
router.post('/verify', authenticateToken, (req, res) => {
  // If middleware passed, token is valid
  res.status(200).json({ 
    valid: true,
    user: req.user 
  });
});

// Check if email exists and has password
router.get('/check-email', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const user = await SecureUser.findByEmail(email);
    
    res.status(200).json({
      exists: !!user,
      hasPassword: user ? !!user.password : false
    });
    
  } catch (error) {
    console.error('Email check error:', error);
    res.status(500).json({ error: 'Server error checking email' });
  }
});

// Password reset request
router.post('/reset-password-request', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Find user by email
    const user = await SecureUser.findByEmail(email);
    if (!user) {
      // Don't reveal if user exists or not for security
      return res.status(200).json({ message: 'If an account exists, a reset link will be sent' });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetTokenExpires = new Date();
    resetTokenExpires.setHours(resetTokenExpires.getHours() + 1); // 1 hour expiry
    
    // Save reset token to user
    user.resetToken = resetToken;
    user.resetTokenExpires = resetTokenExpires;
    await user.save();
    
    // In a real app, would send an email here
    // For development, return the token directly
    res.status(200).json({ 
      message: 'Password reset requested',
      // Remove these in production!
      devToken: resetToken,
      devExpiry: resetTokenExpires
    });
    
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Server error during password reset request' });
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }
    
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    // Find user with this reset token
    const user = await SecureUser.findOne({
      resetToken: token,
      resetTokenExpires: { $gt: new Date() } // Token not expired
    });
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    // Hash new password
    const hashedPassword = CryptoJS.PBKDF2(password, PASSWORD_SECRET, { 
      keySize: 512/32, 
      iterations: 1000 
    }).toString();
    
    // Update user password
    user.password = hashedPassword;
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    await user.save();
    
    res.status(200).json({ message: 'Password reset successful' });
    
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Server error during password reset' });
  }
});

// Change password (when logged in)
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }
    
    // Find user
    const user = await SecureUser.findByEmail(req.user.email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify current password
    const hashedCurrentPassword = CryptoJS.PBKDF2(currentPassword, PASSWORD_SECRET, { 
      keySize: 512/32, 
      iterations: 1000 
    }).toString();
    
    if (hashedCurrentPassword !== user.password) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash and update new password
    const hashedPassword = CryptoJS.PBKDF2(newPassword, PASSWORD_SECRET, { 
      keySize: 512/32, 
      iterations: 1000 
    }).toString();
    user.password = hashedPassword;
    await user.save();
    
    res.status(200).json({ message: 'Password changed successfully' });
    
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Server error during password change' });
  }
});

// Migration endpoint for users from old system
router.post('/migrate', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    // Find existing user
    const user = await SecureUser.findByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if already has password
    if (user.password) {
      return res.status(409).json({ error: 'Account already has password set' });
    }
    
    // Get device info
    const deviceInfo = req.body.browser && req.body.operatingSystem 
      ? req.body 
      : getDeviceInfo(req);
    
    // Update or add device
    await user.addDevice(deviceInfo);
    
    // Hash and set password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    user.password = hashedPassword;
    await user.save();
    
    // Create JWT token
    const token = jwt.sign(
      { 
        id: user._id,
        email: email,
        role: user.role || 'user' 
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.status(200).json({
      message: 'Account migrated successfully',
      token,
      email
    });
    
  } catch (error) {
    console.error('Account migration error:', error);
    res.status(500).json({ error: 'Server error during account migration' });
  }
});

module.exports = router;
