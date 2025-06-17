const express = require("express");
const Mailjet = require("node-mailjet");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

const mailjet = new Mailjet({
  apiKey: process.env.MAILJET_API_KEY,
  apiSecret: process.env.MAILJET_SECRET_KEY,
});

// Replace with your icon48.png base64
const logoBase64 = "data:image/png;base64,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"; // Add your base64 string

app.post("/send-email", async (req, res) => {
  const { date, summary, insights, userEmail } = req.body;

  // Format date nicely
  const formattedDate = new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Helper function to convert duration string to minutes
  const parseDuration = (durationStr) => {
    if (!durationStr) return 0;
    if (durationStr.includes('h')) {
      const [hours, minutes] = durationStr.split('h ');
      return parseInt(hours) * 60 + parseInt(minutes);
    }
    return parseInt(durationStr);
  };

  // Generate site rows
  let sitesHtml = summary
    .map(
      (site) => `
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 10px; font-size: 14px; color: #334155;">${site.domain}</td>
      <td style="padding: 10px; font-size: 14px; color: #334155;">${site.totalTime}</td>
      <td style="padding: 10px; font-size: 14px; color: #334155;">${site.sessions
        .map((s) => `${s.start}–${s.end}`)
        .join(", ")}</td>
    </tr>
  `
    )
    .join("");

  // Calculate total minutes
  const totalMinutes = summary.reduce((total, site) => {
    return total + parseDuration(site.totalTime);
  }, 0);

  // Generate insights HTML
  let insightsHtml = insights
    ? `
    <div style="margin-top: 20px;">
      <h3 style="font-size: 16px; color: #1e293b; margin: 0 0 8px;">Productivity Insights</h3>
      <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
        <div style="background: #f1f5f9; border-radius: 8px; padding: 16px; flex: 1;">
          <p style="font-size: 14px; color: #475569; margin-bottom: 4px;">Focus Score</p>
          <div style="font-size: 32px; font-weight: 700; color: #4f46e5;">${insights.focusScore}%</div>
        </div>
        <div style="background: #f1f5f9; border-radius: 8px; padding: 16px; flex: 1;">
          <p style="font-size: 14px; color: #475569; margin-bottom: 4px;">Total Time</p>
          <div style="font-size: 24px; font-weight: 700; color: #4f46e5;">${totalMinutes} min</div>
        </div>
      </div>
      <h4 style="font-size: 14px; color: #1e293b; margin: 8px 0 4px;">Category Breakdown</h4>
      <ul style="padding-left: 16px; margin: 0; color: #475569;">
        ${insights.categoryBreakdown
          .map((cat) => `<li style="font-size: 14px;">${cat.category}: ${cat.time} (${cat.percentage}%)</li>`)
          .join("")}
      </ul>
    </div>
  `
    : "";

  const emailHtml = `
    <div style="font-family: system-ui, -apple-system, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f8fafc; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
      <div style="text-align: center; margin-bottom: 16px;">
        <img src="${logoBase64}" alt="TimeMachine Logo" style="width: 64px; display: inline-block; vertical-align: middle; margin-bottom: 16px;" />
        <h1 style="font-size: 24px; color: #1e293b; margin: 0 0 8px;">TimeMachine Report</h1>
        <p style="font-size: 16px; color: #64748b;">${formattedDate}</p>
      </div>
      
      <div style="background: white; border-radius: 8px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 24px;">
        <h2 style="font-size: 18px; color: #1e293b; margin: 0 0 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Top Sites</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="padding: 10px; font-size: 14px; color: #1e293b; text-align: left;">Site</th>
              <th style="padding: 10px; font-size: 14px; color: #1e293b; text-align: left;">Time</th>
              <th style="padding: 10px; font-size: 14px; color: #1e293b; text-align: left;">Sessions</th>
            </tr>
          </thead>
          <tbody>
            ${sitesHtml}
          </tbody>
        </table>
        ${insightsHtml}
      </div>
      
      <div style="text-align: center; padding: 16px; background: #f1f5f9; border-radius: 8px;">
        <p style="font-size: 14px; color: #64748b; margin: 0;">
          Sent by TimeMachine | Optimize your time with daily insights
        </p>
      </div>
    </div>
  `;

  try {
    await mailjet.post("send", { version: "v3.1" }).request({
      Messages: [
        {
          From: {
            Email: process.env.FROM_EMAIL,
            Name: "TimeMachine",
          },
          To: [
            {
              Email: userEmail || process.env.USER_EMAIL,
              Name: "User",
            },
          ],
          Subject: `Daily TimeMachine Report - ${formattedDate}`,
          HTMLPart: emailHtml,
          TextPart: `TimeMachine Report for ${formattedDate}\n\nFocus Score: ${insights.focusScore}%\nTotal Time: ${totalMinutes} min`
        },
      ],
    });
    res.status(200).send("Email sent successfully");
  } catch (error) {
    console.error("Email error:", error);
    res.status(500).send("Error sending email");
  }
});


app.listen(3000, () => console.log("Server running on port 3000"));