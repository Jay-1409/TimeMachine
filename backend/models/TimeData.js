const mongoose = require('mongoose');
const { getUserTimezoneDate, getTimezoneNameFromOffset } = require('../utils/timezone');

const timeDataSchema = new mongoose.Schema({
  userEmail: {
    type: String,
    required: true,
    index: true,
    validate: {
      validator: value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      message: 'Invalid email format'
    }
  },
  date: {
    type: String,
    required: true,
    validate: {
      validator: value => /^\d{4}-\d{2}-\d{2}$/.test(value),
      message: 'Invalid date format (use YYYY-MM-DD)'
    }
  },
  domain: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: value => /^(?!:\/\/)([a-zA-Z0-9-_]+\.)*[a-zA-Z0-9][a-zA-Z0-9-_]+\.[a-zA-Z]{2,}$/.test(value),
      message: 'Invalid domain format'
    }
  },
  totalTime: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  timezone: {
    name: {
      type: String,
      default: 'UTC',
      trim: true,
      validate: {
        validator: value => /^[A-Za-z]+\/[A-Za-z]+(_[A-Za-z]+)?$/.test(value) || value === 'UTC',
        message: 'Invalid IANA timezone name'
      }
    },
    offset: {
      type: Number,
      default: 0,
      validate: {
        validator: value => Number.isInteger(value) && value >= -720 && value <= 840,
        message: 'Timezone offset must be an integer between -720 and 840 minutes'
      }
    }
  },
  userLocalDate: {
    type: String,
    required: true,
    validate: {
      validator: value => /^\d{4}-\d{2}-\d{2}$/.test(value),
      message: 'Invalid userLocalDate format (use YYYY-MM-DD)'
    }
  },
  utcDate: {
    type: Date,
    default: Date.now
  },
  sessions: [{
    startTime: {
      type: Number,
      required: true,
      validate: {
        validator: value => Number.isInteger(value) && value > 0,
        message: 'Invalid startTime; must be a positive integer timestamp'
      }
    },
    endTime: {
      type: Number,
      required: true,
      validate: {
        validator: function(value) {
          return Number.isInteger(value) && value > this.startTime;
        },
        message: 'endTime must be a positive integer timestamp after startTime'
      }
    },
    duration: {
      type: Number,
      required: true,
      validate: {
        validator: function(value) {
          return value === this.endTime - this.startTime;
        },
        message: 'Duration must equal endTime - startTime'
      }
    },
    userLocalStartTime: { type: Date },
    userLocalEndTime: { type: Date }
  }],
  category: {
    type: String,
    enum: ['Work', 'Social', 'Entertainment', 'Professional', 'Other'],
    default: 'Other'
  }
}, { timestamps: true });

timeDataSchema.statics.getTodayDataForUser = async function(userEmail, timezoneOffset) {
  if (!userEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
    throw new Error('Valid user email is required');
  }
  if (!Number.isInteger(timezoneOffset) || timezoneOffset < -720 || timezoneOffset > 840) {
    throw new Error('Invalid timezone offset; must be an integer between -720 and 840');
  }
  const userLocalDate = getUserTimezoneDate(Date.now(), timezoneOffset);
  return this.find({ userEmail, userLocalDate }).lean();
};

timeDataSchema.statics.isNewDayForUser = async function(userEmail, timezoneOffset) {
  if (!userEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
    throw new Error('Valid user email is required');
  }
  if (!Number.isInteger(timezoneOffset) || timezoneOffset < -720 || timezoneOffset > 840) {
    throw new Error('Invalid timezone offset; must be an integer between -720 and 840');
  }
  const userLocalDate = getUserTimezoneDate(Date.now(), timezoneOffset);
  const data = await this.findOne({ userEmail, userLocalDate }).lean();
  return !data;
};

timeDataSchema.statics.processMidnightReset = async function(userEmail, timezoneOffset, timezoneName) {
  if (!userEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
    throw new Error('Valid user email is required');
  }
  if (!Number.isInteger(timezoneOffset) || timezoneOffset < -720 || timezoneOffset > 840) {
    throw new Error('Invalid timezone offset; must be an integer between -720 and 840');
  }
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yesterdayUserDate = getUserTimezoneDate(yesterday.getTime(), timezoneOffset);
  console.log(`Processing midnight reset for ${userEmail} in timezone ${timezoneName} (${timezoneOffset})`);
  console.log(`Yesterday's date: ${yesterdayUserDate}`);
  // Add archiving logic here if needed (e.g., move to an archive collection)
  return true;
};

timeDataSchema.index({ userEmail: 1, userLocalDate: 1, domain: 1 }, { unique: true });

module.exports = mongoose.model('TimeData', timeDataSchema);