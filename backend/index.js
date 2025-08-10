const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { initializeCronJobs } = require("./utils/cronJobs");
require("dotenv").config();

const timeDataRoutes = require("./routes/timeData");
const feedbackRoutes = require("./routes/feedback");
const reportRoutes = require("./routes/report");
const userRoutes = require("./routes/user");
const adminRoutes = require("./routes/admin");
const deviceManagementRoutes = require("./routes/device-management");

const app = express();

// Middleware
app.use(express.json());

app.use(
  cors({
    origin: [
      "chrome-extension://bkochhokedlbefkobaccicmpphbgeiab",
      "https://timemachine-1.onrender.com",
      "http://localhost:8080",
    ],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Device-ID"],
  })
);

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 15000,
  })
  .then(() => {
    console.log("Connected to MongoDB");
    
    // Initialize cron jobs after successful DB connection
    initializeCronJobs();
  })
  .catch((err) => console.error("MongoDB connection error:", err));

// Routes
app.use("/api/time-data", timeDataRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/report", reportRoutes);
app.use("/api/user", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/device-management", deviceManagementRoutes);

// Health check routes
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

app.head("/health", (req, res) => {
  res.sendStatus(200);
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res
    .status(500)
    .json({ error: "Internal server error", details: err.message });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
