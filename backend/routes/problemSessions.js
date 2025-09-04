const express = require('express');
const router = express.Router();
const ProblemSession = require('../models/ProblemSession');
const { authenticateToken } = require('./auth');
const mongoose = require('mongoose');
const { getUserTimezoneDate } = require('../utils/timezone');

router.use(authenticateToken);

const VALID_CATEGORIES = ['Coding', 'Math', 'Study', 'Research', 'Debug', 'Design', 'Other'];
const VALID_DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Expert'];
const VALID_STATUSES = ['active', 'paused', 'completed', 'abandoned'];

const validateSessionData = (data, isUpdate = false) => {
  const { title, category, difficulty, tags, url, timezone, reason, completionNotes, notes } = data;
  const errors = [];

  if (!isUpdate && !title) errors.push('Title is required');
  if (isUpdate && title === '' && !['description', 'category', 'difficulty', 'tags', 'notes'].some(k => data[k] !== undefined)) {
    errors.push('At least one field must be provided for update');
  }
  if (category && !VALID_CATEGORIES.includes(category)) errors.push('Invalid category');
  if (difficulty && !VALID_DIFFICULTIES.includes(difficulty)) errors.push('Invalid difficulty');
  if (url && !/^https?:\/\/.+$/.test(url)) errors.push('Invalid URL format');
  if (timezone !== undefined && (!Number.isInteger(timezone) || timezone < -720 || timezone > 840)) {
    errors.push('Invalid timezone offset; must be an integer between -720 and 840');
  }
  if (reason && reason.length > 200) errors.push('Pause reason must not exceed 200 characters');
  if (completionNotes && completionNotes.length > 1000) errors.push('Completion notes must not exceed 1000 characters');
  if (notes && notes.length > 1000) errors.push('Notes must not exceed 1000 characters');
  if (tags && (!Array.isArray(tags) || tags.some(tag => !tag.trim() || typeof tag !== 'string'))) {
    errors.push('Tags must be an array of non-empty strings');
  }

  return errors.length ? { valid: false, message: errors.join('; ') } : { valid: true };
};

const handleError = (res, error, message) => {
  console.error(`${message}:`, error);
  res.status(500).json({
    error: message,
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
};

router.post('/start', async (req, res) => {
  try {
    const validation = validateSessionData(req.body);
    if (!validation.valid) return res.status(400).json({ error: validation.message });

    const { title, description = '', category = 'Other', difficulty = 'Medium', tags = [], url = '', site = '', timezone = 0 } = req.body;
    const activeSession = await ProblemSession.getCurrentSession(req.user.email);
    if (activeSession) {
      return res.status(400).json({
        error: 'Active problem session exists',
        activeSession: { id: activeSession._id, title: activeSession.title, startTime: activeSession.startTime }
      });
    }

    const now = new Date();
    const session = new ProblemSession({
      userEmail: req.user.email,
      title: title.trim(),
      description: description.trim(),
      category,
      difficulty,
      tags: tags.slice(0, 10),
      url,
      site: site.trim(),
      startTime: now,
      userLocalDate: getUserTimezoneDate(now.getTime(), timezone),
      timezone: { offset: timezone }
    });

    await session.save();
    res.status(201).json({
      success: true,
      session: {
        id: session._id,
        title: session.title,
        description: session.description,
        category: session.category,
        difficulty: session.difficulty,
        site: session.site,
        url: session.url,
        startTime: session.startTime,
        status: session.status
      }
    });
  } catch (error) {
    handleError(res, error, 'Failed to start session');
  }
});

router.patch('/:sessionId/pause', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!mongoose.isValidObjectId(sessionId)) return res.status(400).json({ error: 'Invalid session ID' });

    const validation = validateSessionData(req.body);
    if (!validation.valid) return res.status(400).json({ error: validation.message });

    const session = await ProblemSession.findOne({ _id: sessionId, userEmail: req.user.email });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const now = new Date();
    if (session.status === 'active') {
      session.status = 'paused';
      session.pauseHistory.push({
        pausedAt: now,
        reason: req.body.reason?.trim() || 'Manual pause'
      });
    } else if (session.status === 'paused') {
      session.status = 'active';
      const lastPause = session.pauseHistory[session.pauseHistory.length - 1];
      if (lastPause && !lastPause.resumedAt) {
        lastPause.resumedAt = now;
        session.pausedDuration += now.getTime() - lastPause.pausedAt.getTime();
      }
    } else {
      return res.status(400).json({ error: 'Cannot pause/resume a completed or abandoned session' });
    }

    await session.save();
    res.json({ success: true, session: { id: session._id, status: session.status, pausedDuration: session.pausedDuration } });
  } catch (error) {
    handleError(res, error, 'Failed to update session');
  }
});

router.patch('/:sessionId/complete', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!mongoose.isValidObjectId(sessionId)) return res.status(400).json({ error: 'Invalid session ID' });

    const validation = validateSessionData(req.body);
    if (!validation.valid) return res.status(400).json({ error: validation.message });

    const session = await ProblemSession.findOne({ _id: sessionId, userEmail: req.user.email });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (session.status === 'completed' || session.status === 'abandoned') {
      return res.status(400).json({ error: 'Session already completed or abandoned' });
    }

    const now = new Date();
    if (session.status === 'paused') {
      const lastPause = session.pauseHistory[session.pauseHistory.length - 1];
      if (lastPause && !lastPause.resumedAt) {
        session.pausedDuration += now.getTime() - lastPause.pausedAt.getTime();
        lastPause.resumedAt = now;
      }
    }

    session.endTime = now;
    session.status = 'completed';
    session.completionNotes = req.body.completionNotes?.trim() || '';
    session.wasSuccessful = req.body.wasSuccessful !== false;

    await session.save();
    res.json({
      success: true,
      session: { id: session._id, title: session.title, duration: session.duration, status: session.status, wasSuccessful: session.wasSuccessful }
    });
  } catch (error) {
    handleError(res, error, 'Failed to complete session');
  }
});

router.patch('/:sessionId/abandon', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!mongoose.isValidObjectId(sessionId)) return res.status(400).json({ error: 'Invalid session ID' });

    const validation = validateSessionData(req.body);
    if (!validation.valid) return res.status(400).json({ error: validation.message });

    const session = await ProblemSession.findOne({ _id: sessionId, userEmail: req.user.email });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const now = new Date();
    if (session.status === 'paused') {
      const lastPause = session.pauseHistory[session.pauseHistory.length - 1];
      if (lastPause && !lastPause.resumedAt) {
        session.pausedDuration += now.getTime() - lastPause.pausedAt.getTime();
        lastPause.resumedAt = now;
      }
    }

    session.endTime = now;
    session.status = 'abandoned';
    session.wasSuccessful = false;
    session.completionNotes = req.body.reason?.trim() || 'Session abandoned';

    await session.save();
    res.json({ success: true, session: { id: session._id, status: session.status } });
  } catch (error) {
    handleError(res, error, 'Failed to abandon session');
  }
});

router.get('/current/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;
    if (userEmail !== req.user.email && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const session = await ProblemSession.getCurrentSession(userEmail);
    res.json({
      activeSession: session ? {
        id: session._id,
        title: session.title,
        description: session.description,
        category: session.category,
        difficulty: session.difficulty,
        site: session.site,
        url: session.url,
        startTime: session.startTime,
        status: session.status,
        pausedDuration: session.pausedDuration,
        tags: session.tags
      } : null
    });
  } catch (error) {
    handleError(res, error, 'Failed to get current session');
  }
});

router.get('/history/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;
    const { date, endDate, category, status, timezone = '0', useUserTimezone = 'false' } = req.query;

    if (userEmail !== req.user.email && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

    const tz = parseInt(timezone, 10);
    if (!Number.isFinite(tz) || tz < -720 || tz > 840) return res.status(400).json({ error: 'Invalid timezone offset' });
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date) && useUserTimezone !== 'true') return res.status(400).json({ error: 'Invalid date format' });
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate) && useUserTimezone !== 'true') return res.status(400).json({ error: 'Invalid endDate format' });
    if (category && category !== 'all' && !VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
    if (status && status !== 'all' && !VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    let fromDate = date;
    let toDate = endDate;
    if (useUserTimezone === 'true') {
      if (date) {
        const ts = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(date + 'T00:00:00.000Z') : Date.parse(date);
        if (isNaN(ts)) return res.status(400).json({ error: 'Invalid date' });
        fromDate = getUserTimezoneDate(ts, tz);
      }
      if (endDate) {
        const ts2 = /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? Date.parse(endDate + 'T23:59:59.999Z') : Date.parse(endDate);
        if (isNaN(ts2)) return res.status(400).json({ error: 'Invalid endDate' });
        toDate = getUserTimezoneDate(ts2, tz);
      }
    }

    const sessions = await ProblemSession.getHistory(userEmail, { date: fromDate, endDate: toDate, category, status });
    const formattedSessions = sessions.map(s => ({
      id: s._id,
      title: s.title,
      description: s.description,
      category: s.category,
      difficulty: s.difficulty,
      site: s.site,
      url: s.url,
      startTime: s.startTime,
      endTime: s.endTime,
      duration: s.duration,
      status: s.status,
      wasSuccessful: s.wasSuccessful,
      tags: s.tags,
      completionNotes: s.completionNotes,
      userLocalDate: s.userLocalDate
    }));

    res.json({
      sessions: formattedSessions,
      summary: {
        total: sessions.length,
        completed: sessions.filter(s => s.status === 'completed').length,
        totalTime: sessions.reduce((sum, s) => sum + (s.duration || 0), 0),
        successRate: sessions.length ? (sessions.filter(s => s.wasSuccessful).length / sessions.length * 100).toFixed(1) : 0
      }
    });
  } catch (error) {
    handleError(res, error, 'Failed to get session history');
  }
});

router.patch('/:sessionId/update', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!mongoose.isValidObjectId(sessionId)) return res.status(400).json({ error: 'Invalid session ID' });

    const validation = validateSessionData(req.body, true);
    if (!validation.valid) return res.status(400).json({ error: validation.message });

    const session = await ProblemSession.findOne({ _id: sessionId, userEmail: req.user.email });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const { title, description, category, difficulty, tags, notes } = req.body;
    if (title) session.title = title.trim();
    if (description !== undefined) session.description = description.trim();
    if (category) session.category = category;
    if (difficulty) session.difficulty = difficulty;
    if (Array.isArray(tags)) session.tags = tags.slice(0, 10);
    if (notes !== undefined) session.notes = notes.trim();

    await session.save();
    res.json({
      success: true,
      session: { id: session._id, title: session.title, description: session.description, category: session.category, difficulty: session.difficulty, tags: session.tags, notes: session.notes }
    });
  } catch (error) {
    handleError(res, error, 'Failed to update session');
  }
});

module.exports = router;