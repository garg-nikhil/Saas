export interface YMD {
  year: number;
  month: number;
  day: number;
}

const DATE_REGEX = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getDaysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

export function parseDateString(dateStr: unknown): YMD | null {
  if (typeof dateStr !== "string" || dateStr.length !== 10) {
    return null;
  }

  const match = DATE_REGEX.exec(dateStr);
  if (!match) {
    return null;
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12) {
    return null;
  }

  const maxDays = getDaysInMonth(year, month);
  if (day < 1 || day > maxDays) {
    return null;
  }

  return { year, month, day };
}

export function isValidDateString(dateStr: unknown): boolean {
  return parseDateString(dateStr) !== null;
}

export function formatDateString(ymd: YMD): string {
  const y = ymd.year.toString().padStart(4, "0");
  const m = ymd.month.toString().padStart(2, "0");
  const d = ymd.day.toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dateToDays(ymd: YMD): number {
  let days = ymd.day - 1;
  const y = ymd.year;

  if (y >= 2000) {
    for (let yr = 2000; yr < y; yr++) {
      days += isLeapYear(yr) ? 366 : 365;
    }
  } else {
    for (let yr = 1999; yr >= y; yr--) {
      days -= isLeapYear(yr) ? 366 : 365;
    }
  }

  for (let m = 1; m < ymd.month; m++) {
    days += getDaysInMonth(y, m);
  }

  return days;
}

export function daysToDate(totalDays: number): YMD {
  let days = totalDays;
  let year = 2000;

  if (days >= 0) {
    while (true) {
      const daysInYr = isLeapYear(year) ? 366 : 365;
      if (days < daysInYr) {
        break;
      }
      days -= daysInYr;
      year++;
    }
  } else {
    while (days < 0) {
      year--;
      const daysInYr = isLeapYear(year) ? 366 : 365;
      days += daysInYr;
    }
  }

  let month = 1;
  while (true) {
    const dim = getDaysInMonth(year, month);
    if (days < dim) {
      break;
    }
    days -= dim;
    month++;
  }

  return { year, month, day: days + 1 };
}

/**
 * Returns weekday integer: 0 = Sunday, 1 = Monday, ..., 6 = Saturday.
 */
export function getDayOfWeek(ymd: YMD): number {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  let year = ymd.year;
  if (ymd.month < 3) {
    year -= 1;
  }
  return (
    (year +
      Math.floor(year / 4) -
      Math.floor(year / 100) +
      Math.floor(year / 400) +
      t[ymd.month - 1] +
      ymd.day) %
    7
  );
}

export function addDays(dateStr: string, daysToAdd: number): string {
  const parsed = parseDateString(dateStr);
  if (!parsed) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  const days = dateToDays(parsed);
  return formatDateString(daysToDate(days + daysToAdd));
}

/**
 * Compares two ISO YYYY-MM-DD date strings.
 * Returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
export function compareDates(dateStrA: string, dateStrB: string): number {
  if (dateStrA === dateStrB) {
    return 0;
  }
  return dateStrA < dateStrB ? -1 : 1;
}
