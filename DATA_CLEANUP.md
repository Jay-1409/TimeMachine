# TimeMachine Data Cleanup System

## Overview

The TimeMachine backend now includes an automated data cleanup system that:

1. **Removes old schema data** - Cleans up records created before the schema update (without sessions array)
2. **Removes old data** - Automatically deletes records older than 31 days to maintain optimal database performance
3. **Provides monitoring** - Logs data statistics and cleanup operations

## Features

### 🔄 Automatic Cleanup (Cron Jobs)
- **Daily cleanup**: Runs every day at 2:00 AM UTC to remove data older than 31 days
- **Weekly stats**: Logs database statistics every Sunday at 1:00 AM UTC
- **Automatic startup**: Cron jobs initialize when the server starts

### 🛠️ Manual Cleanup Options

#### Command Line Scripts
```bash
# Full cleanup (old schema + old data)
npm run cleanup

# Clean only old schema data
npm run cleanup:old-schema

# Clean only data older than 31 days
npm run cleanup:old-data

# Get current database statistics
npm run stats
```

#### API Endpoints
All admin endpoints are available at `/api/admin/`:

- **GET** `/api/admin/stats` - Get current data statistics
- **POST** `/api/admin/cleanup/full` - Run full cleanup
- **POST** `/api/admin/cleanup/old-schema` - Clean old schema data only
- **POST** `/api/admin/cleanup/old-data` - Clean old data (specify days in body)
- **POST** `/api/admin/cleanup/manual` - Trigger scheduled cleanup manually

#### API Examples

**Get Statistics:**
```bash
curl -X GET http://localhost:3000/api/admin/stats
```

**Full Cleanup:**
```bash
curl -X POST http://localhost:3000/api/admin/cleanup/full
```

**Clean Data Older Than 60 Days:**
```bash
curl -X POST http://localhost:3000/api/admin/cleanup/old-data \
  -H "Content-Type: application/json" \
  -d '{"days": 60}'
```

## Data Retention Policy

### Current Schema (v1.1.1+)
Records include:
- `userEmail`: User identifier
- `date`: Date string (YYYY-MM-DD)
- `domain`: Website domain
- `totalTime`: Total time spent
- `sessions`: Array of session objects with start/end times
- `category`: Website category
- `createdAt`, `updatedAt`: Timestamps

### Cleanup Rules
1. **Old Schema Data**: Removed immediately (records without sessions array)
2. **Daily Data**: Kept for 31 days (showing daily, weekly, monthly views)
3. **User Data**: Never automatically deleted (users can manage their own data)

## Monitoring

### Log Output
The system provides detailed logging:

```
🧹 Starting old schema data cleanup...
📊 Found 1,234 records with old schema
✅ Cleaned up 1,234 old schema records

🧹 Starting cleanup of data older than 31 days...
📅 Cutoff date: 2025-07-08
📊 Found 567 records older than 31 days
✅ Cleaned up 567 old records

📊 Final data statistics:
   Total records: 8,901
   Unique users: 123
   Recent records (last 30 days): 8,901
   Old records (>30 days): 0
```

### Data Statistics
Regular statistics include:
- Total record count
- Unique user count
- Recent vs. old data breakdown
- Date range coverage
- Database health metrics

## Deployment Notes

### Environment Setup
The cleanup system automatically starts with the server when:
1. MongoDB connection is successful
2. The server starts normally
3. Environment variables are properly configured

### Production Considerations
- **Timezone**: All cron jobs run in UTC
- **Performance**: Cleanup operations are indexed and optimized
- **Safety**: Old schema cleanup only runs once (idempotent)
- **Monitoring**: All operations are logged with timestamps

### Backup Recommendations
Before running cleanup for the first time in production:
1. Take a database backup
2. Test cleanup on a copy first
3. Monitor the cleanup logs
4. Verify data integrity after cleanup

## Troubleshooting

### Common Issues

**Cleanup not running automatically:**
- Check MongoDB connection
- Verify server startup logs for cron job initialization
- Check timezone settings

**Manual cleanup fails:**
- Verify MongoDB connection
- Check database permissions
- Review error logs for specific issues

**Too much data being deleted:**
- Adjust the days parameter in cleanup functions
- Review date format consistency
- Check record creation timestamps

### Support
For issues or questions about the cleanup system:
1. Check server logs for detailed error messages
2. Use `npm run stats` to verify data state
3. Test manual cleanup with small datasets first
4. Review the cleanup utility source code in `utils/dataCleanup.js`
