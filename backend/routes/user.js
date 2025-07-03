const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.post('/save-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const user = await User.findOneAndUpdate(
      { email },
      { email, lastUpdated: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true, email: user.email });
  } catch (error) {
    console.error('Save email error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

router.get('/get-email/:email', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, email: user.email });
  } catch (error) {
    console.error('Get email error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

module.exports = router;