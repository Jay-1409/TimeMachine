const express = require("express");
const router = express.Router();
const TimeData = require("../models/TimeData");
const PDFDocument = require("pdfkit");
const QuickChart = require("quickchart-js");
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

/**
 * Hashes an email for privacy
 * @param {string} email - The email to hash
 * @returns {string} - Hashed email
 */
function hashEmail(email) {
  if (!email) return '';
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

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
  // Extract token from Authorization header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  // Verify token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    if (!decoded || !decoded.hashedEmail) {
      return res.status(403).json({ error: "Invalid token" });
    }
    
    const { date, userEmail } = req.body; // 'date' is expected to be "YYYY-MM-DD" string
    if (!date) {
      return res.status(400).json({ error: "Date is required" });
    }

    // Ensure the requesting user can only access their own data
    const requestingUserHash = decoded.hashedEmail;
    const requestedUserHash = hashEmail(userEmail);
    
    // Only allow access if the user is requesting their own data or is an admin
    if (requestingUserHash !== requestedUserHash && decoded.role !== 'admin') {
      return res.status(403).json({ error: "You can only access your own data" });
    }
    
    // Query with sessions data included - look up by hashed email or original email (for compatibility)
    const timeDataList = await TimeData.find({
      $or: [
        { userEmail: requestedUserHash },
        { userEmail: userEmail },  // For backward compatibility during migration
        { originalEmail: userEmail } // For backward compatibility
      ],
      date: date
    }).select('domain totalTime category'); // Don't include sessions in selection

    // Obscure the actual email in logs
    const obscuredEmail = userEmail.substring(0, 3) + "***@" + userEmail.split('@')[1];
    console.log(`Raw timeDataList for ${obscuredEmail} on ${date}:`, 
      `Found ${timeDataList ? timeDataList.length : 0} records`);

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
      
      if (totalTimeInSeconds > 0) {
        domainTimes[data.domain] = (domainTimes[data.domain] || 0) + totalTimeInSeconds;
        const category =
          data.category && categoryTimes.hasOwnProperty(data.category)
            ? data.category
            : "Other";
        categoryTimes[category] += totalTimeInSeconds;
        domainCategories[data.domain] = category;
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
    
    // Only show first 3 characters of email + domain for privacy
    const emailParts = userEmail.split('@');
    const obscuredEmailForPdf = `${emailParts[0].substring(0, 3)}***@${emailParts[1]}`;
    
    doc.text(`User: ${obscuredEmailForPdf}`, { align: "center" });
    doc.moveDown();
    doc
      .fontSize(14)
      .text(`Total Time Tracked: ${formatDuration(totalTimeOverall)}`, {
        align: "center",
      });
    doc.moveDown();

    // Key Insights Section - Enhanced
    doc.fontSize(14).text("Key Insights:", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).text(
      `- Total browsing time: ${formatDuration(totalTimeOverall)}`
    );
    
    // Calculate productivity score
    const productiveTime = categoryTimes.Work + categoryTimes.Professional + (categoryTimes.Other * 0.5);
    const productivityScore = totalTimeOverall > 0 ? Math.round((productiveTime / totalTimeOverall) * 100) : 0;
    doc.text(`- Productivity score: ${productivityScore}%`);
    
    if (sortedDomainTimes.length > 0) {
      const [topSite, topSiteTime] = sortedDomainTimes[0];
      const topSitePercentage = (
        (topSiteTime / totalTimeOverall) *
        100
      ).toFixed(1);
      doc.text(
        `- Most visited site: ${topSite} (${formatDuration(
          topSiteTime
        )}, ${topSitePercentage}% of total)`
      );
    }
    
    const topCategory = Object.keys(categoryTimes).reduce((a, b) =>
      categoryTimes[a] > categoryTimes[b] ? a : b
    );
    const topCategoryPercentage = (
      (categoryTimes[topCategory] / totalTimeOverall) *
      100
    ).toFixed(1);
    doc.text(`- Primary activity: ${topCategory} (${topCategoryPercentage}% of total time)`);
    doc.text(`- Unique websites visited: ${Object.keys(domainTimes).length}`);
    
    // Add a recommendation based on productivity score
    doc.moveDown();
    doc.font("Helvetica-Bold").text("Recommendation:");
    doc.font("Helvetica");
    if (productivityScore >= 70) {
      doc.text("Great job! You had a highly productive day. Keep up the good work!");
    } else if (productivityScore >= 40) {
      doc.text("You had a moderately productive day. Consider allocating more time to work-related tasks.");
    } else {
      doc.text("Your productivity was lower than optimal. Try to focus more on work-related activities and limit entertainment browsing.");
    }
    doc.moveDown();

    // Detailed Activity Log Table (simplified without sessions)
    doc.fontSize(16).text("Detailed Activity Log");
    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(10);

    const startX = 50;
    let y = doc.y;
    const rowHeight = 30;
    const colWidths = [30, 220, 90, 100]; // Rank, Domain, Time, Category (removed Sessions column)

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
        });
      y += rowHeight;
    };

    drawTableHeader(); // Draw initial header

    // Populate table with sorted domain times (simplified without session info)
    for (let i = 0; i < sortedDomainTimes.length; i++) {
      const [domain, time] = sortedDomainTimes[i];
      const category = domainCategories[domain] || "Other";

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

      // Fill row content with improved styling
      doc
        .fillColor("#000000")
        .font("Helvetica")
        .fontSize(10) // Slightly larger font for better readability
        .text((i + 1).toString(), startX + 5, y + 10, {
          width: colWidths[0],
          align: "center",
        })
        .text(domain, startX + colWidths[0] + 5, y + 10, {
          width: colWidths[1],
          align: "left",
        })
        .text(
          formatDuration(time),
          startX + colWidths[0] + colWidths[1] + 5,
          y + 10,
          { width: colWidths[2], align: "center" }
        )
        .text(
          category,
          startX + colWidths[0] + colWidths[1] + colWidths[2] + 5,
          y + 10,
          { width: colWidths[3], align: "center" }
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

    // Add footer with privacy note
    doc.fontSize(8).fillColor("#777777").text("Note: This report contains anonymized data. Your privacy is important to us.", {
      align: "center"
    });

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
