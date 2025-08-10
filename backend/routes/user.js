const express = require('express');
const router = express.Router();
const User = require('../models/User');
const SecureUser = require('../models/User-secure'); // This imports the SecureUser model

// Middleware to validate device ID
const validateDeviceId = (req, res, next) => {
  const deviceId = req.headers['x-device-id'];
  if (!deviceId) {
    return res.status(401).json({ error: 'Device ID required' });
  }
  req.deviceId = deviceId;
  next();
};

router.post('/save-email', validateDeviceId, async (req, res) => {
  try {
    const { email } = req.body;
    const deviceId = req.deviceId;
    
    if (!email) return res.status(400).json({ error: 'Email is required' });
    
    // Check if the device is verified for this email
    let secureUser = await SecureUser.findByEmail(email);
    
    // If no secure user exists yet, we'll create one with this device
    if (!secureUser) {
      // Get device info from headers
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
      
      const deviceInfo = {
        deviceId,
        deviceName: `${browser} on ${os}`,
        browser,
        operatingSystem: os,
        deviceType
      };
      
      try {
        secureUser = await SecureUser.createSecureUser(email, deviceInfo);
        console.log('Created new SecureUser for:', email);
      } catch (createError) {
        console.error('Failed to create SecureUser:', createError);
        return res.status(500).json({ error: 'Failed to create secure user record' });
      }
    } else {
      // For existing secure users, check if device is verified
      const isVerified = secureUser.devices.some(
        device => device.deviceId === deviceId && device.isActive
      );
      
      if (!isVerified) {
        return res.status(401).json({
          error: 'Device not verified',
          deviceAuthentication: true
        });
      }
      
      // Update last login timestamp for this device
      const deviceIndex = secureUser.devices.findIndex(d => d.deviceId === deviceId);
      if (deviceIndex >= 0) {
        secureUser.devices[deviceIndex].lastLogin = new Date();
        await secureUser.save();
      }
    }
    
    // Legacy support - update the regular User model as well
    const user = await User.findOneAndUpdate(
      { email },
      { email, lastUpdated: new Date() },
      { upsert: true, new: true }
    );
    
    res.json({ success: true, email: user.email });
  } catch (error) {
    console.error('Save email error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

router.get('/get-email/:email', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, email: user.email });
  } catch (error) {
    console.error('Get email error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

module.exports = router;