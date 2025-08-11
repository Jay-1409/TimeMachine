const express = require('express');
const router = express.Router();
const SecureUser = require('../models/User-secure');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
// No need for nodemailer since we're not using email
// const nodemailer = require('nodemailer');
const { authenticateToken } = require('./auth');

// Middleware to validate request body fields for device verification
const validateVerificationFields = (req, res, next) => {
  const { email, deviceId } = req.body;

  if (!email) return res.status(400).json({ error: "Email is required" });
  if (!deviceId) return res.status(400).json({ error: "Device ID is required" });

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  next();
};

// NOTE: No email service configuration needed
// We'll use a direct verification approach instead of emails
console.log('Using direct verification codes instead of email verification');

// Helper function to handle verification (no email needed)
async function handleVerificationCode(email, code, deviceInfo) {
  try {
    // Since we don't have an email service, we'll log the code to the console
    // In a real production app, you might want to use a different notification system
    console.log('========== VERIFICATION CODE ==========');
    console.log(`Email: ${email}`);
    console.log(`Device: ${deviceInfo.browser} on ${deviceInfo.operatingSystem} (${deviceInfo.deviceType})`);
    console.log(`Code: ${code}`);
    console.log('======================================');
    
    // Always return true since we're not actually sending emails
    return true;
  } catch (error) {
    console.error("Error handling verification code:", error);
    return false;
  }
}

/**
 * Get device information from request
 */
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

// Route to request a verification code
router.post('/request-verification', validateVerificationFields, async (req, res) => {
  try {
    const { email, deviceId } = req.body;
    const deviceInfo = req.body.browser && req.body.operatingSystem 
      ? req.body 
      : getDeviceInfo(req);

    // Find user by email using the secure method that handles hashed emails
    let user = await SecureUser.findByEmail(email);

    // If user doesn't exist, create a new one
    if (!user) {
      user = await SecureUser.createSecureUser(email, deviceInfo);
    }

    // Check if device already exists and is verified
    const existingDevice = user.devices.find(device => device.deviceId === deviceId && device.isActive);
    if (existingDevice) {
      return res.status(200).json({
        message: "Device already verified",
        verified: true
      });
    }

    // Generate a verification code (6-digit number)
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Set expiration time (15 minutes from now)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    // Add or update verification code for this device
    const verificationIndex = user.verificationCodes.findIndex(vc => vc.deviceId === deviceId);
    if (verificationIndex >= 0) {
      user.verificationCodes[verificationIndex] = {
        deviceId,
        code: verificationCode,
        expiresAt
      };
    } else {
      user.verificationCodes.push({
        deviceId,
        code: verificationCode,
        expiresAt
      });
    }

    // Save the user with the new verification code
    await user.save();

    // Log the verification code instead of sending an email
    await handleVerificationCode(email, verificationCode, deviceInfo);

    // In development mode or for testing, you can return the code in the response
    // REMOVE THIS IN PRODUCTION!
    res.status(200).json({
      message: "Verification code ready",
      success: true,
      // Include the code directly in the response for testing purposes
      // In a real app, you'd use a different secure method to deliver this code
      code: verificationCode,
      deviceInfo: {
        browser: deviceInfo.browser,
        operatingSystem: deviceInfo.operatingSystem,
        deviceType: deviceInfo.deviceType
      }
    });
  } catch (error) {
    console.error("Error requesting verification:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Route to verify a code
router.post('/verify-code', validateVerificationFields, async (req, res) => {
  try {
    const { email, deviceId, code } = req.body;
    const deviceInfo = req.body.browser && req.body.operatingSystem 
      ? req.body 
      : getDeviceInfo(req);

    // Find user by email
    const user = await SecureUser.findByEmail(email);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Find the verification code for this device
    const verificationEntry = user.verificationCodes.find(vc => 
      vc.deviceId === deviceId && vc.code === code && vc.expiresAt > new Date()
    );

    if (!verificationEntry) {
      return res.status(400).json({ error: "Invalid or expired verification code" });
    }

    // Remove the used verification code
    user.verificationCodes = user.verificationCodes.filter(vc => 
      !(vc.deviceId === deviceId && vc.code === code)
    );

    // Add or update the device using the addDevice method
    await user.addDevice({
      deviceId,
      deviceName: deviceInfo.deviceName || `${deviceInfo.browser} on ${deviceInfo.operatingSystem}`,
      browser: deviceInfo.browser,
      operatingSystem: deviceInfo.operatingSystem,
      deviceType: deviceInfo.deviceType
    });

    // Generate a JWT token for this device
    const token = jwt.sign(
      { 
        hashedEmail: user.hashedEmail,
        deviceId,
        role: user.role || 'user'
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(200).json({
      verified: true,
      token,
      message: "Device verified successfully"
    });
  } catch (error) {
    console.error("Error verifying code:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Route to check if a device is verified
router.post('/verify-device', validateVerificationFields, async (req, res) => {
  try {
    const { email, deviceId } = req.body;

    // Find user by email
    const user = await SecureUser.findByEmail(email);
    if (!user) {
      return res.status(200).json({ verified: false });
    }

    // Check if device exists and is active
    const device = user.devices.find(d => d.deviceId === deviceId && d.isActive);
    
    if (!device) {
      return res.status(200).json({ verified: false });
    }

    // Update last login timestamp
    device.lastLogin = new Date();
    await SecureUser.save();

    // Generate a new JWT token
    const token = jwt.sign(
      { 
        hashedEmail: user.hashedEmail,
        deviceId,
        role: user.role || 'user'
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(200).json({
      verified: true,
      token
    });
  } catch (error) {
    console.error("Error verifying device:", error);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * Register a new device for an existing user
 */
router.post('/register-device', authenticateToken, async (req, res) => {
  try {
    const user = await SecureUser.findOne({ hashedEmail: req.SecureUser.hashedEmail });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get device info from request
    const deviceInfo = getDeviceInfo(req);
    
    // Add device to user
    await user.addDevice(deviceInfo);
    
    // Return success with device info
    res.json({ 
      success: true, 
      message: 'Device registered successfully',
      device: {
        deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName,
        deviceType: deviceInfo.deviceType
      }
    });
  } catch (error) {
    console.error('Register device error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

/**
 * List all devices for a user
 */
router.get('/devices', authenticateToken, async (req, res) => {
  try {
    const user = await SecureUser.findOne({ hashedEmail: req.SecureUser.hashedEmail });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get all active devices
    const devices = user.getDevices().map(device => ({
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      deviceType: device.deviceType,
      browser: device.browser,
      operatingSystem: device.operatingSystem,
      lastLogin: device.lastLogin
    }));
    
    res.json({ success: true, devices });
  } catch (error) {
    console.error('List devices error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

/**
 * Deactivate a device
 */
router.post('/deactivate-device/:deviceId', authenticateToken, async (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    const user = await SecureUser.findOne({ hashedEmail: req.SecureUser.hashedEmail });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Deactivate the device
    await user.deactivateDevice(deviceId);
    
    // Send email notification about device deactivation
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.originalEmail || `${user.maskedEmail}`,
      subject: 'TimeMachine Device Deactivated',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">TimeMachine Security Alert</h2>
          <p>A device has been deactivated from your TimeMachine account.</p>
          <p>If you didn't deactivate this device, please reset your password immediately.</p>
          <p>Time: ${new Date().toLocaleString()}</p>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    
    res.json({ 
      success: true, 
      message: 'Device deactivated successfully' 
    });
  } catch (error) {
    console.error('Deactivate device error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

/**
 * Notify user about new device login
 */
router.post('/notify-new-device', authenticateToken, async (req, res) => {
  try {
    const user = await SecureUser.findOne({ hashedEmail: req.SecureUser.hashedEmail });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const deviceInfo = getDeviceInfo(req);
    
    // Send email notification about new device
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.originalEmail || `${user.maskedEmail}`,
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
    
    res.json({ success: true, message: 'Notification sent successfully' });
  } catch (error) {
    console.error('Notify new device error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

module.exports = router;
