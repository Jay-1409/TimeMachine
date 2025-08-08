const mongoose = require("mongoose");
const TimeData = require("../models/TimeData");

/**
 * Clean up old schema data without sessions array
 * This removes records that were created before the schema update
 */
async function cleanupOldSchemaData() {
  try {
    console.log("🧹 Starting old schema data cleanup...");
    
    // Find documents without sessions array or with empty sessions
    const oldDataCount = await TimeData.countDocuments({
      $or: [
        { sessions: { $exists: false } },
        { sessions: { $size: 0 } },
        { sessions: null }
      ]
    });
    
    if (oldDataCount > 0) {
      console.log(`📊 Found ${oldDataCount} records with old schema`);
      
      // Delete old schema data
      const deleteResult = await TimeData.deleteMany({
        $or: [
          { sessions: { $exists: false } },
          { sessions: { $size: 0 } },
          { sessions: null }
        ]
      });
      
      console.log(`✅ Cleaned up ${deleteResult.deletedCount} old schema records`);
      return deleteResult.deletedCount;
    } else {
      console.log("✅ No old schema data found - all clean!");
      return 0;
    }
  } catch (error) {
    console.error("❌ Error during old schema cleanup:", error);
    throw error;
  }
}

/**
 * Clean up data older than specified days
 * @param {number} daysOld - Number of days to keep (default: 31 for ~1 month)
 */
async function cleanupOldData(daysOld = 31) {
  try {
    console.log(`🧹 Starting cleanup of data older than ${daysOld} days...`);
    
    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    // Convert to YYYY-MM-DD format for date string comparison
    const cutoffDateString = cutoffDate.toISOString().split('T')[0];
    
    console.log(`📅 Cutoff date: ${cutoffDateString}`);
    
    // Count old records
    const oldRecordsCount = await TimeData.countDocuments({
      date: { $lt: cutoffDateString }
    });
    
    if (oldRecordsCount > 0) {
      console.log(`📊 Found ${oldRecordsCount} records older than ${daysOld} days`);
      
      // Delete old records
      const deleteResult = await TimeData.deleteMany({
        date: { $lt: cutoffDateString }
      });
      
      console.log(`✅ Cleaned up ${deleteResult.deletedCount} old records`);
      return deleteResult.deletedCount;
    } else {
      console.log("✅ No old data found - all clean!");
      return 0;
    }
  } catch (error) {
    console.error("❌ Error during data cleanup:", error);
    throw error;
  }
}

/**
 * Get data statistics
 */
async function getDataStats() {
  try {
    const totalRecords = await TimeData.countDocuments();
    const uniqueUsers = await TimeData.distinct("userEmail").then(users => users.length);
    
    // Get date range
    const oldestRecord = await TimeData.findOne().sort({ createdAt: 1 }).select('date createdAt');
    const newestRecord = await TimeData.findOne().sort({ createdAt: -1 }).select('date createdAt');
    
    // Count records by age
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoString = thirtyDaysAgo.toISOString().split('T')[0];
    
    const recentRecords = await TimeData.countDocuments({
      date: { $gte: thirtyDaysAgoString }
    });
    
    const oldRecords = totalRecords - recentRecords;
    
    return {
      totalRecords,
      uniqueUsers,
      recentRecords: recentRecords,
      oldRecords: oldRecords,
      oldestDate: oldestRecord?.date,
      newestDate: newestRecord?.date,
      oldestCreated: oldestRecord?.createdAt,
      newestCreated: newestRecord?.createdAt
    };
  } catch (error) {
    console.error("❌ Error getting data stats:", error);
    throw error;
  }
}

/**
 * Full cleanup process
 */
async function runFullCleanup() {
  try {
    console.log("🚀 Starting full data cleanup process...");
    console.log("=".repeat(50));
    
    // Get initial stats
    const initialStats = await getDataStats();
    console.log("📊 Initial data statistics:");
    console.log(`   Total records: ${initialStats.totalRecords}`);
    console.log(`   Unique users: ${initialStats.uniqueUsers}`);
    console.log(`   Recent records (last 30 days): ${initialStats.recentRecords}`);
    console.log(`   Old records (>30 days): ${initialStats.oldRecords}`);
    console.log(`   Date range: ${initialStats.oldestDate} to ${initialStats.newestDate}`);
    console.log("-".repeat(30));
    
    // Step 1: Clean old schema data
    const oldSchemaDeleted = await cleanupOldSchemaData();
    
    // Step 2: Clean data older than 31 days
    const oldDataDeleted = await cleanupOldData(31);
    
    // Get final stats
    const finalStats = await getDataStats();
    console.log("-".repeat(30));
    console.log("📊 Final data statistics:");
    console.log(`   Total records: ${finalStats.totalRecords}`);
    console.log(`   Unique users: ${finalStats.uniqueUsers}`);
    console.log(`   Recent records (last 30 days): ${finalStats.recentRecords}`);
    console.log(`   Old records (>30 days): ${finalStats.oldRecords}`);
    
    console.log("-".repeat(30));
    console.log("🎉 Cleanup Summary:");
    console.log(`   Old schema records deleted: ${oldSchemaDeleted}`);
    console.log(`   Old data records deleted: ${oldDataDeleted}`);
    console.log(`   Total records deleted: ${oldSchemaDeleted + oldDataDeleted}`);
    console.log("=".repeat(50));
    
    return {
      oldSchemaDeleted,
      oldDataDeleted,
      totalDeleted: oldSchemaDeleted + oldDataDeleted,
      finalStats
    };
  } catch (error) {
    console.error("❌ Full cleanup failed:", error);
    throw error;
  }
}

module.exports = {
  cleanupOldSchemaData,
  cleanupOldData,
  getDataStats,
  runFullCleanup
};
