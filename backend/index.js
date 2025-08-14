const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();
const cron = require('node-cron');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// Enable graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT. Shutting down gracefully...');
  mongoose.connection.close().then(() => {
    console.log('MongoDB connection closed.');
    process.exit(0);
  }).catch(err => {
    console.error('Error closing MongoDB connection:', err);
    process.exit(1);
  });
});

// Import only the essential routes
const timeDataRoutes = require("./routes/timeData");
const authRoutes = require("./routes/auth");
const feedbackRoutes = require("./routes/feedback");
const reportRoutes = require("./routes/report");

const app = express();

// Middleware
app.use(express.json({
  limit: '2mb' // Increase payload limit for large time tracking data
}));

// CORS configuration
app.use(
  cors({
    origin: function(origin, callback) {
      // Allow all Chrome extension origins
      if (origin && origin.startsWith('chrome-extension://')) {
        return callback(null, true);
      }

      // Allow specific origins
      const allowedOrigins = [
        "https://timemachine-1.onrender.com",
        "http://localhost:8080", 
        "http://localhost:3000"
      ];
      
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log(`CORS blocked request from: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Device-ID"],
    credentials: true // Allow cookies to be sent with requests
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
  })
  .catch((err) => console.error("MongoDB connection error:", err));

// Import the authenticateToken middleware
const { authenticateToken } = require("./routes/auth");

// Routes - only essential endpoints
app.use("/api/auth", authRoutes);
app.use("/api/time-data", authenticateToken, timeDataRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/report", authenticateToken, reportRoutes);

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

// Status endpoint with more detailed information
app.get("/status", (req, res) => {
  res.status(200).json({
    status: "running",
    version: "2.0.0",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    features: {
      authentication: "email-password",
      timeTracking: true,
      feedback: true,
      cors: "enabled"
    }
  });
});

// Route not found handler
app.use((req, res, next) => {
  res.status(404).json({ 
    error: "Not Found", 
    message: `Route ${req.method} ${req.path} not found` 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  console.error(`Server error (${statusCode}):`, err);
  
  res.status(statusCode).json({ 
    error: err.name || "Internal Server Error",
    message: err.message || "Something went wrong",
    // Only include stack trace in development
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  // Keep-alive cron to ping /health every 2 minutes (helps keep Render free instance awake)
  if (process.env.DISABLE_KEEPALIVE !== 'true') {
    // Enable keep-alive ONLY when an explicit public URL is provided via env
    const baseEnv = (process.env.HEALTH_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
    const healthUrl = process.env.HEALTH_URL
      ? baseEnv
      : (process.env.RENDER_EXTERNAL_URL ? `${baseEnv}/health` : null);

    if (!healthUrl) {
      console.log('Keep-alive cron disabled (no HEALTH_URL or RENDER_EXTERNAL_URL set).');
    } else {
      console.log(`Keep-alive cron enabled: pinging ${healthUrl} every 2 minutes`);
      cron.schedule('*/2 * * * *', () => {
      try {
        const started = Date.now();
        const urlObj = new URL(healthUrl);
        const client = urlObj.protocol === 'https:' ? https : http;
        const req = client.get({
          protocol: urlObj.protocol,
          hostname: urlObj.hostname,
          port: urlObj.port,
          path: urlObj.pathname + urlObj.search,
          headers: { 'User-Agent': 'TimeMachine-keepalive/1.0' },
          timeout: 8000
        }, (res) => {
          // Drain response to free socket
          res.resume();
          const dur = Date.now() - started;
          if (res.statusCode >= 200 && res.statusCode < 400) {
            console.log(`[keepalive] OK ${res.statusCode} in ${dur}ms`);
          } else {
            console.warn(`[keepalive] Non-OK ${res.statusCode} in ${dur}ms`);
          }
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', (err) => console.warn('[keepalive] error:', err.message));
      } catch (e) {
        console.warn('[keepalive] invalid URL:', e.message);
      }
      }, { timezone: 'UTC' });
    }
  } else {
    console.log('Keep-alive cron disabled via DISABLE_KEEPALIVE env var');
  }
});