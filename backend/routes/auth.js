const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');

const JWT_SECRET = process.env.JWT_SECRET || 'timemachine-development-secret';
const PASSWORD_SECRET = process.env.PASSWORD_SECRET || 'timemachine-password-secret';

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPassword(password) {
  return password && password.length >= 6;
}

function getDeviceInfo(req) {
  const userAgent = req.headers['user-agent'] || '';
  
  let browser = 'Unknown';
  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Safari')) browser = 'Safari';
  else if (userAgent.includes('Edge')) browser = 'Edge';
  else if (userAgent.includes('Opera')) browser = 'Opera';
  
  let os = 'Unknown';
  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac')) os = 'MacOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iOS')) os = 'iOS';
  
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

router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    
    const deviceInfo = getDeviceInfo(req);
    const user = await User.createUser(email, password, deviceInfo);
    
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

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await User.findByEmail(email).select('+password');
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    if (!user.verifyPassword(password)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const deviceInfo = getDeviceInfo(req);
    await user.addDevice(deviceInfo);
    
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
        deviceName: deviceInfo.deviceName,
        timezone: user.timezone
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      console.warn('Auth middleware: missing bearer token for', req.method, req.path);
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
        message: 'Please login to access this resource'
      });
    }
    
    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
      if (err) {
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

router.post('/verify', authenticateToken, (req, res) => {
  res.status(200).json({ 
    valid: true,
    user: req.user 
  });
});

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
        settings: user.settings,
        timezone: user.timezone
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

router.post('/reset-password-request', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(200).json({ message: 'If an account exists, a reset link will be sent' });
    }
    
    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetTokenExpires = new Date();
    resetTokenExpires.setHours(resetTokenExpires.getHours() + 1);
    
    user.resetToken = resetToken;
    user.resetTokenExpires = resetTokenExpires;
    await user.save();
    
    res.status(200).json({ 
      message: 'Password reset requested'
    });
    
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Server error during password reset request' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }
    
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpires: { $gt: new Date() }
    });
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    const hashedPassword = CryptoJS.PBKDF2(password, PASSWORD_SECRET, { 
      keySize: 512/32, 
      iterations: 1000 
    }).toString();
    
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

router.post('/update-settings', authenticateToken, async (req, res) => {
  try {
    const { receiveReports, reportFrequency, categories } = req.body;
    
    const user = await User.findByEmail(req.user.email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
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

router.get('/stats', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const totalUsers = await User.countDocuments();
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const activeUsers = await User.countDocuments({
      lastActive: { $gte: sevenDaysAgo }
    });
    
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

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPassword(password) {
  return password && password.length >= 6;
}

function generateDeviceId() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = router;
module.exports.authenticateToken = authenticateToken;
