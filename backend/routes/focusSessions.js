const express = require('express');
const router = express.Router();
const FocusSession = require('../models/FocusSession');

// Create a new focus session
router.post('/', async (req, res) => {
  try {
    const { duration, startTime, endTime, status, sessionType, productivity, notes } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!duration || !startTime || !endTime || !status) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: duration, startTime, endTime, status'
      });
    }

    // Validate duration
    if (duration < 1 || duration > 480) {
      return res.status(400).json({
        success: false,
        message: 'Duration must be between 1 and 480 minutes'
      });
    }

    // Create focus session
    const focusSession = new FocusSession({
      userId,
      duration,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      status,
      sessionType: sessionType || 'focus',
      productivity: productivity || 0,
      notes: notes || ''
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

// Get user's focus sessions
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, offset = 0, status, date } = req.query;

    // Verify user can access these sessions
    if (userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Build query
    const query = { userId };
    
    if (status) {
      query.status = status;
    }
    
    if (date) {
      const queryDate = new Date(date);
      const startOfDay = new Date(queryDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(queryDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      query.startTime = { $gte: startOfDay, $lte: endOfDay };
    }

    const sessions = await FocusSession.find(query)
      .sort({ startTime: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .select('-__v');

    res.json({
      success: true,
      sessions,
      count: sessions.length
    });

  } catch (error) {
    console.error('Error fetching focus sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch focus sessions'
    });
  }
});

// Get daily stats
router.get('/:userId/stats/daily', async (req, res) => {
  try {
    const { userId } = req.params;
    const { date } = req.query;

    // Verify user can access these stats
    if (userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const queryDate = date ? new Date(date) : new Date();
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
      message: 'Failed to fetch daily stats'
    });
  }
});

// Get weekly stats
router.get('/:userId/stats/weekly', async (req, res) => {
  try {
    const { userId } = req.params;
    const { weekStart } = req.query;

    // Verify user can access these stats
    if (userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const queryDate = weekStart ? new Date(weekStart) : new Date();
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
      message: 'Failed to fetch weekly stats'
    });
  }
});

// Delete a focus session
router.delete('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = await FocusSession.findOne({ _id: sessionId, userId });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Focus session not found'
      });
    }

    await FocusSession.deleteOne({ _id: sessionId, userId });

    res.json({
      success: true,
      message: 'Focus session deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting focus session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete focus session'
    });
  }
});

// Update a focus session
router.patch('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const updates = req.body;

    // Remove fields that shouldn't be updated
    delete updates.userId;
    delete updates._id;
    delete updates.createdAt;
    delete updates.updatedAt;

    const session = await FocusSession.findOneAndUpdate(
      { _id: sessionId, userId },
      updates,
      { new: true, runValidators: true }
    );

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
      message: 'Failed to update focus session'
    });
  }
});

module.exports = router;
