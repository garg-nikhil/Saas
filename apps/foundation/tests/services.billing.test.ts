import { describe, it, expect, vi } from "vitest";
import pg from "pg";
import {
  BillingService,
  StripeBillingAdapter,
  createBillingService,
  resolvePlan,
  FACTORY_PLANS,
  type IBillingAdapter,
} from "../app/services/billing";
import type { IEntitlementService } from "../app/services/entitlements";
import type { Env } from "../app/context";

const mockHyperdrive: Hyperdrive = {
  connectionString: "postgresql://hyperdrive.cloudflare.net:5432/testdb",
  database: "testdb",
  host: "hyperdrive.cloudflare.net",
  password: "pass",
  port: 5432,
  user: "postgres",
  connect: () => ({} as any),
};

const mockEnv: Env = {
  STRIPE_SECRET_KEY: "sk_test_mock_key",
  STRIPE_WEBHOOK_SECRET: "whsec_mock_secret",
};

describe("Milestone 4A — Billing Service & Stripe Adapter", () => {
  describe("1. Plan Resolution and Price Security", () => {
    it("resolves valid plans from server catalog", () => {
      const proPlan = resolvePlan("pro_monthly");
      expect(proPlan).toBeDefined();
      expect(proPlan?.id).toBe("pro_monthly");
      expect(proPlan?.features).toContain("advanced_planning");
    });

    it("rejects unknown plan IDs", () => {
      expect(resolvePlan("unknown_enterprise_plan")).toBeNull();
      expect(resolvePlan("")).toBeNull();
      expect(resolvePlan(null as any)).toBeNull();
    });

    it("plans catalog does not allow arbitrary price injection", () => {
      // The server plan mapping is authoritative
      const freePlan = resolvePlan("free");
      expect(freePlan?.stripePriceId).toBeUndefined();
    });
  });

  describe("2. Checkout Session Creation", () => {
    it("rejects non-billable or invalid plan requests", async () => {
      const mockAdapter: IBillingAdapter = {
        createCheckoutSession: vi.fn(),
        createCustomerPortalSession: vi.fn(),
        resolveCustomerId: vi.fn(),
        cancelSubscription: vi.fn(),
        resumeSubscription: vi.fn(),
        constructWebhookEvent: vi.fn(),
      };
      const mockEntitlementService: IEntitlementService = {
        hasEntitlement: vi.fn(),
        getEntitlements: vi.fn(),
        grantEntitlement: vi.fn(),
        revokeEntitlement: vi.fn(),
        setPlanEntitlements: vi.fn(),
      };

      const service = new BillingService(
        mockHyperdrive,
        mockEnv,
        mockAdapter,
        mockEntitlementService,
      );

      const result = await service.createCheckoutSession({
        profileId: "prof-1",
        userEmail: "test@example.com",
        planId: "free", // Not a billable checkout plan
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      });

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe("INVALID_PLAN");
      expect(mockAdapter.createCheckoutSession).not.toHaveBeenCalled();
    });

    it("initiates checkout session via adapter when plan is valid", async () => {
      const mockAdapter: IBillingAdapter = {
        createCheckoutSession: vi.fn().mockResolvedValue({
          data: {
            sessionId: "cs_test_123",
            url: "https://checkout.stripe.com/pay/cs_test_123",
          },
          error: null,
        }),
        createCustomerPortalSession: vi.fn(),
        resolveCustomerId: vi.fn().mockResolvedValue(null),
        cancelSubscription: vi.fn(),
        resumeSubscription: vi.fn(),
        constructWebhookEvent: vi.fn(),
      };
      const mockEntitlementService: IEntitlementService = {
        hasEntitlement: vi.fn(),
        getEntitlements: vi.fn(),
        grantEntitlement: vi.fn(),
        revokeEntitlement: vi.fn(),
        setPlanEntitlements: vi.fn(),
      };

      const service = new BillingService(
        mockHyperdrive,
        mockEnv,
        mockAdapter,
        mockEntitlementService,
      );

      const result = await service.createCheckoutSession({
        profileId: "prof-1",
        userEmail: "test@example.com",
        planId: "pro_monthly",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      });

      expect(result.data?.sessionId).toBe("cs_test_123");
      expect(result.data?.url).toContain("checkout.stripe.com");
      expect(mockAdapter.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: "prof-1",
          planId: "pro_monthly",
        }),
        expect.any(String),
        undefined,
      );
    });

    it("passes existing customerId if customer is already known in Stripe", async () => {
      const mockAdapter: IBillingAdapter = {
        createCheckoutSession: vi.fn().mockResolvedValue({
          data: {
            sessionId: "cs_test_456",
            url: "https://checkout.stripe.com/pay/cs_test_456",
          },
          error: null,
        }),
        createCustomerPortalSession: vi.fn(),
        resolveCustomerId: vi.fn().mockResolvedValue("cus_existing_999"),
        cancelSubscription: vi.fn(),
        resumeSubscription: vi.fn(),
        constructWebhookEvent: vi.fn(),
      };
      const mockEntitlementService: IEntitlementService = {
        hasEntitlement: vi.fn(),
        getEntitlements: vi.fn(),
        grantEntitlement: vi.fn(),
        revokeEntitlement: vi.fn(),
        setPlanEntitlements: vi.fn(),
      };

      const service = new BillingService(
        mockHyperdrive,
        mockEnv,
        mockAdapter,
        mockEntitlementService,
      );

      await service.createCheckoutSession({
        profileId: "prof-1",
        userEmail: "test@example.com",
        planId: "pro_monthly",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      });

      expect(mockAdapter.createCheckoutSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        "cus_existing_999",
      );
    });
  });

  describe("3. Customer Portal Session", () => {
    it("rejects portal session creation when no Stripe customer exists", async () => {
      const mockAdapter: IBillingAdapter = {
        createCheckoutSession: vi.fn(),
        createCustomerPortalSession: vi.fn(),
        resolveCustomerId: vi.fn().mockResolvedValue(null),
        cancelSubscription: vi.fn(),
        resumeSubscription: vi.fn(),
        constructWebhookEvent: vi.fn(),
      };
      const mockEntitlementService: IEntitlementService = {
        hasEntitlement: vi.fn(),
        getEntitlements: vi.fn(),
        grantEntitlement: vi.fn(),
        revokeEntitlement: vi.fn(),
        setPlanEntitlements: vi.fn(),
      };

      const service = new BillingService(
        mockHyperdrive,
        mockEnv,
        mockAdapter,
        mockEntitlementService,
      );

      const result = await service.createCustomerPortalSession({
        profileId: "prof-1",
        userEmail: "test@example.com",
        returnUrl: "https://example.com/app",
      });

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe("CUSTOMER_NOT_FOUND");
    });

    it("creates portal session when customer exists", async () => {
      const mockAdapter: IBillingAdapter = {
        createCheckoutSession: vi.fn(),
        createCustomerPortalSession: vi.fn().mockResolvedValue({
          data: { url: "https://billing.stripe.com/p/session/xyz" },
          error: null,
        }),
        resolveCustomerId: vi.fn().mockResolvedValue("cus_valid_123"),
        cancelSubscription: vi.fn(),
        resumeSubscription: vi.fn(),
        constructWebhookEvent: vi.fn(),
      };
      const mockEntitlementService: IEntitlementService = {
        hasEntitlement: vi.fn(),
        getEntitlements: vi.fn(),
        grantEntitlement: vi.fn(),
        revokeEntitlement: vi.fn(),
        setPlanEntitlements: vi.fn(),
      };

      const service = new BillingService(
        mockHyperdrive,
        mockEnv,
        mockAdapter,
        mockEntitlementService,
      );

      const result = await service.createCustomerPortalSession({
        profileId: "prof-1",
        userEmail: "test@example.com",
        returnUrl: "https://example.com/app",
      });

      expect(result.data?.url).toContain("billing.stripe.com");
      expect(mockAdapter.createCustomerPortalSession).toHaveBeenCalledWith(
        expect.anything(),
        "cus_valid_123",
      );
    });
  });

  describe("4. Webhook Signature Verification and Idempotency", () => {
    it("rejects webhook if signing secret is unconfigured", async () => {
      const mockAdapter: IBillingAdapter = {
        createCheckoutSession: vi.fn(),
        createCustomerPortalSession: vi.fn(),
        resolveCustomerId: vi.fn(),
        cancelSubscription: vi.fn(),
        resumeSubscription: vi.fn(),
        constructWebhookEvent: vi.fn(),
      };
      const mockEntitlementService: IEntitlementService = {
        hasEntitlement: vi.fn(),
        getEntitlements: vi.fn(),
        grantEntitlement: vi.fn(),
        revokeEntitlement: vi.fn(),
        setPlanEntitlements: vi.fn(),
      };

      const service = new BillingService(
        mockHyperdrive,
        {}, // No STRIPE_WEBHOOK_SECRET
        mockAdapter,
        mockEntitlementService,
      );

      const result = await service.handleWebhookEvent("{}", "sig_header");
      expect(result.received).toBe(false);
      expect(result.error).toContain("not configured");
    });

    it("rejects webhook when signature verification fails", async () => {
      const mockAdapter: IBillingAdapter = {
        createCheckoutSession: vi.fn(),
        createCustomerPortalSession: vi.fn(),
        resolveCustomerId: vi.fn(),
        cancelSubscription: vi.fn(),
        resumeSubscription: vi.fn(),
        constructWebhookEvent: vi.fn().mockResolvedValue({
          event: null,
          error: new Error("Signature verification failed"),
        }),
      };
      const mockEntitlementService: IEntitlementService = {
        hasEntitlement: vi.fn(),
        getEntitlements: vi.fn(),
        grantEntitlement: vi.fn(),
        revokeEntitlement: vi.fn(),
        setPlanEntitlements: vi.fn(),
      };

      const service = new BillingService(
        mockHyperdrive,
        mockEnv,
        mockAdapter,
        mockEntitlementService,
      );

      const result = await service.handleWebhookEvent("{}", "invalid_sig");
      expect(result.received).toBe(false);
      expect(result.error).toContain("Invalid webhook signature");
    });

    it("detects duplicate webhook events and returns idempotent response without reprocessing", async () => {
      const mockAdapter: IBillingAdapter = {
        createCheckoutSession: vi.fn(),
        createCustomerPortalSession: vi.fn(),
        resolveCustomerId: vi.fn(),
        cancelSubscription: vi.fn(),
        resumeSubscription: vi.fn(),
        constructWebhookEvent: vi.fn().mockResolvedValue({
          event: {
            id: "evt_already_processed_123",
            type: "checkout.session.completed",
            data: { object: {} },
          },
          error: null,
        }),
      };
      const mockEntitlementService: IEntitlementService = {
        hasEntitlement: vi.fn(),
        getEntitlements: vi.fn(),
        grantEntitlement: vi.fn(),
        revokeEntitlement: vi.fn(),
        setPlanEntitlements: vi.fn(),
      };

      const connectSpy = vi.spyOn(pg.Client.prototype, "connect").mockImplementation(async () => {});
      const endSpy = vi.spyOn(pg.Client.prototype, "end").mockImplementation(async () => {});
      // Mock finding an existing audit_log entry for evt_already_processed_123
      const querySpy = vi.spyOn(pg.Client.prototype, "query").mockImplementation(async () => {
        return {
          rows: [
            {
              id: "audit-1",
              action: "stripe_event_processed",
              entity_type: "stripe_event",
              entity_id: "evt_already_processed_123",
              created_at: new Date(),
            },
          ],
          rowCount: 1,
        } as any;
      });

      try {
        const service = new BillingService(
          mockHyperdrive,
          mockEnv,
          mockAdapter,
          mockEntitlementService,
        );

        const result = await service.handleWebhookEvent("{}", "valid_sig");
        expect(result.received).toBe(true);
        expect(result.duplicate).toBe(true);
        expect(result.eventType).toBe("checkout.session.completed");
        expect(mockEntitlementService.setPlanEntitlements).not.toHaveBeenCalled();
      } finally {
        connectSpy.mockRestore();
        endSpy.mockRestore();
        querySpy.mockRestore();
      }
    });

    it("processes checkout.session.completed and synchronizes plan entitlements", async () => {
      const mockAdapter: IBillingAdapter = {
        createCheckoutSession: vi.fn(),
        createCustomerPortalSession: vi.fn(),
        resolveCustomerId: vi.fn(),
        cancelSubscription: vi.fn(),
        resumeSubscription: vi.fn(),
        constructWebhookEvent: vi.fn().mockResolvedValue({
          event: {
            id: "evt_new_checkout_999",
            type: "checkout.session.completed",
            data: {
              object: {
                client_reference_id: "prof_sub_123",
                subscription: "sub_stripe_111",
                metadata: {
                  profileId: "prof_sub_123",
                  planId: "pro_monthly",
                },
              },
            },
          },
          error: null,
        }),
      };
      const mockEntitlementService: IEntitlementService = {
        hasEntitlement: vi.fn(),
        getEntitlements: vi.fn(),
        grantEntitlement: vi.fn(),
        revokeEntitlement: vi.fn(),
        setPlanEntitlements: vi.fn().mockResolvedValue(undefined),
      };

      const connectSpy = vi.spyOn(pg.Client.prototype, "connect").mockImplementation(async () => {});
      const endSpy = vi.spyOn(pg.Client.prototype, "end").mockImplementation(async () => {});
      const querySpy = vi.spyOn(pg.Client.prototype, "query").mockImplementation(async (sql: any) => {
        // First call: idempotency check returns empty (not processed yet)
        return { rows: [], rowCount: 0 } as any;
      });

      try {
        const service = new BillingService(
          mockHyperdrive,
          mockEnv,
          mockAdapter,
          mockEntitlementService,
        );

        const result = await service.handleWebhookEvent("{}", "valid_sig");
        expect(result.received).toBe(true);
        expect(result.duplicate).toBe(false);
        expect(result.eventType).toBe("checkout.session.completed");
        expect(mockEntitlementService.setPlanEntitlements).toHaveBeenCalledWith(
          "prof_sub_123",
          FACTORY_PLANS.pro_monthly.features,
        );
      } finally {
        connectSpy.mockRestore();
        endSpy.mockRestore();
        querySpy.mockRestore();
      }
    });
  });
});
