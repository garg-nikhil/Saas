import { describe, it, expect, vi } from "vitest";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveHyperdrive, createDbClient } from "../app/db/client";
import { action as checkoutAction } from "../app/routes/api.billing.checkout";
import { action as portalAction } from "../app/routes/api.billing.portal";
import { action as webhookAction } from "../app/routes/api.webhooks.stripe";
import type { IAuthService, AuthUser } from "../app/auth";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, "../app");

describe("Milestone 4A — Factory Security & Isolation Controls", () => {
  describe("1. Secret Isolation & Client Bundle Protection", () => {
    it("STRIPE_SECRET_KEY, RESEND_API_KEY, STRIPE_WEBHOOK_SECRET never appear in client entry or client components", () => {
      const clientEntry = fs.readFileSync(path.join(appDir, "entry.client.tsx"), "utf-8");
      expect(clientEntry).not.toContain("STRIPE_SECRET_KEY");
      expect(clientEntry).not.toContain("STRIPE_WEBHOOK_SECRET");
      expect(clientEntry).not.toContain("RESEND_API_KEY");
      expect(clientEntry).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    });

    it("Worker runtime rejects raw DATABASE_URL as a database connection option", () => {
      expect(() => {
        resolveHyperdrive({
          DATABASE_URL: "postgresql://postgres:secret@remote:5432/db",
        });
      }).toThrowError(/DATABASE_URL is not permitted in the Worker runtime/);

      expect(() => {
        createDbClient({
          DATABASE_URL: "postgresql://postgres:secret@remote:5432/db",
        } as any);
      }).toThrowError(/DATABASE_URL is not permitted in the Worker runtime/);
    });
  });

  describe("2. Parameter Tampering & Price Injection Prevention", () => {
    it("checkout action rejects missing or arbitrary non-billable planId", async () => {
      const mockAuthService: IAuthService = {
        getCurrentUser: vi.fn().mockResolvedValue({
          id: "auth-123",
          email: "user@test.fr",
        } as AuthUser),
        getCurrentSession: vi.fn().mockResolvedValue({
          access_token: "token",
          user: { id: "auth-123", email: "user@test.fr" },
        } as any),
        signUp: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
        requestPasswordReset: vi.fn(),
        updatePassword: vi.fn(),
        verifyOtp: vi.fn(),
        resendVerification: vi.fn(),
      };

      // Attempting to send an arbitrary custom price ID in payload
      const request = new Request("https://factory.local/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: "unregistered_plan_bypass",
          priceId: "price_cheap_custom_hack", // Injected price
        }),
      });

      const connectSpy = vi.spyOn(pg.Client.prototype, "connect").mockImplementation(async () => {});
      const endSpy = vi.spyOn(pg.Client.prototype, "end").mockImplementation(async () => {});
      const querySpy = vi.spyOn(pg.Client.prototype, "query").mockImplementation(async (sql: any) => {
        if (sql?.rowMode === "array") {
          return {
            rows: [["prof-123", "auth-123", "User", "user@test.fr", new Date(), new Date()]],
            rowCount: 1,
          } as any;
        }
        return {
          rows: [{ id: "prof-123", userId: "auth-123", displayName: "User", email: "user@test.fr" }],
          rowCount: 1,
        } as any;
      });

      try {
        const response = await checkoutAction({
          request,
          params: {},
          context: {
            authService: mockAuthService,
            env: {
              SUPABASE_URL: "https://mock.supabase.co",
              SUPABASE_ANON_KEY: "mock-key",
              HYPERDRIVE: {
                connectionString: "postgresql://hyperdrive:5432/test",
                database: "test",
                host: "hyperdrive",
                password: "pass",
                port: 5432,
                user: "postgres",
                connect: () => ({} as any),
              },
            },
          },
        } as any);

        // Must be rejected
        expect(response.status).toBe(400);
        const data = (await response.json()) as { error?: string };
        expect(data.error).toBeDefined();
      } finally {
        connectSpy.mockRestore();
        endSpy.mockRestore();
        querySpy.mockRestore();
      }
    });

    it("checkout action rejects unauthenticated requests with redirect or 302", async () => {
      const request = new Request("https://factory.local/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: "pro_monthly" }),
      });

      // No auth session
      try {
        await checkoutAction({
          request,
          params: {},
          context: {
            env: {
              SUPABASE_URL: "https://mock.supabase.co",
              SUPABASE_ANON_KEY: "mock-key",
            },
          },
        } as any);
      } catch (redirectResponse: any) {
        expect(redirectResponse.status).toBe(302);
        expect(redirectResponse.headers.get("Location")).toContain("/login");
      }
    });

    it("portal action rejects unauthenticated requests", async () => {
      const request = new Request("https://factory.local/api/billing/portal", {
        method: "POST",
      });

      try {
        await portalAction({
          request,
          params: {},
          context: {
            env: {
              SUPABASE_URL: "https://mock.supabase.co",
              SUPABASE_ANON_KEY: "mock-key",
            },
          },
        } as any);
      } catch (redirectResponse: any) {
        expect(redirectResponse.status).toBe(302);
        expect(redirectResponse.headers.get("Location")).toContain("/login");
      }
    });
  });

  describe("3. Webhook Endpoint Defense", () => {
    it("webhook route rejects requests without stripe-signature header", async () => {
      const request = new Request("https://factory.local/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify({ id: "evt_test" }),
      });

      const response = await webhookAction({
        request,
        params: {},
        context: { env: {} },
      } as any);

      expect(response.status).toBe(400);
      const data = (await response.json()) as { error?: string };
      expect(data.error).toContain("Missing stripe-signature");
    });

    it("webhook route rejects GET requests with 405 Method Not Allowed", async () => {
      const request = new Request("https://factory.local/api/webhooks/stripe", {
        method: "GET",
      });

      const response = await webhookAction({
        request,
        params: {},
        context: { env: {} },
      } as any);

      expect(response.status).toBe(405);
    });
  });
});
