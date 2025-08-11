const express = require('express');
const router = express.Router();
const TimeData = require('../models/TimeData');
const PDFDocument = require('pdfkit');

// Generate a PDF daily report (authenticated)
router.post('/generate', async (req, res) => {
  try {
    const { date, userEmail, endDate } = req.body;
    if (!date || !userEmail) {
      return res.status(400).json({ error: 'date and userEmail are required' });
    }

    const rangeEnd = endDate || date;
    const records = await TimeData.find({
      userEmail,
      date: { $gte: date, $lte: rangeEnd }
    }).lean();

    // Aggregate by category & domain
    const categoryTotals = { Work:0, Social:0, Entertainment:0, Professional:0, Other:0 };
    const domainTotals = {};
    let grandTotal = 0;
    records.forEach(r => {
      const cat = r.category || 'Other';
      const time = r.totalTime || 0;
      if (!categoryTotals[cat]) categoryTotals[cat] = 0;
      categoryTotals[cat] += time;
      grandTotal += time;
      if (!domainTotals[r.domain]) domainTotals[r.domain] = 0;
      domainTotals[r.domain] += time;
    });

    // Prepare PDF
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=report_${date}${rangeEnd!==date?`_${rangeEnd}`:''}.pdf`);
    doc.pipe(res);

    doc.fontSize(20).text('TimeMachine Usage Report', { underline: true });
    doc.moveDown();
    doc.fontSize(12).text(`User: ${userEmail}`);
    doc.text(`Date Range: ${date} to ${rangeEnd}`);
    doc.text(`Generated: ${new Date().toLocaleString()}`);
    doc.moveDown();

    doc.fontSize(16).text('Summary');
    doc.fontSize(12).text(`Total Tracked Time: ${(grandTotal/3600000).toFixed(2)} hours`);
    doc.moveDown();

    doc.fontSize(16).text('Category Breakdown');
    Object.entries(categoryTotals).forEach(([cat, ms]) => {
      if (ms>0) doc.fontSize(12).text(`${cat}: ${(ms/3600000).toFixed(2)} h`);
    });
    doc.moveDown();

    doc.fontSize(16).text('Top Domains');
    Object.entries(domainTotals)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,25)
      .forEach(([dom, ms])=> doc.fontSize(12).text(`${dom}: ${(ms/3600000).toFixed(2)} h`));

    doc.end();
  } catch (err) {
    console.error('Report generation error:', err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

module.exports = router;
