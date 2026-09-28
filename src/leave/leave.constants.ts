/**
 * LEAVE CONSTANTS
 * ===============
 * Shared limits and codes so the service, DTOs and mobile client all agree.
 */

/**
 * data.notification_type code for leave notifications.
 * The mobile app routes on this string to open the Leave screen.
 * Existing codes in use: 1 (class), 13 (remarks), 15 (fee), 16 (general alert), 20 (midterm).
 */
export const LEAVE_NOTIFICATION_TYPE = '17';

/** Notification `type` value (must exist in NotificationSchema enum). */
export const LEAVE_NOTIFICATION_KIND = 'leave';

/** Longest single leave application a student can file, in days. */
export const LEAVE_MAX_SPAN_DAYS = 90;

/** Leave cannot start in the past. */
export const LEAVE_PAST_DATE_MESSAGE =
  'Leave cannot be applied for a past date';
