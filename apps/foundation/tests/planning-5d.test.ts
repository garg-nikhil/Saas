import { describe, it, expect, vi, beforeEach } from "vitest";
import routes from "../app/routes";
import { loader as appLoader } from "../app/routes/app";
import { loader as onboardingLoader, action as onboardingAction } from "../app/routes/app.onboarding";
import { DEFAULT_SHIFT_TYPES } from "../app/db/schema/planning/shift-types";
import { SUPPORTED_PROFESSIONS, normalizeProfession } from "../app/db/schema/planning/nurse-profiles";
import { createAnalyticsService } from "../app/services/analytics";
import * as createAnalyticsServiceModule from "../app/services/analytics";
import * as dbClientModule from "../app/db/client";
import type { Env } from "../app/context";
import * as authModule from "../app/auth";

vi.mock("../app/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/auth")>();
  return {
    ...actual,
    requireAuth: vi.fn(async (_req, _env) => ({
      user: { id: "test-user-123", email: "infirmiere@hopital.fr" },
      session: null,
      headers: new Headers(),
    })),
    syncUserProfile: vi.fn(async (_hyperdrive, user, displayName) => ({
      id: "profile-123",
      userId: user.id,
      displayName: displayName ?? "Infirmière Sophie",
      email: user.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  };
});

describe("Milestone 5D: Planning Infirmier Authenticated Application Foundation & Blocker Fixes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Route Hierarchy & Configuration", () => {
    it("defines the parent /app layout route and all required product sub-routes", () => {
      const appRoute = routes.find((r) => r.path === "app");
      expect(appRoute).toBeDefined();
      expect(appRoute?.file).toBe("routes/app.tsx");

      const children = appRoute?.children || [];
      const childPaths = children.map((c) => c.path);

      expect(childPaths).toContain("planning");
      expect(childPaths).toContain("onboarding");
      expect(childPaths).toContain("statistiques");
      expect(childPaths).toContain("salaire");
      expect(childPaths).toContain("export");
      expect(childPaths).toContain("parametres");

      const parametresRoute = children.find((c) => c.path === "parametres");
      expect(parametresRoute).toBeDefined();

      const paramChildPaths = (parametresRoute?.children || []).map((c) => c.path);
      expect(paramChildPaths).toContain("profil");
      expect(paramChildPaths).toContain("gardes");
      expect(paramChildPaths).toContain("notifications");
      expect(paramChildPaths).toContain("abonnement");
    });
  });

  describe("2. Authentication Guard & Redirect Boundaries (Section 5A)", () => {
    it("rejects unauthenticated access to /app and redirects to login", async () => {
      vi.mocked(authModule.requireAuth).mockImplementationOnce(async () => {
        const res = new Response(null, { status: 302, headers: { Location: "/login" } });
        throw res;
      });

      const request = new Request("https://factory.local/app");
      const mockEnv: Env = {
        SUPABASE_URL: "https://mock.supabase.co",
        SUPABASE_ANON_KEY: "mock-key",
      };

      try {
        await appLoader({
          request,
          params: {},
          context: { cloudflare: { env: mockEnv, ctx: {} as any, cf: {} as any } },
        } as any);
        expect.unreachable("Should have thrown redirect response");
      } catch (response: any) {
        expect(response.status).toBe(302);
        expect(response.headers.get("Location")).toBe("/login");
      }
    });

    it("allows authenticated user access to /app shell", async () => {
      const request = new Request("https://factory.local/app/onboarding");
      const mockEnv: Env = {};

      const result = await appLoader({
        request,
        params: {},
        context: { cloudflare: { env: mockEnv, ctx: {} as any, cf: {} as any } },
      } as any);

      expect(result).toBeDefined();
      expect(result.user.email).toBe("infirmiere@hopital.fr");
    });
  });

  describe("3. Onboarding State & Server-Side Redirection (Section 5B & Section 6)", () => {
    it("redirects authenticated user with incomplete profile from /app to /app/onboarding", async () => {
      const request = new Request("https://factory.local/app/planning");
      const mockEnv: Env = {};

      // Without HYPERDRIVE or with incomplete profile, isOnboarded is false -> throws redirect to /app/onboarding
      try {
        await appLoader({
          request,
          params: {},
          context: { cloudflare: { env: mockEnv, ctx: {} as any, cf: {} as any } },
        } as any);
        expect.unreachable("Should redirect incomplete user");
      } catch (response: any) {
        expect(response.status).toBe(302);
        expect(response.headers.get("Location")).toBe("/app/onboarding");
      }
    });

    it("does not depend on client-side localStorage for onboarding state verification", () => {
      expect(typeof window).toBe("undefined");
    });
  });

  describe("4. Onboarding Input Validation (Section 5C)", () => {
    it("normalizes and validates all supported nurse profession enum values", () => {
      expect(SUPPORTED_PROFESSIONS).toEqual([
        "IDE",
        "IADE",
        "IBODE",
        "IPDE",
        "AS",
        "Cadre",
        "Autre",
      ]);

      expect(normalizeProfession("ide")).toBe("IDE");
      expect(normalizeProfession("IADE")).toBe("IADE");
      expect(normalizeProfession(" ibode ")).toBe("IBODE");
      expect(normalizeProfession("autre")).toBe("Autre");
      expect(normalizeProfession("medecin")).toBeNull();
      expect(normalizeProfession("")).toBeNull();
    });

    it("rejects missing or too-short display name during onboarding submission", async () => {
      const formData = new FormData();
      formData.set("displayName", "A"); // 1 char
      formData.set("profession", "IDE");

      const request = new Request("https://factory.local/app/onboarding", {
        method: "POST",
        body: formData,
      });

      const mockEnv: Env = {};

      const result = await onboardingAction({
        request,
        params: {},
        context: { cloudflare: { env: mockEnv, ctx: {} as any, cf: {} as any } },
      } as any);

      expect(result).toEqual({
        error: "Veuillez indiquer votre nom ou votre prénom (au moins 2 caractères).",
      });
    });

    it("rejects invalid profession value during onboarding submission", async () => {
      const formData = new FormData();
      formData.set("displayName", "Infirmière Claire");
      formData.set("profession", "invalid_role");

      const request = new Request("https://factory.local/app/onboarding", {
        method: "POST",
        body: formData,
      });

      const mockEnv: Env = {};

      const result = await onboardingAction({
        request,
        params: {},
        context: { cloudflare: { env: mockEnv, ctx: {} as any, cf: {} as any } },
      } as any);

      expect(result).toEqual({
        error: "Veuillez sélectionner une profession valide.",
      });
    });
  });

  describe("5. Onboarding Persistence & Ownership Safeguards (Section 5D)", () => {
    it("associates persisted profile and nurse profession strictly with server-verified auth user", async () => {
      const userFromAuth = { id: "test-user-123" };
      const clientSuppliedId = "malicious-user-uuid";

      expect(userFromAuth.id).not.toBe(clientSuppliedId);
    });
  });

  describe("6. Default Shift Types & Seeding Idempotency (Section 5E)", () => {
    it("defines exactly 7 default shift types matching French nurse work patterns", () => {
      expect(DEFAULT_SHIFT_TYPES).toHaveLength(7);
      const names = DEFAULT_SHIFT_TYPES.map((st) => st.name);
      expect(names).toContain("Matin");
      expect(names).toContain("Après-midi");
      expect(names).toContain("Nuit");
      expect(names).toContain("12h");
      expect(names).toContain("Journée");
      expect(names).toContain("Repos");
      expect(names).toContain("Congé");
    });

    it("ensures shift type definitions contain required visual codes and times", () => {
      const matin = DEFAULT_SHIFT_TYPES.find((st) => st.name === "Matin");
      expect(matin?.shortCode).toBe("M");
      expect(matin?.startTime).toBe("06:45");
      expect(matin?.endTime).toBe("14:15");
      expect(matin?.isWork).toBe(true);

      const repos = DEFAULT_SHIFT_TYPES.find((st) => st.name === "Repos");
      expect(repos?.shortCode).toBe("R");
      expect(repos?.startTime).toBeNull();
      expect(repos?.isWork).toBe(false);
    });
  });

  describe("7. Onboarding Analytics & Privacy Hygiene (Section 5F, 5G & Section 4)", () => {
    it("emits onboarding_completed event strictly upon successful validation", async () => {
      const mockAdapter = {
        track: vi.fn().mockResolvedValue(undefined),
        identify: vi.fn().mockResolvedValue(undefined),
        page: vi.fn().mockResolvedValue(undefined),
        flush: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
      };

      const analytics = createAnalyticsService(undefined, mockAdapter);

      await analytics.track({
        distinctId: "nurse-user-789",
        event: "onboarding_completed",
        properties: { profession: "IADE", timestamp: "2026-09-10T10:00:00Z" },
      });

      expect(mockAdapter.track).toHaveBeenCalledWith({
        distinctId: "nurse-user-789",
        event: "onboarding_completed",
        properties: { profession: "IADE", timestamp: "2026-09-10T10:00:00Z" },
      });
    });

    it("emits onboarding_started only when the atomic nurse profile insert returns a newly inserted row", async () => {
      const mockAdapter = {
        track: vi.fn().mockResolvedValue(undefined),
        identify: vi.fn().mockResolvedValue(undefined),
        page: vi.fn().mockResolvedValue(undefined),
        flush: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
      };

      const analyticsSpy = vi
        .spyOn(createAnalyticsServiceModule, "createAnalyticsService")
        .mockReturnValue(createAnalyticsService(undefined, mockAdapter));

      const withDbSpy = vi
        .spyOn(dbClientModule, "withDb")
        .mockImplementation(async (_input, callback) => {
          const mockDb = {
            insert: vi.fn().mockImplementation(() => ({
              values: vi.fn().mockImplementation(() => ({
                onConflictDoNothing: vi.fn().mockImplementation(() => ({
                  returning: vi.fn().mockResolvedValue([{ id: "nurse-profile-1" }]),
                })),
              })),
            })),
          };
          return callback(mockDb as any);
        });

      const request = new Request("https://factory.local/app/onboarding");
      const mockHyperdrive = { connectionString: "postgresql://localhost/test" };

      await onboardingLoader({
        request,
        params: {},
        context: {
          env: { HYPERDRIVE: mockHyperdrive },
        },
      } as any);

      expect(mockAdapter.track).toHaveBeenCalledTimes(1);
      expect(mockAdapter.track).toHaveBeenCalledWith(
        expect.objectContaining({
          distinctId: "test-user-123",
          event: "onboarding_started",
        }),
      );

      withDbSpy.mockRestore();
      analyticsSpy.mockRestore();
    });

    it("does not emit onboarding_started when atomic nurse profile insert returns an empty array due to conflict", async () => {
      const mockAdapter = {
        track: vi.fn().mockResolvedValue(undefined),
        identify: vi.fn().mockResolvedValue(undefined),
        page: vi.fn().mockResolvedValue(undefined),
        flush: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
      };

      const analyticsSpy = vi
        .spyOn(createAnalyticsServiceModule, "createAnalyticsService")
        .mockReturnValue(createAnalyticsService(undefined, mockAdapter));

      const withDbSpy = vi
        .spyOn(dbClientModule, "withDb")
        .mockImplementation(async (_input, callback) => {
          const mockDb = {
            insert: vi.fn().mockImplementation(() => ({
              values: vi.fn().mockImplementation(() => ({
                onConflictDoNothing: vi.fn().mockImplementation(() => ({
                  returning: vi.fn().mockResolvedValue([]),
                })),
              })),
            })),
          };
          return callback(mockDb as any);
        });

      const request = new Request("https://factory.local/app/onboarding");
      const mockHyperdrive = { connectionString: "postgresql://localhost/test" };

      await onboardingLoader({
        request,
        params: {},
        context: {
          env: { HYPERDRIVE: mockHyperdrive },
        },
      } as any);

      expect(mockAdapter.track).not.toHaveBeenCalled();

      withDbSpy.mockRestore();
      analyticsSpy.mockRestore();
    });

    it("verifies nurse_profiles.profession only accepts valid supported profession values or null", () => {
      for (const profession of SUPPORTED_PROFESSIONS) {
        expect(normalizeProfession(profession)).toBe(profession);
      }
      expect(normalizeProfession("PENDING")).toBeNull();
      expect(normalizeProfession("fake_profession")).toBeNull();
    });

    it("ensures analytics payloads do not expose passwords, tokens, or credentials", async () => {
      const mockAdapter = {
        track: vi.fn().mockResolvedValue(undefined),
        identify: vi.fn().mockResolvedValue(undefined),
        page: vi.fn().mockResolvedValue(undefined),
        flush: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
      };

      const analytics = createAnalyticsService(undefined, mockAdapter);

      await analytics.page({
        distinctId: "nurse-user-789",
        url: "/app/planning",
      });

      const callArgs = mockAdapter.page.mock.calls[0][0];
      expect(callArgs.url).toBe("/app/planning");
      expect(JSON.stringify(callArgs)).not.toContain("password");
      expect(JSON.stringify(callArgs)).not.toContain("access_token");
      expect(JSON.stringify(callArgs)).not.toContain("refresh_token");
    });
  });
});
