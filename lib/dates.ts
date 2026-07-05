/**
 * Date parsing/validation helpers shared by the astrology tools.
 * Every failure returns an actionable message telling the caller which
 * parameter is wrong and exactly how to fix it.
 */

export interface ParsedDate {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

/** Parse a strict ISO calendar date (YYYY-MM-DD) with a real-calendar validity check. */
export function parseIsoDate(paramName: string, value: string): ParseResult<ParsedDate> {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) {
    return {
      ok: false,
      error: `Invalid ${paramName}: "${value}". Use ISO format YYYY-MM-DD, e.g. "1990-12-31".`,
    };
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) {
    return {
      ok: false,
      error: `Invalid ${paramName}: month "${m[2]}" is out of range. Use a month between 01 and 12, e.g. "1990-06-15".`,
    };
  }
  const maxDay = daysInMonth(year, month);
  if (day < 1 || day > maxDay) {
    return {
      ok: false,
      error: `Invalid ${paramName}: day "${m[3]}" does not exist in ${m[1]}-${m[2]} (that month has ${maxDay} days). Use a day between 01 and ${String(maxDay).padStart(2, "0")}.`,
    };
  }
  if (year < 1900 || year > 2100) {
    return {
      ok: false,
      error: `Invalid ${paramName}: year ${year} is out of the supported range 1900–2100. Pass a ${paramName} within that range.`,
    };
  }
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { ok: true, value: { year, month, day, weekday } };
}

export interface ParsedTime {
  hour: number;
  minute: number;
}

/** Parse a 24-hour HH:mm time string. */
export function parseTime(paramName: string, value: string): ParseResult<ParsedTime> {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  const hour = m ? Number(m[1]) : NaN;
  const minute = m ? Number(m[2]) : NaN;
  if (!m || hour > 23 || minute > 59) {
    return {
      ok: false,
      error: `Invalid ${paramName}: "${value}". Use 24-hour HH:mm format between "00:00" and "23:59", e.g. "08:30" or "21:45".`,
    };
  }
  return { ok: true, value: { hour, minute } };
}

export const EN_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const EN_WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

/** Format e.g. "Friday, 6 February 2026 (B.E. 2569)" — B.E. = Thai Buddhist Era. */
export function formatLongDate(d: { year: number; month: number; day: number; weekday: number }): string {
  return `${EN_WEEKDAYS[d.weekday]}, ${d.day} ${EN_MONTHS[d.month - 1]} ${d.year} (B.E. ${d.year + 543})`;
}

export function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
