const express = require('express');
const router = express.Router();
const FocusSession = require('../models/FocusSession');
const { authenticateToken } = require('./auth');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: 'Too many focus session creations, please try again later'
});

const patchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: 'Too many focus session updates, please try again later'
});

router.use(authenticateToken);

router.post('/', postLimiter, async (req, res) => {
  try {
    const { duration, startTime, endTime, status, sessionType, productivity, notes } = req.body;
    const userId = req.user.id;

    if (!duration || !startTime || !endTime || !status) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: duration, startTime, endTime, status'
      });
    }

    if (duration < 1 || duration > 480) {
      return res.status(400).json({
        success: false,
        message: 'Duration must be between 1 and 480 minutes'
      });
    }

    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    if (isNaN(startDate) || isNaN(endDate)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid startTime or endTime'
      });
    }

    if (sessionType && !['focus', 'break'].includes(sessionType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid sessionType; must be focus or break'
      });
    }

    if (productivity && (productivity < 0 || productivity > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Productivity must be between 0 and 100'
      });
    }

    if (notes && notes.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Notes must not exceed 500 characters'
      });
    }

    const focusSession = new FocusSession({
      userId,
      duration,
      startTime: startDate,
      endTime: endDate,
      status,
      sessionType: sessionType || 'focus',
      productivity: productivity || 0,
      notes: notes ? notes.trim() : ''
    });

    await focusSession.save();

    res.status(201).json({
      success: true,
      message: 'Focus session saved successfully',
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
    console.error('Error saving focus session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save focus session',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, offset = 0, status, date } = req.query;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    if (userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const parsedLimit = parseInt(limit);
    const parsedOffset = parseInt(offset);
    if (isNaN(parsedLimit) || isNaN(parsedOffset) || parsedLimit < 0 || parsedOffset < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid limit or offset'
      });
    }

    const query = { userId };
    if (status && ['completed', 'interrupted'].includes(status)) {
      query.status = status;
    }
    
    if (date) {
      const queryDate = new Date(date);
      if (isNaN(queryDate)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date'
        });
      }
      const startOfDay = new Date(queryDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(queryDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      query.startTime = { $gte: startOfDay, $lte: endOfDay };
    }

    const sessions = await FocusSession.find(query)
      .sort({ startTime: -1 })
      .limit(parsedLimit)
      .skip(parsedOffset)
      .select('-__v')
      .lean();

    res.json({
      success: true,
      sessions,
      count: sessions.length
    });
  } catch (error) {
    console.error('Error fetching focus sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch focus sessions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/:userId/stats/daily', async (req, res) => {
  try {
    const { userId } = req.params;
    const { date } = req.query;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    if (userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const queryDate = date ? new Date(date) : new Date();
    if (isNaN(queryDate)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date'
      });
    }

    const stats = await FocusSession.getDailyStats(userId, queryDate);

    res.json({
      success: true,
      date: queryDate.toDateString(),
      stats
    });
  } catch (error) {
    console.error('Error fetching daily stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch daily stats',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/:userId/stats/weekly', async (req, res) => {
  try {
    const { userId } = req.params;
    const { weekStart } = req.query;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    if (userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const queryDate = weekStart ? new Date(weekStart) : new Date();
    if (isNaN(queryDate)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid weekStart date'
      });
    }

    const stats = await FocusSession.getWeeklyStats(userId, queryDate);

    res.json({
      success: true,
      weekStart: queryDate.toDateString(),
      stats
    });
  } catch (error) {
    console.error('Error fetching weekly stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch weekly stats',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.delete('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    if (!mongoose.isValidObjectId(sessionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid session ID'
      });
    }

    const session = await FocusSession.findOneAndDelete({ _id: sessionId, userId });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Focus session not found'
      });
    }

    res.json({
      success: true,
      message: 'Focus session deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting focus session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete focus session',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.patch('/:sessionId', patchLimiter, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const { duration, startTime, endTime, status, sessionType, productivity, notes } = req.body;

    if (!mongoose.isValidObjectId(sessionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid session ID'
      });
    }

    const updates = {};
    if (duration !== undefined) {
      if (duration < 1 || duration > 480) {
        return res.status(400).json({
          success: false,
          message: 'Duration must be between 1 and 480 minutes'
        });
      }
      updates.duration = duration;
    }
    if (startTime) {
      const startDate = new Date(startTime);
      if (isNaN(startDate)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid startTime'
        });
      }
      updates.startTime = startDate;
    }
    if (endTime) {
      const endDate = new Date(endTime);
      if (isNaN(endDate)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid endTime'
        });
      }
      updates.endTime = endDate;
    }
    if (status && ['completed', 'interrupted'].includes(status)) {
      updates.status = status;
    }
    if (sessionType && ['focus', 'break'].includes(sessionType)) {
      updates.sessionType = sessionType;
    }
    if (productivity !== undefined) {
      if (productivity < 0 || productivity > 100) {
        return res.status(400).json({
          success: false,
          message: 'Productivity must be between 0 and 100'
        });
      }
      updates.productivity = productivity;
    }
    if (notes !== undefined) {
      if (notes.length > 500) {
        return res.status(400).json({
          success: false,
          message: 'Notes must not exceed 500 characters'
        });
      }
      updates.notes = notes.trim();
    }

    const session = await FocusSession.findOneAndUpdate(
      { _id: sessionId, userId },
      updates,
      { new: true, runValidators: true }
    ).lean();

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Focus session not found'
      });
    }

    res.json({
      success: true,
      message: 'Focus session updated successfully',
      session
    });
  } catch (error) {
    console.error('Error updating focus session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update focus session',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;