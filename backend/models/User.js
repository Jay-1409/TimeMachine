const mongoose = require('mongoose');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true
  },
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
  password: {
    type: String,
    required: true,
    select: false
  },
  resetToken: {
    type: String,
    select: false
  },
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
  },
  timezone: {
    name: {
      type: String,
      default: 'UTC'
    },
    offset: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  }
});

userSchema.statics.findByEmail = function(email) {
  if (!email) return null;
  return this.findOne({ email: email.toLowerCase().trim() });
};

userSchema.statics.createUser = async function(email, password, deviceInfo = {}, role = 'user') {
  if (!email || !password) throw new Error('Email and password are required');
  
  const lowercaseEmail = email.toLowerCase().trim();
  
  const device = {
    deviceId: deviceInfo.deviceId || crypto.randomBytes(16).toString('hex'),
    deviceName: deviceInfo.deviceName || 'Unknown Device',
    deviceType: deviceInfo.deviceType || 'other',
    browser: deviceInfo.browser || 'Unknown Browser',
    operatingSystem: deviceInfo.operatingSystem || 'Unknown OS',
    lastLogin: new Date(),
    isActive: true
  };
  
  const PASSWORD_SECRET = process.env.PASSWORD_SECRET || 'timemachine-password-secret';
  
  const hashedPassword = CryptoJS.PBKDF2(password, PASSWORD_SECRET, { 
    keySize: 512/32, 
    iterations: 1000 
  }).toString();
  
  return this.create({
    email: lowercaseEmail,
    password: hashedPassword,
    devices: [device],
    role
  });
};

/**
 * Method to verify password
 */
userSchema.methods.verifyPassword = function(password) {
  const PASSWORD_SECRET = process.env.PASSWORD_SECRET || 'timemachine-password-secret';
  
  const hashedPassword = CryptoJS.PBKDF2(password, PASSWORD_SECRET, { 
    keySize: 512/32, 
    iterations: 1000 
  }).toString();
  
  return this.password === hashedPassword;
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

/**
 * Method to update user's timezone
 */
userSchema.methods.updateTimezone = async function(timezoneName, timezoneOffset) {
  this.timezone = {
    name: timezoneName || 'UTC',
    offset: timezoneOffset || 0,
    lastUpdated: new Date()
  };
  this.lastUpdated = new Date();
  return this.save();
};

/**
 * Method to get current date in user's timezone
 */
userSchema.methods.getCurrentDateInUserTimezone = function() {
  const now = new Date();
  const userTime = new Date(now.getTime() + (this.timezone.offset * 60000));
  return userTime.toISOString().split('T')[0];
};

/**
 * Method to check if it's a new day in user's timezone
 */
userSchema.methods.isNewDayInUserTimezone = function(lastActivityDate) {
  const currentUserDate = this.getCurrentDateInUserTimezone();
  return currentUserDate !== lastActivityDate;
};

/**
 * Static method to get users in a specific timezone for midnight processing
 */
userSchema.statics.getUsersInTimezone = function(timezoneOffset) {
  return this.find({ 'timezone.offset': timezoneOffset });
};

module.exports = mongoose.model('User', userSchema);