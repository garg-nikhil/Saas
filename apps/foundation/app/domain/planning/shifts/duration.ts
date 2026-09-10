import type { ShiftTimeInput, ShiftDurationResult } from "./types";
import { parseTime } from "./time";

const MINUTES_PER_DAY = 1440;

/**
 * Checks if a shift crosses midnight (endTime strictly earlier than startTime).
 * Requires both inputs to be valid HH:mm strings.
 */
export function isOvernightShift(startTimeStr: string, endTimeStr: string): boolean {
  const start = parseTime(startTimeStr);
  const end = parseTime(endTimeStr);
  if (!start || !end) {
    return false;
  }
  return end.totalMinutes < start.totalMinutes;
}

/**
 * Calculates shift duration in integer minutes and determines overnight status.
 *
 * Rules:
 * - Rejects missing or null/undefined times.
 * - Rejects invalid HH:mm formats.
 * - Rejects equal start and end times (e.g. 08:00 -> 08:00) to avoid ambiguous zero or 24-hour shifts.
 * - Overnight shifts (end < start) calculate total time across midnight without altering DB dates.
 */
export function calculateShiftDuration(input: ShiftTimeInput): ShiftDurationResult {
  if (!input || input.startTime === undefined || input.startTime === null) {
    return {
      success: false,
      error: {
        code: "MISSING_TIME_INPUTS",
        message: "Start time is required for duration calculation",
        field: "startTime",
      },
    };
  }

  if (input.endTime === undefined || input.endTime === null) {
    return {
      success: false,
      error: {
        code: "MISSING_TIME_INPUTS",
        message: "End time is required for duration calculation",
        field: "endTime",
      },
    };
  }

  const start = parseTime(input.startTime);
  if (!start) {
    return {
      success: false,
      error: {
        code: "INVALID_TIME_FORMAT",
        message: `Invalid start time format "${input.startTime}". Expected HH:mm (00:00 to 23:59)`,
        field: "startTime",
        details: { value: input.startTime },
      },
    };
  }

  const end = parseTime(input.endTime);
  if (!end) {
    return {
      success: false,
      error: {
        code: "INVALID_TIME_FORMAT",
        message: `Invalid end time format "${input.endTime}". Expected HH:mm (00:00 to 23:59)`,
        field: "endTime",
        details: { value: input.endTime },
      },
    };
  }

  if (start.totalMinutes === end.totalMinutes) {
    return {
      success: false,
      error: {
        code: "INVALID_SHIFT_DURATION",
        message: `Equal start and end times ("${input.startTime}" to "${input.endTime}") are invalid. Shifts must have non-zero duration`,
        details: { startTime: input.startTime, endTime: input.endTime },
      },
    };
  }

  const isOvernight = end.totalMinutes < start.totalMinutes;
  const durationMinutes = isOvernight
    ? MINUTES_PER_DAY - start.totalMinutes + end.totalMinutes
    : end.totalMinutes - start.totalMinutes;

  return {
    success: true,
    durationMinutes,
    isOvernight,
    formatted: formatDuration(durationMinutes),
  };
}

/**
 * Formats duration in minutes to French compact representation (e.g. 0m, 1m, 59m, 1h, 1h01, 7h30, 10h).
 */
export function formatDuration(durationMinutes: number): string {
  if (typeof durationMinutes !== "number" || isNaN(durationMinutes) || durationMinutes < 0) {
    return "0m";
  }

  const minutes = Math.floor(durationMinutes);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  const formattedMins = remainingMinutes < 10 ? `0${remainingMinutes}` : `${remainingMinutes}`;
  return `${hours}h${formattedMins}`;
}
