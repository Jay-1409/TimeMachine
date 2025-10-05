const express = require('express');
const router = express.Router();
const { sendMail } = require('../utils/resendMailer');
const { authenticateToken } = require('./auth');
const User = require('../models/User');

// We are not authenticating with teh jwt token in here because it is expected that this api will be called
// from server to server and not from a microservice to server or a frontend to the server
router.post('/send', async (req, res) => {
  try {
    const { to, subject, message } = req.body;
    if (!to || !subject || !message) return res.status(400).json({ error: 'to, subject and message are required' });

    const result = await sendMail(to, subject, message);
    if (!result.success) return res.status(500).json({ error: result.error || 'Failed to send email' });

    res.json({ success: true, data: result.data });
  } catch (err) {
    console.error('/mail/send error:', err);
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
