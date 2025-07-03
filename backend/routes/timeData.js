const express = require('express');
const router = express.Router();
const TimeData = require('../models/TimeData');

router.post('/sync', async (req, res) => {
  const { userEmail, date, domain, timeSpent } = req.body;
  if (!userEmail || !date || !domain || typeof timeSpent !== 'number') {
    return res.status(400).json({ error: 'Missing or invalid required fields' });
  }

  try {
    const timeData = await TimeData.findOneAndUpdate(
      { userEmail, date, domain },
      { $inc: { totalTime: Math.max(0, Math.floor(timeSpent)) } },
      { upsert: true, new: true }
    );
    res.status(200).json({ success: true, timeData });
  } catch (error) {
    console.error('Error syncing time data:', error.message);
    res.status(500).json({ error: 'Failed to sync time data', details: error.message });
  }
});

router.get('/report/:userEmail', async (req, res) => {
  const { userEmail } = req.params;
  const date = req.query.date || new Date().toISOString().split('T')[0];

  try {
    const timeData = await TimeData.find({ userEmail, date });
    res.status(200).json(timeData);
  } catch (error) {
    console.error('Error fetching report:', error.message);
    res.status(500).json({ error: 'Failed to fetch report', details: error.message });
  }
});

module.exports = router;