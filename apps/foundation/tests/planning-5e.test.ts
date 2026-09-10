import { describe, it, expect, vi, beforeEach } from "vitest";
import { loader as planningLoader, action as planningAction } from "../app/routes/app.planning";
import { DEFAULT_SHIFT_TYPES } from "../app/db/schema/planning/shift-types";
import { calculateShiftDuration } from "../app/domain/planning/shifts";
import * as dbClientModule from "../app/db/client";
import type { Env } from "../app/context";

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
      user: { id: "test-user-nurse-123", email: "infirmiere@hopital.fr" },
      session: null,
      headers: new Headers(),
    })),
    syncUserProfile: vi.fn(async (_hyperdrive, user) => ({
      id: "profile-nurse-123",
      userId: user.id,
      displayName: "Infirmière Sophie",
      email: user.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  };
});

describe("Milestone 5E: Shift Management & Calendar Workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Shift Engine Invariants & Calculations", () => {
    it("uses domain engine to calculate shift duration in minutes and compact French format", () => {
      const resMatin = calculateShiftDuration({ startTime: "06:45", endTime: "14:15" });
      expect(resMatin.success).toBe(true);
      if (resMatin.success) {
        expect(resMatin.durationMinutes).toBe(450);
        expect(resMatin.formatted).toBe("7h30");
        expect(resMatin.isOvernight).toBe(false);
      }

      const resNuit = calculateShiftDuration({ startTime: "21:00", endTime: "07:00" });
      expect(resNuit.success).toBe(true);
      if (resNuit.success) {
        expect(resNuit.durationMinutes).toBe(600);
        expect(resNuit.formatted).toBe("10h");
        expect(resNuit.isOvernight).toBe(true);
      }

      const res12h = calculateShiftDuration({ startTime: "07:00", endTime: "19:00" });
      expect(res12h.success).toBe(true);
      if (res12h.success) {
        expect(res12h.durationMinutes).toBe(720);
        expect(res12h.formatted).toBe("12h");
      }
    });

    it("rejects equal start and end times to prevent zero-duration shifts", () => {
      const resEqual = calculateShiftDuration({ startTime: "08:00", endTime: "08:00" });
      expect(resEqual.success).toBe(false);
      if (!resEqual.success) {
        expect(resEqual.error.code).toBe("INVALID_SHIFT_DURATION");
      }
    });

    it("rejects malformed HH:mm time inputs", () => {
      const resBad = calculateShiftDuration({ startTime: "25:00", endTime: "08:00" });
      expect(resBad.success).toBe(false);
      if (!resBad.success) {
        expect(resBad.error.code).toBe("INVALID_TIME_FORMAT");
      }
    });
  });

  describe("2. Planning Loader & Calendar State", () => {
    it("loads shifts and shift types for authenticated nurse and tracks calendar_viewed analytics", async () => {
      const mockDbShifts = [
        {
          id: "shift-1",
          profileId: "profile-nurse-123",
          shiftTypeId: "st-matin",
          date: "2026-09-10",
          startTime: "06:45",
          endTime: "14:15",
          notes: "Garde du matin",
          createdAt: new Date(),
          updatedAt: new Date(),
          shiftTypeName: "Matin",
          shiftTypeShortCode: "M",
          shiftTypeColor: "#3B82F6",
          shiftTypeIsWork: true,
        },
      ];

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
                where: vi.fn().mockImplementation(() => createWhereRes([])),
                leftJoin: vi.fn().mockImplementation(() => ({
                  where: vi.fn().mockImplementation(() => createWhereRes(mockDbShifts)),
                })),
              })),
            })),
            insert: vi.fn().mockImplementation(() => ({
              values: vi.fn().mockResolvedValue([]),
            })),
          };
          return callback(mockDb as any);
        });

      const request = new Request("https://factory.local/app/planning?month=2026-09");
      const mockHyperdrive = { connectionString: "postgresql://localhost/test" };

      const result = await planningLoader({
        request,
        params: {},
        context: {
          env: { HYPERDRIVE: mockHyperdrive },
        },
      } as any);

      expect(result.currentMonth).toBe("2026-09");
      expect(result.shiftsList).toHaveLength(1);
      expect(result.shiftsList[0].id).toBe("shift-1");
      expect(result.shiftsList[0].shiftType?.name).toBe("Matin");

      expect(mockTrack).toHaveBeenCalledWith({
        distinctId: "profile-nurse-123",
        event: "calendar_viewed",
        properties: { month: "2026-09" },
      });

      withDbSpy.mockRestore();
    });
  });

  describe("3. Shift Creation Action (create_shift)", () => {
    it("creates a new shift for the authenticated profile and emits shift_created analytics", async () => {
      const withDbSpy = vi
        .spyOn(dbClientModule, "withDb")
        .mockImplementation(async (_input, callback) => {
          const mockDb = {
            select: vi.fn().mockImplementation(() => ({
              from: vi.fn().mockImplementation(() => ({
                where: vi.fn().mockImplementation(() => ({
                  limit: vi.fn().mockResolvedValue([{ id: "st-matin" }]),
                })),
              })),
            })),
            insert: vi.fn().mockImplementation(() => ({
              values: vi.fn().mockImplementation(() => ({
                returning: vi.fn().mockResolvedValue([{ id: "new-shift-888" }]),
              })),
            })),
          };
          return callback(mockDb as any);
        });

      const formData = new FormData();
      formData.set("intent", "create_shift");
      formData.set("date", "2026-09-15");
      formData.set("shiftTypeId", "st-matin");
      formData.set("startTime", "06:45");
      formData.set("endTime", "14:15");
      formData.set("notes", "Urgences pédiatriques");

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

      expect(result).toEqual({ success: true, message: "Garde ajoutée avec succès." });

      expect(mockTrack).toHaveBeenCalledWith({
        distinctId: "profile-nurse-123",
        event: "shift_created",
        properties: {
          shift_id: "new-shift-888",
          shift_type_id: "st-matin",
        },
      });

      withDbSpy.mockRestore();
    });

    it("rejects shift creation with invalid equal start/end times", async () => {
      const formData = new FormData();
      formData.set("intent", "create_shift");
      formData.set("date", "2026-09-15");
      formData.set("shiftTypeId", "st-matin");
      formData.set("startTime", "08:00");
      formData.set("endTime", "08:00");

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

      expect(result).toHaveProperty("error");
      expect((result as any).error).toContain("Equal start and end times");
    });
  });

  describe("4. Shift Update Action (update_shift)", () => {
    it("updates an existing shift owned by profile and emits shift_updated analytics", async () => {
      const withDbSpy = vi
        .spyOn(dbClientModule, "withDb")
        .mockImplementation(async (_input, callback) => {
          const mockDb = {
            select: vi.fn().mockImplementation(() => ({
              from: vi.fn().mockImplementation(() => ({
                where: vi.fn().mockImplementation(() => ({
                  limit: vi.fn().mockResolvedValue([{ id: "shift-to-update" }]),
                })),
              })),
            })),
            update: vi.fn().mockImplementation(() => ({
              set: vi.fn().mockImplementation(() => ({
                where: vi.fn().mockResolvedValue([]),
              })),
            })),
          };
          return callback(mockDb as any);
        });

      const formData = new FormData();
      formData.set("intent", "update_shift");
      formData.set("shiftId", "shift-to-update");
      formData.set("date", "2026-09-20");
      formData.set("shiftTypeId", "st-nuit");
      formData.set("startTime", "21:00");
      formData.set("endTime", "07:00");

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

      expect(result).toEqual({ success: true, message: "Garde mise à jour avec succès." });

      expect(mockTrack).toHaveBeenCalledWith({
        distinctId: "profile-nurse-123",
        event: "shift_updated",
        properties: {
          shift_id: "shift-to-update",
          shift_type_id: "st-nuit",
        },
      });

      withDbSpy.mockRestore();
    });

    it("rejects update if shift does not belong to the authenticated user", async () => {
      const withDbSpy = vi
        .spyOn(dbClientModule, "withDb")
        .mockImplementation(async (_input, callback) => {
          const mockDb = {
            select: vi.fn().mockImplementation(() => ({
              from: vi.fn().mockImplementation(() => ({
                where: vi.fn().mockImplementation(() => ({
                  limit: vi.fn().mockResolvedValue([]),
                })),
              })),
            })),
          };
          return callback(mockDb as any);
        });

      const formData = new FormData();
      formData.set("intent", "update_shift");
      formData.set("shiftId", "shift-other-user");
      formData.set("date", "2026-09-20");
      formData.set("shiftTypeId", "st-nuit");

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

      expect(result).toEqual({ error: "Garde non trouvée ou accès refusé." });

      withDbSpy.mockRestore();
    });
  });

  describe("5. Shift Deletion Action (delete_shift)", () => {
    it("deletes an existing shift owned by profile and emits shift_deleted analytics", async () => {
      const withDbSpy = vi
        .spyOn(dbClientModule, "withDb")
        .mockImplementation(async (_input, callback) => {
          const mockDb = {
            select: vi.fn().mockImplementation(() => ({
              from: vi.fn().mockImplementation(() => ({
                where: vi.fn().mockImplementation(() => ({
                  limit: vi.fn().mockResolvedValue([{ id: "shift-to-delete" }]),
                })),
              })),
            })),
            delete: vi.fn().mockImplementation(() => ({
              where: vi.fn().mockResolvedValue([]),
            })),
          };
          return callback(mockDb as any);
        });

      const formData = new FormData();
      formData.set("intent", "delete_shift");
      formData.set("shiftId", "shift-to-delete");

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

      expect(result).toEqual({ success: true, message: "Garde supprimée avec succès." });

      expect(mockTrack).toHaveBeenCalledWith({
        distinctId: "profile-nurse-123",
        event: "shift_deleted",
        properties: {
          shift_id: "shift-to-delete",
        },
      });

      withDbSpy.mockRestore();
    });
  });
});
