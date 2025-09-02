const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const { authenticateToken } = require('./auth');

router.post('/submit', authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const feedback = await Feedback.create({
      userEmail: req.user.email,
      message,
      timestamp: new Date(),
      status: 'received'
    });
    
    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      id: feedback._id
    });
    
  } catch (error) {
    console.error('Feedback submission error:', error);
    res.status(500).json({ error: 'Server error during feedback submission' });
  }
});

router.get('/all', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const allFeedback = await Feedback.find()
      .sort({ timestamp: -1 });
    
    res.status(200).json({
      success: true,
      feedback: allFeedback
    });
    
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ error: 'Server error while retrieving feedback' });
  }
});

router.patch('/status/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    const feedback = await Feedback.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );
    
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
    res.status(500).json({ error: 'Server error while updating feedback' });
  }
});

router.get('/my', authenticateToken, async (req, res) => {
  try {
    const myFeedback = await Feedback.find({ userEmail: req.user.email })
      .sort({ timestamp: -1 });
    
    res.status(200).json({
      success: true,
      feedback: myFeedback
    });
    
  } catch (error) {
    console.error('Get my feedback error:', error);
    res.status(500).json({ error: 'Server error while retrieving feedback' });
  }
});

module.exports = router;
