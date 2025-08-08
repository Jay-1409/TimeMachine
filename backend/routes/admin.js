const express = require("express");
const { runFullCleanup, getDataStats, cleanupOldSchemaData, cleanupOldData } = require("../utils/dataCleanup");
const { triggerManualCleanup } = require("../utils/cronJobs");

const router = express.Router();

/**
 * GET /api/admin/stats
 * Get current data statistics
 */
router.get("/stats", async (req, res) => {
  try {
    const stats = await getDataStats();
    
    res.status(200).json({
      success: true,
      message: "Data statistics retrieved successfully",
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error getting data stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get data statistics",
      details: error.message,
    });
  }
});

/**
 * POST /api/admin/cleanup/full
 * Run full cleanup (old schema + old data)
 */
router.post("/cleanup/full", async (req, res) => {
  try {
    console.log("Manual full cleanup triggered via API");
    
    const result = await runFullCleanup();
    
    res.status(200).json({
      success: true,
      message: "Full cleanup completed successfully",
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error during full cleanup:", error);
    res.status(500).json({
      success: false,
      error: "Full cleanup failed",
      details: error.message,
    });
  }
});

/**
 * POST /api/admin/cleanup/old-schema
 * Clean up only old schema data
 */
router.post("/cleanup/old-schema", async (req, res) => {
  try {
    console.log("Manual old schema cleanup triggered via API");
    
    const deletedCount = await cleanupOldSchemaData();
    
    res.status(200).json({
      success: true,
      message: "Old schema cleanup completed successfully",
      data: {
        deletedCount,
        description: "Removed records without sessions array"
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error during old schema cleanup:", error);
    res.status(500).json({
      success: false,
      error: "Old schema cleanup failed",
      details: error.message,
    });
  }
});

/**
 * POST /api/admin/cleanup/old-data
 * Clean up data older than specified days
 */
router.post("/cleanup/old-data", async (req, res) => {
  try {
    const { days = 31 } = req.body;
    
    console.log(`Manual old data cleanup triggered via API (${days} days)`);
    
    const deletedCount = await cleanupOldData(days);
    
    res.status(200).json({
      success: true,
      message: `Old data cleanup completed successfully`,
      data: {
        deletedCount,
        daysThreshold: days,
        description: `Removed records older than ${days} days`
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error during old data cleanup:", error);
    res.status(500).json({
      success: false,
      error: "Old data cleanup failed",
      details: error.message,
    });
  }
});

/**
 * POST /api/admin/cleanup/manual
 * Trigger the same cleanup that runs on cron schedule
 */
router.post("/cleanup/manual", async (req, res) => {
  try {
    console.log("Manual scheduled cleanup triggered via API");
    
    const deletedCount = await triggerManualCleanup();
    
    res.status(200).json({
      success: true,
      message: "Manual cleanup completed successfully",
      data: {
        deletedCount,
        description: "Removed records older than 31 days (same as scheduled cleanup)"
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error during manual cleanup:", error);
    res.status(500).json({
      success: false,
      error: "Manual cleanup failed",
      details: error.message,
    });
  }
});

module.exports = router;
