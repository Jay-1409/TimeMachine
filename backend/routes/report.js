const express = require('express');
const router = express.Router();
const TimeData = require('../models/TimeData');
const PDFDocument = require('pdfkit');
const QuickChart = require('quickchart-js');

function formatDuration(seconds) {
  if (isNaN(seconds) || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

router.post('/generate', async (req, res) => {
  const { date, userEmail } = req.body;
  if (!date || !userEmail) return res.status(400).json({ error: 'Date and userEmail are required' });
  try {
    const rows = await TimeData.find({ userEmail, date }).select('domain totalTime category sessions').lean();
    if (!rows.length) return res.status(404).json({ error: 'No data found for that date.' });

    const domainTimes = {}; const categoryTimes = { Work:0, Social:0, Entertainment:0, Professional:0, Other:0 }; const domainCategories = {}; const domainSessions = {};
    rows.forEach(r => {
      const secs = Math.min(Math.floor((r.totalTime||0)/1000), 86400);
      if (!secs) return;
      domainTimes[r.domain] = (domainTimes[r.domain]||0) + secs;
      const cat = categoryTimes.hasOwnProperty(r.category) ? r.category : 'Other';
      categoryTimes[cat] += secs; domainCategories[r.domain] = cat;
      if (Array.isArray(r.sessions) && r.sessions.length) {
        // Filter out zero / negative durations & obviously huge (>12h) anomalies
        const clean = r.sessions.filter(s => typeof s.duration==='number' && s.duration>0 && s.duration < 12*3600*1000);
        domainSessions[r.domain] = clean.map(s => ({
          start: s.startTime,
          end: s.endTime,
          durS: Math.floor((s.duration||0)/1000)
        }));
      }
    });
    if (!Object.keys(domainTimes).length) return res.status(404).json({ error: 'No valid time data after processing.' });

    const sorted = Object.entries(domainTimes).sort((a,b)=>b[1]-a[1]);
    const total = Object.values(domainTimes).reduce((a,b)=>a+b,0);

    // Derive session-level aggregate insights
    let allSessionDurations = [];
    let totalSessions = 0; let productiveSeconds = 0;
    const productiveCats = new Set(['Work','Professional']);
    Object.entries(domainSessions).forEach(([dom,sArr])=>{
      totalSessions += sArr.length;
      allSessionDurations.push(...sArr.map(s=>s.durS));
    });
    productiveSeconds = Object.entries(domainTimes).reduce((acc,[dom,secs])=> acc + (productiveCats.has(domainCategories[dom]) ? secs : 0),0);
    const focusRatio = total? (productiveSeconds/total*100):0;
    allSessionDurations.sort((a,b)=>a-b);
    const medianSession = allSessionDurations.length? allSessionDurations[Math.floor(allSessionDurations.length/2)]:0;
    const longestSession = allSessionDurations.length? Math.max(...allSessionDurations):0;

    // Per-domain stats for table
    const domainStats = {};
    sorted.forEach(([dom])=>{
      const sess = domainSessions[dom]||[];
      if (!sess.length) { domainStats[dom]={count:0,avg:0,long:0,first:null,last:null}; return; }
      const count = sess.length;
      const sum = sess.reduce((a,s)=>a+s.durS,0);
      const avg = sum/count;
      const long = Math.max(...sess.map(s=>s.durS));
      const first = new Date(Math.min(...sess.map(s=>s.start))).toLocaleTimeString();
      const last = new Date(Math.max(...sess.map(s=>s.end))).toLocaleTimeString();
      domainStats[dom]={count,avg,long,first,last};
    });

    // Charts
    const catChart = new QuickChart();
    catChart.setConfig({ type:'doughnut', data:{ labels:Object.keys(categoryTimes), datasets:[{ data:Object.values(categoryTimes), backgroundColor:['#3b82f6','#ef4444','#8b5cf6','#10b981','#6b7280'] }] }, options:{ plugins:{ legend:{ position:'right' }, title:{ display:true, text:'Time by Category'} }, cutout:'60%' } });
    const catBuf = Buffer.from((await catChart.toDataUrl()).split(',')[1],'base64');
    const barChart = new QuickChart();
    barChart.setConfig({ type:'bar', data:{ labels:sorted.map(d=>d[0]), datasets:[{ label:'Seconds', data:sorted.map(d=>d[1]), backgroundColor: sorted.map((_,i)=> i===0?'#ff0000': i===1?'#ffa500': i===2?'#008000':'#60a5fa') }] }, options:{ indexAxis:'y', plugins:{ legend:{ display:false }, title:{ display:true, text:'All Sites Time Spent'} } } });
    const barBuf = Buffer.from((await barChart.toDataUrl()).split(',')[1],'base64');

    const doc = new PDFDocument({ margin:50 });
    const chunks=[]; doc.on('data',c=>chunks.push(c)); doc.on('end',()=>{ const pdf=Buffer.concat(chunks); res.set({ 'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="daily_report_${date}.pdf"`,'Content-Length':pdf.length }); res.send(pdf); });

    // Header
    doc.fontSize(20).text('TimeMachine Daily Report',{ align:'center' });
    doc.moveDown(0.5); doc.fontSize(12).text(`Date: ${new Date(date).toLocaleDateString()}`,{ align:'center' });
    doc.text(`User: ${userEmail}`,{ align:'center' }); doc.text(`Generated: ${new Date().toLocaleString()}`,{ align:'center' });
    doc.moveDown(); doc.fontSize(14).text(`Total Time Tracked: ${formatDuration(total)}`,{ align:'center' });

    // Key Insights
    doc.moveDown(); doc.fontSize(12).text('Key Insights',{ underline:true }); doc.moveDown(0.35);
    if (sorted.length){ const [topDom, topSec]=sorted[0]; doc.text(`• Top site: ${topDom} (${formatDuration(topSec)} / ${(topSec/total*100).toFixed(1)}%)`); }
    const topCat = Object.entries(categoryTimes).sort((a,b)=>b[1]-a[1])[0]; if(topCat) doc.text(`• Main activity: ${topCat[0]} (${(topCat[1]/total*100).toFixed(1)}%)`);
    doc.text(`• Unique domains: ${Object.keys(domainTimes).length}`);
    doc.text(`• Total sessions: ${totalSessions}`);
    doc.text(`• Median session: ${formatDuration(medianSession)}`);
    doc.text(`• Longest session: ${formatDuration(longestSession)}`);
    doc.text(`• Focus ratio (Work+Professional): ${focusRatio.toFixed(1)}%`);
    doc.moveDown();

  // Domain Table (Rank, Domain, Time, Category, Sessions, AvgSess, Longest)
  const startX=50; let y=doc.y; const rowH=22; const widths=[36,150,70,70,60,70,70];
  const headerLabels=['#','Domain','Time','Category','Sess','Avg','Longest'];
    const drawHead=()=>{ doc.font('Helvetica-Bold'); const totalW=widths.reduce((a,b)=>a+b,0); doc.rect(startX,y,totalW,rowH).fill('#f3f4f6'); doc.fillColor('#000').fontSize(9);
      let x=startX+5; headerLabels.forEach((lab,i)=>{ doc.text(lab,x,y+6,{width:widths[i]-10,ellipsis:true}); x+=widths[i]; }); y+=rowH; doc.font('Helvetica'); };
    drawHead();
    sorted.forEach(([dom, secs], i)=>{
      if (y+rowH>doc.page.height-50){ doc.addPage(); y=50; drawHead(); }
      const stat = domainStats[dom]; const cat=domainCategories[dom]||'Other';
      const totalW=widths.reduce((a,b)=>a+b,0);
      if (i===0) doc.rect(startX,y,totalW,rowH).fill('#ffdddd'); else if (i===1) doc.rect(startX,y,totalW,rowH).fill('#ffeacc'); else if (i===2) doc.rect(startX,y,totalW,rowH).fill('#ddffdd'); else if (i%2===0) doc.rect(startX,y,totalW,rowH).fill('#ffffff'); else doc.rect(startX,y,totalW,rowH).fill('#f9f9f9');
      doc.fillColor('#000').fontSize(8);
      let x=startX+5;
      const cells=[String(i+1), dom, formatDuration(secs), cat, String(stat.count), formatDuration(Math.round(stat.avg)||0), formatDuration(stat.long||0)];
      cells.forEach((c,ci)=>{ doc.text(c,x,y+5,{width:widths[ci]-10,ellipsis:true}); x+=widths[ci]; });
      y+=rowH;
    });

    // Charts page
    doc.addPage(); y=50; doc.fontSize(16).text('Time Distribution by Category'); doc.moveDown(0.5); doc.image(catBuf,{fit:[400,250],align:'center'});
    doc.moveDown(); doc.fontSize(16).text('All Sites Time Spent'); doc.moveDown(0.5); doc.image(barBuf,{fit:[400,300],align:'center'});

    doc.end();
  } catch (e) {
    console.error('Report generation error:', e); return res.status(500).json({ error:'Failed to generate report', details: e.message });
  }
});

module.exports = router;
