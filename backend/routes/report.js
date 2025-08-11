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
      if (Array.isArray(r.sessions)) domainSessions[r.domain] = r.sessions.map(s => ({ startTime: new Date(s.startTime).toLocaleTimeString(), endTime: new Date(s.endTime).toLocaleTimeString(), duration: Math.floor((s.duration||0)/1000) }));
    });
    if (!Object.keys(domainTimes).length) return res.status(404).json({ error: 'No valid time data after processing.' });

    const sorted = Object.entries(domainTimes).sort((a,b)=>b[1]-a[1]);
    const total = Object.values(domainTimes).reduce((a,b)=>a+b,0);

    const catChart = new QuickChart();
    catChart.setConfig({ type:'doughnut', data:{ labels:Object.keys(categoryTimes), datasets:[{ data:Object.values(categoryTimes), backgroundColor:['#3b82f6','#ef4444','#8b5cf6','#10b981','#6b7280'] }] }, options:{ plugins:{ legend:{ position:'right' }, title:{ display:true, text:'Time by Category'} }, cutout:'60%' } });
    const catBuf = Buffer.from((await catChart.toDataUrl()).split(',')[1],'base64');
    const barChart = new QuickChart();
    barChart.setConfig({ type:'bar', data:{ labels:sorted.map(d=>d[0]), datasets:[{ label:'Seconds', data:sorted.map(d=>d[1]), backgroundColor: sorted.map((_,i)=> i===0?'#ff0000': i===1?'#ffa500': i===2?'#008000':'#60a5fa') }] }, options:{ indexAxis:'y', plugins:{ legend:{ display:false }, title:{ display:true, text:'All Sites Time Spent'} } } });
    const barBuf = Buffer.from((await barChart.toDataUrl()).split(',')[1],'base64');

    const doc = new PDFDocument({ margin:50 });
    const chunks=[]; doc.on('data',c=>chunks.push(c)); doc.on('end',()=>{ const pdf=Buffer.concat(chunks); res.set({ 'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="daily_report_${date}.pdf"`,'Content-Length':pdf.length }); res.send(pdf); });

    doc.fontSize(20).text('TimeMachine Daily Report',{ align:'center' });
    doc.moveDown(0.5); doc.fontSize(12).text(`Date: ${new Date(date).toLocaleDateString()}`,{ align:'center' });
    doc.text(`User: ${userEmail}`,{ align:'center' }); doc.text(`Generated: ${new Date().toLocaleString()}`,{ align:'center' });
    doc.moveDown(); doc.fontSize(14).text(`Total Time Tracked: ${formatDuration(total)}`,{ align:'center' });
    doc.moveDown(); doc.fontSize(12).text('Key Insights:',{ underline:true }); doc.moveDown(0.3);
    if (sorted.length){ const [topDom, topSec]=sorted[0]; doc.text(`- Top site: ${topDom} (${formatDuration(topSec)} / ${(topSec/total*100).toFixed(1)}%)`); }
    const topCat = Object.entries(categoryTimes).sort((a,b)=>b[1]-a[1])[0]; if(topCat) doc.text(`- Main activity: ${topCat[0]} (${(topCat[1]/total*100).toFixed(1)}%)`);
    doc.text(`- Unique domains: ${Object.keys(domainTimes).length}`); doc.moveDown();

    const startX=50; let y=doc.y; const rowH=22; const widths=[40,180,80,80,140];
    const drawHead=()=>{ doc.font('Helvetica-Bold'); doc.rect(startX,y,widths.reduce((a,b)=>a+b,0),rowH).fill('#f3f4f6'); doc.fillColor('#000').fontSize(10)
      .text('Rank',startX+5,y+6,{width:widths[0]})
      .text('Domain',startX+widths[0]+5,y+6,{width:widths[1]})
      .text('Time',startX+widths[0]+widths[1]+5,y+6,{width:widths[2]})
      .text('Category',startX+widths[0]+widths[1]+widths[2]+5,y+6,{width:widths[3]})
      .text('Sessions',startX+widths[0]+widths[1]+widths[2]+widths[3]+5,y+6,{width:widths[4]}); y+=rowH; doc.font('Helvetica'); };
    drawHead();
    sorted.forEach(([dom, secs], i)=>{ if (y+rowH>doc.page.height-50){ doc.addPage(); y=50; drawHead(); } const cat=domainCategories[dom]||'Other'; const sess=domainSessions[dom]||[]; const wSum=widths.reduce((a,b)=>a+b,0);
      if (i===0) doc.rect(startX,y,wSum,rowH).fill('#ffdddd'); else if (i===1) doc.rect(startX,y,wSum,rowH).fill('#ffeacc'); else if (i===2) doc.rect(startX,y,wSum,rowH).fill('#ddffdd'); else if (i%2===0) doc.rect(startX,y,wSum,rowH).fill('#ffffff'); else doc.rect(startX,y,wSum,rowH).fill('#f9f9f9');
      let sessText='No sessions'; if (sess.length===1) sessText=`${sess[0].startTime}-${sess[0].endTime}`; else if (sess.length>1) sessText=`${sess.length} sessions\n${sess[0].startTime}-${sess[0].endTime}`; doc.fillColor('#000').fontSize(9)
        .text(String(i+1),startX+5,y+5,{width:widths[0]})
        .text(dom,startX+widths[0]+5,y+5,{width:widths[1]})
        .text(formatDuration(secs),startX+widths[0]+widths[1]+5,y+5,{width:widths[2]})
        .text(cat,startX+widths[0]+widths[1]+widths[2]+5,y+5,{width:widths[3]})
        .text(sessText,startX+widths[0]+widths[1]+widths[2]+widths[3]+5,y+5,{width:widths[4]}); y+=rowH; });

    doc.addPage(); y=50; doc.fontSize(16).text('Time Distribution by Category'); doc.moveDown(0.5); doc.image(catBuf,{fit:[400,250],align:'center'});
    doc.moveDown(); doc.fontSize(16).text('All Sites Time Spent'); doc.moveDown(0.5); doc.image(barBuf,{fit:[400,300],align:'center'});

    doc.end();
  } catch (e) {
    console.error('Report generation error:', e); return res.status(500).json({ error:'Failed to generate report', details: e.message });
  }
});

module.exports = router;
