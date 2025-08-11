const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');

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

// Get device information from request headers
function getDeviceInfo(req) {
  const userAgent = req.headers['user-agent'] || '';
  
  // Extract browser info
  let browser = 'Unknown';
  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Safari')) browser = 'Safari';
  else if (userAgent.includes('Edge')) browser = 'Edge';
  else if (userAgent.includes('Opera')) browser = 'Opera';
  
  // Extract OS info
  let os = 'Unknown';
  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac')) os = 'MacOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iOS')) os = 'iOS';
  
  // Determine device type
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

/**
 * Sign up route - create a new user with email/password
 */
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
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    
    // Get device info
    const deviceInfo = getDeviceInfo(req);
    
    // Create the user with email and password
    const user = await User.createUser(email, password, deviceInfo);
    
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

/**
 * Login route
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user by email - need to include password field which is excluded by default
    const user = await User.findByEmail(email).select('+password');
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Verify password
    if (!user.verifyPassword(password)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Get device info
    const deviceInfo = getDeviceInfo(req);
    
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
      email,
      user: {
        email: user.email,
        role: user.role,
        deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

/**
 * Middleware to authenticate JWT tokens
 */
/**
 * Middleware to authenticate JWT tokens
 * Enhanced with detailed error messages and device tracking
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
        message: 'Please login to access this resource'
      });
    }
    
    // Verify the token
    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
      if (err) {
        // Provide specific error messages based on jwt error types
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({ 
            error: 'Token expired',
            code: 'TOKEN_EXPIRED',
            message: 'Your session has expired. Please login again'
          });
        } else {
          return res.status(403).json({ 
            error: 'Token invalid',
            code: 'INVALID_TOKEN',
            message: 'Your authentication is invalid. Please login again'
          });
        }
      }
      
      // Set decoded user info in request
      req.user = decoded;
      next();
    });
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({ 
      error: 'Authentication error',
      message: 'An unexpected error occurred during authentication'
    });
  }
};

/**
 * Verify token route
 */
router.post('/verify', authenticateToken, (req, res) => {
  // If middleware passed, token is valid
  res.status(200).json({ 
    valid: true,
    user: req.user 
  });
});

/**
 * Get user profile (requires authentication)
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByEmail(req.user.email);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      success: true,
      user: {
        email: user.email,
        role: user.role,
        lastActive: user.lastActive,
        settings: user.settings
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

/**
 * Reset password request
 */
router.post('/reset-password-request', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Find user by email
    const user = await User.findByEmail(email);
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

/**
 * Reset password with token
 */
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
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpires: { $gt: new Date() } // Token not expired
    });
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    // Get password secret from environment or use default
    const PASSWORD_SECRET = process.env.PASSWORD_SECRET || 'timemachine-password-secret';
    
    // Hash the password with CryptoJS
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

/**
 * Update user settings (requires authentication)
 */
router.post('/update-settings', authenticateToken, async (req, res) => {
  try {
    const { receiveReports, reportFrequency, categories } = req.body;
    
    const user = await User.findByEmail(req.user.email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update settings
    if (receiveReports !== undefined) {
      user.settings.receiveReports = receiveReports;
    }
    
    if (reportFrequency) {
      user.settings.reportFrequency = reportFrequency;
    }
    
    if (categories) {
      user.settings.categories = categories;
    }
    
    user.lastUpdated = new Date();
    await user.save();
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings: user.settings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

/**
 * Get user stats - for admin dashboard (requires admin role)
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    // Check if user has admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Count total users
    const totalUsers = await User.countDocuments();
    
    // Get active users (active in last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const activeUsers = await User.countDocuments({
      lastActive: { $gte: sevenDaysAgo }
    });
    
    // Get users by email domain
    const domainStats = await User.aggregate([
      { 
        $project: {
          domain: { $arrayElemAt: [{ $split: ["$email", "@"] }, 1] }
        }
      },
      { 
        $group: { 
          _id: "$domain", 
          count: { $sum: 1 } 
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    res.json({
      success: true,
      totalUsers,
      activeUsers,
      domainStats: domainStats.map(d => ({ 
        domain: d._id, 
        count: d.count 
      }))
    });
  } catch (error) {
    console.error('User stats error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

module.exports = router;
module.exports.authenticateToken = authenticateToken;
