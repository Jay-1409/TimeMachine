const express = require('express');
const router = express.Router();
const BlockedSite = require('../models/BlockedSite');
const { authenticateToken } = require('./auth');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests to add blocked sites, please try again later'
});

const syncLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many sync requests, please try again later'
});

router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const blockedSites = await BlockedSite.getUserBlockedSites(req.user.email);
    res.json({ blockedSites });
  } catch (error) {
    console.error('Error fetching blocked sites:', error);
    res.status(500).json({ error: 'Failed to fetch blocked sites', details: error.message });
  }
});

router.post('/', postLimiter, async (req, res) => {
  try {
    const { domain, blockType = 'focus-only', enabled = true, blockDuring, schedule, redirectUrl } = req.body;

    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    const blockedSite = new BlockedSite({
      userEmail: req.user.email,
      domain,
      blockType,
      enabled,
      blockDuring: blockDuring || { focusSessions: true, breakTime: false },
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
    res.status(500).json({ error: 'Failed to add blocked site', details: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid site ID' });
    }
    const { enabled, blockType, blockDuring, schedule, redirectUrl } = req.body;

    const blockedSite = await BlockedSite.findOne({
      _id: req.params.id,
      userEmail: req.user.email
    });

    if (!blockedSite) {
      return res.status(404).json({ error: 'Blocked site not found' });
    }

    if (typeof enabled !== 'undefined') blockedSite.enabled = enabled;
    if (blockType) {
      if (!['always', 'focus-only', 'scheduled'].includes(blockType)) {
        return res.status(400).json({ error: 'Invalid blockType' });
      }
      blockedSite.blockType = blockType;
    }
    if (blockDuring) blockedSite.blockDuring = blockDuring;
    if (schedule) blockedSite.schedule = schedule;
    if (redirectUrl) blockedSite.redirectUrl = redirectUrl;

    await blockedSite.save();
    res.json({ blockedSite, message: 'Blocked site updated successfully' });
  } catch (error) {
    console.error('Error updating blocked site:', error);
    res.status(500).json({ error: 'Failed to update blocked site', details: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid site ID' });
    }
    const blockedSite = await BlockedSite.findOneAndDelete({
      _id: req.params.id,
      userEmail: req.user.email
    });

    if (!blockedSite) {
      return res.status(404).json({ error: 'Blocked site not found' });
    }

    res.json({ message: 'Blocked site removed successfully' });
  } catch (error) {
    console.error('Error deleting blocked site:', error);
    res.status(500).json({ error: 'Failed to delete blocked site', details: error.message });
  }
});

router.post('/:id/toggle', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid site ID' });
    }
    const blockedSite = await BlockedSite.findOne({
      _id: req.params.id,
      userEmail: req.user.email
    });

    if (!blockedSite) {
      return res.status(404).json({ error: 'Blocked site not found' });
    }

    await blockedSite.toggle();
    res.json({ blockedSite, message: `Blocked site ${blockedSite.enabled ? 'enabled' : 'disabled'}` });
  } catch (error) {
    console.error('Error toggling blocked site:', error);
    res.status(500).json({ error: 'Failed to toggle blocked site', details: error.message });
  }
});

router.post('/sync', syncLimiter, async (req, res) => {
  try {
    const { blockedSites } = req.body;

    if (!Array.isArray(blockedSites)) {
      return res.status(400).json({ error: 'blockedSites must be an array' });
    }
    if (blockedSites.some(site => !site.domain || !String(site.domain).trim())) {
      return res.status(400).json({ error: 'All sites must have a valid domain' });
    }

    const results = [];
    for (const site of blockedSites) {
      try {
        const doc = await BlockedSite.findOneAndUpdate(
          { userEmail: req.user.email, domain: String(site.domain).toLowerCase().trim() },
          {
            userEmail: req.user.email,
            domain: String(site.domain).toLowerCase().trim(),
            enabled: site.enabled !== false,
            blockType: site.blockType || 'focus-only',
            blockDuring: site.blockDuring || { focusSessions: true, breakTime: false },
            redirectUrl: site.redirectUrl || 'chrome://newtab'
          },
          { upsert: true, new: true, runValidators: true }
        );
        results.push({ domain: doc.domain, status: 'synced' });
      } catch (error) {
        results.push({ domain: site.domain, status: 'error', error: error.message });
      }
    }

    res.json({ message: 'Blocked sites synced successfully', results });
  } catch (error) {
    console.error('Error syncing blocked sites:', error);
    res.status(500).json({ error: 'Failed to sync blocked sites', details: error.message });
  }
});

module.exports = router;