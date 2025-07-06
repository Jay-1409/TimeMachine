const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');

router.post('/store', async (req, res) => {
  const { message, userEmail, timestamp = new Date() } = req.body;
  if (!message || !userEmail) {
    return res.status(400).json({ error: 'Message and userEmail are required' });
  }

  try {
    const feedback = new Feedback({ userEmail, message, timestamp });
    await feedback.save();
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Feedback error:', error.message);
    res.status(500).json({ error: 'Failed to store feedback', details: error.message });
  }
});

module.exports = router;