const express = require('express');
const router = express.Router();
const FocusSession = require('../models/FocusSession');
const { authenticateToken } = require('./auth');
const mongoose = require('mongoose');
const { getUserTimezoneDate, getUserDayBounds } = require('../utils/timezone');

router.use(authenticateToken);

const validateSessionData = (data, isPatch = false) => {
  const { duration, startTime, endTime, status, sessionType, productivity, notes } = data;
  const errors = [];

  if (!isPatch) {
    if (!duration || !startTime || !endTime || !status) {
      errors.push('Missing required fields: duration, startTime, endTime, status');
    }
  }

  if (duration !== undefined) {
    if (!Number.isInteger(duration) || duration < 1 || duration > 480) {
      errors.push('Duration must be an integer between 1 and 480 minutes');
    }
  }

  if (startTime) {
    const startDate = new Date(startTime);
    if (isNaN(startDate)) errors.push('Invalid startTime');
  }

  if (endTime) {
    const endDate = new Date(endTime);
    if (isNaN(endDate)) errors.push('Invalid endTime');
  }

  if (status && !['completed', 'interrupted'].includes(status)) {
    errors.push('Invalid status; must be completed or interrupted');
  }

  if (sessionType && !['focus', 'break'].includes(sessionType)) {
    errors.push('Invalid sessionType; must be focus or break');
  }

  if (productivity !== undefined) {
    if (!Number.isInteger(productivity) || productivity < 0 || productivity > 100) {
      errors.push('Productivity must be an integer between 0 and 100');
    }
  }

  if (notes !== undefined && notes.length > 500) {
    errors.push('Notes must not exceed 500 characters');
  }

  return errors.length ? { valid: false, message: errors.join('; ') } : { valid: true };
};

const handleError = (res, error, message) => {
  console.error(`${message}:`, error);
  res.status(500).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
};

router.post('/', async (req, res) => {
  try {
  const userId = req.user && (req.user.id || req.user._id);
    const validation = validateSessionData(req.body);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const { duration, startTime, endTime, status, sessionType = 'focus', productivity = 0, notes = '' } = req.body;
  const focusSession = new FocusSession({
      userId,
      duration,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      status,
      sessionType,
      productivity,
      notes: notes.trim()
    });

    await focusSession.save();
    res.status(201).json({
      success: true,
      message: 'Focus session created',
      session: {
        id: focusSession._id,
        duration: focusSession.duration,
        startTime: focusSession.startTime,
        endTime: focusSession.endTime,
        status: focusSession.status,
        sessionType: focusSession.sessionType
      }
    });
  } catch (error) {
    if (error && (error.name === 'ValidationError' || String(error.message || '').includes('validation'))) {
      return res.status(400).json({ success: false, message: error.message });
    }
    handleError(res, error, 'Failed to create focus session');
  }
});

router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, offset = 0, status, date, timezone = '0', useUserTimezone = 'false' } = req.query;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    if (userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const parsedLimit = Math.max(1, parseInt(limit));
    const parsedOffset = Math.max(0, parseInt(offset));
    const query = { userId };

    if (status && ['completed', 'interrupted'].includes(status)) {
      query.status = status;
    }

    if (date) {
      const tz = parseInt(timezone, 10);
      if (isNaN(tz) || tz < -720 || tz > 840) {
        return res.status(400).json({ success: false, message: 'Invalid timezone offset' });
      }
      if (useUserTimezone === 'true') {
        const userDateStr = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getUserTimezoneDate(Date.parse(date) || Date.now(), tz);
        if (!userDateStr) return res.status(400).json({ success: false, message: 'Invalid date' });
        const { startOfDay, endOfDay } = getUserDayBounds(userDateStr, tz);
        query.startTime = { $gte: new Date(startOfDay), $lte: new Date(endOfDay) };
      } else {
        const queryDate = new Date(date);
        if (isNaN(queryDate)) return res.status(400).json({ success: false, message: 'Invalid date' });
        query.startTime = {
          $gte: new Date(queryDate.setHours(0, 0, 0, 0)),
          $lte: new Date(queryDate.setHours(23, 59, 59, 999))
        };
      }
    }

    const sessions = await FocusSession.find(query)
      .sort({ startTime: -1 })
      .limit(parsedLimit)
      .skip(parsedOffset)
      .select('-__v')
      .lean();

    res.json({ success: true, sessions, count: sessions.length });
  } catch (error) {
    handleError(res, error, 'Failed to fetch focus sessions');
  }
});

router.get('/:userId/stats/daily', async (req, res) => {
  try {
    const { userId } = req.params;
    const { date, timezone = '0', useUserTimezone = 'false' } = req.query;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    if (userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const tz = parseInt(timezone, 10);
    if (isNaN(tz) || tz < -720 || tz > 840) {
      return res.status(400).json({ success: false, message: 'Invalid timezone offset' });
    }

    let startBound, endBound, dateLabel;
    if (useUserTimezone === 'true') {
      const userDateStr = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getUserTimezoneDate(date ? Date.parse(date) : Date.now(), tz);
      if (!userDateStr) return res.status(400).json({ success: false, message: 'Invalid date' });
      const { startOfDay, endOfDay } = getUserDayBounds(userDateStr, tz);
      startBound = new Date(startOfDay);
      endBound = new Date(endOfDay);
      dateLabel = userDateStr;
    } else {
      const queryDate = date ? new Date(date) : new Date();
      if (isNaN(queryDate)) return res.status(400).json({ success: false, message: 'Invalid date' });
      startBound = new Date(queryDate.setHours(0, 0, 0, 0));
      endBound = new Date(queryDate.setHours(23, 59, 59, 999));
      dateLabel = queryDate.toDateString();
    }

    const sessions = await FocusSession.find({
      userId,
      startTime: { $gte: startBound, $lte: endBound },
      status: 'completed'
    }).lean();

    const totalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
    const sessionCount = sessions.length;
    const productivity = sessionCount ? Math.round(sessions.reduce((sum, s) => sum + (s.productivity || 0), 0) / sessionCount) : 0;

    res.json({
      success: true,
      date: dateLabel,
      stats: { totalMinutes, sessionCount, productivity, sessions: sessions.slice(-5) }
    });
  } catch (error) {
    handleError(res, error, 'Failed to fetch daily stats');
  }
});

router.get('/:userId/stats/weekly', async (req, res) => {
  try {
    const { userId } = req.params;
    const { weekStart } = req.query;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    if (userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const queryDate = weekStart ? new Date(weekStart) : new Date();
    if (isNaN(queryDate)) return res.status(400).json({ success: false, message: 'Invalid weekStart date' });

    const stats = await FocusSession.getWeeklyStats(userId, queryDate);
    res.json({ success: true, weekStart: queryDate.toDateString(), stats });
  } catch (error) {
    handleError(res, error, 'Failed to fetch weekly stats');
  }
});

router.delete('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!mongoose.isValidObjectId(sessionId)) {
      return res.status(400).json({ success: false, message: 'Invalid session ID' });
    }

    const session = await FocusSession.findOneAndDelete({ _id: sessionId, userId: req.user.id });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Focus session not found' });
    }

    res.json({ success: true, message: 'Focus session deleted' });
  } catch (error) {
    handleError(res, error, 'Failed to delete focus session');
  }
});

router.patch('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!mongoose.isValidObjectId(sessionId)) {
      return res.status(400).json({ success: false, message: 'Invalid session ID' });
    }

    const validation = validateSessionData(req.body, true);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const updates = {};
    const { duration, startTime, endTime, status, sessionType, productivity, notes } = req.body;
    if (duration !== undefined) updates.duration = duration;
    if (startTime) updates.startTime = new Date(startTime);
    if (endTime) updates.endTime = new Date(endTime);
    if (status) updates.status = status;
    if (sessionType) updates.sessionType = sessionType;
    if (productivity !== undefined) updates.productivity = productivity;
    if (notes !== undefined) updates.notes = notes.trim();

    const session = await FocusSession.findOneAndUpdate(
      { _id: sessionId, userId: req.user.id },
      updates,
      { new: true, runValidators: true }
    ).lean();

    if (!session) {
      return res.status(404).json({ success: false, message: 'Focus session not found' });
    }

    res.json({ success: true, message: 'Focus session updated', session });
  } catch (error) {
    handleError(res, error, 'Failed to update focus session');
  }
});

module.exports = router;