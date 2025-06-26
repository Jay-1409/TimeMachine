const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  status: { type: String, default: 'received' },
});

module.exports = mongoose.model('Feedback', feedbackSchema);