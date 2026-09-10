import type {
  RecurrenceRuleInput,
  RecurrenceValidationResult,
  GenerationRangeInput,
  RecurrenceDomainError,
} from "./types";
import { isValidDateString, compareDates } from "./date-utils";

/**
 * Normalizes weekday representations (0..6, where 0=Sunday, 1=Monday... 6=Saturday)
 * and deduplicates/sorts them deterministically.
 */
export function normalizeWeekdays(rawDays: unknown): { valid: boolean; days: number[] } {
  if (!Array.isArray(rawDays) || rawDays.length === 0) {
    return { valid: false, days: [] };
  }

  const daysSet = new Set<number>();

  for (const item of rawDays) {
    let dayNum: number;
    if (typeof item === "number") {
      dayNum = item;
    } else if (typeof item === "string") {
      const parsed = parseInt(item.trim(), 10);
      if (isNaN(parsed)) {
        return { valid: false, days: [] };
      }
      dayNum = parsed;
    } else {
      return { valid: false, days: [] };
    }

    if (!Number.isInteger(dayNum) || dayNum < 0 || dayNum > 6) {
      return { valid: false, days: [] };
    }

    daysSet.add(dayNum);
  }

  if (daysSet.size === 0) {
    return { valid: false, days: [] };
  }

  const sortedDays = Array.from(daysSet).sort((a, b) => a - b);
  return { valid: true, days: sortedDays };
}

/**
 * Validates a recurrence rule input.
 */
export function validateRecurrenceRule(rule: RecurrenceRuleInput): RecurrenceValidationResult {
  if (!rule || typeof rule !== "object") {
    return {
      success: false,
      error: {
        code: "INVALID_START_DATE",
        message: "Recurrence rule must be a valid object",
      },
    };
  }

  if (!isValidDateString(rule.startDate)) {
    return {
      success: false,
      error: {
        code: "INVALID_START_DATE",
        message: `Invalid start date "${rule.startDate}". Expected YYYY-MM-DD.`,
        field: "startDate",
      },
    };
  }

  if (rule.endDate !== null && rule.endDate !== undefined && rule.endDate !== "") {
    if (!isValidDateString(rule.endDate)) {
      return {
        success: false,
        error: {
          code: "INVALID_END_DATE",
          message: `Invalid end date "${rule.endDate}". Expected YYYY-MM-DD.`,
          field: "endDate",
        },
      };
    }

    if (compareDates(rule.endDate, rule.startDate) < 0) {
      return {
        success: false,
        error: {
          code: "INVALID_DATE_RANGE",
          message: `End date "${rule.endDate}" cannot be before start date "${rule.startDate}".`,
          field: "endDate",
        },
      };
    }
  }

  const freq = (rule.frequency || "").toLowerCase();
  if (freq !== "daily" && freq !== "weekly") {
    return {
      success: false,
      error: {
        code: "UNSUPPORTED_FREQUENCY",
        message: `Unsupported frequency "${rule.frequency}". Supported frequencies are "daily" and "weekly".`,
        field: "frequency",
      },
    };
  }

  if (
    typeof rule.interval !== "number" ||
    !Number.isInteger(rule.interval) ||
    rule.interval < 1
  ) {
    return {
      success: false,
      error: {
        code: "INVALID_INTERVAL",
        message: `Interval must be a positive integer >= 1. Received ${rule.interval}.`,
        field: "interval",
      },
    };
  }

  if (freq === "weekly") {
    if (!rule.daysOfWeek || (Array.isArray(rule.daysOfWeek) && rule.daysOfWeek.length === 0)) {
      return {
        success: false,
        error: {
          code: "MISSING_WEEKDAYS",
          message: "Weekly recurrence requires at least one weekday in daysOfWeek (0..6).",
          field: "daysOfWeek",
        },
      };
    }

    const { valid } = normalizeWeekdays(rule.daysOfWeek);
    if (!valid) {
      return {
        success: false,
        error: {
          code: "INVALID_WEEKDAYS",
          message:
            "Invalid daysOfWeek values. Must be integers 0 to 6 (0=Sunday, 1=Monday ... 6=Saturday).",
          field: "daysOfWeek",
        },
      };
    }
  }

  return { success: true };
}

/**
 * Validates a generation window range input.
 */
export function validateGenerationRange(
  range: GenerationRangeInput,
): { success: true } | { success: false; error: RecurrenceDomainError } {
  if (!range || typeof range !== "object") {
    return {
      success: false,
      error: {
        code: "INVALID_GENERATION_RANGE",
        message: "Generation range must be a valid object",
      },
    };
  }

  if (!isValidDateString(range.from)) {
    return {
      success: false,
      error: {
        code: "INVALID_GENERATION_RANGE",
        message: `Invalid "from" date "${range.from}". Expected YYYY-MM-DD.`,
        field: "from",
      },
    };
  }

  if (!isValidDateString(range.to)) {
    return {
      success: false,
      error: {
        code: "INVALID_GENERATION_RANGE",
        message: `Invalid "to" date "${range.to}". Expected YYYY-MM-DD.`,
        field: "to",
      },
    };
  }

  if (compareDates(range.to, range.from) < 0) {
    return {
      success: false,
      error: {
        code: "INVALID_GENERATION_RANGE",
        message: `"to" date "${range.to}" cannot be before "from" date "${range.from}".`,
        field: "to",
      },
    };
  }

  return { success: true };
}
