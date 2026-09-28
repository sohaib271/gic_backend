/**
 * 📐 MIDTERM CONSTANTS
 * ===================
 * Shared between the DTO validators and the Mongoose schema so the allowed
 * weekdays can never drift apart.
 */

/** Weekdays a midterm paper can be scheduled on (matches the portal's WEEKDAYS). */
export const MIDTERM_WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Upper bound on papers per schedule, guards against runaway payloads. */
export const MIDTERM_MAX_PAPERS = 30;

/**
 * notification_type sent inside the notification `data` payload.
 * The Flutter app routes on this number to open the MidtermScheduleScreen.
 * 20 is reserved for the midterm test schedule.
 */
export const MIDTERM_NOTIFICATION_TYPE = '20';
