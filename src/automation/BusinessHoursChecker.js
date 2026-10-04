const SanitizedLogger = require('../utils/SanitizedLogger');

const logger = new SanitizedLogger('BusinessHoursChecker');

class BusinessHoursChecker {
  /**
   * Checks if current time is within configured business hours
   * @param {object} settings Map of settings
   * @returns {{ isWithinHours: boolean, scheduleInfo?: string }}
   */
  static isWithinBusinessHours(settings) {
    const isEnabled = settings.business_hours_enabled === 'true' || settings.business_hours_enabled === true;
    if (!isEnabled) {
      return { isWithinHours: true };
    }

    let schedule = {};
    try {
      schedule = typeof settings.business_hours_schedule === 'string'
        ? JSON.parse(settings.business_hours_schedule)
        : settings.business_hours_schedule || {};
    } catch (err) {
      logger.error('Error parsing business_hours_schedule setting', { err: err.message });
      return { isWithinHours: true };
    }

    // Determine current time in the configured timezone (default America/Sao_Paulo)
    const timezone = settings.timezone || 'America/Sao_Paulo';
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });

    const parts = formatter.formatToParts(now);
    const dayName = parts.find(p => p.type === 'weekday')?.value; // e.g. "Mon"
    const currentHour = parseInt(parts.find(p => p.type === 'hour')?.value, 10);
    const currentMinute = parseInt(parts.find(p => p.type === 'minute')?.value, 10);
    const currentMinutes = currentHour * 60 + currentMinute;

    // Day mapping: 0=Sun, 1=Mon, ..., 6=Sat
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayOfWeek = dayMap[dayName] !== undefined ? dayMap[dayName] : now.getDay();

    const dayConfig = schedule[dayOfWeek];
    if (!dayConfig || !dayConfig.enabled) {
      return { isWithinHours: false, scheduleInfo: 'Day closed' };
    }

    const [openH, openM] = (dayConfig.open || '08:00').split(':').map(Number);
    const [closeH, closeM] = (dayConfig.close || '18:00').split(':').map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    const isWithin = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
    return {
      isWithinHours: isWithin,
      scheduleInfo: `${dayConfig.open} - ${dayConfig.close}`
    };
  }
}

module.exports = BusinessHoursChecker;
