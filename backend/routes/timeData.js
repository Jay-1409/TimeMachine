const express = require('express');
const router = express.Router();
const TimeData = require('../models/TimeData');

router.post('/sync', async (req, res) => {
  try {
    const { userEmail, date, domain, sessions } = req.body;
    
    if (!userEmail || !date || !domain || !sessions || !Array.isArray(sessions)) {
      return res.status(400).json({ error: 'Missing or invalid required fields' });
    }

    // Calculate total time from sessions
    const totalTime = sessions.reduce((sum, session) => sum + (session.duration || 0), 0);

    // Update or create time data record
    const timeData = await TimeData.findOneAndUpdate(
      { userEmail, date, domain },
      { 
        $inc: { totalTime },
        $push: { sessions: { $each: sessions } },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, timeData });
  } catch (error) {
    console.error('Error syncing time data:', error);
    res.status(500).json({ error: 'Failed to sync time data', details: error.message });
  }
});

router.get('/report/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;
    const date = req.query.date || new Date().toISOString().split('T')[0];

    if (!userEmail) {
      return res.status(400).json({ error: 'User email is required' });
    }

    // Get time data for the specified user and date
    const timeData = await TimeData.find({ userEmail, date }).lean();

    // Ensure each entry has a sessions array
    const formattedData = timeData.map(entry => ({
      domain: entry.domain,
      sessions: entry.sessions || [],
      totalTime: entry.totalTime || 0
    }));

    res.status(200).json(formattedData);
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ 
      error: 'Failed to fetch report', 
      details: error.message 
    });
  }
});

module.exports = router;