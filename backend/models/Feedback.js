const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  userEmail: {
    type: String,
    required: true,
    index: true,
    validate: {
      validator: value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      message: 'Invalid email format'
    }
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['received', 'reviewed', 'resolved'],
    default: 'received'
  }
}, { timestamps: true });

feedbackSchema.statics.getUserFeedback = function(userEmail) {
  if (!userEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
    throw new Error('Valid user email is required');
  }
  return this.find({ userEmail }).sort({ createdAt: -1 }).lean();
};

module.exports = mongoose.model('Feedback', feedbackSchema);