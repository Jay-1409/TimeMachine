const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Enhanced User Schema with email hashing for security
 * Supports multiple devices for the same user
 */
const userSchema = new mongoose.Schema({
  // Hashed email - main identifier
  hashedEmail: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Original email domain (stored for display/filtering purposes without compromising privacy)
  emailDomain: {
    type: String,
    required: true
  },
  // First part of email (first 3 chars) + *** for display purposes
  maskedEmail: {
    type: String,
    required: true
  },
  // Registered devices for multi-device support
  devices: [{
    deviceId: {
      type: String,
      required: true
    },
    deviceName: String,
    deviceType: {
      type: String,
      enum: ['desktop', 'laptop', 'mobile', 'tablet', 'other'],
      default: 'other'
    },
    lastLogin: {
      type: Date,
      default: Date.now
    },
    browser: String,
    operatingSystem: String,
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  // Verification codes for device authentication
  verificationCodes: [{
    deviceId: {
      type: String,
      required: true
    },
    code: {
      type: String,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true
    }
  }],
  // For backward compatibility during migration (will be removed after full migration)
  originalEmail: {
    type: String,
    required: false,
    select: false // Don't include in query results by default
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  // Password for authentication (hashed)
  password: {
    type: String,
    select: false // Don't include in query results by default
  },
  // Password reset token
  resetToken: {
    type: String,
    select: false
  },
  // Reset token expiry time
  resetTokenExpires: {
    type: Date,
    select: false
  },
  settings: {
    receiveReports: {
      type: Boolean,
      default: false
    },
    reportFrequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'weekly'
    },
    categories: {
      type: Map,
      of: String,
      default: {}
    }
  }
});

/**
 * Static method to hash email for lookup
 */
userSchema.statics.hashEmail = function(email) {
  if (!email) return '';
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
};

/**
 * Static method to create masked email for display
 */
userSchema.statics.createMaskedEmail = function(email) {
  if (!email) return '***@unknown.com';
  
  const parts = email.split('@');
  if (parts.length !== 2) return '***@unknown.com';
  
  const username = parts[0];
  const domain = parts[1];
  
  // Take first 3 chars of username (or fewer if username is shorter) and add ***
  const maskedUsername = username.substring(0, Math.min(3, username.length)) + '***';
  return `${maskedUsername}@${domain}`;
};

/**
 * Static method to create a new user with proper email hashing
 */
userSchema.statics.createSecureUser = async function(email, deviceInfo = {}, role = 'user') {
  if (!email) throw new Error('Email is required');
  
  const lowercaseEmail = email.toLowerCase().trim();
  const hashedEmail = this.hashEmail(lowercaseEmail);
  const emailParts = lowercaseEmail.split('@');
  const emailDomain = emailParts.length === 2 ? emailParts[1] : 'unknown.com';
  const maskedEmail = this.createMaskedEmail(lowercaseEmail);
  
  // Create device object
  const device = {
    deviceId: deviceInfo.deviceId || crypto.randomBytes(16).toString('hex'),
    deviceName: deviceInfo.deviceName || 'Unknown Device',
    deviceType: deviceInfo.deviceType || 'other',
    browser: deviceInfo.browser || 'Unknown Browser',
    operatingSystem: deviceInfo.operatingSystem || 'Unknown OS',
    lastLogin: new Date(),
    isActive: true
  };
  
  return this.create({
    hashedEmail,
    emailDomain,
    maskedEmail,
    devices: [device],
    originalEmail: lowercaseEmail, // Temporarily store for migration
    role
  });
};

/**
 * Static method to find user by email
 */
userSchema.statics.findByEmail = function(email) {
  if (!email) return null;
  
  const hashedEmail = this.hashEmail(email.toLowerCase().trim());
  
  // Try to find by hashed email first, fall back to original email for migration period
  return this.findOne({ 
    $or: [
      { hashedEmail },
      { originalEmail: email.toLowerCase().trim() }
    ]
  });
};

/**
 * Method to add a new device for an existing user
 */
userSchema.methods.addDevice = async function(deviceInfo) {
  if (!deviceInfo) throw new Error('Device info is required');
  
  // Check if device already exists by deviceId
  const existingDeviceIndex = this.devices.findIndex(d => 
    d.deviceId === deviceInfo.deviceId
  );
  
  const device = {
    deviceId: deviceInfo.deviceId || crypto.randomBytes(16).toString('hex'),
    deviceName: deviceInfo.deviceName || 'Unknown Device',
    deviceType: deviceInfo.deviceType || 'other',
    browser: deviceInfo.browser || 'Unknown Browser',
    operatingSystem: deviceInfo.operatingSystem || 'Unknown OS',
    lastLogin: new Date(),
    isActive: true
  };
  
  // If device exists, update it
  if (existingDeviceIndex >= 0) {
    this.devices[existingDeviceIndex] = {
      ...this.devices[existingDeviceIndex],
      ...device,
      lastLogin: new Date()
    };
  } else {
    // Otherwise add new device
    this.devices.push(device);
  }
  
  this.lastActive = new Date();
  this.lastUpdated = new Date();
  return this.save();
};

/**
 * Method to get all devices for a user
 */
userSchema.methods.getDevices = function() {
  return this.devices.filter(device => device.isActive);
};

/**
 * Method to deactivate a device
 */
userSchema.methods.deactivateDevice = async function(deviceId) {
  const deviceIndex = this.devices.findIndex(d => d.deviceId === deviceId);
  
  if (deviceIndex >= 0) {
    this.devices[deviceIndex].isActive = false;
    this.lastUpdated = new Date();
    return this.save();
  }
  
  return this;
};

const SecureUser = mongoose.model('SecureUser', userSchema);

module.exports = SecureUser;
