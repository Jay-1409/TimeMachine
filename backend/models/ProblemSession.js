const mongoose = require("mongoose");

const problemSessionSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: "" },
  url: { type: String, default: "" }, // URL of the problem/page
  site: { type: String, default: "" }, // Site name (LeetCode, GitHub, etc.)
  category: {
    type: String,
    enum: ["Coding", "Math", "Study", "Research", "Debug", "Design", "Other"],
    default: "Other",
  },
  startTime: { type: Date, required: true },
  endTime: { type: Date },
  duration: { type: Number, default: 0 }, // Duration in milliseconds
  status: {
    type: String,
    enum: ["active", "paused", "completed", "abandoned"],
    default: "active",
  },
  difficulty: {
    type: String,
    enum: ["Easy", "Medium", "Hard", "Expert"],
    default: "Medium",
  },
  tags: [{ type: String }],
  notes: { type: String, default: "" },
  pausedDuration: { type: Number, default: 0 }, // Total time paused
  pauseHistory: [{
    pausedAt: { type: Date },
    resumedAt: { type: Date },
    reason: { type: String }
  }],
  completionNotes: { type: String, default: "" },
  wasSuccessful: { type: Boolean, default: true },
  userLocalDate: { type: String, required: true }, // YYYY-MM-DD in user's timezone
  timezone: {
    name: { type: String, default: 'UTC' },
    offset: { type: Number, default: 0 } // Offset in minutes
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

problemSessionSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  
  // Calculate duration if session is completed
  if (this.endTime && this.startTime) {
    this.duration = this.endTime.getTime() - this.startTime.getTime() - this.pausedDuration;
  }
  
  next();
});

// Index for efficient queries
problemSessionSchema.index({ userEmail: 1, userLocalDate: 1 });
problemSessionSchema.index({ userEmail: 1, status: 1 });
problemSessionSchema.index({ userEmail: 1, category: 1 });

module.exports = mongoose.model("ProblemSession", problemSessionSchema);
