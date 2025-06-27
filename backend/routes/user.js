const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.post('/save-email', async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  try {
    await User.findOneAndUpdate(
      { email },
      { email, lastUpdated: new Date() },
      { upsert: true }
    );
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving email:', error);
    res.status(500).json({ error: 'Failed to save email' });
  }
});

router.get('/get-email/:email', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    res.status(200).json({ email: user?.email || null });
  } catch (error) {
    console.error('Error fetching email:', error);
    res.status(500).json({ error: 'Failed to fetch email' });
  }
});

module.exports = router;