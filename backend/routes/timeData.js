const express = require("express");
const router = express.Router();
const TimeData = require("../models/TimeData");

const ALLOWED_CATEGORIES = [
  "Work",
  "Social",
  "Entertainment",
  "Professional",
  "Other",
];

router.post("/sync", async (req, res) => {
  const { userEmail, date, domain, sessions, category = "Other" } = req.body;

  if (!userEmail || !date || !domain || !sessions || !Array.isArray(sessions)) {
    console.warn(
      "Backend Sync Error: Missing or invalid required fields in request body:",
      req.body
    );
    return res
      .status(400)
      .json({ error: "Missing or invalid required fields" });
  }

  const newTotalTimeForSessionBatch = sessions.reduce(
    (sum, s) => sum + (s.duration || 0),
    0
  );

  try {
    const timeData = await TimeData.findOneAndUpdate(
      { userEmail, date, domain },
      {
        $inc: { totalTime: newTotalTimeForSessionBatch },

        $push: { sessions: { $each: sessions } },

        $set: { category },

        $setOnInsert: { createdAt: new Date() },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    );

    res.status(200).json({ success: true, timeData });
  } catch (error) {
    console.error("Error in /api/time-data/sync:", error);

    res
      .status(500)
      .json({ error: "Failed to sync data", details: error.message });
  }
});

router.get("/report/:userEmail", async (req, res) => {
  try {
    const { userEmail } = req.params;
    const date = req.query.date || new Date().toISOString().split("T")[0];

    if (!userEmail) {
      return res.status(400).json({ error: "User email is required" });
    }

    const timeData = await TimeData.find({ userEmail, date }).lean();

    const formattedData = timeData.map((entry) => ({
      domain: entry.domain,
      sessions: entry.sessions || [],
      totalTime: entry.totalTime || 0,
      category: ALLOWED_CATEGORIES.includes(entry.category)
        ? entry.category
        : "Other",
    }));

    res.status(200).json(formattedData);
  } catch (error) {
    console.error("Error fetching report:", error);
    res.status(500).json({
      error: "Failed to fetch report",
      details: error.message,
    });
  }
});

router.patch("/category", async (req, res) => {
  const { userEmail, date, domain, category } = req.body;

  if (!userEmail || !date || !domain || !category) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!ALLOWED_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }

  try {
    const timeData = await TimeData.findOneAndUpdate(
      { userEmail, date, domain },
      { $set: { category } },
      { new: true }
    );

    if (!timeData) {
      return res.status(404).json({ error: "Record not found" });
    }

    res.status(200).json({ success: true, timeData });
  } catch (error) {
    console.error("Error updating category:", error);
    res
      .status(500)
      .json({ error: "Failed to update category", details: error.message });
  }
});

module.exports = router;
