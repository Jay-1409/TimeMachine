const express = require("express");
const router = express.Router();
const TimeData = require("../models/TimeData");
const PDFDocument = require("pdfkit");
const QuickChart = require("quickchart-js");

function formatDuration(seconds) {
  if (isNaN(seconds) || seconds <= 0) return "0m";
  if (seconds > 86400) {
    console.warn(`Unusually large time value: ${seconds} seconds`);
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}

router.post("/generate", async (req, res) => {
  const { date, userEmail } = req.body;
  if (!date || !userEmail) {
    return res.status(400).json({ error: "Date and userEmail are required" });
  }

  try {
    const startOfDay = new Date(date).setHours(0, 0, 0, 0);
    const endOfDay = new Date(date).setHours(23, 59, 59, 999);
    const timeDataList = await TimeData.find({
      userEmail,
      date: { $gte: new Date(startOfDay), $lte: new Date(endOfDay) },
    }).select('domain totalTime category');
    console.log(`Raw timeDataList for ${userEmail} on ${date}:`, JSON.stringify(timeDataList, null, 2));

    if (!timeDataList || timeDataList.length === 0) {
      return res.status(404).json({ error: "No data found" });
    }

    const domainTimes = {};
    const categoryTimes = { Work: 0, Social: 0, Entertainment: 0, Professional: 0, Other: 0 };
    const domainCategories = {};

    timeDataList.forEach((data) => {
      const totalTime = Math.min(data.totalTime ? Math.floor(data.totalTime / 1000) : 0, 86400);
      console.log(`Domain: ${data.domain}, Raw totalTime: ${data.totalTime}ms, Converted: ${totalTime}s`);
      if (totalTime > 0) {
        domainTimes[data.domain] = (domainTimes[data.domain] || 0) + totalTime;
        const category = data.category && categoryTimes.hasOwnProperty(data.category) ? data.category : "Other";
        categoryTimes[category] += totalTime;
        domainCategories[data.domain] = category;
      }
    });

    if (Object.keys(domainTimes).length === 0) {
      return res.status(404).json({ error: "No valid time data" });
    }

    const sortedDomainTimes = Object.entries(domainTimes).sort((a, b) => b[1] - a[1]);
    const totalTimeOverall = Object.values(domainTimes).reduce((sum, time) => sum + time, 0);

    const categoryChart = new QuickChart();
    categoryChart.setConfig({
      type: "doughnut",
      data: {
        labels: Object.keys(categoryTimes),
        datasets: [
          {
            data: Object.values(categoryTimes),
            backgroundColor: ["#3b82f6", "#ef4444", "#60a5fa", "#10b981", "#d1d5db"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        plugins: {
          legend: { position: "right" },
          title: { display: true, text: "Time by Category" },
          tooltip: {
            callbacks: {
              label: function (context) {
                return `${context.label}: ${formatDuration(context.raw)}`;
              },
            },
          },
        },
        cutout: "65%",
      },
    });
    const categoryChartBuffer = Buffer.from((await categoryChart.toDataUrl()).split(",")[1], "base64");

    const allSitesBarChart = new QuickChart();
    allSitesBarChart.setConfig({
      type: "bar",
      data: {
        labels: sortedDomainTimes.map((site) => site[0]),
        datasets: [
          {
            label: "Time Spent",
            data: sortedDomainTimes.map((site) => site[1]), // Already in seconds
            backgroundColor: sortedDomainTimes.map((_, index) => {
              if (index === 0) return "#ff0000";
              if (index === 1) return "#ffa500";
              if (index === 2) return "#008000";
              return "#60a5fa";
            }),
            borderWidth: 1,
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
          title: { display: true, text: "All Sites Time Spent" },
          tooltip: {
            callbacks: {
              label: function (context) {
                return `${context.dataset.label}: ${formatDuration(context.raw)}`;
              },
            },
          },
        },
        indexAxis: "y",
        scales: {
          x: {
            beginAtZero: true,
            title: { display: true, text: "Time" },
            ticks: { callback: (value) => formatDuration(value) },
          },
        },
      },
    });
    const allSitesChartBuffer = Buffer.from((await allSitesBarChart.toDataUrl()).split(",")[1], "base64");

    const doc = new PDFDocument({ margin: 50 });
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));

    doc.fontSize(20).text("TimeMachine Daily Report", { align: "center" });
    doc.fontSize(12).text(`Date: ${new Date(date).toLocaleDateString("en-US")}`, { align: "center" });
    doc.text(`User: ${userEmail}`, { align: "center" });
    doc.moveDown();
    doc.fontSize(14).text(`Total Time Tracked: ${formatDuration(totalTimeOverall)}`, { align: "center" });
    doc.moveDown();

    doc.fontSize(12).text("Key Insights:", { underline: true });
    doc.moveDown(0.5);
    doc.text(`- You spent a total of ${formatDuration(totalTimeOverall)} online today.`);
    if (sortedDomainTimes.length > 0) {
      const [topSite, topSiteTime] = sortedDomainTimes[0];
      const topSitePercentage = ((topSiteTime / totalTimeOverall) * 100).toFixed(2);
      doc.text(`- Top site: ${topSite} (${formatDuration(topSiteTime)}, ${topSitePercentage}%).`);
    }
    const topCategory = Object.keys(categoryTimes).reduce((a, b) => (categoryTimes[a] > categoryTimes[b] ? a : b));
    const topCategoryPercentage = ((categoryTimes[topCategory] / totalTimeOverall) * 100).toFixed(2);
    doc.text(`- Main activity: ${topCategory} (${topCategoryPercentage}%).`);
    doc.text(`- Unique domains: ${Object.keys(domainTimes).length}`);
    doc.moveDown();

    doc.fontSize(16).text("Detailed Activity Log");
    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(10);

    const startX = 50;
    let y = doc.y;
    const rowHeight = 20;
    const colWidths = [50, 250, 100, 100];

    const drawTableHeader = () => {
      doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill("#f3f4f6");
      doc.fillColor("#000000")
        .text("Rank", startX + 5, y + 5, { width: colWidths[0], align: "left" })
        .text("Domain", startX + colWidths[0] + 5, y + 5, { width: colWidths[1], align: "left" })
        .text("Time Spent", startX + colWidths[0] + colWidths[1] + 5, y + 5, { width: colWidths[2], align: "left" })
        .text("Category", startX + colWidths[0] + colWidths[1] + colWidths[2] + 5, y + 5, { width: colWidths[3], align: "left" });
      y += rowHeight;
    };

    drawTableHeader();

    for (let i = 0; i < sortedDomainTimes.length; i++) {
      const [domain, time] = sortedDomainTimes[i];
      const category = domainCategories[domain] || "Other";

      if (y + rowHeight > doc.page.height - 50) {
        doc.addPage();
        y = 50;
        drawTableHeader();
      }

      if (i === 0) doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill("#ffdddd");
      else if (i === 1) doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill("#ffeacc");
      else if (i === 2) doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill("#ddffdd");
      else if (i % 2 === 0) doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill("#ffffff");
      else doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill("#f9f9f9");

      doc.fillColor("#000000")
        .font("Helvetica")
        .fontSize(9)
        .text((i + 1).toString(), startX + 5, y + 5, { width: colWidths[0], align: "left" })
        .text(domain, startX + colWidths[0] + 5, y + 5, { width: colWidths[1], align: "left" })
        .text(formatDuration(time), startX + colWidths[0] + colWidths[1] + 5, y + 5, { width: colWidths[2], align: "left" })
        .text(category, startX + colWidths[0] + colWidths[1] + colWidths[2] + 5, y + 5, { width: colWidths[3], align: "left" });

      y += rowHeight;
    }

    doc.addPage();
    y = 50;

    doc.fontSize(16).fillColor("#000000").text("Time Distribution by Category");
    doc.moveDown();
    doc.image(categoryChartBuffer, { fit: [400, 250], align: "center" });

    doc.moveDown();
    doc.fontSize(16).text("All Sites Time Spent (Bar Chart)");
    doc.moveDown();
    doc.image(allSitesChartBuffer, { fit: [400, 300], align: "center" });

    doc.end();

    const pdfBuffer = await new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(buffers))));

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="daily_report_${date}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Report generation error:", error);
    res.status(500).json({ error: "Failed to generate report", details: error.message });
  }
});

module.exports = router;