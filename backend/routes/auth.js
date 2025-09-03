const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET;
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS);

if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');
if (!BCRYPT_ROUNDS || isNaN(BCRYPT_ROUNDS)) throw new Error('BCRYPT_ROUNDS environment variable is required and must be a number');

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
    deviceId: req.body.deviceId || uuidv4(),
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
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.status(201).json({
      message: 'User created successfully',
      token,
      email: user.email
    });
  } catch (error) {
    console.error('Sign up error:', error);
    res.status(500).json({ error: 'Server error during signup', details: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user || !await user.verifyPassword(password)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const deviceInfo = getDeviceInfo(req);
    try {
      await user.addDevice(deviceInfo);
    } catch (error) {
      if (error.message === 'Device ID already exists') {
        return res.status(400).json({ error: 'Device already registered' });
      }
      throw error;
    }
    
    const token = jwt.sign(
      { 
        id: user._id,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.status(200).json({
      message: 'Login successful',
      token,
      email: user.email,
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
    res.status(500).json({ error: 'Server error during login', details: error.message });
  }
});

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
    
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) reject(err);
        else resolve(decoded);
      });
    });
    
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
        message: 'Your session has expired. Please login again'
      });
    }
    return res.status(403).json({ 
      error: 'Token invalid',
      code: 'INVALID_TOKEN',
      message: 'Your authentication is invalid. Please login again'
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
    
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+resetToken +resetTokenExpires');
    if (!user) {
      return res.status(200).json({ message: 'If an account exists, a reset link will be sent' });
    }
    
    const resetToken = uuidv4().replace(/-/g, '');
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour
    
    user.resetToken = resetToken;
    user.resetTokenExpires = resetTokenExpires;
    await user.save();
    
    res.status(200).json({ message: 'Password reset link sent' });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Server error during password reset request', details: error.message });
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
    }).select('+resetToken +resetTokenExpires +password');
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    user.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    await user.save();
    
    res.status(200).json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Server error during password reset', details: error.message });
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
      if (!['daily', 'weekly', 'monthly'].includes(reportFrequency)) {
        return res.status(400).json({ error: 'Invalid report frequency' });
      }
      user.settings.reportFrequency = reportFrequency;
    }
    
    if (categories && typeof categories === 'object') {
      user.settings.categories = new Map(Object.entries(categories));
    }
    
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
          domain: { $arrayElemAt: [{ $split: ['$email', '@'] }, 1] }
        }
      },
      { 
        $group: { 
          _id: '$domain', 
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