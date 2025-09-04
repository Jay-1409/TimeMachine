const { v4: uuidv4 } = require('uuid');

/**
 * Validates timezone offset.
 * @param {number} offset - Timezone offset in minutes
 * @throws {Error} If offset is invalid
 */
function validateTimezoneOffset(offset) {
  if (!Number.isFinite(offset) || offset < -720 || offset > 840) {
    throw new Error('Invalid timezone offset');
  }
}

/**
 * Get current date in user's timezone.
 * @param {number} [timestamp=Date.now()] - Unix timestamp
 * @param {number} [timezoneOffset=0] - Timezone offset in minutes from UTC
 * @returns {string} Date in YYYY-MM-DD format
 */
function getUserTimezoneDate(timestamp = Date.now(), timezoneOffset = 0) {
  validateTimezoneOffset(timezoneOffset);
  const userTime = new Date(timestamp - (timezoneOffset * 60000));
  return userTime.toISOString().split('T')[0];
}

/**
 * Check if it's midnight in user's timezone.
 * @param {number} [timezoneOffset=0] - Timezone offset in minutes from UTC
 * @param {number} [tolerance=5] - Tolerance window in minutes
 * @returns {boolean} True if within tolerance of midnight
 */
function isMidnightInUserTimezone(timezoneOffset = 0, tolerance = 5) {
  validateTimezoneOffset(timezoneOffset);
  const userTime = new Date(Date.now() - (timezoneOffset * 60000));
  const minutesFromMidnight = userTime.getUTCHours() * 60 + userTime.getUTCMinutes();
  return minutesFromMidnight <= tolerance || minutesFromMidnight >= (24 * 60 - tolerance);
}

/**
 * Get timezone offsets currently at midnight.
 * @param {number} [tolerance=5] - Tolerance window in minutes
 * @returns {number[]} Array of timezone offsets at midnight
 */
function getTimezonesAtMidnight(tolerance = 5) {
  const midnightOffsets = [];
  for (let offset = -720; offset <= 840; offset += 15) {
    if (isMidnightInUserTimezone(offset, tolerance)) {
      midnightOffsets.push(offset);
    }
  }
  return midnightOffsets;
}

/**
 * Convert timestamp to user's local time.
 * @param {number} timestamp - Unix timestamp
 * @param {number} [timezoneOffset=0] - Timezone offset in minutes from UTC
 * @returns {Date} Date object in user's timezone
 */
function timestampToUserTime(timestamp, timezoneOffset = 0) {
  validateTimezoneOffset(timezoneOffset);
  if (!Number.isFinite(timestamp)) throw new Error('Invalid timestamp');
  return new Date(timestamp - (timezoneOffset * 60000));
}

/**
 * Get start and end of day in user's timezone.
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {number} [timezoneOffset=0] - Timezone offset in minutes from UTC
 * @returns {{startOfDay: number, endOfDay: number}} Timestamps for day bounds
 */
function getUserDayBounds(date, timezoneOffset = 0) {
  validateTimezoneOffset(timezoneOffset);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date format');
  const start = new Date(`${date}T00:00:00.000Z`).getTime() + (timezoneOffset * 60000);
  const end = new Date(`${date}T23:59:59.999Z`).getTime() + (timezoneOffset * 60000);
  return { startOfDay: start, endOfDay: end };
}

/**
 * Format duration in a human-readable format.
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "2h 30m")
 */
function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '0m';
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

/**
 * Schedule function to run at midnight in specific timezones.
 * @param {Function} callback - Function to execute
 * @param {number[]} [timezoneOffsets=[]] - Timezone offsets to monitor
 */
function scheduleAtMidnight(callback, timezoneOffsets = []) {
  setInterval(() => {
    const midnightOffsets = getTimezonesAtMidnight(2);
    for (const offset of timezoneOffsets) {
      if (midnightOffsets.includes(offset)) {
        try {
          callback(offset);
        } catch (error) {
          console.error(`Midnight callback error for offset ${offset}:`, error);
        }
      }
    }
  }, 60000);
}

module.exports = {
  getUserTimezoneDate,
  isMidnightInUserTimezone,
  getTimezonesAtMidnight,
  timestampToUserTime,
  getUserDayBounds,
  formatDuration,
  scheduleAtMidnight,
  generateDeviceId: () => uuidv4()
};