const express = require('express');
const router = express.Router();
const ProblemSession = require('../models/ProblemSession');
const { authenticateToken } = require('./auth');
const mongoose = require('mongoose');
const { getUserTimezoneDate, getTimezoneNameFromOffset } = require('../utils/timezone');

router.use(authenticateToken);

router.post('/start', async (req, res) => {
  try {
    const { title, description, category, difficulty, tags, timezone, url, site } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    if (category && !['Coding', 'Math', 'Study', 'Research', 'Debug', 'Design', 'Other'].includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    if (difficulty && !['Easy', 'Medium', 'Hard', 'Expert'].includes(difficulty)) {
      return res.status(400).json({ error: 'Invalid difficulty' });
    }

    if (url && !/^https?:\/\/.+$/.test(url)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    if (timezone !== undefined && (!Number.isInteger(timezone) || timezone < -720 || timezone > 840)) {
      return res.status(400).json({ error: 'Invalid timezone offset; must be an integer between -720 and 840' });
    }

    const activeSession = await ProblemSession.getCurrentSession(req.user.email);
    if (activeSession) {
      return res.status(400).json({ 
        error: 'You already have an active problem session. Please complete or abandon it first.',
        activeSession: {
          id: activeSession._id,
          title: activeSession.title,
          startTime: activeSession.startTime
        }
      });
    }

    const now = new Date();
    const userLocalDate = getUserTimezoneDate(now.getTime(), timezone || 0);

    const session = new ProblemSession({
      userEmail: req.user.email,
      title: title.trim(),
      description: description?.trim() || '',
      category: category || 'Other',
      difficulty: difficulty || 'Medium',
      tags: Array.isArray(tags) ? tags.filter(tag => tag.trim()).slice(0, 10) : [],
      url: url || '',
      site: site?.trim() || '',
      startTime: now,
      userLocalDate,
      timezone: {
        name: timezone !== undefined ? getTimezoneNameFromOffset(timezone) : 'UTC',
        offset: timezone || 0
      }
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
    console.error('Error starting problem session:', error);
    res.status(500).json({
      error: 'Failed to start session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.patch('/:sessionId/pause', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { reason } = req.body;

    if (!mongoose.isValidObjectId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    if (reason && reason.length > 200) {
      return res.status(400).json({ error: 'Pause reason must not exceed 200 characters' });
    }

    const session = await ProblemSession.findOne({ _id: sessionId, userEmail: req.user.email });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const now = new Date();

    if (session.status === 'active') {
      session.status = 'paused';
      session.pauseHistory.push({
        pausedAt: now,
        reason: reason?.trim() || 'Manual pause'
      });
    } else if (session.status === 'paused') {
      session.status = 'active';
      const lastPause = session.pauseHistory[session.pauseHistory.length - 1];
      if (lastPause && !lastPause.resumedAt) {
        lastPause.resumedAt = now;
        const pauseDuration = now.getTime() - lastPause.pausedAt.getTime();
        session.pausedDuration += pauseDuration;
      }
    } else {
      return res.status(400).json({ error: 'Cannot pause/resume a completed or abandoned session' });
    }

    await session.save();
    
    res.json({
      success: true,
      session: {
        id: session._id,
        status: session.status,
        pausedDuration: session.pausedDuration
      }
    });
  } catch (error) {
    console.error('Error pausing/resuming session:', error);
    res.status(500).json({
      error: 'Failed to update session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.patch('/:sessionId/complete', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { completionNotes, wasSuccessful } = req.body;

    if (!mongoose.isValidObjectId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    if (completionNotes && completionNotes.length > 1000) {
      return res.status(400).json({ error: 'Completion notes must not exceed 1000 characters' });
    }

    const session = await ProblemSession.findOne({ _id: sessionId, userEmail: req.user.email });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status === 'completed' || session.status === 'abandoned') {
      return res.status(400).json({ error: 'Session is already completed or abandoned' });
    }

    const now = new Date();
    if (session.status === 'paused') {
      const lastPause = session.pauseHistory[session.pauseHistory.length - 1];
      if (lastPause && !lastPause.resumedAt) {
        const pauseDuration = now.getTime() - lastPause.pausedAt.getTime();
        session.pausedDuration += pauseDuration;
        lastPause.resumedAt = now;
      }
    }

    session.endTime = now;
    session.status = 'completed';
    session.completionNotes = completionNotes?.trim() || '';
    session.wasSuccessful = wasSuccessful !== false;

    await session.save();
    
    res.json({
      success: true,
      session: {
        id: session._id,
        title: session.title,
        duration: session.duration,
        status: session.status,
        wasSuccessful: session.wasSuccessful
      }
    });
  } catch (error) {
    console.error('Error completing session:', error);
    res.status(500).json({
      error: 'Failed to complete session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.patch('/:sessionId/abandon', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { reason } = req.body;

    if (!mongoose.isValidObjectId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    if (reason && reason.length > 1000) {
      return res.status(400).json({ error: 'Abandon reason must not exceed 1000 characters' });
    }

    const session = await ProblemSession.findOne({ _id: sessionId, userEmail: req.user.email });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const now = new Date();
    if (session.status === 'paused') {
      const lastPause = session.pauseHistory[session.pauseHistory.length - 1];
      if (lastPause && !lastPause.resumedAt) {
        const pauseDuration = now.getTime() - lastPause.pausedAt.getTime();
        session.pausedDuration += pauseDuration;
        lastPause.resumedAt = now;
      }
    }

    session.endTime = now;
    session.status = 'abandoned';
    session.wasSuccessful = false;
    session.completionNotes = reason?.trim() || 'Session abandoned';

    await session.save();
    
    res.json({
      success: true,
      session: {
        id: session._id,
        status: session.status
      }
    });
  } catch (error) {
    console.error('Error abandoning session:', error);
    res.status(500).json({
      error: 'Failed to abandon session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/current/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;

    if (userEmail !== req.user.email && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const session = await ProblemSession.getCurrentSession(userEmail);
    if (!session) {
      return res.json({ activeSession: null });
    }

    res.json({
      activeSession: {
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
      }
    });
  } catch (error) {
    console.error('Error getting current session:', error);
    res.status(500).json({
      error: 'Failed to get current session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/history/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;
    const { date, endDate, category, status } = req.query;

    if (userEmail !== req.user.email && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format (use YYYY-MM-DD)' });
    }
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ error: 'Invalid endDate format (use YYYY-MM-DD)' });
    }
    if (category && category !== 'all' && !['Coding', 'Math', 'Study', 'Research', 'Debug', 'Design', 'Other'].includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    if (status && status !== 'all' && !['active', 'paused', 'completed', 'abandoned'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const sessions = await ProblemSession.getHistory(userEmail, { date, endDate, category, status });

    const formattedSessions = sessions.map(session => ({
      id: session._id,
      title: session.title,
      description: session.description,
      category: session.category,
      difficulty: session.difficulty,
      site: session.site,
      url: session.url,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.duration,
      status: session.status,
      wasSuccessful: session.wasSuccessful,
      tags: session.tags,
      completionNotes: session.completionNotes,
      userLocalDate: session.userLocalDate
    }));

    res.json({
      sessions: formattedSessions,
      summary: {
        total: sessions.length,
        completed: sessions.filter(s => s.status === 'completed').length,
        totalTime: sessions.reduce((sum, s) => sum + (s.duration || 0), 0),
        successRate: sessions.length ? 
          (sessions.filter(s => s.wasSuccessful).length / sessions.length * 100).toFixed(1) : 0
      }
    });
  } catch (error) {
    console.error('Error getting session history:', error);
    res.status(500).json({
      error: 'Failed to get session history',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.patch('/:sessionId/update', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title, description, category, difficulty, tags, notes } = req.body;

    if (!mongoose.isValidObjectId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    if (!title && !description && !category && !difficulty && !tags && !notes) {
      return res.status(400).json({ error: 'At least one field must be provided for update' });
    }

    if (category && !['Coding', 'Math', 'Study', 'Research', 'Debug', 'Design', 'Other'].includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    if (difficulty && !['Easy', 'Medium', 'Hard', 'Expert'].includes(difficulty)) {
      return res.status(400).json({ error: 'Invalid difficulty' });
    }

    if (notes && notes.length > 1000) {
      return res.status(400).json({ error: 'Notes must not exceed 1000 characters' });
    }

    const session = await ProblemSession.findOne({ _id: sessionId, userEmail: req.user.email });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (title) session.title = title.trim();
    if (description !== undefined) session.description = description.trim();
    if (category) session.category = category;
    if (difficulty) session.difficulty = difficulty;
    if (notes !== undefined) session.notes = notes.trim();
    if (Array.isArray(tags)) {
      session.tags = tags.filter(tag => tag.trim()).slice(0, 10);
    }

    await session.save();
    
    res.json({
      success: true,
      session: {
        id: session._id,
        title: session.title,
        description: session.description,
        category: session.category,
        difficulty: session.difficulty,
        tags: session.tags,
        notes: session.notes
      }
    });
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({
      error: 'Failed to update session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;