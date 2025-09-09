const express = require('express');
const router = express.Router();
const TimeData = require('../models/TimeData');
const FocusSession = require('../models/FocusSession');
const ProblemSession = require('../models/ProblemSession');
const BlockedSite = require('../models/BlockedSite');
const BlockedKeyword = require('../models/BlockedKeyword');
const PDFDocument = require('pdfkit');
const QuickChart = require('quickchart-js');
const { authenticateToken } = require('./auth');
const { getUserTimezoneDate } = require('../utils/timezone');

function formatDuration(seconds) {
  if (isNaN(seconds) || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

router.post('/generate', authenticateToken, async (req, res) => {
  try {
  const { date, timezone = 0, userEmail: requestedEmail } = req.body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format (use YYYY-MM-DD)' });
    }
    if (!Number.isInteger(timezone) || timezone < -720 || timezone > 840) {
      return res.status(400).json({ error: 'Invalid timezone offset; must be an integer between -720 and 840' });
    }

    // Determine target email (admins can request another user's data)
    const targetEmail = req.user.role === 'admin' && requestedEmail ? requestedEmail : req.user.email;
    if (targetEmail !== req.user.email && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Treat provided date as the user's local date directly (client already picked local day)
    const userLocalDate = date;
    const rows = await TimeData.find({ userEmail: targetEmail, userLocalDate })
      .select('domain totalTime category sessions timezone')
      .lean();
    const noBrowsingData = !rows.length;

    const domainTimes = {};
    const categoryTimes = { Work: 0, Social: 0, Entertainment: 0, Professional: 0, Other: 0 };
    const domainCategories = {};
    const domainSessions = {};

  rows.forEach(r => {
      const secs = Math.min(Math.floor((Number.isFinite(r.totalTime) ? r.totalTime : 0) / 1000), 86400);
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

  const hasTimeData = Object.keys(domainTimes).length > 0;

    // Aggregate overall stats
  const sorted = hasTimeData ? Object.entries(domainTimes).sort((a, b) => b[1] - a[1]) : [];
  const total = hasTimeData ? Object.values(domainTimes).reduce((a, b) => a + b, 0) : 0;
    let allSessionDurations = [];
    let productiveSeconds = 0;
    const productiveCats = new Set(['Work', 'Professional']);
    if (hasTimeData) {
      Object.entries(domainSessions).forEach(([dom, sArr]) => {
        allSessionDurations.push(...sArr.map(s => s.durS));
      });
      productiveSeconds = Object.entries(domainTimes).reduce((acc, [dom, secs]) =>
        acc + (productiveCats.has(domainCategories[dom]) ? secs : 0), 0);
    }
    const focusRatio = total > 0 ? (productiveSeconds / total * 100).toFixed(1) : 0;
  const productivityScore = total > 0 ? (((categoryTimes.Work + categoryTimes.Professional + 0.5 * categoryTimes.Other) / total) * 100).toFixed(1) : '0.0';
    allSessionDurations.sort((a, b) => a - b);
    const medianSession = allSessionDurations.length ?
      allSessionDurations[Math.floor(allSessionDurations.length / 2)] : 0;
    const longestSession = allSessionDurations.length ?
      Math.max(...allSessionDurations) : 0;

    // Domain stats (sessions info per domain)
    const domainStats = {};
  sorted.forEach(([dom]) => {
      const sess = domainSessions[dom] || [];
      if (!sess.length) {
        domainStats[dom] = { count: 0, avg: 0, long: 0, first: null, last: null };
        return;
      }
      const count = sess.length;
      const sum = sess.reduce((a, s) => a + s.durS, 0);
      const avg = count > 0 ? sum / count : 0; // Fix: Avoid NaN by checking count
      const long = Math.max(...sess.map(s => s.durS));
      const first = new Date(Math.min(...sess.map(s => s.start))).toLocaleTimeString('en-US', { timeZone: rows[0]?.timezone?.name || 'UTC' });
      const last = new Date(Math.max(...sess.map(s => s.end))).toLocaleTimeString('en-US', { timeZone: rows[0]?.timezone?.name || 'UTC' });
      if (isNaN(avg)) {
        console.warn(`NaN detected for domain ${dom}: count=${count}, sum=${sum}`);
      }
      domainStats[dom] = { count, avg, long, first, last };
    });

    // Category order for later internal pie rendering
    const catOrder = ['Work','Social','Entertainment','Professional','Other'];

    // TOP SITES (HORIZONTAL BAR) CHART
    const barChart = new QuickChart();
    barChart.setWidth(900).setHeight(520).setBackgroundColor('white');
    const barColorPalette = [
      '#7f1d1d', // Dark red
      '#92400e', // Dark amber
      '#065f46', // Dark emerald
      '#1e3a8a', // Dark blue
      '#581c87', // Dark purple
      '#064e3b', // Deeper teal
      '#7c2d12', // Dark orange
      '#134e4a', // Dark cyan
      '#4338ca', // Indigo
      '#111827'  // Very dark gray
    ];
    barChart.setConfig({
      type: 'bar',
      data: {
        labels: sorted.map(d => d[0]).slice(0, 10),
        datasets: [{
          label: 'Hours',
          data: sorted.map(d => (d[1] / 3600)).slice(0, 10),
          backgroundColor: sorted.map((_, i) => barColorPalette[i % barColorPalette.length]).slice(0, 10),
          borderColor: sorted.map((_, i) => barColorPalette[i % barColorPalette.length]).slice(0, 10),
          borderWidth: 2,
          barPercentage: 0.7, // Thinner bars for better spacing
          categoryPercentage: 0.8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { left: 50, right: 50, top: 50, bottom: 50 } },
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          title: { 
            display: true, 
            text: 'Top Sites Time (Hours)', 
            font: { size: 22, weight: 'bold', family: 'Helvetica' },
            padding: { top: 20, bottom: 30 },
            color: '#1f2937'
          },
          datalabels: {
            display: true,
            anchor: 'end',
            align: 'top', // place label above bar
            offset: 4,
            font: { size: 12, weight: 'bold', family: 'Helvetica' },
            color: '#111827',
            formatter: (value) => `${value.toFixed(2)}h`
          }
        },
        scales: {
          x: {
            ticks: { 
              font: { size: 14, family: 'Helvetica' }, 
              callback: (val) => val.toFixed(1),
              color: '#1f2937'
            },
            title: { 
              display: true, 
              text: 'Hours', 
              font: { size: 16, weight: 'bold', family: 'Helvetica' },
              color: '#1f2937'
            },
            grid: { 
              color: 'rgba(229, 231, 235, 0.5)', // Light grid for contrast
              lineWidth: 1
            }
          },
          y: { 
            ticks: { display: false }, // Hide Y-axis labels
            grid: { display: false }
          }
        },
  elements: { bar: { borderRadius: 4 } }
      }
    });
    let barBuf = null;
    if (hasTimeData && sorted.length) {
      try {
        barBuf = Buffer.from((await barChart.toDataUrl()).split(',')[1], 'base64');
      } catch (error) {
        console.warn('Failed to generate bar chart:', error.message || error);
      }
    }

    // Fetch Focus Sessions & Problem Sessions for same local day (optional)
    let focusSummary = null;
    let problemSummary = null;
    let focusSessionsForDay = [];
    let problemSessionsForDay = [];
    let blockedSites = [];
    let blockedKeywords = [];
    try {
      const tzOffsetMs = timezone * 60 * 1000; // minutes -> ms
      const localStartUTC = new Date(Date.parse(date + 'T00:00:00.000Z') - tzOffsetMs);
      const localEndUTC = new Date(localStartUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

      focusSessionsForDay = await FocusSession.find({
        userId: req.user.id,
        startTime: { $gte: localStartUTC, $lte: localEndUTC },
        status: { $in: ['completed', 'interrupted'] }
      }).select('duration productivity startTime endTime status sessionType').lean();
      const completedFocus = focusSessionsForDay.filter(s => s.status === 'completed');
      if (completedFocus.length) {
        const totalMinutes = completedFocus.reduce((a, s) => a + (s.duration || 0), 0);
        const avgProd = Math.round(completedFocus.reduce((a, s) => a + (s.productivity || 0), 0) / completedFocus.length);
        focusSummary = { count: completedFocus.length, totalMinutes, avgProd };
      }

      problemSessionsForDay = await ProblemSession.find({
        userEmail: req.user.email,
        userLocalDate
      }).select('title category difficulty status duration wasSuccessful startTime endTime url').lean();
      if (problemSessionsForDay.length) {
        const completed = problemSessionsForDay.filter(s => s.status === 'completed');
        const success = completed.filter(s => s.wasSuccessful !== false); // default true
        const totalActiveSeconds = problemSessionsForDay.reduce((a, s) => a + (s.duration ? Math.max(0, Math.floor(s.duration / 1000)) : 0), 0);
        const successRate = completed.length ? (success.length / completed.length * 100).toFixed(1) : '0.0';
        problemSummary = {
          total: problemSessionsForDay.length,
          completed: completed.length,
          successRate,
          totalActiveSeconds
        };
      }

      // Guard data
  blockedSites = await BlockedSite.find({ userEmail: targetEmail }).select('domain').lean();
  blockedKeywords = await BlockedKeyword.find({ userEmail: targetEmail }).select('keyword').lean();
    } catch (e) {
      console.warn('Optional session summaries failed:', e.message);
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

    // HEADER BAR
    const headerColor = '#1f2937';
    const accentColor = '#2563eb';
    const lightGray = '#e5e7eb';
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const startXHeader = doc.page.margins.left;
    doc.save();
    doc.rect(startXHeader, 40, pageWidth, 60).fill(headerColor);
    doc.fillColor('#ffffff').fontSize(20).text('TimeMachine Daily Report', startXHeader + 14, 52, { width: pageWidth - 28, align: 'left' });
  doc.fontSize(10).fillColor('#d1d5db').text(`Date: ${new Date(date).toLocaleDateString('en-US', { timeZone: rows[0]?.timezone?.name || 'UTC' })}  |  User: ${targetEmail}`,
      startXHeader + 14, 78, { width: pageWidth - 28, align: 'left' });
    doc.restore();
    doc.y = 110;

    // Section title helper to keep consistent left alignment and style
    const tabs = ['Summary','Analytics','Focus','Solver','Guard','Charts'];
    const drawTabs = (active) => {
      const padX = 10; const padY = 6; let x = doc.page.margins.left; const y = doc.y; const gap = 6;
      doc.fontSize(8).font('Helvetica');
      tabs.forEach(t => {
        const w = doc.widthOfString(t) + padX * 2;
        const h = 18;
        doc.save();
        if (t === active) {
          doc.roundedRect(x, y, w, h, 5).fill(accentColor);
          doc.fillColor('#ffffff').text(t, x + padX, y + padY - 2);
        } else {
          doc.roundedRect(x, y, w, h, 5).stroke('#cbd5e1');
          doc.fillColor('#475569').text(t, x + padX, y + padY - 2);
        }
        doc.restore();
        x += w + gap;
      });
      doc.moveDown(1.0);
    };
    const sectionTitle = (label) => {
      doc.x = doc.page.margins.left;
      drawTabs(label);
      const y0 = doc.y;
      doc.save();
      doc.rect(doc.page.margins.left, y0 + 2, 4, 14).fill(accentColor);
      doc.fillColor(accentColor).fontSize(13).text('  ' + label, doc.page.margins.left + 4, y0, { continued: false });
      doc.restore();
      doc.moveDown(0.45);
      doc.x = doc.page.margins.left;
    };

    // -------- SUMMARY (Tab: Summary) --------
    sectionTitle('Summary');
    const metrics = [
      { label: 'Total Time', value: formatDuration(total) },
      { label: 'Productive', value: formatDuration(productiveSeconds) },
      { label: 'Focus Ratio', value: total ? String(focusRatio) + '%' : '0%' },
      { label: 'Productivity', value: String(productivityScore) + '%' },
      { label: 'Focus Sessions', value: String(focusSummary ? focusSummary.count : 0) },
      { label: 'Problems Solved', value: String(problemSummary ? problemSummary.completed : 0) },
      { label: 'Blocked Sites', value: String(blockedSites.length) },
      { label: 'Blocked Keywords', value: String(blockedKeywords.length) }
    ];
    console.log('Metrics data:', {
      total,
      productiveSeconds,
      focusRatio,
      productivityScore,
      focusSummary,
      problemSummary,
      blockedSitesLength: blockedSites.length,
      blockedKeywordsLength: blockedKeywords.length
    });
    const gridCols = 4; const boxW = (pageWidth - (gridCols - 1) * 8) / gridCols; const boxH = 40;
    let gx = doc.page.margins.left; let gy = doc.y;
    metrics.forEach((m,i)=>{
      if (i && i % gridCols === 0) { gx = doc.page.margins.left; gy += boxH + 6; }
      doc.save();
      doc.roundedRect(gx, gy, boxW, boxH, 6).stroke(lightGray);
      doc.fillColor('#6b7280').fontSize(7).text(m.label.toUpperCase(), gx+6, gy+6, { width: boxW-12 });
      doc.fontSize(12).fillColor(accentColor).text(m.value, gx+6, gy+18, { width: boxW-12 });
      doc.restore();
      gx += boxW + 8;
    });
    doc.y = gy + boxH + 10;

    // -------- ANALYTICS (Tab: Analytics) --------
    sectionTitle('Analytics');
    doc.moveDown(0.35);
    doc.fontSize(8).fillColor('#64748b').text('Category breakdown & pie chart are in the Charts tab.');
    doc.moveDown(0.4);
  const topDomains = sorted;
    const colSpec = [28, 200, 60, 55, 55];
    const headers = ['#','Domain','Time','Sess','Avg'];
    let tStartX = doc.page.margins.left;
    let ty = doc.y; const tRowH = 20; const tW = colSpec.reduce((a,b)=>a+b,0);
    const drawTopHead = () => { doc.font('Helvetica-Bold'); doc.rect(tStartX, ty, tW, tRowH).fill('#e5e7eb'); doc.fillColor('#000').fontSize(9); let cx=tStartX+4; headers.forEach((h,i)=>{ doc.text(h,cx,ty+5,{width:colSpec[i]-8}); cx+=colSpec[i]; }); ty+=tRowH; doc.font('Helvetica'); };
    drawTopHead();
    topDomains.forEach(([dom, secs], i) => {
      if (ty + tRowH > doc.page.height - 80) { doc.addPage(); ty = doc.page.margins.top; drawTopHead(); }
      const stat = domainStats[dom];
      const cells=[String(i+1), dom.length>24? dom.slice(0,21)+'...':dom, formatDuration(secs), String(stat.count), formatDuration(Math.round(stat.avg) || 0)];
      doc.rect(tStartX, ty, tW, tRowH).fill(i%2===0? '#ffffff':'#f9fafb');
      doc.fillColor('#111827').fontSize(8); let cx=tStartX+4; cells.forEach((c,ci)=>{ doc.text(c,cx,ty+5,{width:colSpec[ci]-8}); cx+=colSpec[ci]; }); ty+=tRowH;
    });
    doc.fontSize(7).fillColor('#64748b').text(`Domains shown: ${topDomains.length}`, tStartX, ty + 6);
    doc.moveDown(0.5);
    doc.moveDown(0.15);

    // -------- FOCUS (Tab: Focus) --------
  sectionTitle('Focus');
    if (focusSummary) {
      doc.moveDown(0.15);
      doc.fontSize(10).fillColor('#111827').text(`Completed: ${focusSummary.count}   Time: ${focusSummary.totalMinutes}m   Avg Productivity: ${focusSummary.avgProd}%`);
    } else {
      doc.moveDown(0.15);
      doc.fontSize(10).fillColor('#6b7280').text('No completed focus sessions.');
    }
    if (focusSessionsForDay.length) {
      doc.moveDown(0.35);
      const tzName = rows[0]?.timezone?.name || 'UTC';
      const fsData = focusSessionsForDay.slice(0,15);
      const fsCols=[20,55,85,85,40];
      const fsHeaders=['#','Type','Start','End','Dur'];
      let fx=doc.page.margins.left; let fy=doc.y; const fH=16; const fW=fsCols.reduce((a,b)=>a+b,0);
      const drawFsHead=()=>{ doc.font('Helvetica-Bold'); doc.rect(fx,fy,fW,fH).fill('#e5e7eb'); doc.fillColor('#000').fontSize(8); let cx=fx+4; fsHeaders.forEach((h,i)=>{ doc.text(h,cx,fy+4,{width:fsCols[i]-8}); cx+=fsCols[i]; }); fy+=fH; doc.font('Helvetica'); };
      drawFsHead();
      fsData.forEach((s,i)=>{ if (fy+fH>doc.page.height-60){ doc.addPage(); fy=doc.page.margins.top; drawFsHead(); }
        const typeDisp = (s.sessionType || '').toString().slice(0,10) || '-';
        const cells=[
          String(i+1),
          typeDisp.charAt(0).toUpperCase()+typeDisp.slice(1),
          new Date(s.startTime).toLocaleTimeString('en-US',{timeZone:tzName,hour:'2-digit',minute:'2-digit'}),
          new Date(s.endTime).toLocaleTimeString('en-US',{timeZone:tzName,hour:'2-digit',minute:'2-digit'}),
          `${s.duration}m`
        ];
        doc.rect(fx,fy,fW,fH).fill(i%2===0? '#ffffff':'#f3f4f6'); doc.fillColor('#111827').fontSize(8); let cx=fx+4; cells.forEach((c,ci)=>{ doc.text(c,cx,fy+4,{width:fsCols[ci]-8}); cx+=fsCols[ci]; }); fy+=fH; });
      if (focusSessionsForDay.length>fsData.length) { doc.fontSize(7).fillColor('#6b7280').text(`+${focusSessionsForDay.length-fsData.length} more`); }
    }
    doc.moveDown(0.5);

    // -------- SOLVER (Tab: Solver) --------
  sectionTitle('Solver');
    if (problemSummary) {
      doc.moveDown(0.15);
      const activeRoundedMins = Math.round(problemSummary.totalActiveSeconds / 60);
      const activeDisplay = activeRoundedMins >= 60 ? `${Math.floor(activeRoundedMins/60)}h ${activeRoundedMins%60}m` : `${activeRoundedMins}m`;
      doc.fontSize(10).fillColor('#111827').text(`Sessions: ${problemSummary.total}   Completed: ${problemSummary.completed}   Active: ${activeDisplay}`);
    } else {
      doc.moveDown(0.15);
      doc.fontSize(10).fillColor('#6b7280').text('No problem solving sessions.');
    }
    if (problemSessionsForDay.length) {
      doc.moveDown(0.35);
      const psData = problemSessionsForDay.slice(0,15);
      const psCols=[20,150,55,55,150];
      const psHeaders=['#','Title','Cat','Dur','URL'];
      let px=doc.page.margins.left; let py=doc.y; const pH=16; const pW=psCols.reduce((a,b)=>a+b,0);
      const drawPsHead=()=>{ doc.font('Helvetica-Bold'); doc.rect(px,py,pW,pH).fill('#e5e7eb'); doc.fillColor('#000').fontSize(8); let cx=px+4; psHeaders.forEach((h,i)=>{ doc.text(h,cx,py+4,{width:psCols[i]-8}); cx+=psCols[i]; }); py+=pH; doc.font('Helvetica'); };
      drawPsHead();
      psData.forEach((s,i)=>{ if (py+pH>doc.page.height-60){ doc.addPage(); py=doc.page.margins.top; drawPsHead(); }
        const durS = s.duration ? Math.max(0, Math.floor(s.duration/1000)) : 0;
        const rawUrl = s.url || '';
        let urlDisp = rawUrl ? (rawUrl.replace(/^https?:\/\//,'').slice(0,34)) : '';
        const cells=[String(i+1),(s.title||'').slice(0,28), s.category||'-', formatDuration(durS), urlDisp];
        doc.rect(px,py,pW,pH).fill(i%2===0? '#ffffff':'#f3f4f6');
        let cx=px+4; cells.forEach((c,ci)=>{
          if (ci === cells.length-1 && rawUrl) {
            const linkWidth = psCols[ci]-8;
            doc.fillColor('#1d4ed8').fontSize(8).text(c,cx,py+4,{width:linkWidth, underline:true});
            try { doc.link(cx, py+4, linkWidth, pH-6, rawUrl); } catch(_){}
          } else {
            doc.fillColor('#111827').fontSize(8).text(c,cx,py+4,{width:psCols[ci]-8});
          }
          cx+=psCols[ci];
        });
        py+=pH; });
      if (problemSessionsForDay.length>psData.length) { doc.fontSize(7).fillColor('#6b7280').text(`+${problemSessionsForDay.length-psData.length} more`); }
    }
    doc.moveDown(0.4);

    // -------- GUARD (Tab: Guard) --------
  sectionTitle('Guard');
    if (!blockedSites.length && !blockedKeywords.length) {
      doc.moveDown(0.15);
      doc.fontSize(10).fillColor('#6b7280').text('No guard rules configured.');
    } else {
      doc.moveDown(0.15);
      const guardData = [
        ...blockedSites.map(s => ({ name: s.domain, type: 'Website' })),
        ...blockedKeywords.map(k => ({ name: k.keyword, type: 'Keyword' }))
      ].slice(0, 20);
      if (guardData.length) {
        doc.fontSize(10).fillColor('#111827').text(`Blocked Items (${guardData.length})`);
        const gCols = [22, 200, 100];
        const gHeaders = ['#', 'Name', 'Type'];
        let gx = doc.page.margins.left; let gy = doc.y + 4; const gH = 18; const gW = gCols.reduce((a,b)=>a+b,0);
        const drawGHead = () => { 
          doc.font('Helvetica-Bold'); 
          doc.rect(gx, gy, gW, gH).fill('#e5e7eb'); 
          doc.fillColor('#000').fontSize(8); 
          let cx = gx + 4; 
          gHeaders.forEach((h,i)=>{ 
            doc.text(h, cx, gy + 5, { width: gCols[i] - 8 }); 
            cx += gCols[i]; 
          }); 
          gy += gH; 
          doc.font('Helvetica'); 
        };
        drawGHead();
        guardData.forEach((item, i) => { 
          if (gy + gH > doc.page.height - 80) { 
            doc.addPage(); 
            gy = doc.page.margins.top; 
            drawGHead(); 
          }
          const cells = [String(i + 1), item.name.slice(0, 28), item.type];
          doc.rect(gx, gy, gW, gH).fill(i % 2 === 0 ? '#ffffff' : '#f9fafb'); 
          doc.fillColor('#111827').fontSize(8); 
          let cx = gx + 4; 
          cells.forEach((c, ci) => { 
            doc.text(c, cx, gy + 5, { width: gCols[ci] - 8 }); 
            cx += gCols[ci]; 
          }); 
          gy += gH; 
        });
        if (guardData.length > 20) { 
          doc.fontSize(8).fillColor('#6b7280').text(`+${guardData.length - 20} more items not shown`); 
        }
      }
    }
    doc.moveDown(0.4);

    // -------- CHARTS (END) --------
    const estPieHeight = 280;
    const estBarHeight = 320;
    const needed = estPieHeight + (barBuf ? estBarHeight : 0) + 120;
    const available = (doc.page.height - doc.page.margins.bottom) - doc.y;
    if (available < needed) {
      doc.addPage();
    } else {
      doc.moveDown(0.3);
    }
  sectionTitle('Charts');
    doc.moveDown(0.1);
    // Internal Donut Pie
    const pieColors = ['#1e40af', '#dc2626', '#9333ea', '#059669', '#4b5563'];
  const valuesRaw = catOrder.map(k => categoryTimes[k] || 0);
    const sumRaw = valuesRaw.reduce((a,b)=>a+b,0) || 1;
    const epsilon = sumRaw * 0.001;
    const adjustedValues = valuesRaw.map(v => v === 0 ? epsilon : v);
    const totalAdj = adjustedValues.reduce((a,b)=>a+b,0) || 1;
    const radius = 100;
    const centerX = doc.page.margins.left + pageWidth/2;
    const centerY = doc.y + radius + 20;
    let startAngle = -90;
    try {
      adjustedValues.forEach((v,i)=>{
        const angle = (v/totalAdj)*360;
        const endAngle = startAngle + angle;
        doc.save();
        doc.path(`M ${centerX} ${centerY} L ${centerX + radius * Math.cos(startAngle*Math.PI/180)} ${centerY + radius * Math.sin(startAngle*Math.PI/180)} A ${radius} ${radius} 0 ${angle>180?1:0} 1 ${centerX + radius * Math.cos(endAngle*Math.PI/180)} ${centerY + radius * Math.sin(endAngle*Math.PI/180)} Z`);
        doc.fill(pieColors[i % pieColors.length]);
        doc.restore();
        startAngle = endAngle;
      });
      doc.save();
      doc.circle(centerX, centerY, radius*0.5).fill('#ffffff');
      doc.restore();
    } catch (e) {
      console.warn('Pie chart rendering failed:', e.message);
      doc.fontSize(9).fillColor('#64748b').text('Pie chart rendering failed.', doc.page.margins.left, centerY);
    }
    doc.fontSize(11).fillColor('#334155').text('Time Distribution by Category', doc.page.margins.left, centerY - radius - 16, { width: pageWidth, align: 'center' });
    let legendY = centerY + radius + 12;
    const legBox = 12;
    catOrder.forEach((c,i)=>{
      const realVal = valuesRaw[i];
      const pct = sumRaw ? ((realVal/sumRaw)*100).toFixed(1) : '0.0';
      doc.save();
      doc.rect(doc.page.margins.left, legendY, legBox, legBox).fill(pieColors[i % pieColors.length]);
      doc.restore();
      doc.fontSize(9).fillColor('#111827').text(
        `${c}: ${formatDuration(realVal)} (${pct}%)`,
        doc.page.margins.left + legBox + 6,
        legendY,
        { width: pageWidth - legBox - 12 }
      );
      legendY += legBox + 8;
    });
    doc.y = legendY + 20;

    // Bar chart below
  if (barBuf) {
      const bw = pageWidth * 0.85; const bh = bw * (520/900); const bx = doc.page.margins.left + (pageWidth - bw)/2;
      if (doc.y + bh > doc.page.height - 70) { doc.addPage(); sectionTitle('Charts'); doc.moveDown(0.2); }
      doc.image(barBuf, bx, doc.y, { width: bw, height: bh });
      doc.y += bh + 12;
      doc.fontSize(8).fillColor('#64748b').text('Bar units: hours (values truncated to two decimals).', doc.page.margins.left, doc.y, { width: pageWidth, align: 'center' });
      doc.moveDown(0.35);
    } else {
      doc.fontSize(9).fillColor('#64748b').text('Bar chart unavailable (generation failed or no data).');
      doc.moveDown(0.4);
    }

    // Simple footer on last page only
    const addFooter = () => {
      const saveY = doc.y;
      const now = new Date();
      const hr12 = (now.getHours()%12) || 12;
      const mm = String(now.getMinutes()).padStart(2,'0');
      const ss = String(now.getSeconds()).padStart(2,'0');
      const ampm = now.getHours() < 12 ? 'am' : 'pm';
      const dtStr = `${now.getMonth()+1}/${now.getDate()}/${now.getFullYear()}, ${hr12}:${mm}:${ss} ${ampm}`;
      doc.fontSize(8).fillColor('#6b7280');
      const txt = `Generated ${dtStr} | TimeMachine`;
      doc.text(txt, doc.page.margins.left, doc.page.height - doc.page.margins.bottom - 10, { width: pageWidth, align: 'center' });
      doc.y = saveY;
    };
    addFooter();

    // If no browsing / activity data at all, append a friendly note
    if (!hasTimeData && !focusSummary && !problemSummary) {
      doc.addPage();
      sectionTitle('Summary');
      doc.fontSize(12).fillColor('#334155').text('No activity recorded for this day.', { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(9).fillColor('#64748b').text('Tracking may have been disabled or there was simply no qualifying activity.', { align: 'left' });
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