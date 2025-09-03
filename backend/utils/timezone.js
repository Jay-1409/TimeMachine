const moment = require('moment-timezone');

/**
 * Get current date in user's timezone
 * @param {number} timestamp - Unix timestamp
 * @param {number} timezoneOffset - Timezone offset in minutes from UTC
 * @returns {string} Date in YYYY-MM-DD format
 */
function getUserTimezoneDate(timestamp = Date.now(), timezoneOffset = 0) {
  if (isNaN(timezoneOffset)) throw new Error('Invalid timezone offset');
  const userTime = new Date(timestamp - (timezoneOffset * 60000));
  return userTime.toISOString().split('T')[0];
}

/**
 * Check if it's midnight (00:00) in user's timezone
 * @param {number} timezoneOffset - Timezone offset in minutes from UTC
 * @param {number} toleranceMinutes - Tolerance window around midnight (default: 5 minutes)
 * @returns {boolean} True if within tolerance of midnight
 */
function isMidnightInUserTimezone(timezoneOffset = 0, toleranceMinutes = 5) {
  if (isNaN(timezoneOffset)) throw new Error('Invalid timezone offset');
  const now = Date.now();
  const userTime = new Date(now - (timezoneOffset * 60000));
  
  const hours = userTime.getUTCHours();
  const minutes = userTime.getUTCMinutes();
  
  const minutesFromMidnight = hours * 60 + minutes;
  return minutesFromMidnight <= toleranceMinutes || minutesFromMidnight >= (24 * 60 - toleranceMinutes);
}

/**
 * Get all timezone offsets that are currently at midnight
 * @param {number} toleranceMinutes - Tolerance window around midnight
 * @returns {number[]} Array of timezone offsets (in minutes) that are at midnight
 */
function getTimezonesAtMidnight(toleranceMinutes = 5) {
  const midnightTimezones = [];
  
  // Check common timezone offsets (every 15 minutes from -12 to +14 hours)
  for (let hours = -12; hours <= 14; hours += 0.25) {
    const offsetMinutes = hours * 60;
    if (isMidnightInUserTimezone(offsetMinutes, toleranceMinutes)) {
      midnightTimezones.push(offsetMinutes);
    }
  }
  
  return midnightTimezones;
}

/**
 * Convert timestamp to user's local time
 * @param {number} timestamp - Unix timestamp
 * @param {number} timezoneOffset - Timezone offset in minutes from UTC
 * @returns {Date} Date object in user's timezone
 */
function timestampToUserTime(timestamp, timezoneOffset = 0) {
  if (isNaN(timezoneOffset) || isNaN(timestamp)) throw new Error('Invalid timestamp or timezone offset');
  return new Date(timestamp - (timezoneOffset * 60000));
}

/**
 * Get start and end of day in user's timezone
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {number} timezoneOffset - Timezone offset in minutes from UTC
 * @returns {object} Object with startOfDay and endOfDay timestamps
 */
function getUserDayBounds(date, timezoneOffset = 0) {
  if (isNaN(timezoneOffset)) throw new Error('Invalid timezone offset');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date format');
  
  const startOfDay = new Date(date + 'T00:00:00.000Z');
  const startTimestamp = startOfDay.getTime() + (timezoneOffset * 60000);
  
  const endOfDay = new Date(date + 'T23:59:59.999Z');
  const endTimestamp = endOfDay.getTime() + (timezoneOffset * 60000);
  
  return {
    startOfDay: startTimestamp,
    endOfDay: endTimestamp
  };
}

/**
 * Format duration in a human-readable format
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "2h 30m", "45m", "30s")
 */
function formatDuration(milliseconds) {
  if (isNaN(milliseconds) || milliseconds < 0) return '0m';
  
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds === 0) return '0m';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

/**
 * Get timezone name from offset
 * @param {number} offsetMinutes - Timezone offset in minutes from UTC
 * @returns {string} Timezone name
 */
function getTimezoneNameFromOffset(offsetMinutes) {
  if (isNaN(offsetMinutes)) throw new Error('Invalid timezone offset');
  const zones = moment.tz.names().filter(name => {
    const zone = moment.tz.zone(name);
    return zone && moment.tz(name).utcOffset() === offsetMinutes;
  });
  return zones[0] || `UTC${offsetMinutes / 60 >= 0 ? '+' : ''}${offsetMinutes / 60}`;
}

/**
 * Schedule function to run at midnight in specific timezones
 * @param {Function} callback - Function to execute at midnight
 * @param {number[]} timezoneOffsets - Array of timezone offsets to monitor
 */
function scheduleAtMidnight(callback, timezoneOffsets = []) {
  setInterval(() => {
    const midnightTimezones = getTimezonesAtMidnight(2);
    
    for (const offset of timezoneOffsets) {
      if (midnightTimezones.includes(offset)) {
        try {
          callback(offset);
        } catch (error) {
          console.error(`Error executing midnight callback for timezone offset ${offset}:`, error);
        }
      }
    }
  }, 60000); // Check every minute
}

module.exports = {
  getUserTimezoneDate,
  isMidnightInUserTimezone,
  getTimezonesAtMidnight,
  timestampToUserTime,
  getUserDayBounds,
  formatDuration,
  getTimezoneNameFromOffset,
  scheduleAtMidnight,
  generateDeviceId: () => uuidv4()
};