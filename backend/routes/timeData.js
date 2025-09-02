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
  const { 
    userEmail, 
    date, 
    domain, 
    sessions, 
    category = "Other", 
    timezone = 0,
    timezoneName = 'UTC'
  } = req.body;

  if (!userEmail || !date || !domain || !sessions || !Array.isArray(sessions)) {
    console.warn(
      "Backend Sync Error: Missing or invalid required fields in request body:",
      req.body
    );
    return res
      .status(400)
      .json({ error: "Missing or invalid required fields" });
  }

  const MAX_SESSION_DURATION = 12 * 60 * 60 * 1000;
  
  const validatedSessions = sessions.filter(session => {
    if (!session || typeof session.duration !== 'number' || session.duration <= 0) {
      console.warn(`Skipping invalid session for ${domain}: `, session);
      return false;
    }
    
    if (session.duration > MAX_SESSION_DURATION) {
      console.warn(`Capping extremely long session duration for ${domain}: ${session.duration}ms -> ${MAX_SESSION_DURATION}ms`);
      session.duration = MAX_SESSION_DURATION;
    }
    
    if (session.startTime && session.endTime) {
      session.userLocalStartTime = new Date(session.startTime - (timezone * 60000));
      session.userLocalEndTime = new Date(session.endTime - (timezone * 60000));
    }
    
    return true;
  });

  const newTotalTimeForSessionBatch = validatedSessions.reduce(
    (sum, s) => sum + (s.duration || 0),
    0
  );

  try {
    const userLocalDate = TimeData.getUserTimezoneDate(Date.now(), timezone);
    
    const existingRecord = await TimeData.findOne({ 
      userEmail, 
      userLocalDate, 
      domain 
    });
    
    let newTotalTime = newTotalTimeForSessionBatch;
    
    if (existingRecord) {
      const MAX_DAILY_TIME = 24 * 60 * 60 * 1000;
      newTotalTime = Math.min(existingRecord.totalTime + newTotalTimeForSessionBatch, MAX_DAILY_TIME);
      
      if (existingRecord.totalTime >= MAX_DAILY_TIME) {
        console.warn(`Domain ${domain} already reached maximum daily time (${MAX_DAILY_TIME}ms) for user ${userEmail} on ${userLocalDate}`);
        newTotalTime = MAX_DAILY_TIME;
      }
    }

    const timeData = await TimeData.findOneAndUpdate(
      { userEmail, userLocalDate, domain },
      {
        $set: { 
          totalTime: newTotalTime, 
          category,
          timezone: {
            name: timezoneName,
            offset: timezone
          },
          date: date,
          utcDate: new Date()
        },
        $push: { sessions: { $each: validatedSessions } },
        $setOnInsert: { 
          createdAt: new Date(),
          userLocalDate: userLocalDate
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    );

    res.status(200).json({ success: true, timeData, userLocalDate });
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
    const endDate = req.query.endDate || date;
    const timezoneOffset = parseInt(req.query.timezone || "0", 10);
    const timezoneName = req.query.timezoneName || 'UTC';

    if (!userEmail) {
      return res.status(400).json({ error: "User email is required" });
    }

    let startUserDate, endUserDate;
    
    if (req.query.useUserTimezone === 'true') {
      const startTimestamp = new Date(date + 'T00:00:00.000Z').getTime();
      const endTimestamp = new Date(endDate + 'T23:59:59.999Z').getTime();
      
      startUserDate = TimeData.getUserTimezoneDate(startTimestamp, timezoneOffset);
      endUserDate = TimeData.getUserTimezoneDate(endTimestamp, timezoneOffset);
    } else {
      startUserDate = date;
      endUserDate = endDate;
    }

    console.log(`Fetching report for ${userEmail} from ${startUserDate} to ${endUserDate} (timezone: ${timezoneName}, offset: ${timezoneOffset})`);

    const dateRange = { $gte: startUserDate, $lte: endUserDate };
    
    let timeData = await TimeData.find({ 
      userEmail, 
      userLocalDate: dateRange
    }).lean();

    if (!timeData || timeData.length === 0) {
      timeData = await TimeData.find({ 
        userEmail, 
        date: dateRange
      }).lean();
    }

    const formattedData = timeData.map((entry) => ({
      domain: entry.domain,
      date: entry.userLocalDate || entry.date,
      sessions: entry.sessions || [],
      totalTime: entry.totalTime || 0,
      category: ALLOWED_CATEGORIES.includes(entry.category)
        ? entry.category
        : "Other",
      timezone: entry.timezone || { name: timezoneName, offset: timezoneOffset },
      userLocalDate: entry.userLocalDate
    }));

    res.status(200).json({
      data: formattedData,
      timezone: { name: timezoneName, offset: timezoneOffset },
      dateRange: { start: startUserDate, end: endUserDate },
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error fetching report:", error);
    res.status(500).json({
      error: "Failed to fetch report",
      details: error.message,
    });
  }
});

router.get('/refresh/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const timezoneOffset = parseInt(req.query.timezone || "0", 10);
    const timezoneName = req.query.timezoneName || 'UTC';
    
    if (!userEmail) return res.status(400).json({ error: 'User email is required' });

    const userLocalDate = req.query.useUserTimezone === 'true' 
      ? TimeData.getUserTimezoneDate(Date.now(), timezoneOffset)
      : date;

    let rows = await TimeData.find({ userEmail, userLocalDate }).lean();
    
    if (!rows || rows.length === 0) {
      rows = await TimeData.find({ userEmail, date }).lean();
    }

    const data = rows.map(entry => ({
      domain: entry.domain,
      date: entry.userLocalDate || entry.date,
      totalTime: entry.totalTime || 0,
      category: ALLOWED_CATEGORIES.includes(entry.category) ? entry.category : 'Other',
      sessions: entry.sessions || [],
      timezone: entry.timezone || { name: timezoneName, offset: timezoneOffset }
    }));

    const isNewDay = await TimeData.isNewDayForUser(userEmail, timezoneOffset);
    
    return res.json({ 
      success: true, 
      date: userLocalDate, 
      count: data.length, 
      serverTime: new Date().toISOString(),
      userTime: new Date(Date.now() - (timezoneOffset * 60000)).toISOString(),
      isNewDay,
      timezone: { name: timezoneName, offset: timezoneOffset },
      data 
    });
  } catch (e) {
    console.error('Error in /api/time-data/refresh:', e);
    return res.status(500).json({ error: 'Failed to refresh data', details: e.message });
  }
});

router.get('/debug/recent/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;
    if (!userEmail) return res.status(400).json({ error: 'User email is required' });
    const docs = await TimeData.find({ userEmail }).sort({ updatedAt: -1 }).limit(10).lean();
    res.json({ count: docs.length, docs });
  } catch (e) {
    console.error('debug recent error:', e);
    res.status(500).json({ error: 'Failed debug fetch', details: e.message });
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

router.post("/check-activity", async (req, res) => {
  const { date, userEmail, timezone = 0, timezoneName = 'UTC', useUserTimezone = false } = req.body;
  
  if (!date || !userEmail) {
    return res.status(400).json({ error: "Date and userEmail are required" });
  }
  
  try {
    let queryDate = date;
    
    if (useUserTimezone) {
      const timestamp = new Date(date + 'T00:00:00.000Z').getTime();
      queryDate = TimeData.getUserTimezoneDate(timestamp, timezone);
    }
    
    let timeDataCount = await TimeData.countDocuments({
      userEmail,
      userLocalDate: queryDate,
      totalTime: { $gt: 0 }
    });
    
    if (timeDataCount === 0) {
      timeDataCount = await TimeData.countDocuments({
        userEmail,
        date: queryDate,
        totalTime: { $gt: 0 }
      });
    }
    
    const isNewDay = await TimeData.isNewDayForUser(userEmail, timezone);
    
    return res.json({ 
      hasActivity: timeDataCount > 0,
      count: timeDataCount,
      queryDate,
      originalDate: date,
      isNewDay,
      timezone: { name: timezoneName, offset: timezone },
      userTime: new Date(Date.now() - (timezone * 60000)).toISOString()
    });
  } catch (error) {
    console.error("Error checking activity:", error);
    return res.status(500).json({ 
      error: "Failed to check for activity",
      details: error.message
    });
  }
});

router.post("/update-timezone", async (req, res) => {
  const { userEmail, timezoneName, timezoneOffset } = req.body;
  
  if (!userEmail || typeof timezoneOffset !== 'number') {
    return res.status(400).json({ error: "userEmail and timezoneOffset are required" });
  }
  
  try {
    const user = await User.findByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    await user.updateTimezone(timezoneName || 'UTC', timezoneOffset);
    
    return res.json({ 
      success: true,
      message: "Timezone updated successfully",
      timezone: {
        name: timezoneName || 'UTC',
        offset: timezoneOffset
      }
    });
  } catch (error) {
    console.error("Error updating timezone:", error);
    return res.status(500).json({ 
      error: "Failed to update timezone",
      details: error.message
    });
  }
});

router.post("/check-new-day", async (req, res) => {
  const { userEmail, lastActiveDate, timezone = 0, timezoneName = 'UTC' } = req.body;
  
  if (!userEmail) {
    return res.status(400).json({ error: "userEmail is required" });
  }
  
  try {
    const currentUserDate = TimeData.getUserTimezoneDate(Date.now(), timezone);
    const isNewDay = !lastActiveDate || currentUserDate !== lastActiveDate;
    
    if (isNewDay && lastActiveDate) {
      await TimeData.processMidnightReset(userEmail, timezone, timezoneName);
    }
    
    return res.json({ 
      isNewDay,
      currentUserDate,
      lastActiveDate,
      timezone: { name: timezoneName, offset: timezone },
      userTime: new Date(Date.now() - (timezone * 60000)).toISOString(),
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error checking new day:", error);
    return res.status(500).json({ 
      error: "Failed to check new day",
      details: error.message
    });
  }
});

module.exports = router;
