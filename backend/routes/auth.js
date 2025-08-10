const express = require('express');
const router = express.Router();
const User = require('../models/User-secure');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Generate a random 6-digit code
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Store verification codes with expiration (in-memory for now, could be moved to Redis in production)
const verificationCodes = new Map();

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

// Configure email transporter (setup with environment variables)
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

/**
 * Request email verification code - first step of authentication
 */
router.post('/request-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    
    // Generate a verification code
    const verificationCode = generateVerificationCode();
    
    // Store code with 10-minute expiration
    const expirationTime = new Date();
    expirationTime.setMinutes(expirationTime.getMinutes() + 10);
    
    // Store both the code and a hash of the email
    const hashedEmail = User.hashEmail(email);
    verificationCodes.set(hashedEmail, {
      code: verificationCode,
      expires: expirationTime
    });
    
    // Send email with verification code
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'TimeMachine Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">TimeMachine Verification</h2>
          <p>Your verification code is: <strong style="font-size: 24px;">${verificationCode}</strong></p>
          <p>This code will expire in 10 minutes.</p>
          <p>If you did not request this code, please ignore this email.</p>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    
    // Don't reveal whether the email exists in our database yet
    res.json({ 
      success: true, 
      message: 'If your email is registered, a verification code has been sent. Check your inbox.' 
    });
  } catch (error) {
    console.error('Verification request error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

/**
 * Verify email with code and issue JWT token - second step of authentication
 */
router.post('/verify', async (req, res) => {
  try {
    const { email, verificationCode, deviceId, deviceName } = req.body;
    if (!email || !verificationCode) {
      return res.status(400).json({ error: 'Email and verification code are required' });
    }
    
    const hashedEmail = User.hashEmail(email);
    const storedVerification = verificationCodes.get(hashedEmail);
    
    // Check if code exists and is valid
    if (!storedVerification || 
        storedVerification.code !== verificationCode || 
        new Date() > storedVerification.expires) {
      return res.status(401).json({ error: 'Invalid or expired verification code' });
    }
    
    // Get device information
    const deviceInfo = getDeviceInfo(req);
    if (deviceId) deviceInfo.deviceId = deviceId;
    if (deviceName) deviceInfo.deviceName = deviceName;
    
    // Code is valid - check if user exists or create new one
    let user = await User.findByEmail(email);
    let isNewDevice = false;
    
    if (!user) {
      // Create new user with device info
      user = await User.createSecureUser(email, deviceInfo);
      isNewDevice = true;
    } else {
      // Check if this is a new device
      const existingDevice = user.devices.find(d => d.deviceId === deviceInfo.deviceId);
      isNewDevice = !existingDevice;
      
      if (isNewDevice) {
        // Add this device to user's devices
        await user.addDevice(deviceInfo);
      } else {
        // Update existing device's last login
        const deviceIndex = user.devices.findIndex(d => d.deviceId === deviceInfo.deviceId);
        if (deviceIndex >= 0) {
          user.devices[deviceIndex].lastLogin = new Date();
        }
        user.lastActive = new Date();
        await user.save();
      }
    }
    
    // Delete the verification code to prevent reuse
    verificationCodes.delete(hashedEmail);
    
    // Generate JWT token with a 7-day expiration
    const token = jwt.sign(
      { 
        hashedEmail, 
        role: user.role || 'user',
        deviceId: deviceInfo.deviceId // Include device ID in token
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
    
    // If this is a new device, send notification email
    if (isNewDevice && user.devices.length > 1) {
      try {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'TimeMachine New Device Login',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #3b82f6;">TimeMachine Security Alert</h2>
              <p>A new device has logged into your TimeMachine account.</p>
              <p><strong>Device:</strong> ${deviceInfo.deviceName}</p>
              <p><strong>Browser:</strong> ${deviceInfo.browser}</p>
              <p><strong>Operating System:</strong> ${deviceInfo.operatingSystem}</p>
              <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
              <p>If this wasn't you, please deactivate this device immediately from your account settings.</p>
            </div>
          `
        };
        
        await transporter.sendMail(mailOptions);
      } catch (emailError) {
        console.error('Failed to send device notification email:', emailError);
        // Continue even if email fails
      }
    }
    
    // Return the token and masked user info
    res.json({ 
      success: true,
      token,
      user: {
        email: user.maskedEmail,
        role: user.role,
        deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName
      }
    });
  } catch (error) {
    console.error('Verification error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

/**
 * Middleware to authenticate JWT tokens
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalid or expired' });
    }
    req.user = user;
    next();
  });
};

/**
 * Get user profile (requires authentication)
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ hashedEmail: req.user.hashedEmail });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      success: true,
      user: {
        email: user.maskedEmail,
        role: user.role,
        lastActive: user.lastActive
      }
    });
  } catch (error) {
    console.error('Get profile error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

/**
 * Update user settings (requires authentication)
 */
router.post('/update-settings', authenticateToken, async (req, res) => {
  try {
    const { receiveReports, reportFrequency, categories } = req.body;
    
    const user = await User.findOne({ hashedEmail: req.user.hashedEmail });
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
    console.error('Update settings error:', error.message, error.stack);
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
    
    // Get users by domain (for analytics)
    const domainStats = await User.aggregate([
      { $group: { 
        _id: "$emailDomain", 
        count: { $sum: 1 } 
      }},
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
    console.error('User stats error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Export the router and the authentication middleware
module.exports = {
  router,
  authenticateToken
};
