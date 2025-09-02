const mongoose = require('mongoose');

const focusSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  duration: {
    type: Number,
    required: true,
    min: 1,
    max: 480 // Max 8 hours
  },
  startTime: {
    type: Date,
    required: true,
    index: true
  },
  endTime: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['completed', 'interrupted'],
    required: true
  },
  sessionType: {
    type: String,
    enum: ['focus', 'break'],
    default: 'focus'
  },
  productivity: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  notes: {
    type: String,
    maxlength: 500
  }
}, {
  timestamps: true
});

// Index for efficient queries
focusSessionSchema.index({ userId: 1, startTime: -1 });
focusSessionSchema.index({ userId: 1, status: 1 });

// Virtual for session date
focusSessionSchema.virtual('sessionDate').get(function() {
  return this.startTime.toDateString();
});

// Static method to get user's daily stats
focusSessionSchema.statics.getDailyStats = async function(userId, date = new Date()) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const sessions = await this.find({
    userId,
    startTime: { $gte: startOfDay, $lte: endOfDay },
    status: 'completed'
  });
  
  const totalMinutes = sessions.reduce((sum, session) => sum + session.duration, 0);
  const sessionCount = sessions.length;
  const productivity = sessions.length > 0 
    ? Math.round(sessions.reduce((sum, session) => sum + session.productivity, 0) / sessions.length)
    : 0;
  
  return {
    totalMinutes,
    sessionCount,
    productivity,
    sessions: sessions.slice(-5) // Last 5 sessions
  };
};

// Static method to get weekly stats
focusSessionSchema.statics.getWeeklyStats = async function(userId, weekStart = new Date()) {
  const startOfWeek = new Date(weekStart);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  
  const sessions = await this.find({
    userId,
    startTime: { $gte: startOfWeek, $lte: endOfWeek },
    status: 'completed'
  });
  
  const dailyStats = {};
  sessions.forEach(session => {
    const day = session.startTime.toDateString();
    if (!dailyStats[day]) {
      dailyStats[day] = { minutes: 0, sessions: 0 };
    }
    dailyStats[day].minutes += session.duration;
    dailyStats[day].sessions += 1;
  });
  
  return {
    totalMinutes: sessions.reduce((sum, session) => sum + session.duration, 0),
    totalSessions: sessions.length,
    dailyBreakdown: dailyStats
  };
};

module.exports = mongoose.model('FocusSession', focusSessionSchema);
