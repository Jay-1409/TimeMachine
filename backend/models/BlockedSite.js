const mongoose = require('mongoose');

const blockedSiteSchema = new mongoose.Schema({
  userEmail: {
    type: String,
    required: true,
    index: true
  },
  domain: {
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
    focusSessions: {
      type: Boolean,
      default: true
    },
    breakTime: {
      type: Boolean,
      default: false
    }
  },
  schedule: {
    days: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }],
    startTime: String, // HH:MM format
    endTime: String    // HH:MM format
  },
  redirectUrl: {
    type: String,
    default: 'chrome://newtab'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for user and domain uniqueness
blockedSiteSchema.index({ userEmail: 1, domain: 1 }, { unique: true });

// Update timestamp on save
blockedSiteSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to get user's blocked sites
blockedSiteSchema.statics.getUserBlockedSites = function(userEmail) {
  return this.find({ userEmail }).sort({ createdAt: -1 });
};

// Instance method to toggle enabled status
blockedSiteSchema.methods.toggle = function() {
  this.enabled = !this.enabled;
  return this.save();
};

module.exports = mongoose.model('BlockedSite', blockedSiteSchema);
