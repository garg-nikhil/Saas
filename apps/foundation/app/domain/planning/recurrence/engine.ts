import type {
  RecurrenceRuleInput,
  GenerationRangeInput,
  RecurrenceGenerationResult,
} from "./types";
import {
  parseDateString,
  formatDateString,
  isValidDateString,
  compareDates,
  dateToDays,
  daysToDate,
  getDayOfWeek,
} from "./date-utils";
import {
  validateRecurrenceRule,
  validateGenerationRange,
  normalizeWeekdays,
} from "./validation";

const DEFAULT_MAX_DAYS_LIMIT = 1095; // 3 years

function monBasedIndex(dayOfWeek: number): number {
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
}

export function generateOccurrenceDates(
  rule: RecurrenceRuleInput,
  range: GenerationRangeInput,
): RecurrenceGenerationResult {
  const ruleVal = validateRecurrenceRule(rule);
  if (!ruleVal.success) {
    return { success: false, error: ruleVal.error };
  }

  const rangeVal = validateGenerationRange(range);
  if (!rangeVal.success) {
    return { success: false, error: rangeVal.error };
  }

  if (rule.isActive === false) {
    return { success: true, occurrences: [] };
  }

  const effectiveStart =
    compareDates(rule.startDate, range.from) > 0 ? rule.startDate : range.from;

  let effectiveEnd = range.to;
  if (rule.endDate && compareDates(rule.endDate, range.to) < 0) {
    effectiveEnd = rule.endDate;
  }

  if (compareDates(effectiveEnd, effectiveStart) < 0) {
    return { success: true, occurrences: [] };
  }

  const startYMD = parseDateString(effectiveStart)!;
  const endYMD = parseDateString(effectiveEnd)!;
  const startDaysNum = dateToDays(startYMD);
  const endDaysNum = dateToDays(endYMD);

  const rangeDaysCount = endDaysNum - startDaysNum + 1;
  const maxLimit = range.maxDaysLimit ?? DEFAULT_MAX_DAYS_LIMIT;

  if (rangeDaysCount > maxLimit) {
    return {
      success: false,
      error: {
        code: "EXCEEDED_MAX_RANGE",
        message: `Generation range span (${rangeDaysCount} days) exceeds maximum limit of ${maxLimit} days.`,
        details: { rangeDaysCount, maxLimit },
      },
    };
  }

  const occurrences: string[] = [];
  const freq = rule.frequency.toLowerCase();
  const interval = rule.interval;
  const ruleStartYMD = parseDateString(rule.startDate)!;
  const ruleStartDaysNum = dateToDays(ruleStartYMD);

  if (freq === "daily") {
    const startOffset = startDaysNum - ruleStartDaysNum;
    const nStart = startOffset > 0 ? Math.ceil(startOffset / interval) : 0;

    let n = nStart;
    while (true) {
      const candidateDays = ruleStartDaysNum + n * interval;
      if (candidateDays > endDaysNum) {
        break;
      }
      if (candidateDays >= startDaysNum) {
        occurrences.push(formatDateString(daysToDate(candidateDays)));
      }
      n++;
    }
  } else if (freq === "weekly") {
    const { days } = normalizeWeekdays(rule.daysOfWeek);
    const ruleStartMonAnchor =
      ruleStartDaysNum - monBasedIndex(getDayOfWeek(ruleStartYMD));

    const effStartMonAnchor =
      startDaysNum - monBasedIndex(getDayOfWeek(startYMD));
    const effEndMonAnchor = endDaysNum - monBasedIndex(getDayOfWeek(endYMD));

    const startWeekDiff = Math.floor((effStartMonAnchor - ruleStartMonAnchor) / 7);
    const endWeekDiff = Math.floor((effEndMonAnchor - ruleStartMonAnchor) / 7);

    const kStart = startWeekDiff > 0 ? Math.floor(startWeekDiff / interval) : 0;
    const kEnd = Math.floor(endWeekDiff / interval) + 1;

    for (let k = kStart; k <= kEnd; k++) {
      const weekMonAnchor = ruleStartMonAnchor + k * interval * 7;

      for (const dayOfWeek of days) {
        const targetMonIdx = monBasedIndex(dayOfWeek);
        const candidateDays = weekMonAnchor + targetMonIdx;

        if (candidateDays >= startDaysNum && candidateDays <= endDaysNum) {
          if (candidateDays >= ruleStartDaysNum) {
            occurrences.push(formatDateString(daysToDate(candidateDays)));
          }
        }
      }
    }
  }

  const sortedUniqueOccurrences = Array.from(new Set(occurrences)).sort(compareDates);

  return {
    success: true,
    occurrences: sortedUniqueOccurrences,
  };
}
