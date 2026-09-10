import { describe, it, expect, vi } from "vitest";
import pg from "pg";
import {
  EntitlementService,
  createEntitlementService,
  verifyUserEntitlement,
  type IEntitlementService,
  type EntitlementRecord,
} from "../app/services/entitlements";

const mockHyperdrive: Hyperdrive = {
  connectionString: "postgresql://hyperdrive.cloudflare.net:5432/testdb",
  database: "testdb",
  host: "hyperdrive.cloudflare.net",
  password: "pass",
  port: 5432,
  user: "postgres",
  connect: () => ({} as any),
};

describe("Milestone 4A — EntitlementService", () => {
  describe("1. Contract and Interface Verification", () => {
    it("exports EntitlementService and factory helpers", () => {
      expect(EntitlementService).toBeDefined();
      expect(typeof createEntitlementService).toBe("function");
      expect(typeof verifyUserEntitlement).toBe("function");
    });

    it("creates an instance implementing IEntitlementService", () => {
      const service = createEntitlementService(mockHyperdrive);
      expect(typeof service.hasEntitlement).toBe("function");
      expect(typeof service.getEntitlements).toBe("function");
      expect(typeof service.grantEntitlement).toBe("function");
      expect(typeof service.revokeEntitlement).toBe("function");
      expect(typeof service.setPlanEntitlements).toBe("function");
    });
  });

  describe("2. Entitlement Evaluation & Unknown Feature Behavior", () => {
    it("returns false for unknown feature key or missing profile", async () => {
      const service = createEntitlementService(mockHyperdrive);
      // Empty inputs default to false safely without throwing
      expect(await service.hasEntitlement("", "feature_x")).toBe(false);
      expect(await service.hasEntitlement("prof-1", "")).toBe(false);
    });

    it("hasEntitlement evaluates database rows correctly", async () => {
      const connectSpy = vi.spyOn(pg.Client.prototype, "connect").mockImplementation(async () => {});
      const endSpy = vi.spyOn(pg.Client.prototype, "end").mockImplementation(async () => {});
      const querySpy = vi.spyOn(pg.Client.prototype, "query").mockImplementation(async (sql: any) => {
        if (sql?.rowMode === "array") {
          return {
            rows: [["ent-1", "prof-123", "export_pdf", true, {}, new Date(), new Date()]],
            rowCount: 1,
          } as any;
        }
        return {
          rows: [
            {
              id: "ent-1",
              profile_id: "prof-123",
              feature_key: "export_pdf",
              enabled: true,
              metadata: {},
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
          rowCount: 1,
        } as any;
      });

      try {
        const service = new EntitlementService(mockHyperdrive);
        const result = await service.hasEntitlement("prof-123", "export_pdf");
        expect(result).toBe(true);
      } finally {
        connectSpy.mockRestore();
        endSpy.mockRestore();
        querySpy.mockRestore();
      }
    });

    it("returns false if entitlement is disabled in the database", async () => {
      const connectSpy = vi.spyOn(pg.Client.prototype, "connect").mockImplementation(async () => {});
      const endSpy = vi.spyOn(pg.Client.prototype, "end").mockImplementation(async () => {});
      const querySpy = vi.spyOn(pg.Client.prototype, "query").mockImplementation(async () => {
        return {
          rows: [
            {
              id: "ent-1",
              profile_id: "prof-123",
              feature_key: "export_pdf",
              enabled: false,
              metadata: {},
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
          rowCount: 1,
        } as any;
      });

      try {
        const service = new EntitlementService(mockHyperdrive);
        const result = await service.hasEntitlement("prof-123", "export_pdf");
        expect(result).toBe(false);
      } finally {
        connectSpy.mockRestore();
        endSpy.mockRestore();
        querySpy.mockRestore();
      }
    });

    it("returns false if no row exists in the database", async () => {
      const connectSpy = vi.spyOn(pg.Client.prototype, "connect").mockImplementation(async () => {});
      const endSpy = vi.spyOn(pg.Client.prototype, "end").mockImplementation(async () => {});
      const querySpy = vi.spyOn(pg.Client.prototype, "query").mockImplementation(async () => {
        return {
          rows: [],
          rowCount: 0,
        } as any;
      });

      try {
        const service = new EntitlementService(mockHyperdrive);
        const result = await service.hasEntitlement("prof-123", "non_existent");
        expect(result).toBe(false);
      } finally {
        connectSpy.mockRestore();
        endSpy.mockRestore();
        querySpy.mockRestore();
      }
    });
  });

  describe("3. Grant and Revoke Operations", () => {
    it("grantEntitlement executes an upsert query", async () => {
      const connectSpy = vi.spyOn(pg.Client.prototype, "connect").mockImplementation(async () => {});
      const endSpy = vi.spyOn(pg.Client.prototype, "end").mockImplementation(async () => {});
      let capturedSql = "";
      const querySpy = vi.spyOn(pg.Client.prototype, "query").mockImplementation(async (sql: any) => {
        capturedSql = typeof sql === "string" ? sql : sql.text;
        if (sql?.rowMode === "array") {
          return {
            rows: [["ent-1", "prof-123", "advanced_planning", true, { limit: 10 }, new Date(), new Date()]],
            rowCount: 1,
          } as any;
        }
        return {
          rows: [
            {
              id: "ent-1",
              profile_id: "prof-123",
              feature_key: "advanced_planning",
              enabled: true,
              metadata: { limit: 10 },
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
          rowCount: 1,
        } as any;
      });

      try {
        const service = new EntitlementService(mockHyperdrive);
        const record = await service.grantEntitlement("prof-123", "advanced_planning", { limit: 10 });
        expect(record).toBeDefined();
        expect(record.featureKey).toBe("advanced_planning");
        expect(record.enabled).toBe(true);
        expect(capturedSql.toLowerCase()).toContain("insert into");
      } finally {
        connectSpy.mockRestore();
        endSpy.mockRestore();
        querySpy.mockRestore();
      }
    });

    it("revokeEntitlement executes an update query setting enabled = false", async () => {
      const connectSpy = vi.spyOn(pg.Client.prototype, "connect").mockImplementation(async () => {});
      const endSpy = vi.spyOn(pg.Client.prototype, "end").mockImplementation(async () => {});
      let capturedSql = "";
      const querySpy = vi.spyOn(pg.Client.prototype, "query").mockImplementation(async (sql: any) => {
        capturedSql = typeof sql === "string" ? sql : sql.text;
        return {
          rows: [],
          rowCount: 1,
        } as any;
      });

      try {
        const service = new EntitlementService(mockHyperdrive);
        await service.revokeEntitlement("prof-123", "advanced_planning");
        expect(capturedSql.toLowerCase()).toContain("update");
      } finally {
        connectSpy.mockRestore();
        endSpy.mockRestore();
        querySpy.mockRestore();
      }
    });
  });

  describe("4. Ownership and Identity Derivation", () => {
    it("verifyUserEntitlement derives profile from verified auth user ID", async () => {
      const mockCustomService: IEntitlementService = {
        hasEntitlement: vi.fn().mockResolvedValue(true),
        getEntitlements: vi.fn().mockResolvedValue([]),
        grantEntitlement: vi.fn(),
        revokeEntitlement: vi.fn(),
        setPlanEntitlements: vi.fn(),
      };

      const connectSpy = vi.spyOn(pg.Client.prototype, "connect").mockImplementation(async () => {});
      const endSpy = vi.spyOn(pg.Client.prototype, "end").mockImplementation(async () => {});
      const querySpy = vi.spyOn(pg.Client.prototype, "query").mockImplementation(async (sql: any) => {
        if (sql?.rowMode === "array") {
          return {
            rows: [["resolved-profile-id-789", "auth-user-123", "Test User", "test@example.fr", new Date(), new Date()]],
            rowCount: 1,
          } as any;
        }
        return {
          rows: [
            {
              id: "resolved-profile-id-789",
              user_id: "auth-user-123",
              email: "test@example.fr",
              display_name: "Test User",
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
          rowCount: 1,
        } as any;
      });

      try {
        const allowed = await verifyUserEntitlement(
          mockHyperdrive,
          "auth-user-123",
          "advanced_planning",
          mockCustomService,
        );

        expect(allowed).toBe(true);
        expect(mockCustomService.hasEntitlement).toHaveBeenCalledWith(
          "resolved-profile-id-789",
          "advanced_planning",
        );
      } finally {
        connectSpy.mockRestore();
        endSpy.mockRestore();
        querySpy.mockRestore();
      }
    });

    it("verifyUserEntitlement returns false when profile does not exist", async () => {
      const connectSpy = vi.spyOn(pg.Client.prototype, "connect").mockImplementation(async () => {});
      const endSpy = vi.spyOn(pg.Client.prototype, "end").mockImplementation(async () => {});
      const querySpy = vi.spyOn(pg.Client.prototype, "query").mockImplementation(async () => {
        return { rows: [], rowCount: 0 } as any;
      });

      try {
        const allowed = await verifyUserEntitlement(
          mockHyperdrive,
          "unknown-user-id",
          "advanced_planning",
        );
        expect(allowed).toBe(false);
      } finally {
        connectSpy.mockRestore();
        endSpy.mockRestore();
        querySpy.mockRestore();
      }
    });
  });
});
