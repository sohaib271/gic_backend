/**
 * 📐 ASSIGNMENT CONSTANTS
 * =======================
 * Shared between DTO validation, the service and the file store.
 *
 * notification_type codes (the Flutter app routes on these):
 *   25 - a new assignment was published
 *   26 - a submission was graded
 *   27 - a student submitted / resubmitted
 * Codes 25-27 were unused by the other modules (1,13,15,16,17,20-24,30).
 */

export const ASSIGNMENT_NOTIFICATION_TYPE = '25';
export const ASSIGNMENT_GRADED_NOTIFICATION_TYPE = '26';
export const ASSIGNMENT_SUBMITTED_NOTIFICATION_TYPE = '27';

/** Hard cap per uploaded file (matches the Flutter picker check). */
export const ASSIGNMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Maximum attachments on one assignment or one submission. */
export const ASSIGNMENT_MAX_FILES = 5;

/**
 * File types a teacher or student may attach. Homework is usually a PDF, an
 * Office document, an archive of code, or a phone photo of the work, so those
 * are allowed and everything executable is not.
 */
export const ASSIGNMENT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
];

export const ASSIGNMENT_STATUSES = ['published', 'closed'] as const;
