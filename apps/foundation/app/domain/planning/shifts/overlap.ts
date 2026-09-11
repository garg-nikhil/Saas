import { parseTime } from "./time";
import { isOvernightShift } from "./duration";

export interface ShiftIntervalInput {
  id?: string | null;
  date: string; // YYYY-MM-DD
  startTime?: string | null; // HH:mm
  endTime?: string | null; // HH:mm
  name?: string | null;
}

export interface ShiftOverlapCheckResult {
  hasOverlap: boolean;
  conflictingShift?: ShiftIntervalInput;
  message?: string;
}

/**
 * Converts a date string (YYYY-MM-DD) into an integer day number (days since 1970-01-01 UTC).
 */
function dateToDays(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return Math.floor(d.getTime() / (1000 * 60 * 60 * 24));
}

/**
 * Computes the absolute start and end minutes [startMin, endMin) for a shift.
 */
export function getShiftMinuteRange(shift: {
  date: string;
  startTime?: string | null;
  endTime?: string | null;
}): { startMin: number; endMin: number } | null {
  if (!shift.startTime || !shift.endTime) {
    return null;
  }

  const start = parseTime(shift.startTime);
  const end = parseTime(shift.endTime);
  if (!start || !end) {
    return null;
  }

  const baseDays = dateToDays(shift.date);
  const baseMinutes = baseDays * 1440;

  const startMin = baseMinutes + start.totalMinutes;
  const isOvernight = isOvernightShift(shift.startTime, shift.endTime);
  const endMin = isOvernight
    ? baseMinutes + 1440 + end.totalMinutes
    : baseMinutes + end.totalMinutes;

  return { startMin, endMin };
}

/**
 * Checks if two shifts overlap in time.
 * Back-to-back shifts (e.g. 07:00-15:00 and 15:00-23:00) do NOT overlap.
 */
export function doShiftsOverlap(
  a: ShiftIntervalInput,
  b: ShiftIntervalInput
): boolean {
  // If either has no times, check if they are on the same date with identical IDs or undefined
  const rangeA = getShiftMinuteRange(a);
  const rangeB = getShiftMinuteRange(b);

  if (!rangeA || !rangeB) {
    // If times are not defined, no overlapping time conflict can be definitively calculated
    return false;
  }

  // Interval overlap: [startA, endA) and [startB, endB)
  return rangeA.startMin < rangeB.endMin && rangeB.startMin < rangeA.endMin;
}

/**
 * Validates a candidate shift against a list of existing shifts.
 * Ignores the existing shift if its ID matches the candidate ID (for updates).
 */
export function validateShiftOverlap(
  candidate: ShiftIntervalInput,
  existingShifts: ShiftIntervalInput[]
): ShiftOverlapCheckResult {
  const candidateRange = getShiftMinuteRange(candidate);
  if (!candidateRange) {
    return { hasOverlap: false };
  }

  for (const existing of existingShifts) {
    // Skip self when updating an existing shift
    if (candidate.id && existing.id && candidate.id === existing.id) {
      continue;
    }

    if (doShiftsOverlap(candidate, existing)) {
      const shiftLabel = existing.name ? `"${existing.name}"` : "une garde existante";
      const timeLabel =
        existing.startTime && existing.endTime
          ? ` (${existing.startTime} - ${existing.endTime})`
          : "";
      const dateLabel = existing.date !== candidate.date ? ` le ${existing.date}` : "";

      return {
        hasOverlap: true,
        conflictingShift: existing,
        message: `Conflit d'horaires : cette garde chevauche ${shiftLabel}${timeLabel}${dateLabel}.`,
      };
    }
  }

  return { hasOverlap: false };
}
