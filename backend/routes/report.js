const express = require('express');
const router = express.Router();
const TimeData = require('../models/TimeData');
const PDFDocument = require('pdfkit');
const QuickChart = require('quickchart-js');
const { authenticateToken } = require('./auth');
const { getUserTimezoneDate } = require('../utils/timezone');
const rateLimit = require('express-rate-limit');

const generateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many report generation requests, please try again later'
});

function formatDuration(seconds) {
  if (isNaN(seconds) || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

router.post('/generate', authenticateToken, generateLimiter, async (req, res) => {
  try {
    const { date, timezone = 0 } = req.body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format (use YYYY-MM-DD)' });
    }
    if (!Number.isInteger(timezone) || timezone < -720 || timezone > 840) {
      return res.status(400).json({ error: 'Invalid timezone offset; must be an integer between -720 and 840' });
    }

    if (req.user.role !== 'admin' && req.user.email !== req.body.userEmail) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const userLocalDate = getUserTimezoneDate(new Date(date + 'T00:00:00.000Z').getTime(), timezone);
    const rows = await TimeData.find({ userEmail: req.user.email, userLocalDate })
      .select('domain totalTime category sessions timezone')
      .lean();

    if (!rows.length) {
      return res.status(404).json({ error: 'No data found for the specified date' });
    }

    const domainTimes = {};
    const categoryTimes = { Work: 0, Social: 0, Entertainment: 0, Professional: 0, Other: 0 };
    const domainCategories = {};
    const domainSessions = {};

    rows.forEach(r => {
      const secs = Math.min(Math.floor((r.totalTime || 0) / 1000), 86400);
      if (!secs) return;

      domainTimes[r.domain] = (domainTimes[r.domain] || 0) + secs;
      const cat = categoryTimes.hasOwnProperty(r.category) ? r.category : 'Other';
      categoryTimes[cat] += secs;
      domainCategories[r.domain] = cat;

      if (Array.isArray(r.sessions) && r.sessions.length) {
        const clean = r.sessions.filter(s => {
          const valid = typeof s.duration === 'number' &&
            s.duration > 0 &&
            s.duration < 12 * 3600 * 1000 &&
            typeof s.startTime === 'number' &&
            typeof s.endTime === 'number' &&
            s.endTime > s.startTime &&
            s.duration === s.endTime - s.startTime;
          if (!valid) {
            console.warn(`Invalid session for ${r.domain}: `, s);
          }
          return valid;
        });
        domainSessions[r.domain] = clean.map(s => ({
          start: s.startTime,
          end: s.endTime,
          durS: Math.floor(s.duration / 1000)
        }));
      }
    });

    if (!Object.keys(domainTimes).length) {
      return res.status(404).json({ error: 'No valid time data after processing' });
    }

    const sorted = Object.entries(domainTimes).sort((a, b) => b[1] - a[1]);
    const total = Object.values(domainTimes).reduce((a, b) => a + b, 0);

    let allSessionDurations = [];
    let totalSessions = 0;
    let productiveSeconds = 0;
    const productiveCats = new Set(['Work', 'Professional']);

    Object.entries(domainSessions).forEach(([dom, sArr]) => {
      totalSessions += sArr.length;
      allSessionDurations.push(...sArr.map(s => s.durS));
    });

    productiveSeconds = Object.entries(domainTimes).reduce((acc, [dom, secs]) =>
      acc + (productiveCats.has(domainCategories[dom]) ? secs : 0), 0);

    const focusRatio = total ? (productiveSeconds / total * 100).toFixed(1) : 0;
    allSessionDurations.sort((a, b) => a - b);
    const medianSession = allSessionDurations.length ?
      allSessionDurations[Math.floor(allSessionDurations.length / 2)] : 0;
    const longestSession = allSessionDurations.length ?
      Math.max(...allSessionDurations) : 0;

    const domainStats = {};
    sorted.forEach(([dom]) => {
      const sess = domainSessions[dom] || [];
      if (!sess.length) {
        domainStats[dom] = { count: 0, avg: 0, long: 0, first: null, last: null };
        return;
      }
      const count = sess.length;
      const sum = sess.reduce((a, s) => a + s.durS, 0);
      const avg = sum / count;
      const long = Math.max(...sess.map(s => s.durS));
      const first = new Date(Math.min(...sess.map(s => s.start))).toLocaleTimeString('en-US', { timeZone: rows[0]?.timezone?.name || 'UTC' });
      const last = new Date(Math.max(...sess.map(s => s.end))).toLocaleTimeString('en-US', { timeZone: rows[0]?.timezone?.name || 'UTC' });
      domainStats[dom] = { count, avg, long, first, last };
    });

    const catChart = new QuickChart();
    catChart.setConfig({
      type: 'doughnut',
      data: {
        labels: Object.keys(categoryTimes).filter(cat => categoryTimes[cat] > 0),
        datasets: [{
          data: Object.values(categoryTimes).filter(time => time > 0),
          backgroundColor: ['#1e40af', '#dc2626', '#9333ea', '#059669', '#4b5563']
        }]
      },
      options: {
        plugins: {
          legend: { position: 'right', labels: { font: { size: 10 } } },
          title: { display: true, text: 'Time by Category', font: { size: 14 } }
        },
        cutout: '60%'
      }
    });
    let catBuf;
    try {
      catBuf = Buffer.from((await catChart.toDataUrl()).split(',')[1], 'base64');
    } catch (error) {
      console.warn('Failed to generate category chart:', error);
      catBuf = null;
    }

    const barChart = new QuickChart();
    barChart.setConfig({
      type: 'bar',
      data: {
        labels: sorted.map(d => d[0]).slice(0, 10),
        datasets: [{
          label: 'Seconds',
          data: sorted.map(d => d[1]).slice(0, 10),
          backgroundColor: sorted.map((_, i) =>
            i === 0 ? '#dc2626' :
            i === 1 ? '#f59e0b' :
            i === 2 ? '#16a34a' : '#2563eb'
          ).slice(0, 10)
        }]
      },
      options: {
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Top Sites Time Spent', font: { size: 14 } }
        },
        scales: {
          x: { ticks: { font: { size: 10 } } },
          y: { ticks: { font: { size: 10 } } }
        }
      }
    });
    let barBuf;
    try {
      barBuf = Buffer.from((await barChart.toDataUrl()).split(',')[1], 'base64');
    } catch (error) {
      console.warn('Failed to generate bar chart:', error);
      barBuf = null;
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      const pdf = Buffer.concat(chunks);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="daily_report_${userLocalDate}.pdf"`,
        'Content-Length': pdf.length
      });
      res.send(pdf);
    });

    doc.fontSize(20).text('TimeMachine Daily Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Date: ${new Date(date).toLocaleDateString('en-US', { timeZone: rows[0]?.timezone?.name || 'UTC' })}`, { align: 'center' });
    doc.text(`User: ${req.user.email}`, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleString('en-US', { timeZone: rows[0]?.timezone?.name || 'UTC' })}`, { align: 'center' });
    doc.text(`Timezone: ${rows[0]?.timezone?.name || 'UTC'} (UTC${rows[0]?.timezone?.offset > 0 ? '+' : ''}${rows[0]?.timezone?.offset / 60 || 0})`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Total Time Tracked: ${formatDuration(total)}`, { align: 'center' });

    doc.moveDown();
    doc.fontSize(12).text('Key Insights', { underline: true });
    doc.moveDown(0.35);

    if (sorted.length) {
      const [topDom, topSec] = sorted[0];
      doc.text(`• Top site: ${topDom} (${formatDuration(topSec)} / ${(topSec / total * 100).toFixed(1)}%)`);
    }

    const topCat = Object.entries(categoryTimes).sort((a, b) => b[1] - a[1])[0];
    if (topCat && topCat[1] > 0) {
      doc.text(`• Main activity: ${topCat[0]} (${(topCat[1] / total * 100).toFixed(1)}%)`);
    }

    doc.text(`• Unique domains: ${Object.keys(domainTimes).length}`);
    doc.text(`• Total sessions: ${totalSessions}`);
    doc.text(`• Median session: ${formatDuration(medianSession)}`);
    doc.text(`• Longest session: ${formatDuration(longestSession)}`);
    doc.text(`• Focus ratio (Work+Professional): ${focusRatio}%`);
    doc.moveDown();

    const startX = 50;
    let y = doc.y;
    const rowH = 22;
    const widths = [36, 150, 70, 70, 60, 70, 70];
    const headerLabels = ['#', 'Domain', 'Time', 'Category', 'Sess', 'Avg', 'Longest'];

    const drawHead = () => {
      doc.font('Helvetica-Bold');
      const totalW = widths.reduce((a, b) => a + b, 0);
      doc.rect(startX, y, totalW, rowH).fill('#e5e7eb');
      doc.fillColor('#000').fontSize(9);
      let x = startX + 5;
      headerLabels.forEach((lab, i) => {
        doc.text(lab, x, y + 6, { width: widths[i] - 10, ellipsis: true });
        x += widths[i];
      });
      y += rowH;
      doc.font('Helvetica');
    };

    drawHead();
    sorted.forEach(([dom, secs], i) => {
      if (y + rowH > doc.page.height - 50) {
        doc.addPage();
        y = 50;
        drawHead();
      }

      const stat = domainStats[dom];
      const cat = domainCategories[dom] || 'Other';
      const totalW = widths.reduce((a, b) => a + b, 0);

      doc.rect(startX, y, totalW, rowH).fill(i % 2 === 0 ? '#f9fafb' : '#ffffff');
      doc.fillColor('#000').fontSize(8);
      let x = startX + 5;
      const cells = [
        String(i + 1),
        dom.length > 20 ? dom.slice(0, 17) + '...' : dom,
        formatDuration(secs),
        cat,
        String(stat.count),
        formatDuration(Math.round(stat.avg) || 0),
        formatDuration(stat.long || 0)
      ];

      cells.forEach((c, ci) => {
        doc.text(c, x, y + 5, { width: widths[ci] - 10, ellipsis: true });
        x += widths[ci];
      });
      y += rowH;
    });

    if (catBuf) {
      doc.addPage();
      y = 50;
      doc.fontSize(16).text('Time Distribution by Category');
      doc.moveDown(0.5);
      doc.image(catBuf, { fit: [350, 200], align: 'center' });
    }

    if (barBuf) {
      doc.addPage();
      y = 50;
      doc.fontSize(16).text('Top Sites Time Spent');
      doc.moveDown(0.5);
      doc.image(barBuf, { fit: [350, 250], align: 'center' });
    }

    doc.end();
  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({
      error: 'Failed to generate report',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;