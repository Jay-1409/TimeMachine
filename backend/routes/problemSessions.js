const express = require('express');
const router = express.Router();
const ProblemSession = require('../models/ProblemSession');

// Create a new problem session (start stopwatch)
router.post('/start', async (req, res) => {
  try {
    const { userEmail, title, description, category, difficulty, tags, timezone, timezoneName } = req.body;
    
    if (!userEmail || !title) {
      return res.status(400).json({ error: 'userEmail and title are required' });
    }

    // Check if user has an active session
    const activeSession = await ProblemSession.findOne({ 
      userEmail, 
      status: { $in: ['active', 'paused'] } 
    });

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
    const userLocalDate = new Date(now.getTime() - (timezone || 0) * 60000)
      .toISOString().split('T')[0];

    const session = new ProblemSession({
      userEmail,
      title: title.trim(),
      description: description?.trim() || '',
      category: category || 'Other',
      difficulty: difficulty || 'Medium',
      tags: Array.isArray(tags) ? tags.filter(tag => tag.trim()) : [],
      startTime: now,
      userLocalDate,
      timezone: {
        name: timezoneName || 'UTC',
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
        startTime: session.startTime,
        status: session.status
      }
    });
  } catch (error) {
    console.error('Error starting problem session:', error);
    res.status(500).json({ error: 'Failed to start session', details: error.message });
  }
});

// Pause/Resume a session
router.patch('/:sessionId/pause', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userEmail, reason } = req.body;
    
    const session = await ProblemSession.findOne({ _id: sessionId, userEmail });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const now = new Date();

    if (session.status === 'active') {
      // Pause the session
      session.status = 'paused';
      session.pauseHistory.push({
        pausedAt: now,
        reason: reason || 'Manual pause'
      });
    } else if (session.status === 'paused') {
      // Resume the session
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
    res.status(500).json({ error: 'Failed to update session', details: error.message });
  }
});

// Complete a session
router.patch('/:sessionId/complete', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userEmail, completionNotes, wasSuccessful } = req.body;
    
    const session = await ProblemSession.findOne({ _id: sessionId, userEmail });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status === 'completed' || session.status === 'abandoned') {
      return res.status(400).json({ error: 'Session is already completed or abandoned' });
    }

    const now = new Date();
    
    // If session was paused, add final pause duration
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
    session.wasSuccessful = wasSuccessful !== false; // Default to true

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
    res.status(500).json({ error: 'Failed to complete session', details: error.message });
  }
});

// Abandon a session
router.patch('/:sessionId/abandon', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userEmail, reason } = req.body;
    
    const session = await ProblemSession.findOne({ _id: sessionId, userEmail });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const now = new Date();
    
    // If session was paused, add final pause duration
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
    res.status(500).json({ error: 'Failed to abandon session', details: error.message });
  }
});

// Get current active session
router.get('/current/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;
    
    const session = await ProblemSession.findOne({ 
      userEmail, 
      status: { $in: ['active', 'paused'] } 
    });

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
        startTime: session.startTime,
        status: session.status,
        pausedDuration: session.pausedDuration,
        tags: session.tags
      }
    });
  } catch (error) {
    console.error('Error getting current session:', error);
    res.status(500).json({ error: 'Failed to get current session', details: error.message });
  }
});

// Get problem sessions for a date range
router.get('/history/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;
    const { date, endDate, category, status } = req.query;
    
    const query = { userEmail };
    
    if (date) {
      if (endDate) {
        query.userLocalDate = { $gte: date, $lte: endDate };
      } else {
        query.userLocalDate = date;
      }
    }
    
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (status && status !== 'all') {
      query.status = status;
    }

    const sessions = await ProblemSession.find(query)
      .sort({ startTime: -1 })
      .lean();

    const formattedSessions = sessions.map(session => ({
      id: session._id,
      title: session.title,
      description: session.description,
      category: session.category,
      difficulty: session.difficulty,
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
    res.status(500).json({ error: 'Failed to get session history', details: error.message });
  }
});

// Update session details (title, description, tags, etc.)
router.patch('/:sessionId/update', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userEmail, title, description, category, difficulty, tags, notes } = req.body;
    
    const session = await ProblemSession.findOne({ _id: sessionId, userEmail });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (title) session.title = title.trim();
    if (description !== undefined) session.description = description.trim();
    if (category) session.category = category;
    if (difficulty) session.difficulty = difficulty;
    if (notes !== undefined) session.notes = notes.trim();
    if (Array.isArray(tags)) {
      session.tags = tags.filter(tag => tag.trim());
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
    res.status(500).json({ error: 'Failed to update session', details: error.message });
  }
});

module.exports = router;
