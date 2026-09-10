import { describe, it, expect } from "vitest";
import {
  parseTime,
  isValidTime,
  isOvernightShift,
  calculateShiftDuration,
  formatDuration,
  type ShiftTimeInput,
} from "../../../app/domain/planning/shifts";

describe("Milestone 5B: Planning Infirmier Shift Domain Engine", () => {
  describe("1. Time Parsing & Validation (HH:mm)", () => {
    it("accepts valid HH:mm time strings", () => {
      const times = [
        { str: "00:00", hour: 0, minute: 0, total: 0 },
        { str: "06:45", hour: 6, minute: 45, total: 405 },
        { str: "07:00", hour: 7, minute: 0, total: 420 },
        { str: "13:45", hour: 13, minute: 45, total: 825 },
        { str: "19:00", hour: 19, minute: 0, total: 1140 },
        { str: "21:00", hour: 21, minute: 0, total: 1260 },
        { str: "22:00", hour: 22, minute: 0, total: 1320 },
        { str: "23:59", hour: 23, minute: 59, total: 1439 },
      ];

      for (const t of times) {
        expect(isValidTime(t.str)).toBe(true);
        const parsed = parseTime(t.str);
        expect(parsed).toEqual({
          hour: t.hour,
          minute: t.minute,
          totalMinutes: t.total,
        });
      }
    });

    it("rejects invalid time formats and out-of-range values", () => {
      const invalidTimes = [
        "24:00",
        "25:00",
        "12:60",
        "01:000",
        "1:00",
        "abc",
        "-01:00",
        "12:5",
        "12:5a",
        "",
        null,
        undefined,
        123,
        {},
      ];

      for (const inv of invalidTimes) {
        expect(isValidTime(inv)).toBe(false);
        expect(parseTime(inv)).toBeNull();
      }
    });
  });

  describe("2. Normal Shift Duration Calculation", () => {
    it("calculates correct duration in minutes for same-day shifts", () => {
      const cases = [
        { start: "06:45", end: "14:15", expectedMins: 450, expectedFmt: "7h30" },
        { start: "13:45", end: "21:15", expectedMins: 450, expectedFmt: "7h30" },
        { start: "07:00", end: "19:00", expectedMins: 720, expectedFmt: "12h" },
        { start: "08:30", end: "16:30", expectedMins: 480, expectedFmt: "8h" },
      ];

      for (const c of cases) {
        const result = calculateShiftDuration({ startTime: c.start, endTime: c.end });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.durationMinutes).toBe(c.expectedMins);
          expect(result.isOvernight).toBe(false);
          expect(result.formatted).toBe(c.expectedFmt);
        }
      }
    });
  });

  describe("3. Overnight Shift Detection & Duration", () => {
    it("identifies overnight shifts when end time is earlier than start time", () => {
      expect(isOvernightShift("21:00", "07:00")).toBe(true);
      expect(isOvernightShift("22:00", "07:00")).toBe(true);
      expect(isOvernightShift("23:59", "00:01")).toBe(true);
      expect(isOvernightShift("06:45", "14:15")).toBe(false);
    });

    it("calculates correct duration for overnight shifts without altering DB dates", () => {
      const cases = [
        { start: "21:00", end: "07:00", expectedMins: 600, expectedFmt: "10h" },
        { start: "22:00", end: "07:00", expectedMins: 540, expectedFmt: "9h" },
        { start: "23:59", end: "00:01", expectedMins: 2, expectedFmt: "2m" },
      ];

      for (const c of cases) {
        const result = calculateShiftDuration({ startTime: c.start, endTime: c.end });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.durationMinutes).toBe(c.expectedMins);
          expect(result.isOvernight).toBe(true);
          expect(result.formatted).toBe(c.expectedFmt);
        }
      }
    });
  });

  describe("4. Boundary Conditions & Equal Times", () => {
    it("handles 1-minute shift boundaries correctly", () => {
      const b1 = calculateShiftDuration({ startTime: "00:00", endTime: "00:01" });
      expect(b1.success && b1.durationMinutes).toBe(1);

      const b2 = calculateShiftDuration({ startTime: "23:58", endTime: "23:59" });
      expect(b2.success && b2.durationMinutes).toBe(1);

      const b3 = calculateShiftDuration({ startTime: "23:59", endTime: "00:00" });
      expect(b3.success && b3.durationMinutes).toBe(1);
      expect(b3.success && b3.isOvernight).toBe(true);
    });

    it("rejects equal start and end times to prevent ambiguous zero/24-hour duration", () => {
      const result = calculateShiftDuration({ startTime: "08:00", endTime: "08:00" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("INVALID_SHIFT_DURATION");
        expect(result.error.message).toContain("Equal start and end times");
      }
    });
  });

  describe("5. Missing & Null Time Inputs", () => {
    it("returns structured MISSING_TIME_INPUTS error when start or end time is missing", () => {
      const resMissingStart = calculateShiftDuration({ endTime: "14:15" });
      expect(resMissingStart.success).toBe(false);
      if (!resMissingStart.success) {
        expect(resMissingStart.error.code).toBe("MISSING_TIME_INPUTS");
        expect(resMissingStart.error.field).toBe("startTime");
      }

      const resNullStart = calculateShiftDuration({ startTime: null, endTime: "14:15" });
      expect(resNullStart.success).toBe(false);
      if (!resNullStart.success) {
        expect(resNullStart.error.code).toBe("MISSING_TIME_INPUTS");
        expect(resNullStart.error.field).toBe("startTime");
      }

      const resMissingEnd = calculateShiftDuration({ startTime: "06:45" });
      expect(resMissingEnd.success).toBe(false);
      if (!resMissingEnd.success) {
        expect(resMissingEnd.error.code).toBe("MISSING_TIME_INPUTS");
        expect(resMissingEnd.error.field).toBe("endTime");
      }

      const resBothMissing = calculateShiftDuration({});
      expect(resBothMissing.success).toBe(false);
      if (!resBothMissing.success) {
        expect(resBothMissing.error.code).toBe("MISSING_TIME_INPUTS");
      }
    });

    it("returns INVALID_TIME_FORMAT when invalid string format is provided", () => {
      const result = calculateShiftDuration({ startTime: "24:00", endTime: "08:00" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("INVALID_TIME_FORMAT");
        expect(result.error.field).toBe("startTime");
      }
    });
  });

  describe("6. Duration Formatting (French Compact)", () => {
    it("formats minutes into compact French time string", () => {
      expect(formatDuration(0)).toBe("0m");
      expect(formatDuration(1)).toBe("1m");
      expect(formatDuration(59)).toBe("59m");
      expect(formatDuration(60)).toBe("1h");
      expect(formatDuration(61)).toBe("1h01");
      expect(formatDuration(450)).toBe("7h30");
      expect(formatDuration(600)).toBe("10h");
      expect(formatDuration(720)).toBe("12h");
    });
  });

  describe("7. Input Immutability & Pure Behavior", () => {
    it("does not mutate input objects", () => {
      const input: ShiftTimeInput = Object.freeze({ startTime: "22:00", endTime: "07:00" });
      const result = calculateShiftDuration(input);
      expect(result.success).toBe(true);
      expect(input.startTime).toBe("22:00");
      expect(input.endTime).toBe("07:00");
    });
  });
});
