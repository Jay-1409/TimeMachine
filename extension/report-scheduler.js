// Report Scheduler Module
// This module handles scheduling and automating report generation and delivery

class ReportScheduler {
  constructor() {
    this.scheduleSettings = {
      enabled: false,
      frequency: 'daily', // daily, weekly, monthly
      day: 1, // day of week (0-6) for weekly, day of month (1-31) for monthly
      time: '18:00', // 24h format
      includeInactive: false // whether to send reports on days with no activity
    };
    
    this.lastReportSent = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    // Load settings from storage
    const data = await chrome.storage.local.get(['reportScheduleSettings', 'lastReportSent']);
    
    if (data.reportScheduleSettings) {
      this.scheduleSettings = {...this.scheduleSettings, ...data.reportScheduleSettings};
    }
    
    if (data.lastReportSent) {
      this.lastReportSent = new Date(data.lastReportSent);
    }
    
    this.checkSchedule();
    this.setupScheduleCheck();
    
    this.initialized = true;
    
    return this.scheduleSettings;
  }
  
  async saveSettings(settings) {
    this.scheduleSettings = {...this.scheduleSettings, ...settings};
    await chrome.storage.local.set({reportScheduleSettings: this.scheduleSettings});
    this.setupScheduleCheck();
    return this.scheduleSettings;
  }
  
  // Set up periodic check for scheduled reports
  setupScheduleCheck() {
    // Clear any existing checks
    if (this.scheduleCheckInterval) {
      clearInterval(this.scheduleCheckInterval);
    }
    
    // Only set up interval if scheduling is enabled
    if (this.scheduleSettings.enabled) {
      // Check every 5 minutes if a report should be sent
      this.scheduleCheckInterval = setInterval(() => this.checkSchedule(), 5 * 60 * 1000);
    }
  }
  
  // Check if a report should be sent now based on schedule
  async checkSchedule() {
    if (!this.scheduleSettings.enabled) return false;
    
    const now = new Date();
    const [scheduledHour, scheduledMinute] = this.scheduleSettings.time.split(':').map(Number);
    
    // Check if the time is right (within the last 10 minutes of scheduled time)
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    if (currentHour !== scheduledHour || currentMinute < scheduledMinute || currentMinute > scheduledMinute + 10) {
      return false;
    }
    
    // Check if the day matches for weekly/monthly schedules
    if (this.scheduleSettings.frequency === 'weekly' && now.getDay() !== this.scheduleSettings.day) {
      return false;
    }
    
    if (this.scheduleSettings.frequency === 'monthly' && now.getDate() !== this.scheduleSettings.day) {
      return false;
    }
    
    // Check if we already sent a report today
    if (this.lastReportSent) {
      const lastSentDate = new Date(this.lastReportSent);
      if (lastSentDate.toDateString() === now.toDateString()) {
        return false;
      }
    }
    
    // All conditions met, send the report
    await this.sendScheduledReport();
    return true;
  }
  
  // Send the scheduled report
  async sendScheduledReport() {
    try {
      // Check if there's activity for today before sending (unless opted in)
      if (!this.scheduleSettings.includeInactive) {
        const hasTodayActivity = await this.checkForTodayActivity();
        if (!hasTodayActivity) return false;
      }

      // Ensure email is configured (EmailJS)
      const { userEmail, emailConfig } = await chrome.storage.local.get(['userEmail','emailConfig']);
      if (!userEmail || !emailConfig || !emailConfig.enabled || emailConfig.service !== 'emailjs') {
        return false;
      }

      // Use the same flow as the manual send
      if (typeof window.sendDailyReport === 'function') {
        const ok = await window.sendDailyReport();
        if (!ok) return false;
      } else {
        // Fallback: try calling the function via message in case of module context
        try {
          await chrome.runtime.sendMessage({ action: 'sendDailyReport' });
        } catch (_) {
          return false;
        }
      }
      
      // Update the last sent time
      this.lastReportSent = new Date();
      await chrome.storage.local.set({lastReportSent: this.lastReportSent.toISOString()});
      
      return true;
    } catch (error) {
      console.error('Failed to send scheduled report:', error);
    }
    
    return false;
  }
  
  // Check if there's any activity data for today
  async checkForTodayActivity() {
    try {
      const { userEmail } = await chrome.storage.local.get(['userEmail']);
      if (!userEmail) return false;

      const backend = await window.resolveBackendUrl();
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      const timezone = today.getTimezoneOffset();

      // Attempt to include auth headers similar to popup.js
  let token;
      try { token = (await TokenStorage.getToken())?.token; } catch (_) {}

      const response = await fetch(
        `${backend}/api/time-data/report/${encodeURIComponent(userEmail)}?date=${dateStr}&endDate=${dateStr}&timezone=${timezone}`,
  { headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) } }
      );

      if (!response.ok) return false;
      const arr = await response.json();
      return Array.isArray(arr) && arr.length > 0;
    } catch (error) {
      console.error('Failed to check for activity:', error);
      return false;
    }
  }
  
  // Get next scheduled report time
  getNextScheduledTime() {
    if (!this.scheduleSettings.enabled) return null;
    
    const now = new Date();
    const [scheduledHour, scheduledMinute] = this.scheduleSettings.time.split(':').map(Number);
    
    const nextReport = new Date();
    nextReport.setHours(scheduledHour, scheduledMinute, 0, 0);
    
    // If the scheduled time has already passed for today
    if (nextReport <= now) {
      nextReport.setDate(nextReport.getDate() + 1);
    }
    
    // Adjust for weekly schedule
    if (this.scheduleSettings.frequency === 'weekly') {
      const currentDay = nextReport.getDay();
      const daysUntilScheduledDay = (7 + this.scheduleSettings.day - currentDay) % 7;
      
      if (daysUntilScheduledDay > 0 || (daysUntilScheduledDay === 0 && nextReport <= now)) {
        nextReport.setDate(nextReport.getDate() + daysUntilScheduledDay);
      }
    }
    
    // Adjust for monthly schedule
    if (this.scheduleSettings.frequency === 'monthly') {
      const currentDate = nextReport.getDate();
      
      if (currentDate > this.scheduleSettings.day) {
        // Move to next month
        nextReport.setMonth(nextReport.getMonth() + 1);
      }
      
      // Set the correct day of month
      nextReport.setDate(this.scheduleSettings.day);
    }
    
    return nextReport;
  }
}

// Create and export a single instance
const reportScheduler = new ReportScheduler();
export default reportScheduler;
