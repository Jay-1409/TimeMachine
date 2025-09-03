const mongoose = require('mongoose');

const blockedKeywordSchema = new mongoose.Schema({
  userEmail: {
    type: String,
    required: true,
    index: true,
    validate: {
      validator: value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      message: 'Invalid email format'
    }
  },
  keyword: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  enabled: {
    type: Boolean,
    default: true
  },
  blockType: {
    type: String,
    enum: ['always', 'focus-only', 'scheduled'],
    default: 'focus-only'
  },
  blockDuring: {
    focusSessions: { type: Boolean, default: true },
    breakTime: { type: Boolean, default: false }
  },
  schedule: {
    days: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }],
    startTime: {
      type: String,
      validate: {
        validator: value => !value || /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value),
        message: 'Invalid time format for startTime (use HH:MM)'
      }
    },
    endTime: {
      type: String,
      validate: {
        validator: value => !value || /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value),
        message: 'Invalid time format for endTime (use HH:MM)'
      }
    }
  },
  redirectUrl: {
    type: String,
    default: 'chrome://newtab',
    validate: {
      validator: value => /^https?:\/\/.+$|^chrome:\/\/.+$/.test(value),
      message: 'Invalid URL format for redirectUrl'
    }
  }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

blockedKeywordSchema.index({ userEmail: 1, keyword: 1 }, { unique: true });

blockedKeywordSchema.methods.toggle = async function() {
  this.enabled = !this.enabled;
  return this.save();
};

blockedKeywordSchema.statics.getUserBlockedKeywords = function(userEmail) {
  if (!userEmail) throw new Error('User email is required');
  return this.find({ userEmail }).lean();
};

module.exports = mongoose.model('BlockedKeyword', blockedKeywordSchema);