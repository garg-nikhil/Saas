import { describe, it, expect, vi } from "vitest";
import pg from "pg";
import {
  GdprService,
  createGdprService,
  type IGdprService,
} from "../app/services/gdpr";

const mockHyperdrive: Hyperdrive = {
  connectionString: "postgresql://hyperdrive.cloudflare.net:5432/testdb",
  database: "testdb",
  host: "hyperdrive.cloudflare.net",
  password: "pass",
  port: 5432,
  user: "postgres",
  connect: () => ({} as any),
};

describe("Milestone 4B — GDPR & Account Lifecycle Service", () => {
  it("rejects invalid or empty user ID on export and deletion", async () => {
    const service = createGdprService({
      hyperdrive: mockHyperdrive,
    });

    await expect(service.exportUserData("")).rejects.toThrow("Valid userId is required");
    await expect(service.deleteUserAccount("")).rejects.toThrow("Valid userId is required");
  });

  it("orchestrates deletion across stripe, database, storage, and auth provider", async () => {
    vi.spyOn(pg.Client.prototype, "connect").mockImplementation(async () => {});
    vi.spyOn(pg.Client.prototype, "end").mockImplementation(async () => {});
    vi.spyOn(pg.Client.prototype, "query").mockImplementation(async (sql: any) => {
      if (sql?.rowMode === "array") {
        return {
          rows: [["prof-123", "usr_test_123", "Test User", "test@example.com", new Date(), new Date()]],
          rowCount: 1,
        } as any;
      }
      return {
        rows: [{ id: "prof-123", userId: "usr_test_123", displayName: "Test User", email: "test@example.com" }],
        rowCount: 1,
      } as any;
    });

    const mockBilling = {
      getSubscription: vi.fn().mockResolvedValue({
        data: { id: "sub_123", status: "active", profileId: "prof-123", planId: "pro" },
        error: null,
      }),
      cancelSubscription: vi.fn().mockResolvedValue({
        data: { id: "sub_123", status: "canceled" },
        error: null,
      }),
      createCheckoutSession: vi.fn(),
      createCustomerPortalSession: vi.fn(),
      resumeSubscription: vi.fn(),
      handleWebhookEvent: vi.fn(),
    };

    const mockStorage = {
      getUserScopedPath: vi.fn().mockReturnValue("users/usr_test_123/"),
      deleteFolder: vi.fn().mockResolvedValue({ data: { deleted: ["users/usr_test_123/file.pdf"] }, error: null }),
      upload: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      list: vi.fn(),
      getSignedUrl: vi.fn(),
    };

    const mockAuthAdmin = {
      deleteUser: vi.fn().mockResolvedValue({ error: null }),
    };

    const service = new GdprService({
      hyperdrive: mockHyperdrive,
      billingService: mockBilling,
      storageService: mockStorage,
      authAdminClient: mockAuthAdmin,
    });

    const receipt = await service.deleteUserAccount("usr_test_123", {
      cancelStripeSubscriptions: true,
      deleteStorageFiles: true,
      deleteAuthAccount: true,
    });

    expect(receipt.userId).toBe("usr_test_123");
    expect(receipt.success).toBe(true);
    expect(mockBilling.getSubscription).toHaveBeenCalledWith("prof-123");
    expect(mockBilling.cancelSubscription).toHaveBeenCalledWith("prof-123");
    expect(mockStorage.getUserScopedPath).toHaveBeenCalledWith("usr_test_123", "");
    expect(mockStorage.deleteFolder).toHaveBeenCalledWith("user-assets", "users/usr_test_123");
    expect(mockAuthAdmin.deleteUser).toHaveBeenCalledWith("usr_test_123");
    expect(receipt.authDeleted).toBe(true);
  });

  it("reports success: false when partial failure occurs during account deletion", async () => {
    vi.spyOn(pg.Client.prototype, "connect").mockImplementation(async () => {});
    vi.spyOn(pg.Client.prototype, "end").mockImplementation(async () => {});
    vi.spyOn(pg.Client.prototype, "query").mockImplementation(async () => {
      return {
        rows: [{ id: "prof-123", userId: "usr_test_123", displayName: "Test User", email: "test@example.com" }],
        rowCount: 1,
      } as any;
    });

    const mockBilling = {
      getSubscription: vi.fn().mockResolvedValue({
        data: { id: "sub_123", status: "active", profileId: "prof-123", planId: "pro" },
        error: null,
      }),
      cancelSubscription: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Stripe API timeout" },
      }),
      createCheckoutSession: vi.fn(),
      createCustomerPortalSession: vi.fn(),
      resumeSubscription: vi.fn(),
      handleWebhookEvent: vi.fn(),
    };

    const mockStorage = {
      getUserScopedPath: vi.fn().mockReturnValue("users/usr_test_123/"),
      deleteFolder: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Storage permission denied", code: "DELETE_FAILED" },
      }),
      upload: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      list: vi.fn(),
      getSignedUrl: vi.fn(),
    };

    const mockAuthAdmin = {
      deleteUser: vi.fn().mockResolvedValue({ error: { message: "User not found" } }),
    };

    const service = new GdprService({
      hyperdrive: mockHyperdrive,
      billingService: mockBilling,
      storageService: mockStorage,
      authAdminClient: mockAuthAdmin,
    });

    const receipt = await service.deleteUserAccount("usr_test_123", {
      cancelStripeSubscriptions: true,
      deleteStorageFiles: true,
      deleteAuthAccount: true,
    });

    expect(receipt.userId).toBe("usr_test_123");
    expect(receipt.success).toBe(false);
    expect(receipt.warnings.length).toBeGreaterThan(0);
    expect(receipt.warnings.some((w) => w.includes("Stripe subscription cancellation failed"))).toBe(true);
    expect(receipt.warnings.some((w) => w.includes("Storage cleanup encountered error"))).toBe(true);
    expect(receipt.warnings.some((w) => w.includes("Auth account deletion warning"))).toBe(true);
  });
});
