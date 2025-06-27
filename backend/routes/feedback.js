const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const Mailjet = require('node-mailjet');

const mailjet = new Mailjet({
  apiKey: process.env.MAILJET_API_KEY,
  apiSecret: process.env.MAILJET_SECRET_KEY,
});

router.post('/store', async (req, res) => {
  const { message, userEmail, timestamp = new Date() } = req.body;
  if (!message || !userEmail) {
    return res.status(400).json({ error: 'Message and userEmail are required' });
  }

  try {
    const feedback = new Feedback({ userEmail, message, timestamp });
    await feedback.save();

    // Send notification email
    await mailjet.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: { Email: process.env.FROM_EMAIL, Name: 'TimeMachine Feedback' },
          To: [{ Email: process.env.DEVELOPER_EMAIL, Name: 'Developer' }],
          ReplyTo: { Email: userEmail, Name: 'User' },
          Subject: 'TimeMachine Extension Feedback',
          TextPart: `New feedback from ${userEmail}:\n\n${message}`,
          HTMLPart: `
            <div style="font-family: system-ui; max-width: 600px; margin: 0 auto; padding: 24px; background: #f0fdf4; border-radius: 10px;">
              <h2 style="font-size: 18px; color: #166534;">TimeMachine Feedback</h2>
              <p style="font-size: 14px; color: #4b5563;">From: ${userEmail}</p>
              <p style="font-size: 14px; color: #1f2937; margin-top: 16px;">${message}</p>
            </div>
          `,
        },
      ],
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Feedback error:', error);
    res.status(500).json({ error: 'Failed to store or send feedback' });
  }
});

module.exports = router;