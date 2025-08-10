/**
 * User Migration Script
 * This script migrates regular User records to SecureUser records
 */
const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');
const SecureUser = require('./models/User-secure');

async function migrateUsers() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 15000,
    });
    console.log('Connected to MongoDB');

    // Get all users
    const users = await User.find({});
    console.log(`Found ${users.length} users to migrate`);

    // Get all secure users (to avoid duplicates)
    const secureUsers = await SecureUser.find({});
    console.log(`Found ${secureUsers.length} existing secure users`);

    // Extract emails of existing secure users
    const existingEmails = new Set();
    secureUsers.forEach(user => {
      if (user.originalEmail) {
        existingEmails.add(user.originalEmail.toLowerCase());
      }
    });

    // Migrate each user
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const user of users) {
      try {
        const email = user.email.toLowerCase();
        
        // Skip if already exists
        if (existingEmails.has(email)) {
          console.log(`Skipping existing user: ${email}`);
          skippedCount++;
          continue;
        }

        // Create fake device info
        const deviceInfo = {
          deviceId: new mongoose.Types.ObjectId().toString(),
          deviceName: 'Migrated Device',
          deviceType: 'other',
          browser: 'Unknown',
          operatingSystem: 'Unknown'
        };

        // Create new secure user
        await SecureUser.createSecureUser(email, deviceInfo);
        console.log(`Migrated: ${email}`);
        migratedCount++;
      } catch (err) {
        console.error(`Error migrating user ${user.email}:`, err.message);
        errorCount++;
      }
    }

    console.log('\nMigration Summary:');
    console.log(`- Total users: ${users.length}`);
    console.log(`- Successfully migrated: ${migratedCount}`);
    console.log(`- Skipped (already migrated): ${skippedCount}`);
    console.log(`- Errors: ${errorCount}`);
    
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the migration
migrateUsers();
