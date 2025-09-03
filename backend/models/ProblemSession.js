const mongoose = require('mongoose');
const { getUserTimezoneDate } = require('../utils/timezone');

const problemSessionSchema = new mongoose.Schema({
  userEmail: {
    type: String,
    required: true,
    index: true,
    validate: {
      validator: value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      message: 'Invalid email format'
    }
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  url: {
    type: String,
    default: '',
    validate: {
      validator: value => !value || /^https?:\/\/.+$/.test(value),
      message: 'Invalid URL format'
    }
  },
  site: {
    type: String,
    default: '',
    trim: true
  },
  category: {
    type: String,
    enum: ['Coding', 'Math', 'Study', 'Research', 'Debug', 'Design', 'Other'],
    default: 'Other'
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    validate: {
      validator: function(value) {
        return !value || value > this.startTime;
      },
      message: 'endTime must be after startTime'
    }
  },
  duration: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'completed', 'abandoned'],
    default: 'active'
  },
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard', 'Expert'],
    default: 'Medium'
  },
  tags: [{
    type: String,
    trim: true
  }],
  notes: {
    type: String,
    default: '',
    trim: true,
    maxlength: [1000, 'Notes must not exceed 1000 characters']
  },
  pausedDuration: {
    type: Number,
    default: 0,
    min: 0
  },
  pauseHistory: [{
    pausedAt: { type: Date, required: true },
    resumedAt: { type: Date },
    reason: {
      type: String,
      trim: true,
      maxlength: [200, 'Pause reason must not exceed 200 characters']
    }
  }],
  completionNotes: {
    type: String,
    default: '',
    trim: true,
    maxlength: [1000, 'Completion notes must not exceed 1000 characters']
  },
  wasSuccessful: {
    type: Boolean,
    default: true
  },
  userLocalDate: {
    type: String,
    required: true,
    validate: {
      validator: value => /^\d{4}-\d{2}-\d{2}$/.test(value),
      message: 'Invalid userLocalDate format (use YYYY-MM-DD)'
    }
  },
  timezone: {
    name: {
      type: String,
      default: 'UTC',
      trim: true
    },
    offset: {
      type: Number,
      default: 0,
      validate: {
        validator: value => Number.isInteger(value) && value >= -720 && value <= 840,
        message: 'Timezone offset must be an integer between -720 and 840 minutes'
      }
    }
  }
}, { timestamps: true });

problemSessionSchema.pre('save', function(next) {
  if (this.endTime && this.startTime) {
    this.duration = this.endTime.getTime() - this.startTime.getTime() - this.pausedDuration;
  }
  next();
});

problemSessionSchema.statics.getCurrentSession = function(userEmail) {
  if (!userEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
    throw new Error('Valid user email is required');
  }
  return this.findOne({ userEmail, status: { $in: ['active', 'paused'] } }).lean();
};

problemSessionSchema.statics.getHistory = function(userEmail, { date, endDate, category, status } = {}) {
  if (!userEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
    throw new Error('Valid user email is required');
  }
  const query = { userEmail };
  if (date) {
    query.userLocalDate = endDate ? { $gte: date, $lte: endDate } : date;
  }
  if (category && category !== 'all') {
    query.category = category;
  }
  if (status && status !== 'all') {
    query.status = status;
  }
  return this.find(query).sort({ startTime: -1 }).lean();
};

problemSessionSchema.index({ userEmail: 1, userLocalDate: 1 });
problemSessionSchema.index({ userEmail: 1, status: 1 });
problemSessionSchema.index({ userEmail: 1, category: 1 });

module.exports = mongoose.model('ProblemSession', problemSessionSchema);