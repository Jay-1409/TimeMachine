const express = require('express');
const router = express.Router();
const BlockedSite = require('../models/BlockedSite');

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  const userEmail = req.headers['x-user-email'];
  if (!userEmail) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.userEmail = userEmail;
  next();
};

// GET /api/blocked-sites - Get all blocked sites for user
router.get('/', requireAuth, async (req, res) => {
  try {
    const blockedSites = await BlockedSite.getUserBlockedSites(req.userEmail);
    res.json({ blockedSites });
  } catch (error) {
    console.error('Error fetching blocked sites:', error);
    res.status(500).json({ error: 'Failed to fetch blocked sites' });
  }
});

// POST /api/blocked-sites - Add new blocked site
router.post('/', requireAuth, async (req, res) => {
  try {
    const { domain, blockType = 'focus-only', enabled = true, blockDuring, schedule, redirectUrl } = req.body;

    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    // Clean and validate domain
    const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').trim();
    
    if (!cleanDomain) {
      return res.status(400).json({ error: 'Invalid domain format' });
    }

    const blockedSite = new BlockedSite({
      userEmail: req.userEmail,
      domain: cleanDomain,
      blockType,
      enabled,
      blockDuring: blockDuring || {
        focusSessions: true,
        breakTime: false
      },
      schedule,
      redirectUrl: redirectUrl || 'chrome://newtab'
    });

    await blockedSite.save();
    res.status(201).json({ blockedSite, message: 'Blocked site added successfully' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'This site is already blocked' });
    }
    console.error('Error adding blocked site:', error);
    res.status(500).json({ error: 'Failed to add blocked site' });
  }
});

// PUT /api/blocked-sites/:id - Update blocked site
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { enabled, blockType, blockDuring, schedule, redirectUrl } = req.body;

    const blockedSite = await BlockedSite.findOne({
      _id: req.params.id,
      userEmail: req.userEmail
    });

    if (!blockedSite) {
      return res.status(404).json({ error: 'Blocked site not found' });
    }

    // Update fields
    if (typeof enabled !== 'undefined') blockedSite.enabled = enabled;
    if (blockType) blockedSite.blockType = blockType;
    if (blockDuring) blockedSite.blockDuring = blockDuring;
    if (schedule) blockedSite.schedule = schedule;
    if (redirectUrl) blockedSite.redirectUrl = redirectUrl;

    await blockedSite.save();
    res.json({ blockedSite, message: 'Blocked site updated successfully' });
  } catch (error) {
    console.error('Error updating blocked site:', error);
    res.status(500).json({ error: 'Failed to update blocked site' });
  }
});

// DELETE /api/blocked-sites/:id - Remove blocked site
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const blockedSite = await BlockedSite.findOneAndDelete({
      _id: req.params.id,
      userEmail: req.userEmail
    });

    if (!blockedSite) {
      return res.status(404).json({ error: 'Blocked site not found' });
    }

    res.json({ message: 'Blocked site removed successfully' });
  } catch (error) {
    console.error('Error deleting blocked site:', error);
    res.status(500).json({ error: 'Failed to delete blocked site' });
  }
});

// POST /api/blocked-sites/:id/toggle - Toggle enabled status
router.post('/:id/toggle', requireAuth, async (req, res) => {
  try {
    const blockedSite = await BlockedSite.findOne({
      _id: req.params.id,
      userEmail: req.userEmail
    });

    if (!blockedSite) {
      return res.status(404).json({ error: 'Blocked site not found' });
    }

    await blockedSite.toggle();
    res.json({ blockedSite, message: `Blocked site ${blockedSite.enabled ? 'enabled' : 'disabled'}` });
  } catch (error) {
    console.error('Error toggling blocked site:', error);
    res.status(500).json({ error: 'Failed to toggle blocked site' });
  }
});

// POST /api/blocked-sites/sync - Sync blocked sites from extension
router.post('/sync', requireAuth, async (req, res) => {
  try {
    const { blockedSites } = req.body;

    if (!Array.isArray(blockedSites)) {
      return res.status(400).json({ error: 'blockedSites must be an array' });
    }

    const results = [];
    
    for (const site of blockedSites) {
      try {
        const cleanDomain = site.domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').trim();
        
        await BlockedSite.findOneAndUpdate(
          { userEmail: req.userEmail, domain: cleanDomain },
          {
            userEmail: req.userEmail,
            domain: cleanDomain,
            enabled: site.enabled !== false,
            blockType: site.blockType || 'focus-only',
            blockDuring: site.blockDuring || { focusSessions: true, breakTime: false },
            redirectUrl: site.redirectUrl || 'chrome://newtab'
          },
          { upsert: true, new: true }
        );
        
        results.push({ domain: cleanDomain, status: 'synced' });
      } catch (error) {
        results.push({ domain: site.domain, status: 'error', error: error.message });
      }
    }

    res.json({ message: 'Blocked sites synced successfully', results });
  } catch (error) {
    console.error('Error syncing blocked sites:', error);
    res.status(500).json({ error: 'Failed to sync blocked sites' });
  }
});

module.exports = router;
