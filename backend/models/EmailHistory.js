const mongoose = require('mongoose');

const emailHistorySchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  date: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  status: { type: String, default: 'sent' },
  error: String,
});

module.exports = mongoose.model('EmailHistory', emailHistorySchema);