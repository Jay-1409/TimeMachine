const express = require('express');
const router = express.Router();
const BlockedKeyword = require('../models/BlockedKeyword');
const { authenticateToken } = require('./auth');
const mongoose = require('mongoose');

router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const blockedKeywords = await BlockedKeyword.getUserBlockedKeywords(req.user.email);
    res.json({ blockedKeywords });
  } catch (e) {
    console.error('Error fetching blocked keywords:', e);
    res.status(500).json({ error: 'Failed to fetch blocked keywords', details: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { keyword, enabled = true, blockType = 'focus-only', blockDuring, schedule, redirectUrl } = req.body;
    if (!keyword || !String(keyword).trim()) {
      return res.status(400).json({ error: 'Keyword is required' });
    }

    const doc = new BlockedKeyword({
      userEmail: req.user.email,
      keyword,
      enabled,
      blockType,
      blockDuring: blockDuring || { focusSessions: true, breakTime: false },
      schedule,
      redirectUrl: redirectUrl || 'chrome://newtab'
    });
    await doc.save();
    res.status(201).json({ blockedKeyword: doc, message: 'Blocked keyword added successfully' });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'This keyword is already blocked' });
    console.error('Error adding blocked keyword:', e);
    res.status(500).json({ error: 'Failed to add blocked keyword', details: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid keyword ID' });
    }
    const kw = await BlockedKeyword.findOneAndDelete({ _id: req.params.id, userEmail: req.user.email });
    if (!kw) return res.status(404).json({ error: 'Blocked keyword not found' });
    res.json({ message: 'Blocked keyword removed successfully' });
  } catch (e) {
    console.error('Error deleting blocked keyword:', e);
    res.status(500).json({ error: 'Failed to delete blocked keyword', details: e.message });
  }
});

router.post('/:id/toggle', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid keyword ID' });
    }
    const kw = await BlockedKeyword.findOne({ _id: req.params.id, userEmail: req.user.email });
    if (!kw) return res.status(404).json({ error: 'Blocked keyword not found' });
    await kw.toggle();
    res.json({ blockedKeyword: kw, message: `Blocked keyword ${kw.enabled ? 'enabled' : 'disabled'}` });
  } catch (e) {
    console.error('Error toggling blocked keyword:', e);
    res.status(500).json({ error: 'Failed to toggle blocked keyword', details: e.message });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const { blockedKeywords } = req.body;
    if (!Array.isArray(blockedKeywords)) {
      return res.status(400).json({ error: 'blockedKeywords must be an array' });
    }
    if (blockedKeywords.some(k => !k.keyword || !String(k.keyword).trim())) {
      return res.status(400).json({ error: 'All keywords must be non-empty strings' });
    }

    const results = [];
    for (const k of blockedKeywords) {
      try {
        const doc = await BlockedKeyword.findOneAndUpdate(
          { userEmail: req.user.email, keyword: String(k.keyword).toLowerCase().trim() },
          {
            userEmail: req.user.email,
            keyword: String(k.keyword).toLowerCase().trim(),
            enabled: k.enabled !== false,
            blockType: k.blockType || 'focus-only',
            blockDuring: k.blockDuring || { focusSessions: true, breakTime: false },
            redirectUrl: k.redirectUrl || 'chrome://newtab'
          },
          { upsert: true, new: true, runValidators: true }
        );
        results.push({ keyword: doc.keyword, status: 'synced' });
      } catch (err) {
        results.push({ keyword: k.keyword || String(k), status: 'error', error: err.message });
      }
    }
    res.json({ message: 'Blocked keywords synced successfully', results });
  } catch (e) {
    console.error('Error syncing blocked keywords:', e);
    res.status(500).json({ error: 'Failed to sync blocked keywords', details: e.message });
  }
});

module.exports = router;