const express = require("express");
const router = express.Router();
const TimeData = require("../models/TimeData");
const PDFDocument = require("pdfkit");
const QuickChart = require("quickchart-js");

// Helper function to format duration from seconds to human-readable format
function formatDuration(seconds) {
  if (isNaN(seconds) || seconds <= 0) return "0m";
  // Optional: Add a warning for unusually large values if they somehow pass the capping
  if (seconds > 86400) {
    console.warn(`Unusually large time value detected in formatDuration: ${seconds} seconds`);
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  // Improved formatting for clarity
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

// Route to generate the PDF report
router.post("/generate", async (req, res) => {
  const { date, userEmail } = req.body; // 'date' is expected to be "YYYY-MM-DD" string
  if (!date || !userEmail) {
    return res.status(400).json({ error: "Date and userEmail are required" });
  }

  try {
    // Query with sessions data included
    const timeDataList = await TimeData.find({
      userEmail,
      date: date
    }).select('domain totalTime category sessions'); // Include sessions in selection

    // Log the raw data fetched for debugging
    console.log(`Raw timeDataList for ${userEmail} on ${date}:`, JSON.stringify(timeDataList, null, 2));

    if (!timeDataList || timeDataList.length === 0) {
      return res.status(404).json({ error: "No data found for the specified date and user." });
    }

    const domainTimes = {};
    const categoryTimes = {
      Work: 0,
      Social: 0,
      Entertainment: 0,
      Professional: 0,
      Other: 0,
    };
    const domainCategories = {};
    const domainSessions = {}; // Store session details for each domain

    timeDataList.forEach((data) => {
      // totalTime is already in milliseconds, convert to seconds for display
      const totalTimeInSeconds = Math.min(data.totalTime ? Math.floor(data.totalTime / 1000) : 0, 86400);
      console.log(`Domain: ${data.domain}, Raw totalTime: ${data.totalTime}ms, Converted: ${totalTimeInSeconds}s`);

      if (totalTimeInSeconds > 0) {
        domainTimes[data.domain] = (domainTimes[data.domain] || 0) + totalTimeInSeconds;
        const category =
          data.category && categoryTimes.hasOwnProperty(data.category)
            ? data.category
            : "Other";
        categoryTimes[category] += totalTimeInSeconds;
        domainCategories[data.domain] = category;
        
        // Store session information for detailed reporting
        if (data.sessions && Array.isArray(data.sessions)) {
          domainSessions[data.domain] = data.sessions.map(session => ({
            startTime: new Date(session.startTime).toLocaleTimeString(),
            endTime: new Date(session.endTime).toLocaleTimeString(),
            duration: Math.floor(session.duration / 1000) // Convert to seconds
          }));
        }
      }
    });

    if (Object.keys(domainTimes).length === 0) {
      return res.status(404).json({ error: "No valid time data found after processing." });
    }

    const sortedDomainTimes = Object.entries(domainTimes).sort(
      (a, b) => b[1] - a[1]
    );
    const totalTimeOverall = Object.values(domainTimes).reduce(
      (sum, time) => sum + time,
      0
    );

    // --- QuickChart for Category Distribution ---
    const categoryChart = new QuickChart();
    categoryChart.setConfig({
      type: "doughnut",
      data: {
        labels: Object.keys(categoryTimes),
        datasets: [
          {
            data: Object.values(categoryTimes),
            backgroundColor: [
              "#3b82f6", // Blue
              "#ef4444", // Red
              "#60a5fa", // Lighter Blue
              "#10b981", // Green
              "#d1d5db", // Gray
            ],
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
    // Get chart as base64 and convert to buffer
    const categoryChartBuffer = Buffer.from(
      (await categoryChart.toDataUrl()).split(",")[1],
      "base64"
    );

    // --- QuickChart for All Sites Bar Chart ---
    const allSitesBarChart = new QuickChart();
    allSitesBarChart.setConfig({
      type: "bar",
      data: {
        labels: sortedDomainTimes.map((site) => site[0]),
        datasets: [
          {
            label: "Time Spent",
            data: sortedDomainTimes.map((site) => site[1]), // Data is already in seconds
            backgroundColor: sortedDomainTimes.map((_, index) => {
              if (index === 0) return "#ff0000"; // Red for top site
              if (index === 1) return "#ffa500"; // Orange for second
              if (index === 2) return "#008000"; // Green for third
              return "#60a5fa"; // Default blue
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
                return `${context.dataset.label}: ${formatDuration(
                  context.raw
                )}`;
              },
            },
          },
        },
        indexAxis: "y", // Horizontal bars
        scales: {
          x: {
            beginAtZero: true,
            title: { display: true, text: "Time" },
            ticks: { callback: (value) => formatDuration(value) },
          },
        },
      },
    });
    // Get chart as base64 and convert to buffer
    const allSitesChartBuffer = Buffer.from(
      (await allSitesBarChart.toDataUrl()).split(",")[1],
      "base64"
    );

    // --- PDF Generation ---
    const doc = new PDFDocument({ margin: 50 });
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers)); // Collect PDF data chunks

    // Header Section
    doc.fontSize(20).text("TimeMachine Daily Report", { align: "center" });
    doc
      .fontSize(12)
      .text(`Date: ${new Date(date).toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' })}`, { // More readable date format
        align: "center",
      });
    doc.text(`User: ${userEmail}`, { align: "center" });
    doc.moveDown();
    doc
      .fontSize(14)
      .text(`Total Time Tracked: ${formatDuration(totalTimeOverall)}`, {
        align: "center",
      });
    doc.moveDown();

    // Key Insights Section
    doc.fontSize(12).text("Key Insights:", { underline: true });
    doc.moveDown(0.5);
    doc.text(
      `- You spent a total of ${formatDuration(totalTimeOverall)} online today.`
    );
    if (sortedDomainTimes.length > 0) {
      const [topSite, topSiteTime] = sortedDomainTimes[0];
      const topSitePercentage = (
        (topSiteTime / totalTimeOverall) *
        100
      ).toFixed(2);
      doc.text(
        `- Top site: ${topSite} (${formatDuration(
          topSiteTime
        )}, ${topSitePercentage}%).`
      );
    }
    const topCategory = Object.keys(categoryTimes).reduce((a, b) =>
      categoryTimes[a] > categoryTimes[b] ? a : b
    );
    const topCategoryPercentage = (
      (categoryTimes[topCategory] / totalTimeOverall) *
      100
    ).toFixed(2);
    doc.text(`- Main activity: ${topCategory} (${topCategoryPercentage}%).`);
    doc.text(`- Unique domains: ${Object.keys(domainTimes).length}`);
    doc.moveDown();

    // Detailed Activity Log Table with Sessions
    doc.fontSize(16).text("Detailed Activity Log");
    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(10);

    const startX = 50;
    let y = doc.y;
    const rowHeight = 25; // Increased for session info
    const colWidths = [40, 180, 80, 80, 120]; // Rank, Domain, Time, Category, Sessions

    // Function to draw table header (can be called on new pages)
    const drawTableHeader = () => {
      doc
        .rect(
          startX,
          y,
          colWidths.reduce((a, b) => a + b, 0),
          rowHeight
        )
        .fill("#f3f4f6"); // Light gray background for header
      doc
        .fillColor("#000000")
        .text("Rank", startX + 5, y + 5, { width: colWidths[0], align: "left" })
        .text("Domain", startX + colWidths[0] + 5, y + 5, {
          width: colWidths[1],
          align: "left",
        })
        .text("Time", startX + colWidths[0] + colWidths[1] + 5, y + 5, {
          width: colWidths[2],
          align: "left",
        })
        .text("Category", startX + colWidths[0] + colWidths[1] + colWidths[2] + 5, y + 5, {
          width: colWidths[3],
          align: "left",
        })
        .text(
          "Sessions",
          startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 5,
          y + 5,
          { width: colWidths[4], align: "left" }
        );
      y += rowHeight;
    };

    drawTableHeader(); // Draw initial header

    // Populate table with sorted domain times and session info
    for (let i = 0; i < sortedDomainTimes.length; i++) {
      const [domain, time] = sortedDomainTimes[i];
      const category = domainCategories[domain] || "Other";
      const sessions = domainSessions[domain] || [];

      // Check if a new page is needed before drawing the next row
      if (y + rowHeight > doc.page.height - 50) { // 50 is bottom margin
        doc.addPage();
        y = 50; // Reset Y for new page
        drawTableHeader(); // Draw header on new page
      }

      // Apply row background colors
      if (i === 0) doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill("#ffdddd"); // Top 1: Reddish
      else if (i === 1) doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill("#ffeacc"); // Top 2: Orangish
      else if (i === 2) doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill("#ddffdd"); // Top 3: Greenish
      else if (i % 2 === 0) doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill("#ffffff"); // Even rows: White
      else doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill("#f9f9f9"); // Odd rows: Light gray

      // Prepare session summary text
      let sessionText = "No sessions";
      if (sessions.length > 0) {
        if (sessions.length === 1) {
          sessionText = `${sessions[0].startTime}-${sessions[0].endTime}`;
        } else {
          sessionText = `${sessions.length} sessions\n${sessions[0].startTime}-${sessions[0].endTime}`;
          if (sessions.length > 1) {
            sessionText += `\n...+${sessions.length - 1} more`;
          }
        }
      }

      // Fill row content
      doc
        .fillColor("#000000")
        .font("Helvetica")
        .fontSize(8) // Smaller font to fit more content
        .text((i + 1).toString(), startX + 5, y + 5, {
          width: colWidths[0],
          align: "left",
        })
        .text(domain, startX + colWidths[0] + 5, y + 5, {
          width: colWidths[1],
          align: "left",
        })
        .text(
          formatDuration(time),
          startX + colWidths[0] + colWidths[1] + 5,
          y + 5,
          { width: colWidths[2], align: "left" }
        )
        .text(
          category,
          startX + colWidths[0] + colWidths[1] + colWidths[2] + 5,
          y + 5,
          { width: colWidths[3], align: "left" }
        )
        .text(
          sessionText,
          startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 5,
          y + 5,
          { width: colWidths[4], align: "left" }
        );

      y += rowHeight; // Move to next row position
    }

    // Add Charts to PDF
    doc.addPage();
    y = 50; // Reset Y for new page

    doc.fontSize(16).fillColor("#000000").text("Time Distribution by Category");
    doc.moveDown();
    doc.image(categoryChartBuffer, { fit: [400, 250], align: "center" });

    doc.moveDown();
    doc.fontSize(16).text("All Sites Time Spent (Bar Chart)");
    doc.moveDown();
    doc.image(allSitesChartBuffer, { fit: [400, 300], align: "center" });

    doc.end(); // Finalize PDF

    // Convert PDF stream to a buffer and send as response
    const pdfBuffer = await new Promise((resolve) =>
      doc.on("end", () => resolve(Buffer.concat(buffers)))
    );

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="daily_report_${date}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Report generation error:", error);
    res
      .status(500)
      .json({ error: "Failed to generate report", details: error.message });
  }
});

module.exports = router;
