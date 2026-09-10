import { describe, it, expect, vi } from "vitest";
import { eq, and, gte, lte } from "drizzle-orm";
import pg from "pg";
import * as schema from "../app/db/schema";
import { createDbClient } from "../app/db/client";
import { seedDefaultShiftTypes, DEFAULT_SHIFT_TYPES } from "../app/db/schema/planning";

const mockHyperdrive: Hyperdrive = {
  connectionString: "postgresql://hyperdrive.cloudflare.net:5432/testdb",
  database: "testdb",
  host: "hyperdrive.cloudflare.net",
  password: "pass",
  port: 5432,
  user: "postgres",
  connect: () => ({} as any),
};

describe("Milestone 5A: Planning Infirmier Database Schema", () => {
  const db = createDbClient(mockHyperdrive);

  describe("1. Schema Exports & Required Fields", () => {
    it("exports all 4 product tables", () => {
      expect(schema.shiftTypes).toBeDefined();
      expect(schema.shifts).toBeDefined();
      expect(schema.recurringShifts).toBeDefined();
      expect(schema.salaryProfiles).toBeDefined();
    });

    it("has required column definitions on shift_types table", () => {
      const cols = schema.shiftTypes;
      expect(cols.id).toBeDefined();
      expect(cols.profileId).toBeDefined();
      expect(cols.name).toBeDefined();
      expect(cols.shortCode).toBeDefined();
      expect(cols.startTime).toBeDefined();
      expect(cols.endTime).toBeDefined();
      expect(cols.color).toBeDefined();
      expect(cols.isWork).toBeDefined();
      expect(cols.isActive).toBeDefined();
      expect(cols.createdAt).toBeDefined();
      expect(cols.updatedAt).toBeDefined();
    });

    it("has required column definitions on shifts table", () => {
      const cols = schema.shifts;
      expect(cols.id).toBeDefined();
      expect(cols.profileId).toBeDefined();
      expect(cols.shiftTypeId).toBeDefined();
      expect(cols.date).toBeDefined();
      expect(cols.startTime).toBeDefined();
      expect(cols.endTime).toBeDefined();
      expect(cols.notes).toBeDefined();
      expect(cols.createdAt).toBeDefined();
      expect(cols.updatedAt).toBeDefined();
    });

    it("has required column definitions on recurring_shifts table", () => {
      const cols = schema.recurringShifts;
      expect(cols.id).toBeDefined();
      expect(cols.profileId).toBeDefined();
      expect(cols.shiftTypeId).toBeDefined();
      expect(cols.name).toBeDefined();
      expect(cols.frequency).toBeDefined();
      expect(cols.interval).toBeDefined();
      expect(cols.daysOfWeek).toBeDefined();
      expect(cols.startDate).toBeDefined();
      expect(cols.endDate).toBeDefined();
      expect(cols.isActive).toBeDefined();
      expect(cols.createdAt).toBeDefined();
      expect(cols.updatedAt).toBeDefined();
    });

    it("has required column definitions on salary_profiles table", () => {
      const cols = schema.salaryProfiles;
      expect(cols.id).toBeDefined();
      expect(cols.profileId).toBeDefined();
      expect(cols.baseHourlyRate).toBeDefined();
      expect(cols.baseMonthlySalary).toBeDefined();
      expect(cols.contractedHoursPerWeek).toBeDefined();
      expect(cols.nightBonusRate).toBeDefined();
      expect(cols.sundayBonusRate).toBeDefined();
      expect(cols.holidayBonusRate).toBeDefined();
      expect(cols.overtimeBonusRate).toBeDefined();
      expect(cols.currency).toBeDefined();
      expect(cols.createdAt).toBeDefined();
      expect(cols.updatedAt).toBeDefined();
    });
  });

  describe("2. Query Compilation & SQL Verification", () => {
    const testProfileId = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
    const testShiftTypeId = "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";

    it("generates valid SQL for inserting a shift type", () => {
      const query = db
        .insert(schema.shiftTypes)
        .values({
          profileId: testProfileId,
          name: "Matin",
          shortCode: "M",
          startTime: "06:45",
          endTime: "14:15",
          color: "#3B82F6",
        })
        .toSQL();

      expect(query.sql).toContain('insert into "shift_types"');
      expect(query.sql).toContain('"name"');
      expect(query.params).toContain("Matin");
      expect(query.params).toContain(testProfileId);
    });

    it("generates valid SQL for inserting an overnight shift", () => {
      const query = db
        .insert(schema.shifts)
        .values({
          profileId: testProfileId,
          shiftTypeId: testShiftTypeId,
          date: "2026-10-15",
          startTime: "22:00",
          endTime: "07:00",
          notes: "Nuit aux urgences",
        })
        .toSQL();

      expect(query.sql).toContain('insert into "shifts"');
      expect(query.sql).toContain('"start_time"');
      expect(query.sql).toContain('"end_time"');
      expect(query.params).toContain("22:00");
      expect(query.params).toContain("07:00");
      expect(query.params).toContain("2026-10-15");
    });

    it("generates valid SQL for querying shifts by date range and ownership", () => {
      const query = db
        .select()
        .from(schema.shifts)
        .where(
          and(
            eq(schema.shifts.profileId, testProfileId),
            gte(schema.shifts.date, "2026-10-01"),
            lte(schema.shifts.date, "2026-10-31"),
          ),
        )
        .toSQL();

      expect(query.sql).toContain('from "shifts"');
      expect(query.sql).toContain('"profile_id" = $1');
      expect(query.sql).toContain('"date" >= $2');
      expect(query.sql).toContain('"date" <= $3');
      expect(query.params).toEqual([testProfileId, "2026-10-01", "2026-10-31"]);
    });

    it("generates valid SQL for recurring shift rules without shift row generation", () => {
      const query = db
        .insert(schema.recurringShifts)
        .values({
          profileId: testProfileId,
          shiftTypeId: testShiftTypeId,
          name: "Cycle 12h Garde",
          frequency: "weekly",
          interval: 2,
          daysOfWeek: [1, 3, 5],
          startDate: "2026-11-01",
          endDate: "2027-04-30",
          isActive: true,
        })
        .toSQL();

      expect(query.sql).toContain('insert into "recurring_shifts"');
      expect(query.sql).toContain('"frequency"');
      expect(query.sql).toContain('"days_of_week"');
      expect(query.params).toContain("Cycle 12h Garde");
    });

    it("generates valid SQL for salary profile insertion with bonus rates", () => {
      const query = db
        .insert(schema.salaryProfiles)
        .values({
          profileId: testProfileId,
          baseHourlyRate: "18.50",
          baseMonthlySalary: "2800.00",
          contractedHoursPerWeek: "35.00",
          nightBonusRate: "25.00",
          sundayBonusRate: "50.00",
          holidayBonusRate: "100.00",
          overtimeBonusRate: "25.00",
          currency: "EUR",
        })
        .toSQL();

      expect(query.sql).toContain('insert into "salary_profiles"');
      expect(query.sql).toContain('"base_hourly_rate"');
      expect(query.sql).toContain('"night_bonus_rate"');
      expect(query.params).toContain("18.50");
      expect(query.params).toContain("2800.00");
    });
  });

  describe("3. Default Shift Types & Idempotent Seeding", () => {
    it("defines 7 initial default shift types matching spec", () => {
      expect(DEFAULT_SHIFT_TYPES).toHaveLength(7);
      const names = DEFAULT_SHIFT_TYPES.map((t) => t.name);
      expect(names).toEqual([
        "Matin",
        "Après-midi",
        "Nuit",
        "12h",
        "Journée",
        "Repos",
        "Congé",
      ]);
    });

    it("seedDefaultShiftTypes executes idempotent queries per profile", async () => {
      const querySpy = vi.spyOn(pg.Client.prototype, "query").mockImplementation(async () => {
        return { rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] } as any;
      });

      try {
        await seedDefaultShiftTypes(db, "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
        expect(querySpy).toHaveBeenCalled();
      } finally {
        querySpy.mockRestore();
      }
    });
  });
});
