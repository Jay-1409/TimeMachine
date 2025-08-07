const mongoose = require("mongoose");

const timeDataSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  date: { type: String, required: true },
  domain: { type: String, required: true },
  totalTime: { type: Number, required: true, default: 0 },
  sessions: [
    {
      startTime: { type: Number, required: true },
      endTime: { type: Number, required: true },
      duration: { type: Number, required: true },
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

timeDataSchema.index({ userEmail: 1, date: 1, domain: 1 }, { unique: true });

module.exports = mongoose.model("TimeData", timeDataSchema);
