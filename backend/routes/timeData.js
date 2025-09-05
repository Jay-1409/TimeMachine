const express = require('express');
const router = express.Router();
const TimeData = require('../models/TimeData');
const User = require('../models/User');
const { authenticateToken } = require('./auth');
const { getUserTimezoneDate, getTimezoneNameFromOffset } = require('../utils/timezone');

const ALLOWED_CATEGORIES = ['Work', 'Social', 'Entertainment', 'Professional', 'Other'];

router.use(authenticateToken);

// Merge overlapping/contiguous session intervals and sum their durations
function sumMergedSessions(sessions) {
  try {
    const items = (Array.isArray(sessions) ? sessions : [])
      .filter(s => s && Number.isFinite(s.startTime) && Number.isFinite(s.endTime) && s.endTime > s.startTime)
      .map(s => ({ start: Number(s.startTime), end: Number(s.endTime) }))
      .sort((a, b) => a.start - b.start);
    if (!items.length) return 0;
    let total = 0;
    let curStart = items[0].start;
    let curEnd = items[0].end;
    for (let i = 1; i < items.length; i++) {
      const it = items[i];
      if (it.start <= curEnd) {
        // Overlap or touch
        if (it.end > curEnd) curEnd = it.end;
      } else {
        total += (curEnd - curStart);
        curStart = it.start;
        curEnd = it.end;
      }
    }
    total += (curEnd - curStart);
    return Math.max(0, total);
  } catch (_) {
    return 0;
  }
}

router.post('/sync', async (req, res) => {
  try {
    const { date, domain, sessions, category = 'Other', timezone = 0, timezoneName = 'UTC' } = req.body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format (use YYYY-MM-DD)' });
    }
    if (!domain || !/^(?!:\/\/)([a-zA-Z0-9-_]+\.)*[a-zA-Z0-9][a-zA-Z0-9-_]+\.[a-zA-Z]{2,}$/.test(domain)) {
      return res.status(400).json({ error: 'Invalid domain format' });
    }
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return res.status(400).json({ error: 'Sessions must be a non-empty array' });
    }
    if (!ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    if (!Number.isInteger(timezone) || timezone < -720 || timezone > 840) {
      return res.status(400).json({ error: 'Invalid timezone offset; must be an integer between -720 and 840' });
    }
    if (timezoneName && !/^[A-Za-z]+\/[A-Za-z]+(_[A-Za-z]+)?$/.test(timezoneName) && timezoneName !== 'UTC') {
      return res.status(400).json({ error: 'Invalid IANA timezone name' });
    }

    const MAX_SESSION_DURATION = 12 * 60 * 60 * 1000;
    const validatedSessions = sessions.filter(session => {
      if (!session || typeof session.startTime !== 'number' || typeof session.endTime !== 'number' || 
          typeof session.duration !== 'number' || session.duration <= 0 || 
          session.endTime <= session.startTime) {
        console.warn(`Skipping invalid session for ${domain}: `, session);
        return false;
      }
      if (session.duration !== session.endTime - session.startTime) {
        console.warn(`Invalid duration for ${domain}; adjusting to endTime - startTime`);
        session.duration = session.endTime - session.startTime;
      }
      if (session.duration > MAX_SESSION_DURATION) {
        console.warn(`Capping session duration for ${domain}: ${session.duration}ms -> ${MAX_SESSION_DURATION}ms`);
        session.duration = MAX_SESSION_DURATION;
        session.endTime = session.startTime + MAX_SESSION_DURATION;
      }
      session.userLocalStartTime = new Date(session.startTime - (timezone * 60000));
      session.userLocalEndTime = new Date(session.endTime - (timezone * 60000));
      return true;
    });

    if (validatedSessions.length === 0) {
      return res.status(400).json({ error: 'No valid sessions provided' });
    }

    // Use the provided 'date' (derived from the session start time in the extension)
    // to ensure sessions aggregate into the correct local day, not the server's current day.
    const userLocalDate = date; // already validated as YYYY-MM-DD

    // Deduplicate by (startTime, endTime) pair to avoid exact replays
    const existingRecord = await TimeData.findOne({ userEmail: req.user.email, userLocalDate, domain }).lean();
    const existingPairs = new Set(
      (existingRecord?.sessions || [])
        .filter(s => s && typeof s.startTime === 'number' && typeof s.endTime === 'number')
        .map(s => `${s.startTime}-${s.endTime}`)
    );

    const newSessions = validatedSessions.filter(s => !existingPairs.has(`${s.startTime}-${s.endTime}`));
    if (newSessions.length === 0) {
      // No-op; return current record
      return res.status(200).json({ success: true, timeData: existingRecord || null, userLocalDate, deduped: true });
    }

    // Recompute totalTime from merged intervals to avoid inflation from overlaps
    const allSessions = [
      ...((existingRecord?.sessions || []).filter(s => s && Number.isFinite(s.startTime) && Number.isFinite(s.endTime))),
      ...newSessions
    ];
    const mergedTotal = sumMergedSessions(allSessions);
    const MAX_DAILY_TIME = 24 * 60 * 60 * 1000;
    const totalTime = Math.min(mergedTotal, MAX_DAILY_TIME);

    const timeData = await TimeData.findOneAndUpdate(
      { userEmail: req.user.email, userLocalDate, domain },
      {
        $set: {
          totalTime,
          category,
          timezone: {
            name: timezoneName,
            offset: timezone
          },
          date,
          utcDate: new Date()
        },
        $push: { sessions: { $each: newSessions } },
        $setOnInsert: { userLocalDate }
      },
      { upsert: true, new: true, runValidators: true }
    ).lean();

    res.status(200).json({ success: true, timeData, userLocalDate });
  } catch (error) {
    console.error('Error in /api/time-data/sync:', error);
    res.status(500).json({
      error: 'Failed to sync data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/report/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;
    const { date, endDate, timezone = '0', timezoneName = 'UTC', useUserTimezone = 'false' } = req.query;

    if (userEmail !== req.user.email && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format (use YYYY-MM-DD)' });
    }
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ error: 'Invalid endDate format (use YYYY-MM-DD)' });
    }
    const timezoneOffset = parseInt(timezone, 10);
    if (isNaN(timezoneOffset) || timezoneOffset < -720 || timezoneOffset > 840) {
      return res.status(400).json({ error: 'Invalid timezone offset; must be an integer between -720 and 840' });
    }
    if (timezoneName && !/^[A-Za-z]+\/[A-Za-z]+(_[A-Za-z]+)?$/.test(timezoneName) && timezoneName !== 'UTC') {
      return res.status(400).json({ error: 'Invalid IANA timezone name' });
    }

    let startUserDate = date;
    let endUserDate = endDate || date;
    if (useUserTimezone === 'true') {
      const startTimestamp = new Date(date + 'T00:00:00.000Z').getTime();
      const endTimestamp = new Date((endDate || date) + 'T23:59:59.999Z').getTime();
      startUserDate = getUserTimezoneDate(startTimestamp, timezoneOffset);
      endUserDate = getUserTimezoneDate(endTimestamp, timezoneOffset);
    }

    const timeData = await TimeData.find({
      userEmail,
      userLocalDate: { $gte: startUserDate, $lte: endUserDate }
    }).lean();

    const formattedData = timeData.map(entry => {
      const computedTotal = sumMergedSessions(entry.sessions || []);
      return {
        domain: entry.domain,
        date: entry.userLocalDate,
        sessions: entry.sessions || [],
        totalTime: Math.min(computedTotal || entry.totalTime || 0, 24 * 60 * 60 * 1000),
        category: ALLOWED_CATEGORIES.includes(entry.category) ? entry.category : 'Other',
        timezone: entry.timezone || { name: timezoneName, offset: timezoneOffset },
        userLocalDate: entry.userLocalDate
      };
    });

    res.status(200).json({
      data: formattedData,
      timezone: { name: timezoneName, offset: timezoneOffset },
      dateRange: { start: startUserDate, end: endUserDate },
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({
      error: 'Failed to fetch report',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/refresh/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;
    const { date, timezone = '0', timezoneName = 'UTC', useUserTimezone = 'false' } = req.query;

    if (userEmail !== req.user.email && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format (use YYYY-MM-DD)' });
    }
    const timezoneOffset = parseInt(timezone, 10);
    if (isNaN(timezoneOffset) || timezoneOffset < -720 || timezoneOffset > 840) {
      return res.status(400).json({ error: 'Invalid timezone offset; must be an integer between -720 and 840' });
    }
    if (timezoneName && !/^[A-Za-z]+\/[A-Za-z]+(_[A-Za-z]+)?$/.test(timezoneName) && timezoneName !== 'UTC') {
      return res.status(400).json({ error: 'Invalid IANA timezone name' });
    }

    const userLocalDate = useUserTimezone === 'true' 
      ? getUserTimezoneDate(Date.now(), timezoneOffset)
      : (date || getUserTimezoneDate(Date.now(), timezoneOffset));

    const rows = await TimeData.find({ userEmail, userLocalDate }).lean();
    const data = rows.map(entry => ({
      domain: entry.domain,
      date: entry.userLocalDate,
      totalTime: Math.min(sumMergedSessions(entry.sessions || []) || entry.totalTime || 0, 24 * 60 * 60 * 1000),
      category: ALLOWED_CATEGORIES.includes(entry.category) ? entry.category : 'Other',
      sessions: entry.sessions || [],
      timezone: entry.timezone || { name: timezoneName, offset: timezoneOffset }
    }));

    const isNewDay = await TimeData.isNewDayForUser(userEmail, timezoneOffset);

    res.json({
      success: true,
      date: userLocalDate,
      count: data.length,
      serverTime: new Date().toISOString(),
      userTime: new Date(Date.now() - (timezoneOffset * 60000)).toISOString(),
      isNewDay,
      timezone: { name: timezoneName, offset: timezoneOffset },
      data
    });
  } catch (error) {
    console.error('Error in /api/time-data/refresh:', error);
    res.status(500).json({
      error: 'Failed to refresh data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/debug/recent/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;

    if (userEmail !== req.user.email && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const docs = await TimeData.find({ userEmail }).sort({ updatedAt: -1 }).limit(10).lean();
    res.json({ count: docs.length, docs });
  } catch (error) {
    console.error('Debug recent error:', error);
    res.status(500).json({
      error: 'Failed debug fetch',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.patch('/category', async (req, res) => {
  try {
    const { date, domain, category } = req.body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format (use YYYY-MM-DD)' });
    }
    if (!domain || !/^(?!:\/\/)([a-zA-Z0-9-_]+\.)*[a-zA-Z0-9][a-zA-Z0-9-_]+\.[a-zA-Z]{2,}$/.test(domain)) {
      return res.status(400).json({ error: 'Invalid domain format' });
    }
    if (!category || !ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const timeData = await TimeData.findOneAndUpdate(
      { userEmail: req.user.email, date, domain },
      { $set: { category } },
      { new: true, runValidators: true }
    ).lean();

    if (!timeData) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.status(200).json({ success: true, timeData });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({
      error: 'Failed to update category',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.post('/check-activity', async (req, res) => {
  try {
    const { date, timezone = 0, timezoneName = 'UTC', useUserTimezone = false } = req.body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format (use YYYY-MM-DD)' });
    }
    if (!Number.isInteger(timezone) || timezone < -720 || timezone > 840) {
      return res.status(400).json({ error: 'Invalid timezone offset; must be an integer between -720 and 840' });
    }
    if (timezoneName && !/^[A-Za-z]+\/[A-Za-z]+(_[A-Za-z]+)?$/.test(timezoneName) && timezoneName !== 'UTC') {
      return res.status(400).json({ error: 'Invalid IANA timezone name' });
    }

    const queryDate = useUserTimezone ? getUserTimezoneDate(new Date(date + 'T00:00:00.000Z').getTime(), timezone) : date;
    const timeDataCount = await TimeData.countDocuments({
      userEmail: req.user.email,
      userLocalDate: queryDate,
      totalTime: { $gt: 0 }
    });

    const isNewDay = await TimeData.isNewDayForUser(req.user.email, timezone);

    res.json({
      hasActivity: timeDataCount > 0,
      count: timeDataCount,
      queryDate,
      originalDate: date,
      isNewDay,
      timezone: { name: timezoneName, offset: timezone },
      userTime: new Date(Date.now() - (timezone * 60000)).toISOString()
    });
  } catch (error) {
    console.error('Error checking activity:', error);
    res.status(500).json({
      error: 'Failed to check for activity',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.post('/update-timezone', async (req, res) => {
  try {
    const { timezoneName = 'UTC', timezoneOffset } = req.body;

    if (!Number.isInteger(timezoneOffset) || timezoneOffset < -720 || timezoneOffset > 840) {
      return res.status(400).json({ error: 'Invalid timezone offset; must be an integer between -720 and 840' });
    }
    if (timezoneName && !/^[A-Za-z]+\/[A-Za-z]+(_[A-Za-z]+)?$/.test(timezoneName) && timezoneName !== 'UTC') {
      return res.status(400).json({ error: 'Invalid IANA timezone name' });
    }

    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await user.updateOne({ 
      timezone: { name: timezoneName, offset: timezoneOffset },
      updatedAt: new Date()
    });

    res.json({
      success: true,
      message: 'Timezone updated successfully',
      timezone: { name: timezoneName, offset: timezoneOffset }
    });
  } catch (error) {
    console.error('Error updating timezone:', error);
    res.status(500).json({
      error: 'Failed to update timezone',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.post('/check-new-day', async (req, res) => {
  try {
    const { lastActiveDate, timezone = 0, timezoneName = 'UTC' } = req.body;

    if (lastActiveDate && !/^\d{4}-\d{2}-\d{2}$/.test(lastActiveDate)) {
      return res.status(400).json({ error: 'Invalid lastActiveDate format (use YYYY-MM-DD)' });
    }
    if (!Number.isInteger(timezone) || timezone < -720 || timezone > 840) {
      return res.status(400).json({ error: 'Invalid timezone offset; must be an integer between -720 and 840' });
    }
    if (timezoneName && !/^[A-Za-z]+\/[A-Za-z]+(_[A-Za-z]+)?$/.test(timezoneName) && timezoneName !== 'UTC') {
      return res.status(400).json({ error: 'Invalid IANA timezone name' });
    }

    const currentUserDate = getUserTimezoneDate(Date.now(), timezone);
    const isNewDay = !lastActiveDate || currentUserDate !== lastActiveDate;

    if (isNewDay && lastActiveDate) {
      await TimeData.processMidnightReset(req.user.email, timezone, timezoneName);
    }

    res.json({
      isNewDay,
      currentUserDate,
      lastActiveDate,
      timezone: { name: timezoneName, offset: timezone },
      userTime: new Date(Date.now() - (timezone * 60000)).toISOString(),
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking new day:', error);
    res.status(500).json({
      error: 'Failed to check new day',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;