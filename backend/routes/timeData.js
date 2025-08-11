const express = require("express");
const router = express.Router();
const TimeData = require("../models/TimeData");
const User = require("../models/User");

const ALLOWED_CATEGORIES = [
  "Work",
  "Social",
  "Entertainment",
  "Professional",
  "Other",
];

router.post("/sync", async (req, res) => {
  const { userEmail, date, domain, sessions, category = "Other", timezone = 0 } = req.body;

  if (!userEmail || !date || !domain || !sessions || !Array.isArray(sessions)) {
    console.warn(
      "Backend Sync Error: Missing or invalid required fields in request body:",
      req.body
    );
    return res
      .status(400)
      .json({ error: "Missing or invalid required fields" });
  }

  // Validate and cap session durations to prevent unrealistic values (max 12 hours per session)
  const MAX_SESSION_DURATION = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
  
  // Process and validate each session
  const validatedSessions = sessions.filter(session => {
    // Basic structural validation
    if (!session || typeof session.duration !== 'number' || session.duration <= 0) {
      console.warn(`Skipping invalid session for ${domain}: `, session);
      return false;
    }
    
    // Cap overly long durations
    if (session.duration > MAX_SESSION_DURATION) {
      console.warn(`Capping extremely long session duration for ${domain}: ${session.duration}ms -> ${MAX_SESSION_DURATION}ms`);
      session.duration = MAX_SESSION_DURATION;
    }
    
    return true;
  });

  // Calculate total time for this batch of sessions
  const newTotalTimeForSessionBatch = validatedSessions.reduce(
    (sum, s) => sum + (s.duration || 0),
    0
  );

  try {
    // Find existing record to check current totalTime
    const existingRecord = await TimeData.findOne({ userEmail, date, domain });
    let newTotalTime = newTotalTimeForSessionBatch;
    
    // If record exists, add the new time but cap at MAX_DAILY_TIME
    if (existingRecord) {
      const MAX_DAILY_TIME = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      newTotalTime = Math.min(existingRecord.totalTime + newTotalTimeForSessionBatch, MAX_DAILY_TIME);
      
      // If already at cap, log it but still add sessions for record keeping
      if (existingRecord.totalTime >= MAX_DAILY_TIME) {
        console.warn(`Domain ${domain} already reached maximum daily time (${MAX_DAILY_TIME}ms) for user ${userEmail} on ${date}`);
        // Still store the sessions but don't increment totalTime
        newTotalTime = MAX_DAILY_TIME;
      }
    }

    // Update the record with the new sessions
    const timeData = await TimeData.findOneAndUpdate(
      { userEmail, date, domain },
      {
        $set: { totalTime: newTotalTime, category, timezone },
        $push: { sessions: { $each: validatedSessions } },
        $setOnInsert: { createdAt: new Date() },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    );

    res.status(200).json({ success: true, timeData });
  } catch (error) {
    console.error("Error in /api/time-data/sync:", error);

    res
      .status(500)
      .json({ error: "Failed to sync data", details: error.message });
  }
});

router.get("/report/:userEmail", async (req, res) => {
  try {
    const { userEmail } = req.params;
    const date = req.query.date || new Date().toISOString().split("T")[0];
    const endDate = req.query.endDate || date; // Support for date range queries
    const timezoneOffset = parseInt(req.query.timezone || "0", 10); // Get user's timezone offset

    if (!userEmail) {
      return res.status(400).json({ error: "User email is required" });
    }

    // Create date range for the query
    const dateRange = { $gte: date, $lte: endDate };
    
    // Find all time data within the date range
    const timeData = await TimeData.find({ 
      userEmail, 
      date: dateRange
    }).lean();

    const formattedData = timeData.map((entry) => ({
      domain: entry.domain,
      date: entry.date,
      sessions: entry.sessions || [],
      totalTime: entry.totalTime || 0,
      category: ALLOWED_CATEGORIES.includes(entry.category)
        ? entry.category
        : "Other",
      timezone: entry.timezone || timezoneOffset, // Include timezone info
    }));

    res.status(200).json(formattedData);
  } catch (error) {
    console.error("Error fetching report:", error);
    res.status(500).json({
      error: "Failed to fetch report",
      details: error.message,
    });
  }
});

router.patch("/category", async (req, res) => {
  const { userEmail, date, domain, category } = req.body;

  if (!userEmail || !date || !domain || !category) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!ALLOWED_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }

  try {
    const timeData = await TimeData.findOneAndUpdate(
      { userEmail, date, domain },
      { $set: { category } },
      { new: true }
    );

    if (!timeData) {
      return res.status(404).json({ error: "Record not found" });
    }

    res.status(200).json({ success: true, timeData });
  } catch (error) {
    console.error("Error updating category:", error);
    res
      .status(500)
      .json({ error: "Failed to update category", details: error.message });
  }
});

// Route to check if there's any activity for a specific date
router.post("/check-activity", async (req, res) => {
  const { date, userEmail, timezone = 0 } = req.body;
  
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
      count: timeDataCount,
      timezone: timezone // Return the timezone that was used
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
