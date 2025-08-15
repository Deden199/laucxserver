import moment from 'moment-timezone';

/**
 * Returns current date and time in ISO 8601 format for Asia/Jakarta timezone.
 */
const getCurrentDate = (): string => {
  const jakartaDate = moment().tz('Asia/Jakarta');
  return jakartaDate.format();
};

/**
 * Safely get nested property value using dot notation path.
 */
const getNestedValue = (obj: any, path: string): any => {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
};

/**
 * Returns today's date in YYYYMMDD format for Asia/Jakarta timezone.
 */
const getTodayDateInJakartaFormat = (): string => {
  const today = new Date();
  const jakartaOffset = 7 * 60 * 60 * 1000; // UTC+7 in milliseconds
  const jakartaDate = new Date(today.getTime() + jakartaOffset);

  const year = jakartaDate.getUTCFullYear();
  const month = String(jakartaDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jakartaDate.getUTCDate()).padStart(2, '0');

  return `${year}${month}${day}`;
};

export { getCurrentDate, getNestedValue, getTodayDateInJakartaFormat };
