const cron = require('node-cron');
const { cleanupOldData, getDataStats } = require('../utils/dataCleanup');

/**
 * Cron job for automatic data cleanup
 * Runs daily at 2:00 AM to clean up data older than 31 days
 */
function scheduleDataCleanup() {
  // Run daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log(`🕐 [${new Date().toISOString()}] Starting scheduled data cleanup...`);
      
      const deletedCount = await cleanupOldData(31);
      
      if (deletedCount > 0) {
        console.log(`✅ [${new Date().toISOString()}] Scheduled cleanup completed: ${deletedCount} records deleted`);
      } else {
        console.log(`✅ [${new Date().toISOString()}] Scheduled cleanup completed: No old data to clean`);
      }
      
      // Log current stats
      const stats = await getDataStats();
      console.log(`📊 [${new Date().toISOString()}] Current data: ${stats.totalRecords} total, ${stats.recentRecords} recent`);
      
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Scheduled cleanup failed:`, error);
    }
  }, {
    timezone: "UTC"
  });
  
  console.log("⏰ Data cleanup cron job scheduled (daily at 2:00 AM UTC)");
}

/**
 * Cron job for weekly data statistics logging
 * Runs every Sunday at 1:00 AM
 */
function scheduleStatsLogging() {
  // Run weekly on Sunday at 1:00 AM
  cron.schedule('0 1 * * 0', async () => {
    try {
      console.log(`📊 [${new Date().toISOString()}] Weekly data statistics report:`);
      
      const stats = await getDataStats();
      console.log(`   Total records: ${stats.totalRecords}`);
      console.log(`   Unique users: ${stats.uniqueUsers}`);
      console.log(`   Recent records (last 30 days): ${stats.recentRecords}`);
      console.log(`   Old records (>30 days): ${stats.oldRecords}`);
      console.log(`   Date range: ${stats.oldestDate} to ${stats.newestDate}`);
      
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Weekly stats logging failed:`, error);
    }
  }, {
    timezone: "UTC"
  });
  
  console.log("📊 Weekly statistics cron job scheduled (Sundays at 1:00 AM UTC)");
}

/**
 * Initialize all cron jobs
 */
function initializeCronJobs() {
  console.log("🚀 Initializing cron jobs...");
  
  scheduleDataCleanup();
  scheduleStatsLogging();
  
  console.log("✅ All cron jobs initialized successfully");
}

/**
 * Manual trigger for immediate cleanup (for testing)
 */
async function triggerManualCleanup() {
  try {
    console.log("🔧 Manual cleanup triggered...");
    const deletedCount = await cleanupOldData(31);
    console.log(`✅ Manual cleanup completed: ${deletedCount} records deleted`);
    return deletedCount;
  } catch (error) {
    console.error("❌ Manual cleanup failed:", error);
    throw error;
  }
}

module.exports = {
  initializeCronJobs,
  scheduleDataCleanup,
  scheduleStatsLogging,
  triggerManualCleanup
};
