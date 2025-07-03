const mongoose = require('mongoose');

const timeDataSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  date: { type: String, required: true },
  domain: { type: String, required: true },
  totalTime: { type: Number, required: true, default: 0 } 
});

timeDataSchema.index({ userEmail: 1, date: 1, domain: 1 });

module.exports = mongoose.model('TimeData', timeDataSchema);