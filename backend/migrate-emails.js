/**
 * Enhanced Email Migration Script
 * 
 * This script migrates existing plaintext emails in the database to secure hashed emails
 * with the new enhanced User-secure model format including:
 * - hashedEmail (primary identifier)
 * - emailDomain (for analytics) 
 * - maskedEmail (for display)
 * 
 * Usage: node migrate-emails.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');

/**
 * Hashes an email for privacy
 * @param {string} email - The email to hash
 * @returns {string} - Hashed email
 */
function hashEmail(email) {
  if (!email) return '';
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

/**
 * Creates a masked email for display (first 3 chars + ***)
 * @param {string} email - The email to mask
 * @returns {string} - Masked email
 */
function createMaskedEmail(email) {
  if (!email) return '***@unknown.com';
  
  const parts = email.split('@');
  if (parts.length !== 2) return '***@unknown.com';
  
  const username = parts[0];
  const domain = parts[1];
  
  // Take first 3 chars of username (or fewer if username is shorter) and add ***
  const maskedUsername = username.substring(0, Math.min(3, username.length)) + '***';
  return `${maskedUsername}@${domain}`;
}

/**
 * Extract domain part of email
 * @param {string} email - The email
 * @returns {string} - Domain part
 */
function getEmailDomain(email) {
  if (!email) return 'unknown.com';
  
  const parts = email.split('@');
  return parts.length === 2 ? parts[1] : 'unknown.com';
}

async function migrateUserEmails() {
  let client;
  
  try {
    console.log('Connecting to MongoDB...');
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/timemachine';
    client = new MongoClient(uri);
    await client.connect();
    console.log('Connected successfully');
    
    const db = client.db();
    
    // Access the collections directly
    const userCollection = db.collection('users');
    const timeDataCollection = db.collection('timedatas');
    
    // Create a backup of user collection
    console.log('Creating backup of users collection...');
    await db.collection('users_backup_before_migration').drop().catch(() => {});
    const backupResult = await db.command({
      create: 'users_backup_before_migration'
    });
    await db.collection('users').aggregate([
      { $out: 'users_backup_before_migration' }
    ]).toArray();
    console.log('Backup completed.');
    
    // Find all users
    const users = await userCollection.find({}).toArray();
    console.log(`Found ${users.length} users to migrate`);
    
    // Create the new secure users collection
    try {
      await db.collection('secureusers').drop();
      console.log('Dropped existing secureusers collection');
    } catch (err) {
      console.log('No existing secureusers collection to drop');
    }
    
    await db.command({
      create: 'secureusers',
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["hashedEmail", "emailDomain", "maskedEmail"],
          properties: {
            hashedEmail: {
              bsonType: "string",
              description: "SHA-256 hash of the user's email (required)"
            },
            emailDomain: {
              bsonType: "string",
              description: "Domain part of email (required)"
            },
            maskedEmail: {
              bsonType: "string",
              description: "Masked version of email for display (required)" 
            },
            originalEmail: {
              bsonType: "string",
              description: "Original email (temporary for migration)"
            },
            role: {
              bsonType: "string",
              enum: ["user", "admin"],
              description: "User role (user or admin)"
            },
            lastActive: {
              bsonType: "date",
              description: "Last login or activity date"
            },
            lastUpdated: {
              bsonType: "date",
              description: "Last update date"
            },
            createdAt: {
              bsonType: "date",
              description: "User creation date"
            }
          }
        }
      }
    });
    console.log('Created new secureusers collection with schema validation');
    
    const secureUserCollection = db.collection('secureusers');
    await secureUserCollection.createIndex({ hashedEmail: 1 }, { unique: true });
    console.log('Created unique index on hashedEmail field');
    
    // Process and migrate each user to new secure format
    let migratedCount = 0;
    let errorCount = 0;
    
    for (const user of users) {
      try {
        const originalEmail = user.email;
        if (!originalEmail) {
          console.log(`Skipping user with ID ${user._id} - no email found`);
          continue;
        }
        
        const hashedEmail = hashEmail(originalEmail);
        const emailDomain = getEmailDomain(originalEmail);
        const maskedEmail = createMaskedEmail(originalEmail);
        
        // Create a new secure user document
        await secureUserCollection.insertOne({
          hashedEmail,
          emailDomain,
          maskedEmail,
          originalEmail, // Keep temporarily for verification
          role: 'user', // Default role
          createdAt: user.lastUpdated || new Date(),
          lastActive: user.lastUpdated || new Date(),
          lastUpdated: new Date()
        });
        
        migratedCount++;
        console.log(`Migrated user: ${maskedEmail}`);
      } catch (err) {
        console.error(`Error migrating user ${user._id}:`, err);
        errorCount++;
      }
    }
    
    console.log('\nUser Migration Summary:');
    console.log(`- Total users: ${users.length}`);
    console.log(`- Successfully migrated: ${migratedCount}`);
    console.log(`- Errors: ${errorCount}`);
    
    // Also update TimeData collection to use hashed emails
    console.log('\nUpdating TimeData collection to use hashed emails...');
    
    // Create a backup of timedata collection
    console.log('Creating backup of timedata collection...');
    await db.collection('timedatas_backup_before_migration').drop().catch(() => {});
    await db.collection('timedatas').aggregate([
      { $out: 'timedatas_backup_before_migration' }
    ]).toArray();
    console.log('Backup completed.');
    
    const distinctEmails = await timeDataCollection.distinct('userEmail');
    console.log(`Found ${distinctEmails.length} distinct emails in TimeData`);
    
    let timeDataMigratedCount = 0;
    let timeDataErrorCount = 0;
    
    for (const email of distinctEmails) {
      try {
        if (!email) continue;
        
        const hashedEmail = hashEmail(email);
        const result = await timeDataCollection.updateMany(
          { userEmail: email },
          { $set: { 
              userEmail: hashedEmail, 
              originalEmail: email,
              userEmailMasked: createMaskedEmail(email)
            } 
          }
        );
        
        timeDataMigratedCount++;
        console.log(`Migrated TimeData for ${createMaskedEmail(email)} - ${result.modifiedCount} records updated`);
      } catch (err) {
        console.error(`Error migrating TimeData for email:`, err);
        timeDataErrorCount++;
      }
    }
    
    console.log('\nTimeData Migration Summary:');
    console.log(`- Total distinct emails: ${distinctEmails.length}`);
    console.log(`- Successfully migrated: ${timeDataMigratedCount}`);
    console.log(`- Errors: ${timeDataErrorCount}`);
    
    // Instructions for completing migration
    console.log('\n----------------------------------------------------');
    console.log('NEXT STEPS TO COMPLETE MIGRATION:');
    console.log('1. Verify data in MongoDB for secureusers collection');
    console.log('2. Update your index.js with these changes:');
    console.log('   - Replace require(\'./models/User\') with require(\'./models/User-secure\')');
    console.log('   - Replace app.use(\'/api/user\', require(\'./routes/user\')) with app.use(\'/api/user\', require(\'./routes/user-secure\'))');
    console.log('   - Replace app.use(\'/api/report\', require(\'./routes/report\')) with app.use(\'/api/report\', require(\'./routes/report-secure\'))');
    console.log('3. Test the application thoroughly with the new secure email system');
    console.log('4. When confirmed working, you can remove the originalEmail fields from the database');
    console.log('----------------------------------------------------\n');
    
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    if (client) {
      await client.close();
      console.log('\nDisconnected from MongoDB');
    }
  }
}

migrateUserEmails();
