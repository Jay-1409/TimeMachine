# 📋 TimeMachine Extension - Complete Functionality Overview

## 🔍 Core Tracking Features

### **Automatic Time Tracking**
- **Background monitoring** of active tabs and windows
- **Precise timing** with start/end timestamps for each session
- **Idle detection** - pauses tracking when browser is idle (60s threshold)
- **Tab management** - handles tab switches, new tabs, closed tabs
- **Domain extraction** - tracks by clean domain names (removes www, protocols)
- **Session storage** - each visit stored as individual session with duration

### **Data Storage Architecture**
```javascript
// Local Storage Structure (chrome.storage.local)
{
  "2025-08-07": {
    "github.com": {
      "sessions": [
        {
          "startTime": 1691389200000,  // Unix timestamp
          "endTime": 1691391000000,    // Unix timestamp  
          "duration": 1800000          // Duration in milliseconds
        }
      ],
      "category": "Work"
    }
  }
}

// Backend Storage (MongoDB) - Enhanced Schema
{
  "userEmail": "user@example.com",
  "date": "2025-08-07",
  "domain": "github.com", 
  "totalTime": 1800000,           // Sum of all sessions in milliseconds
  "sessions": [                   // NEW: Individual session details
    {
      "startTime": 1691389200000,
      "endTime": 1691391000000,
      "duration": 1800000
    }
  ],
  "category": "Work"
}
```

## 🎨 User Interface Features

### **Multi-Theme Support**
- **5 Themes**: Light, Dark, Glass, Neumorphic, Vivid
- **Persistent preferences** saved in localStorage
- **Dynamic chart colors** that adapt to theme
- **Smooth transitions** between themes

### **Time View Options**
- **Daily View**: Today's activity only
- **Weekly View**: Last 7 days aggregated  
- **Monthly View**: Last 30 days aggregated
- **Real-time updates** as you browse

### **Interactive Charts**
- **Doughnut chart** showing category breakdown
- **Hover tooltips** with formatted durations
- **Color-coded categories** matching current theme
- **Responsive design** for extension popup

### **Productivity Scoring**
```javascript
// Scoring Algorithm
const productiveTime = categoryData.Work + categoryData.Professional + (categoryData.Other * 0.5);
const productivityScore = Math.round((productiveTime / totalTime) * 100);

// Color coding:
// Green (70%+): Highly productive
// Yellow (40-69%): Moderately productive  
// Red (<40%): Needs improvement
```

## 📊 Category Management

### **Default Categories**
- **Work**: github.com, stackoverflow.com, leetcode.com, chatgpt.com, codechef.com
- **Social**: instagram.com, reddit.com, twitter.com
- **Professional**: linkedin.com
- **Entertainment**: youtube.com, netflix.com
- **Other**: Everything else

### **Dynamic Categorization**
- **User override**: Can change any site's category
- **Real-time updates**: Changes reflected immediately
- **Backend sync**: Category changes saved to database
- **Persistent storage**: Categories remembered across sessions

## 📄 Report Generation

### **PDF Reports (Always Available)**
- **Enhanced with session details**: Shows individual visit times
- **Beautiful formatting**: Professional layout with charts
- **Comprehensive data**:
  - Total time online
  - Top websites with percentages
  - Category breakdown
  - Session timestamps (NEW)
  - Productivity insights
  - Visual charts embedded

### **Email Reports (Optional)**
- **User-configured EmailJS**: Users set up their own free account
- **Same content as PDF**: Formatted for email reading
- **Test functionality**: Verify setup before use
- **Manual sending**: "Send Report Now" button
- **Privacy-first**: No developer email credentials exposed

## 🔒 Privacy & Security Features

### **Local-First Approach**
- **Primary storage**: Chrome extension local storage
- **Offline functionality**: Works without internet
- **User control**: Can clear data anytime
- **No tracking**: Extension doesn't track users

### **Optional Backend Sync**
- **User choice**: Can work purely offline or sync
- **MongoDB storage**: For cross-device sync
- **API endpoints**: RESTful backend service
- **Error handling**: Falls back to local storage if backend fails

### **Email Privacy**
- **No developer email**: Users configure their own email service
- **EmailJS integration**: Free service, user's own account
- **Optional feature**: Extension fully functional without email
- **Zero credentials**: No sensitive data in extension code

## 🔧 Technical Implementation

### **Background Script (Service Worker)**
- **Event listeners**: Tab changes, creation, removal, idle states
- **Session management**: Start/stop timing for each domain
- **Data validation**: Ensures clean domains and positive durations
- **Periodic sync**: Every 5 minutes to backend (if configured)
- **Error resilience**: Handles network failures gracefully

### **Popup Interface**
- **Modern JavaScript**: ES6+ with async/await
- **Chart.js integration**: Professional data visualization
- **Responsive design**: Works in extension popup constraints
- **Real-time updates**: Fetches fresh data on each open

### **Backend API**
- **Express.js server**: RESTful API design
- **MongoDB integration**: Efficient data storage
- **PDF generation**: PDFKit for report creation
- **Chart integration**: QuickChart for embedded visuals
- **CORS configured**: Secure cross-origin requests

## 🎯 User Experience Flow

### **First-Time Setup**
1. **Email entry**: Used as unique identifier
2. **Automatic tracking**: Starts immediately
3. **Default categories**: Pre-configured for common sites
4. **Optional email**: Can configure EmailJS later

### **Daily Usage**
1. **Browse normally**: Extension tracks in background
2. **Check popup**: View real-time stats and charts
3. **Manage categories**: Adjust site classifications
4. **Download reports**: Get detailed PDF reports
5. **Send emails**: Optional email reports to self

### **Data Management**
1. **View insights**: Productivity scores and trends
2. **Export data**: PDF reports for record keeping
3. **Sync across devices**: Optional backend synchronization
4. **Privacy control**: Clear data or disable features anytime

## 🚀 Advanced Features

### **Intelligent Session Handling**
- **Overlap prevention**: Ends previous session before starting new
- **Domain validation**: Filters out non-web URLs (chrome://, file://)
- **Duration limits**: Caps sessions at 24 hours maximum
- **Idle handling**: Automatically pauses during inactivity

### **Error Resilience**
- **Network failures**: Stores locally when backend unavailable
- **Data validation**: Prevents corrupted data storage
- **Graceful degradation**: Features work independently
- **Retry mechanisms**: Automatic sync retry for failed requests

### **Performance Optimization**
- **Efficient queries**: MongoDB indexing for fast lookups
- **Minimal resource usage**: Lightweight background processing
- **Compressed storage**: Optimized data structures
- **Lazy loading**: Features loaded only when needed

---

## 📈 Summary

TimeMachine is a **full-featured productivity tracking extension** that:

✅ **Works completely offline** with PDF reports
✅ **Optionally syncs** to backend for advanced features  
✅ **Respects privacy** with user-controlled email configuration
✅ **Provides detailed insights** with session-level tracking
✅ **Offers beautiful UI** with multiple themes and real-time charts
✅ **Handles edge cases** with robust error handling and validation

Users get **maximum flexibility**: from simple offline tracking to advanced cross-device sync with email reports - all while maintaining complete control over their data and privacy.
