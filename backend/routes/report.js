const express = require('express');
const router = express.Router();
const TimeData = require('../models/TimeData');
const EmailHistory = require('../models/EmailHistory');
const PDFDocument = require('pdfkit');

function formatDuration(seconds) {
  if (isNaN(seconds) || seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

router.post('/generate', async (req, res) => {
  const { date, userEmail } = req.body;
  if (!date || !userEmail) {
    return res.status(400).json({ error: 'Date and userEmail are required' });
  }

  try {
    // Fetch time data
    const timeDataList = await TimeData.find({ userEmail, date });
    if (!timeDataList || timeDataList.length === 0) {
      await EmailHistory.create({ userEmail, date, status: 'failed', error: 'No data found' });
      return res.status(404).json({ error: 'No data found' });
    }

    // Aggregate time by domain
    const domainTimes = {};
    timeDataList.forEach(data => {
      domainTimes[data.domain] = (domainTimes[data.domain] || 0) + data.totalTime;
    });

    if (Object.keys(domainTimes).length === 0) {
      await EmailHistory.create({ userEmail, date, status: 'failed', error: 'No valid time data' });
      return res.status(404).json({ error: 'No valid time data' });
    }

    // Generate PDF
    const doc = new PDFDocument();
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.fontSize(16).text('TimeMachine Daily Report', 50, 50);
    doc.fontSize(12).text(`Date: ${date}`, 50, 80);
    doc.text(`User: ${userEmail}`, 50, 100);
    doc.text('Top Sites:', 50, 130);
    let y = 150;
    Object.entries(domainTimes).sort((a, b) => b[1] - a[1]).forEach(([domain, time]) => {
      doc.text(`${domain}: ${formatDuration(time)}`, 50, y);
      y += 20;
    });
    doc.end();

    const pdfBuffer = await new Promise(resolve => doc.on('end', () => resolve(Buffer.concat(buffers))));

    await EmailHistory.create({ userEmail, date, status: 'generated' });

    // Send PDF as response
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="daily_report_${date}.pdf"`,
      'Content-Length': pdfBuffer.length
    });
    res.send(pdfBuffer);

    // Delete data after generating report
    await TimeData.deleteMany({ userEmail, date });
  } catch (error) {
    console.error('Report generation error:', error.message);
    await EmailHistory.create({ userEmail, date, status: 'failed', error: error.message });
    res.status(500).json({ error: 'Failed to generate report', details: error.message });
  }
});

module.exports = router;