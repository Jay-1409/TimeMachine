const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-timezone');

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
      default: 'UTC',
      validate: {
        validator: value => value === 'UTC' || moment.tz.zone(value) !== null,
        message: 'Invalid timezone name'
      }
    },
    offset: {
      type: Number,
      default: 0,
      validate: {
        validator: value => !isNaN(value) && value >= -720 && value <= 840,
        message: 'Invalid timezone offset; must be between -720 and 840 minutes'
      }
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'lastUpdated' } });

userSchema.pre('save', function(next) {
  if (this.isModified('devices') && this.devices.length > 10) {
    next(new Error('Maximum device limit of 10 reached'));
  }
  next();
});

userSchema.statics.findByEmail = function(email) {
  if (!email || typeof email !== 'string') {
    throw new Error('Valid email is required');
  }
  return this.findOne({ email: email.toLowerCase().trim() }).lean();
};

userSchema.statics.createUser = async function(email, password, deviceInfo = {}, role = 'user') {
  if (!email || !password) throw new Error('Email and password are required');
  
  const lowercaseEmail = email.toLowerCase().trim();
  const saltRounds = Number(process.env.BCRYPT_ROUNDS);
  if (!saltRounds || isNaN(saltRounds)) {
    throw new Error('BCRYPT_ROUNDS environment variable is required and must be a number');
  }
  
  const device = {
    deviceId: deviceInfo.deviceId || uuidv4(),
    deviceName: deviceInfo.deviceName || 'Unknown Device',
    deviceType: deviceInfo.deviceType || 'other',
    browser: deviceInfo.browser || 'Unknown Browser',
    operatingSystem: deviceInfo.operatingSystem || 'Unknown OS',
    lastLogin: new Date(),
    isActive: true
  };
  
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  
  return this.create({
    email: lowercaseEmail,
    password: hashedPassword,
    devices: [device],
    role
  });
};

userSchema.methods.verifyPassword = async function(password) {
  try {
    return await bcrypt.compare(password, this.password);
  } catch (_) {
    return false;
  }
};

userSchema.methods.addDevice = async function(deviceInfo) {
  if (!deviceInfo) throw new Error('Device info is required');
  
  const deviceId = deviceInfo.deviceId || uuidv4();
  if (this.devices.some(d => d.deviceId === deviceId)) {
    throw new Error('Device ID already exists');
  }
  
  const device = {
    deviceId,
    deviceName: deviceInfo.deviceName || 'Unknown Device',
    deviceType: deviceInfo.deviceType || 'other',
    browser: deviceInfo.browser || 'Unknown Browser',
    operatingSystem: deviceInfo.operatingSystem || 'Unknown OS',
    lastLogin: new Date(),
    isActive: true
  };
  
  this.devices.push(device);
  this.lastActive = new Date();
  return this.save();
};

userSchema.methods.getDevices = function() {
  return this.devices.filter(device => device.isActive);
};

userSchema.methods.deactivateDevice = async function(deviceId) {
  const deviceIndex = this.devices.findIndex(d => d.deviceId === deviceId);
  if (deviceIndex >= 0) {
    this.devices[deviceIndex].isActive = false;
    this.lastActive = new Date();
    return this.save();
  }
  throw new Error('Device not found');
};

userSchema.methods.cleanupInactiveDevices = async function() {
  this.devices = this.devices.filter(d => d.isActive);
  return this.save();
};

userSchema.methods.updateTimezone = async function(timezoneName, timezoneOffset) {
  const offset = Number(timezoneOffset);
  if (isNaN(offset) || offset < -720 || offset > 840) {
    throw new Error('Invalid timezone offset; must be between -720 and 840 minutes');
  }
  this.timezone = {
    name: timezoneName || 'UTC',
    offset,
    lastUpdated: new Date()
  };
  return this.save();
};

userSchema.methods.getCurrentDateInUserTimezone = function() {
  const now = new Date();
  const offset = Number(this.timezone.offset);
  if (isNaN(offset)) {
    console.warn(`Invalid timezone offset for user ${this.email}, defaulting to UTC`);
    return now.toISOString().split('T')[0];
  }
  const userTime = new Date(now.getTime() + (offset * 60000));
  return userTime.toISOString().split('T')[0];
};

userSchema.methods.isNewDayInUserTimezone = function(lastActivityDate) {
  const currentUserDate = this.getCurrentDateInUserTimezone();
  return currentUserDate !== lastActivityDate;
};

userSchema.statics.getUsersInTimezone = function(timezoneOffset) {
  if (isNaN(timezoneOffset)) {
    throw new Error('Valid timezone offset is required');
  }
  return this.find({ 'timezone.offset': timezoneOffset });
};

module.exports = mongoose.model('User', userSchema);