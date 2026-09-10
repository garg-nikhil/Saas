import { describe, it, expect, vi, beforeEach } from "vitest";
import { loader as planningLoader, action as planningAction } from "../app/routes/app.planning";
import { validateRecurrenceRule, generateOccurrenceDates } from "../app/domain/planning/recurrence";
import * as dbClientModule from "../app/db/client";

const mockTrack = vi.fn().mockResolvedValue(undefined);

vi.mock("../app/services/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/services/analytics")>();
  return {
    ...actual,
    createAnalyticsService: vi.fn(() => ({
      track: mockTrack,
      identify: vi.fn().mockResolvedValue(undefined),
      page: vi.fn().mockResolvedValue(undefined),
      flush: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock("../app/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/auth")>();
  return {
    ...actual,
    requireAuth: vi.fn(async (_req, _env) => ({
      user: { id: "test-user-nurse-5f", email: "infirmiere.5f@hopital.fr" },
      session: null,
      headers: new Headers(),
    })),
    syncUserProfile: vi.fn(async (_hyperdrive, user) => ({
      id: "profile-nurse-5f",
      userId: user.id,
      displayName: "Infirmière Claire 5F",
      email: user.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  };
});

describe("Milestone 5F: Recurring Shifts Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Recurrence Engine Validation & Date Generation", () => {
    it("validates valid weekly recurrence rules", () => {
      const result = validateRecurrenceRule({
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [1, 3, 5],
      });
      expect(result.success).toBe(true);
    });

    it("rejects weekly recurrence rules without selected days of week", () => {
      const result = validateRecurrenceRule({
        startDate: "2026-10-01",
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("MISSING_WEEKDAYS");
      }
    });

    it("generates correct occurrence dates for weekly pattern", () => {
      const genRes = generateOccurrenceDates(
        {
          startDate: "2026-10-01", // Thursday
          endDate: "2026-10-15",
          frequency: "weekly",
          interval: 1,
          daysOfWeek: [1, 5], // Mon, Fri
        },
        {
          from: "2026-10-01",
          to: "2026-10-15",
        },
      );

      expect(genRes.success).toBe(true);
      if (genRes.success) {
        expect(genRes.occurrences).toContain("2026-10-02"); // Friday
        expect(genRes.occurrences).toContain("2026-10-05"); // Monday
        expect(genRes.occurrences).toContain("2026-10-09"); // Friday
        expect(genRes.occurrences).toContain("2026-10-12"); // Monday
      }
    });
  });

  describe("2. Planning Loader with Recurring Shifts", () => {
    it("loads recurring shift rules along with calendar shifts and types", async () => {
      const mockRule = {
        id: "rec-rule-1",
        shiftTypeId: "st-matin",
        name: "Garde du Matin",
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [1, 3, 5],
        startDate: "2026-10-01",
        endDate: "2026-12-31",
        isActive: true,
        startTime: "06:45",
        endTime: "14:15",
        notes: "Service Réanimation",
      };

      const withDbSpy = vi
        .spyOn(dbClientModule, "withDb")
        .mockImplementation(async (_input, callback) => {
          const createWhereRes = (arr: any[] = []) => {
            const p = Promise.resolve(arr);
            (p as any).orderBy = vi.fn().mockResolvedValue(arr);
            return p;
          };

          const mockDb = {
            select: vi.fn().mockImplementation(() => ({
              from: vi.fn().mockImplementation(() => ({
                where: vi.fn().mockImplementation(() => createWhereRes([mockRule])),
                leftJoin: vi.fn().mockImplementation(() => ({
                  where: vi.fn().mockImplementation(() => createWhereRes([])),
                })),
              })),
            })),
            insert: vi.fn().mockImplementation(() => ({
              values: vi.fn().mockResolvedValue([]),
            })),
          };
          return callback(mockDb as any);
        });

      const request = new Request("https://factory.local/app/planning?month=2026-10");
      const mockHyperdrive = { connectionString: "postgresql://localhost/test" };

      const data = await planningLoader({
        request,
        params: {},
        context: { env: { HYPERDRIVE: mockHyperdrive } },
      } as any);

      expect(data).toHaveProperty("recurringShiftsList");
      expect((data as any).recurringShiftsList).toHaveLength(1);
      expect((data as any).recurringShiftsList[0].id).toBe("rec-rule-1");

      withDbSpy.mockRestore();
    });
  });

  describe("3. Create Recurring Shift Action (create_recurring_shift)", () => {
    it("saves recurring rule and materializes individual shifts while skipping duplicates", async () => {
      const insertedShifts: any[] = [];
      const insertedRules: any[] = [];

      const withDbSpy = vi
        .spyOn(dbClientModule, "withDb")
        .mockImplementation(async (_input, callback) => {
          const mockDb = {
            select: vi.fn().mockImplementation((fields) => {
              // Check what field is selected to return correct mock
              return {
                from: vi.fn().mockImplementation(() => ({
                  where: vi.fn().mockImplementation(() => {
                    if (fields && fields.name) {
                      // Validating shiftTypeId
                      return {
                        limit: vi.fn().mockResolvedValue([
                          {
                            id: "st-matin",
                            name: "Garde du Matin",
                            startTime: "06:45",
                            endTime: "14:15",
                          },
                        ]),
                      };
                    } else {
                      // Querying existing shifts to prevent duplicates
                      return Promise.resolve([
                        { date: "2026-10-02" }, // Pre-existing shift on Oct 2
                      ]);
                    }
                  }),
                })),
              };
            }),
            insert: vi.fn().mockImplementation((table) => ({
              values: vi.fn().mockImplementation((val) => {
                if (Array.isArray(val)) {
                  insertedShifts.push(...val);
                } else {
                  insertedRules.push(val);
                }
                return {
                  returning: vi.fn().mockResolvedValue([{ id: "rule-uuid-999" }]),
                };
              }),
            })),
          };
          return callback(mockDb as any);
        });

      const formData = new FormData();
      formData.set("intent", "create_recurring_shift");
      formData.set("shiftTypeId", "st-matin");
      formData.set("frequency", "weekly");
      formData.set("interval", "1");
      formData.append("daysOfWeek", "1,5"); // Mon, Fri
      formData.set("startDate", "2026-10-01");
      formData.set("endDate", "2026-10-15");
      formData.set("startTime", "06:45");
      formData.set("endTime", "14:15");
      formData.set("notes", "Roulement d'automne");

      const request = new Request("https://factory.local/app/planning", {
        method: "POST",
        body: formData,
      });

      const mockHyperdrive = { connectionString: "postgresql://localhost/test" };

      const result = await planningAction({
        request,
        params: {},
        context: { env: { HYPERDRIVE: mockHyperdrive } },
      } as any);

      expect(result).toHaveProperty("success", true);
      expect((result as any).message).toContain("Roulement récurrent créé avec succès");

      // Verify rule was saved
      expect(insertedRules).toHaveLength(1);
      expect(insertedRules[0].profileId).toBe("profile-nurse-5f");
      expect(insertedRules[0].shiftTypeId).toBe("st-matin");

      // Verify materialized shifts exclude the duplicate date 2026-10-02
      expect(insertedShifts.length).toBeGreaterThan(0);
      const insertedDates = insertedShifts.map((s) => s.date);
      expect(insertedDates).not.toContain("2026-10-02");
      expect(insertedDates).toContain("2026-10-05");

      // Verify analytics event
      expect(mockTrack).toHaveBeenCalledWith({
        distinctId: "profile-nurse-5f",
        event: "recurring_shift_created",
        properties: {
          recurring_shift_id: "rule-uuid-999",
          shift_type_id: "st-matin",
          occurrences_count: insertedShifts.length,
        },
      });

      withDbSpy.mockRestore();
    });
  });

  describe("4. Delete Recurring Shift Action (delete_recurring_shift)", () => {
    it("deletes recurring shift rule owned by profile and emits analytics", async () => {
      let ruleDeleted = false;

      const withDbSpy = vi
        .spyOn(dbClientModule, "withDb")
        .mockImplementation(async (_input, callback) => {
          const mockDb = {
            select: vi.fn().mockImplementation(() => ({
              from: vi.fn().mockImplementation(() => ({
                where: vi.fn().mockImplementation(() => ({
                  limit: vi.fn().mockResolvedValue([{ id: "rule-uuid-999" }]),
                })),
              })),
            })),
            delete: vi.fn().mockImplementation(() => ({
              where: vi.fn().mockImplementation(() => {
                ruleDeleted = true;
                return Promise.resolve();
              }),
            })),
          };
          return callback(mockDb as any);
        });

      const formData = new FormData();
      formData.set("intent", "delete_recurring_shift");
      formData.set("recurringShiftId", "rule-uuid-999");

      const request = new Request("https://factory.local/app/planning", {
        method: "POST",
        body: formData,
      });

      const mockHyperdrive = { connectionString: "postgresql://localhost/test" };

      const result = await planningAction({
        request,
        params: {},
        context: { env: { HYPERDRIVE: mockHyperdrive } },
      } as any);

      expect(result).toHaveProperty("success", true);
      expect((result as any).message).toContain("Roulement récurrent supprimé");
      expect(ruleDeleted).toBe(true);

      expect(mockTrack).toHaveBeenCalledWith({
        distinctId: "profile-nurse-5f",
        event: "recurring_shift_deleted",
        properties: {
          recurring_shift_id: "rule-uuid-999",
        },
      });

      withDbSpy.mockRestore();
    });
  });
});
