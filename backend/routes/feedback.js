const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const { authenticateToken } = require('./auth');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many feedback submissions, please try again later'
});

router.post('/submit', authenticateToken, submitLimiter, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const feedback = await Feedback.create({
      userEmail: req.user.email,
      message: message.trim(),
      status: 'received'
    });
    
    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      id: feedback._id
    });
  } catch (error) {
    console.error('Feedback submission error:', error);
    res.status(500).json({ error: 'Server error during feedback submission', details: error.message });
  }
});

router.get('/all', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const allFeedback = await Feedback.find().sort({ createdAt: -1 }).lean();
    
    res.status(200).json({
      success: true,
      feedback: allFeedback
    });
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ error: 'Server error while retrieving feedback', details: error.message });
  }
});

router.patch('/status/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid feedback ID' });
    }
    
    if (!status || !['received', 'reviewed', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status; must be received, reviewed, or resolved' });
    }
    
    const feedback = await Feedback.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    ).lean();
    
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }
    
    res.status(200).json({
      success: true,
      message: 'Feedback status updated',
      feedback
    });
  } catch (error) {
    console.error('Update feedback status error:', error);
    res.status(500).json({ error: 'Server error while updating feedback', details: error.message });
  }
});

router.get('/my', authenticateToken, async (req, res) => {
  try {
    const myFeedback = await Feedback.getUserFeedback(req.user.email);
    
    res.status(200).json({
      success: true,
      feedback: myFeedback
    });
  } catch (error) {
    console.error('Get my feedback error:', error);
    res.status(500).json({ error: 'Server error while retrieving feedback', details: error.message });
  }
});

module.exports = router;