const express = require('express');
const router = express.Router();
const TimeData = require('../models/TimeData');

router.post('/sync', async (req, res) => {
  const { userEmail, date, domain, sessions } = req.body;
  if (!userEmail || !date || !domain || !sessions || !Array.isArray(sessions)) {
    return res.status(400).json({ error: 'Missing or invalid required fields' });
  }

  try {
    const validatedSessions = sessions.map(session => ({
      start: session.start,
      end: session.end,
      duration: Math.max(0, Math.floor(session.duration)), // Ensure non-negative integer
    }));

    await TimeData.findOneAndUpdate(
      { userEmail, date, domain },
      { $push: { sessions: { $each: validatedSessions } } },
      { upsert: true, new: true }
    );
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error syncing time data:', error);
    res.status(500).json({ error: 'Failed to sync time data' });
  }
});

router.get('/:userEmail/:date', async (req, res) => {
  const { userEmail, date } = req.params;
  try {
    const timeData = await TimeData.find({ userEmail, date });
    res.status(200).json(timeData);
  } catch (error) {
    console.error('Error fetching time data:', error);
    res.status(500).json({ error: 'Failed to fetch time data' });
  }
});

module.exports = router;