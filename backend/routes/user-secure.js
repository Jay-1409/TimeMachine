const express = require('express');
const router = express.Router();
const User = require('../models/User-secure');

/**
 * Save user email in hashed format with enhanced security
 */
router.post('/save-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    
    // Find if the user already exists
    let user = await User.findByEmail(email);
    
    if (!user) {
      // Create a new secure user
      user = await User.createSecureUser(email);
    } else {
      // Update last active
      user.lastActive = new Date();
      user.lastUpdated = new Date();
      await user.save();
    }
    
    // Return success with masked email for display
    res.json({ 
      success: true, 
      email: email,
      maskedEmail: user.maskedEmail
    });
  } catch (error) {
    console.error('Save email error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

/**
 * Get user by email (using secure hashed lookup)
 */
router.get('/get-email/:email', async (req, res) => {
  try {
    const emailToCheck = req.params.email;
    
    // Look up by email using secure method
    const user = await User.findByEmail(emailToCheck);
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Return the masked email for display
    res.json({ 
      success: true, 
      email: emailToCheck,
      maskedEmail: user.maskedEmail,
      lastActive: user.lastActive
    });
  } catch (error) {
    console.error('Get email error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

/**
 * Get user stats - for admin dashboard
 */
router.get('/stats', async (req, res) => {
  try {
    // Count total users
    const totalUsers = await User.countDocuments();
    
    // Get active users (active in last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const activeUsers = await User.countDocuments({
      lastActive: { $gte: sevenDaysAgo }
    });
    
    // Get users by domain (for analytics)
    const domainStats = await User.aggregate([
      { $group: { 
        _id: "$emailDomain", 
        count: { $sum: 1 } 
      }},
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    res.json({
      success: true,
      totalUsers,
      activeUsers,
      domainStats: domainStats.map(d => ({ 
        domain: d._id, 
        count: d.count 
      }))
    });
  } catch (error) {
    console.error('User stats error:', error.message, error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

module.exports = router;
