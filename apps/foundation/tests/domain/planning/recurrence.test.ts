import { describe, it, expect } from "vitest";
import {
  validateRecurrenceRule,
  generateOccurrenceDates,
  parseDateString,
  addDays,
  getDayOfWeek,
  type RecurrenceRuleInput,
} from "../../../app/domain/planning/recurrence";

describe("Milestone 5C: Planning Infirmier Recurrence Domain Engine", () => {
  describe("1. Rule & Range Validation", () => {
    it("validates a correct daily recurrence rule", () => {
      const rule: RecurrenceRuleInput = {
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        frequency: "daily",
        interval: 1,
      };
      const res = validateRecurrenceRule(rule);
      expect(res.success).toBe(true);
    });

    it("validates a correct weekly recurrence rule", () => {
      const rule: RecurrenceRuleInput = {
        startDate: "2026-10-01",
        frequency: "weekly",
        interval: 2,
        daysOfWeek: [1, 3, 5],
      };
      const res = validateRecurrenceRule(rule);
      expect(res.success).toBe(true);
    });

    it("rejects invalid start date", () => {
      const res = validateRecurrenceRule({
        startDate: "2026-02-30",
        frequency: "daily",
        interval: 1,
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe("INVALID_START_DATE");
      }
    });

    it("rejects end date before start date", () => {
      const res = validateRecurrenceRule({
        startDate: "2026-10-15",
        endDate: "2026-10-01",
        frequency: "daily",
        interval: 1,
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe("INVALID_DATE_RANGE");
      }
    });

    it("rejects unsupported frequency", () => {
      const res = validateRecurrenceRule({
        startDate: "2026-10-01",
        frequency: "monthly",
        interval: 1,
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe("UNSUPPORTED_FREQUENCY");
      }
    });

    it("rejects interval < 1", () => {
      const resZero = validateRecurrenceRule({
        startDate: "2026-10-01",
        frequency: "daily",
        interval: 0,
      });
      expect(resZero.success).toBe(false);

      const resNeg = validateRecurrenceRule({
        startDate: "2026-10-01",
        frequency: "daily",
        interval: -2,
      });
      expect(resNeg.success).toBe(false);
    });

    it("rejects missing or invalid weekdays for weekly frequency", () => {
      const resMissing = validateRecurrenceRule({
        startDate: "2026-10-01",
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [],
      });
      expect(resMissing.success).toBe(false);

      const resInvalid = validateRecurrenceRule({
        startDate: "2026-10-01",
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [1, 7],
      });
      expect(resInvalid.success).toBe(false);
    });

    it("rejects invalid generation range when from > to", () => {
      const res = generateOccurrenceDates(
        { startDate: "2026-10-01", frequency: "daily", interval: 1 },
        { from: "2026-10-20", to: "2026-10-10" },
      );
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe("INVALID_GENERATION_RANGE");
      }
    });
  });

  describe("2. Daily Recurrence Generation", () => {
    it("generates daily occurrences (interval = 1)", () => {
      const res = generateOccurrenceDates(
        { startDate: "2026-10-01", endDate: "2026-10-05", frequency: "daily", interval: 1 },
        { from: "2026-10-01", to: "2026-10-10" },
      );
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.occurrences).toEqual([
          "2026-10-01",
          "2026-10-02",
          "2026-10-03",
          "2026-10-04",
          "2026-10-05",
        ]);
      }
    });

    it("generates every 2 days (interval = 2) excluding dates outside range", () => {
      const res = generateOccurrenceDates(
        { startDate: "2026-10-01", frequency: "daily", interval: 2 },
        { from: "2026-10-05", to: "2026-10-12" },
      );
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.occurrences).toEqual(["2026-10-05", "2026-10-07", "2026-10-09", "2026-10-11"]);
      }
    });

    it("generates every 3 days (interval = 3)", () => {
      const res = generateOccurrenceDates(
        { startDate: "2026-10-01", frequency: "daily", interval: 3 },
        { from: "2026-10-01", to: "2026-10-10" },
      );
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.occurrences).toEqual(["2026-10-01", "2026-10-04", "2026-10-07", "2026-10-10"]);
      }
    });
  });

  describe("3. Weekly Recurrence Generation", () => {
    it("generates weekly occurrences on specified weekdays (interval = 1)", () => {
      // 2026-10-05 is Monday (1), Wednesday is 2026-10-07 (3)
      const res = generateOccurrenceDates(
        {
          startDate: "2026-10-05",
          frequency: "weekly",
          interval: 1,
          daysOfWeek: [1, 3],
        },
        { from: "2026-10-05", to: "2026-10-18" },
      );
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.occurrences).toEqual([
          "2026-10-05", // Mon
          "2026-10-07", // Wed
          "2026-10-12", // Mon
          "2026-10-14", // Wed
        ]);
      }
    });

    it("sorts random input weekdays chronologically", () => {
      const res = generateOccurrenceDates(
        {
          startDate: "2026-10-05",
          frequency: "weekly",
          interval: 1,
          daysOfWeek: [5, 1, 3], // Fri, Mon, Wed
        },
        { from: "2026-10-05", to: "2026-10-11" },
      );
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.occurrences).toEqual([
          "2026-10-05", // Mon
          "2026-10-07", // Wed
          "2026-10-09", // Fri
        ]);
      }
    });

    it("skips non-matching weeks for biweekly (interval = 2) schedule", () => {
      const res = generateOccurrenceDates(
        {
          startDate: "2026-10-05", // Week 1 Mon
          frequency: "weekly",
          interval: 2,
          daysOfWeek: [1, 3], // Mon, Wed
        },
        { from: "2026-10-05", to: "2026-10-25" },
      );
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.occurrences).toEqual([
          "2026-10-05", // Week 1 Mon
          "2026-10-07", // Week 1 Wed
          // Week 2 (10-12 to 10-18) skipped!
          "2026-10-19", // Week 3 Mon
          "2026-10-21", // Week 3 Wed
        ]);
      }
    });
  });

  describe("4. Calendar Boundary Crossing & Leap Years", () => {
    it("handles month boundary crossing cleanly", () => {
      const res = generateOccurrenceDates(
        { startDate: "2026-10-28", frequency: "daily", interval: 2 },
        { from: "2026-10-28", to: "2026-11-05" },
      );
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.occurrences).toEqual(["2026-10-28", "2026-10-30", "2026-11-01", "2026-11-03", "2026-11-05"]);
      }
    });

    it("handles year boundary crossing cleanly", () => {
      const res = generateOccurrenceDates(
        { startDate: "2026-12-30", frequency: "daily", interval: 1 },
        { from: "2026-12-30", to: "2027-01-02" },
      );
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.occurrences).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
      }
    });

    it("handles leap year (2028-02-29) correctly", () => {
      const res = generateOccurrenceDates(
        { startDate: "2028-02-27", frequency: "daily", interval: 1 },
        { from: "2028-02-27", to: "2028-03-01" },
      );
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.occurrences).toEqual([
          "2028-02-27",
          "2028-02-28",
          "2028-02-29", // Leap day!
          "2028-03-01",
        ]);
      }
    });

    it("handles non-leap year (2027-02-28 to 2027-03-01) correctly", () => {
      const res = generateOccurrenceDates(
        { startDate: "2027-02-27", frequency: "daily", interval: 1 },
        { from: "2027-02-27", to: "2027-03-01" },
      );
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.occurrences).toEqual(["2027-02-27", "2027-02-28", "2027-03-01"]);
      }
    });
  });

  describe("5. Empty Results & Inactive Rules", () => {
    it("returns empty array when no matching weekday exists in range", () => {
      // 2026-10-05 is Monday, 2026-10-06 is Tuesday
      const res = generateOccurrenceDates(
        {
          startDate: "2026-10-05",
          frequency: "weekly",
          interval: 1,
          daysOfWeek: [0], // Sunday
        },
        { from: "2026-10-05", to: "2026-10-06" }, // Mon to Tue only
      );
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.occurrences).toEqual([]);
      }
    });

    it("returns empty array when rule isActive is false", () => {
      const res = generateOccurrenceDates(
        {
          startDate: "2026-10-01",
          frequency: "daily",
          interval: 1,
          isActive: false,
        },
        { from: "2026-10-01", to: "2026-10-10" },
      );
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.occurrences).toEqual([]);
      }
    });
  });

  describe("6. Duplicate Protection & Immutability", () => {
    it("deduplicates redundant input weekdays", () => {
      const res = generateOccurrenceDates(
        {
          startDate: "2026-10-05",
          frequency: "weekly",
          interval: 1,
          daysOfWeek: [1, 1, 3, 3], // Mon & Wed duplicated
        },
        { from: "2026-10-05", to: "2026-10-07" },
      );
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.occurrences).toEqual(["2026-10-05", "2026-10-07"]);
      }
    });

    it("does not mutate input rule object", () => {
      const rule: RecurrenceRuleInput = Object.freeze({
        startDate: "2026-10-01",
        frequency: "daily",
        interval: 1,
      });
      const res = generateOccurrenceDates(rule, { from: "2026-10-01", to: "2026-10-03" });
      expect(res.success).toBe(true);
      expect(rule.startDate).toBe("2026-10-01");
    });
  });

  describe("7. Range Safeguards", () => {
    it("rejects range span exceeding maxDaysLimit", () => {
      const res = generateOccurrenceDates(
        { startDate: "2026-01-01", frequency: "daily", interval: 1 },
        { from: "2026-01-01", to: "2030-01-01", maxDaysLimit: 100 }, // > 100 days
      );
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe("EXCEEDED_MAX_RANGE");
      }
    });
  });
});
