#!/usr/bin/env node

/**
 * TimeMachine Data Cleanup Script
 * Run this script to clean up old schema data and implement automatic cleanup
 */

const mongoose = require("mongoose");
const { runFullCleanup } = require("./utils/dataCleanup");
require("dotenv").config();

async function main() {
  try {
    console.log("🚀 TimeMachine Data Cleanup Tool");
    console.log("=".repeat(60));
    
    // Connect to MongoDB
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 15000,
    });
    console.log("✅ Connected to MongoDB");
    console.log("-".repeat(30));
    
    // Run cleanup
    const result = await runFullCleanup();
    
    console.log("🎉 Cleanup process completed successfully!");
    
    // Close connection
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
    
    process.exit(0);
    
  } catch (error) {
    console.error("❌ Cleanup script failed:", error);
    
    // Close connection on error
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    
    process.exit(1);
  }
}

// Handle script termination
process.on('SIGINT', async () => {
  console.log("\n⚠️  Script interrupted");
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  process.exit(0);
});

// Run the script
main();
