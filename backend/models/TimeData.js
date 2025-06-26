const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  start: String,
  end: String,
  duration: Number,
});

const timeDataSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  date: { type: String, required: true },
  domain: { type: String, required: true },
  sessions: [sessionSchema],
});

module.exports = mongoose.model('TimeData', timeDataSchema);