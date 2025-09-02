const mongoose = require("mongoose");

const timeDataSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  date: { type: String, required: true }, // Date in YYYY-MM-DD format in user's timezone
  domain: { type: String, required: true },
  totalTime: { type: Number, required: true, default: 0 },
  timezone: {
    name: { type: String, default: 'UTC' }, // IANA timezone name
    offset: { type: Number, default: 0 }, // Timezone offset in minutes from UTC
  },
  userLocalDate: { type: String, required: true }, // Always store the date in user's local timezone
  utcDate: { type: Date, default: Date.now }, // UTC date for server-side operations
  sessions: [
    {
      startTime: { type: Number, required: true }, // Unix timestamp
      endTime: { type: Number, required: true }, // Unix timestamp
      duration: { type: Number, required: true },
      userLocalStartTime: { type: Date }, // Start time in user's timezone
      userLocalEndTime: { type: Date }, // End time in user's timezone
    },
  ],
  category: {
    type: String,
    enum: ["Work", "Social", "Entertainment", "Professional", "Other"],
    default: "Other",
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

timeDataSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});
timeDataSchema.pre("findOneAndUpdate", function (next) {
  this._update.updatedAt = Date.now();
  next();
});

/**
 * Static method to get date in user's timezone
 */
timeDataSchema.statics.getUserTimezoneDate = function(timestamp, timezoneOffset) {
  // timezoneOffset is in minutes, convert to milliseconds
  const userTime = new Date(timestamp - (timezoneOffset * 60000));
  return userTime.toISOString().split('T')[0];
};

/**
 * Static method to check if it's a new day for user
 */
timeDataSchema.statics.isNewDayForUser = function(userEmail, timezoneOffset) {
  const now = Date.now();
  const userDate = this.getUserTimezoneDate(now, timezoneOffset);
  
  return this.findOne({ 
    userEmail, 
    userLocalDate: userDate 
  }).then(data => !data); // Returns true if no data exists for today (new day)
};

/**
 * Static method to get data for user's current day
 */
timeDataSchema.statics.getTodayDataForUser = function(userEmail, timezoneOffset) {
  const userDate = this.getUserTimezoneDate(Date.now(), timezoneOffset);
  
  return this.find({ 
    userEmail, 
    userLocalDate: userDate 
  });
};

/**
 * Static method to reset daily data (for new day processing)
 */
timeDataSchema.statics.processMidnightReset = async function(userEmail, timezoneOffset, timezoneName) {
  // Archive yesterday's data or perform any cleanup
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yesterdayUserDate = this.getUserTimezoneDate(yesterday.getTime(), timezoneOffset);
  
  console.log(`Processing midnight reset for ${userEmail} in timezone ${timezoneName} (${timezoneOffset})`);
  console.log(`Yesterday's date: ${yesterdayUserDate}`);
  
  // You can add any specific logic here for handling new day
  // For example: send daily reports, archive data, etc.
  
  return true;
};

timeDataSchema.index({ userEmail: 1, userLocalDate: 1, domain: 1 }, { unique: true });
timeDataSchema.index({ userEmail: 1, date: 1, domain: 1 }); // Keep existing index for backward compatibility

module.exports = mongoose.model("TimeData", timeDataSchema);
