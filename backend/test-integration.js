#!/usr/bin/env node

/**
 * Integration Test for TimeMachine Frontend-Backend
 * This script tests the complete data flow from extension to backend
 */

const mongoose = require("mongoose");
const TimeData = require("../models/TimeData");
require("dotenv").config();

// Test data mimicking what the extension would send
const testData = {
  userEmail: "test@timemachine.com",
  date: new Date().toISOString().split("T")[0],
  domain: "github.com",
  sessions: [
    {
      startTime: Date.now() - 3600000, // 1 hour ago
      endTime: Date.now() - 1800000,   // 30 minutes ago
      duration: 1800000 // 30 minutes in milliseconds
    },
    {
      startTime: Date.now() - 1800000, // 30 minutes ago
      endTime: Date.now(),             // now
      duration: 1800000 // 30 minutes in milliseconds
    }
  ],
  category: "Work"
};

async function testBackendIntegration() {
  try {
    console.log("🧪 TimeMachine Integration Test");
    console.log("=".repeat(50));
    
    // Connect to MongoDB
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 15000,
    });
    console.log("✅ Connected to MongoDB");
    
    // Test 1: Data Sync Endpoint
    console.log("\n🔄 Testing Data Sync...");
    const syncURL = "http://localhost:3000/api/time-data/sync";
    
    const syncResponse = await fetch(syncURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testData),
    });
    
    if (syncResponse.ok) {
      const syncResult = await syncResponse.json();
      console.log("✅ Sync successful:", syncResult.success);
      console.log("📊 Total time:", syncResult.timeData.totalTime, "ms");
      console.log("📅 Sessions count:", syncResult.timeData.sessions.length);
    } else {
      console.error("❌ Sync failed:", await syncResponse.text());
    }
    
    // Test 2: Report Endpoint
    console.log("\n📊 Testing Report Generation...");
    const reportURL = `http://localhost:3000/api/time-data/report/${encodeURIComponent(testData.userEmail)}?date=${testData.date}`;
    
    const reportResponse = await fetch(reportURL);
    
    if (reportResponse.ok) {
      const reportData = await reportResponse.json();
      console.log("✅ Report generated successfully");
      console.log("📈 Records found:", reportData.length);
      
      if (reportData.length > 0) {
        const record = reportData.find(r => r.domain === testData.domain);
        if (record) {
          console.log("🎯 Test domain found:");
          console.log("   Domain:", record.domain);
          console.log("   Total time:", record.totalTime, "ms");
          console.log("   Sessions:", record.sessions.length);
          console.log("   Category:", record.category);
        }
      }
    } else {
      console.error("❌ Report failed:", await reportResponse.text());
    }
    
    // Test 3: Category Update
    console.log("\n🏷️ Testing Category Update...");
    const categoryURL = "http://localhost:3000/api/time-data/category";
    const categoryData = {
      userEmail: testData.userEmail,
      date: testData.date,
      domain: testData.domain,
      category: "Professional"
    };
    
    const categoryResponse = await fetch(categoryURL, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(categoryData),
    });
    
    if (categoryResponse.ok) {
      const categoryResult = await categoryResponse.json();
      console.log("✅ Category updated successfully");
      console.log("🏷️ New category:", categoryResult.timeData.category);
    } else {
      console.error("❌ Category update failed:", await categoryResponse.text());
    }
    
    // Test 4: PDF Report Generation
    console.log("\n📄 Testing PDF Report...");
    const pdfURL = "http://localhost:3000/api/report/generate";
    const pdfData = {
      userEmail: testData.userEmail,
      date: testData.date
    };
    
    const pdfResponse = await fetch(pdfURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pdfData),
    });
    
    if (pdfResponse.ok) {
      console.log("✅ PDF generated successfully");
      console.log("📏 PDF size:", pdfResponse.headers.get('content-length'), "bytes");
    } else {
      console.error("❌ PDF generation failed:", await pdfResponse.text());
    }
    
    // Test 5: Database Validation
    console.log("\n💾 Testing Database State...");
    const dbRecord = await TimeData.findOne({
      userEmail: testData.userEmail,
      date: testData.date,
      domain: testData.domain
    });
    
    if (dbRecord) {
      console.log("✅ Database record found");
      console.log("📊 Total time in DB:", dbRecord.totalTime, "ms");
      console.log("📅 Sessions in DB:", dbRecord.sessions.length);
      console.log("🏷️ Category in DB:", dbRecord.category);
      
      // Validate session structure
      if (dbRecord.sessions.length > 0) {
        const session = dbRecord.sessions[0];
        console.log("🕐 Session structure valid:", !!(session.startTime && session.endTime && session.duration));
      }
    } else {
      console.error("❌ No database record found");
    }
    
    // Cleanup test data
    console.log("\n🧹 Cleaning up test data...");
    await TimeData.deleteMany({
      userEmail: testData.userEmail,
      date: testData.date
    });
    console.log("✅ Test data cleaned up");
    
    console.log("\n" + "=".repeat(50));
    console.log("🎉 Integration test completed successfully!");
    
  } catch (error) {
    console.error("❌ Integration test failed:", error);
    throw error;
  } finally {
    // Close connection
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
  }
}

// Handle script termination
process.on('SIGINT', async () => {
  console.log("\n⚠️  Test interrupted");
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  process.exit(0);
});

// Run the test
testBackendIntegration()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
