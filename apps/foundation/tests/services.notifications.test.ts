import { describe, it, expect, vi } from "vitest";
import pg from "pg";
import {
  NotificationService,
  NotificationStateError,
  isValidTransition,
  type NotificationStatus,
} from "../app/services/notifications";

const mockHyperdrive: Hyperdrive = {
  connectionString: "postgresql://hyperdrive.cloudflare.net:5432/testdb",
  database: "testdb",
  host: "hyperdrive.cloudflare.net",
  password: "pass",
  port: 5432,
  user: "postgres",
  connect: () => ({} as any),
};

describe("Milestone 4B — Notification Service & State Lifecycle", () => {
  describe("1. State Transition Matrix Rules", () => {
    it("allows valid forward transitions", () => {
      expect(isValidTransition("pending", "processing")).toBe(true);
      expect(isValidTransition("scheduled", "processing")).toBe(true);
      expect(isValidTransition("processing", "sent")).toBe(true);
      expect(isValidTransition("processing", "failed")).toBe(true);
      expect(isValidTransition("failed", "processing")).toBe(true);
      expect(isValidTransition("pending", "cancelled")).toBe(true);
      expect(isValidTransition("scheduled", "cancelled")).toBe(true);
      expect(isValidTransition("failed", "cancelled")).toBe(true);
    });

    it("prevents transitions from terminal states", () => {
      expect(isValidTransition("sent", "processing")).toBe(false);
      expect(isValidTransition("sent", "cancelled")).toBe(false);
      expect(isValidTransition("sent", "failed")).toBe(false);
      expect(isValidTransition("cancelled", "processing")).toBe(false);
      expect(isValidTransition("cancelled", "sent")).toBe(false);
    });

    it("allows idempotent transitions to the same state", () => {
      expect(isValidTransition("sent", "sent")).toBe(true);
      expect(isValidTransition("pending", "pending")).toBe(true);
    });
  });

  describe("2. Notification Service State Machine Enforcement", () => {
    it("throws NotificationStateError when transitioning a sent notification", async () => {
      vi.spyOn(pg.Client.prototype, "connect").mockImplementation(async () => {});
      vi.spyOn(pg.Client.prototype, "end").mockImplementation(async () => {});
      vi.spyOn(pg.Client.prototype, "query").mockImplementation(async (sql: any) => {
        const text = typeof sql === "string" ? sql : sql?.text || "";
        if (text.toLowerCase().includes("update")) {
          return { rows: [], rowCount: 0 } as any;
        }
        if (sql?.rowMode === "array") {
          return {
            rows: [["notif-123", "prof-1", "welcome_email", "sent", null, new Date(), {}, new Date(), new Date()]],
            rowCount: 1,
          } as any;
        }
        return {
          rows: [
            {
              id: "notif-123",
              profileId: "prof-1",
              type: "welcome_email",
              status: "sent",
              scheduledAt: null,
              sentAt: new Date(),
              metadata: {},
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          rowCount: 1,
        } as any;
      });

      const service = new NotificationService(mockHyperdrive);

      vi.spyOn(service, "getNotification").mockResolvedValue({
        id: "notif-123",
        profileId: "prof-1",
        type: "welcome_email",
        status: "sent",
        scheduledAt: null,
        sentAt: new Date(),
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.markProcessing("notif-123")).rejects.toThrow(NotificationStateError);
      await expect(service.cancelNotification("notif-123")).rejects.toThrow(NotificationStateError);
      await expect(service.markSent("notif-123")).rejects.toThrow(NotificationStateError);
      await expect(service.markFailed("notif-123", "Some error")).rejects.toThrow(NotificationStateError);
    });

    it("throws error if required creation parameters are missing", async () => {
      const service = new NotificationService(mockHyperdrive);

      await expect(
        service.createNotification({ profileId: "", type: "alert" }),
      ).rejects.toThrow("profileId is required");

      await expect(
        service.createNotification({ profileId: "prof-1", type: "" }),
      ).rejects.toThrow("type is required");
    });
  });
});
