import type { ParsedTime } from "./types";

const TIME_HH_MM_REGEX = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;

/**
 * Parses and validates an HH:mm time string.
 * Strictly requires 5 characters in format HH:mm where HH is 00-23 and mm is 00-59.
 * Does not use JS Date parsing.
 */
export function parseTime(timeStr: unknown): ParsedTime | null {
  if (typeof timeStr !== "string") {
    return null;
  }

  if (timeStr.length !== 5) {
    return null;
  }

  const match = TIME_HH_MM_REGEX.exec(timeStr);
  if (!match) {
    return null;
  }

  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);

  if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return {
    hour,
    minute,
    totalMinutes: hour * 60 + minute,
  };
}

/**
 * Returns true if input is a valid HH:mm formatted string.
 */
export function isValidTime(timeStr: unknown): boolean {
  return parseTime(timeStr) !== null;
}
