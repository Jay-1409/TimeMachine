const express = require('express');
const TimeData = require('../models/TimeData');

// Route to check if there's any activity for a specific date
router.post("/check-activity", async (req, res) => {
  const { date, userEmail } = req.body;
  
  if (!date || !userEmail) {
    return res.status(400).json({ error: "Date and userEmail are required" });
  }
  
  try {
    // Check if there's any time data for this date
    const timeDataCount = await TimeData.countDocuments({
      userEmail,
      date: date,
      totalTime: { $gt: 0 } // Only count records with some activity
    });
    
    return res.json({ 
      hasActivity: timeDataCount > 0,
      count: timeDataCount
    });
  } catch (error) {
    console.error("Error checking activity:", error);
    return res.status(500).json({ 
      error: "Failed to check for activity",
      details: error.message
    });
  }
});

module.exports = router;
