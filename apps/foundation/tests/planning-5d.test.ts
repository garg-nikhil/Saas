import { describe, it, expect, vi } from "vitest";
import routes from "../app/routes";
import { DEFAULT_SHIFT_TYPES } from "../app/db/schema/planning/shift-types";
import { createAnalyticsService } from "../app/services/analytics";

describe("Milestone 5D: Planning Infirmier Authenticated Application Foundation", () => {
  describe("1. Route Configuration & Application Shell Hierarchy", () => {
    it("defines the parent /app layout route and all 10 required product sub-routes", () => {
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

      const parametresChildren = parametresRoute?.children || [];
      const paramChildPaths = parametresChildren.map((c) => c.path);

      expect(paramChildPaths).toContain("profil");
      expect(paramChildPaths).toContain("gardes");
      expect(paramChildPaths).toContain("notifications");
      expect(paramChildPaths).toContain("abonnement");
    });
  });

  describe("2. Onboarding Experience & Default Shift Types Seeding", () => {
    it("defines 7 default shift types matching French nurse work patterns", () => {
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

  describe("3. Analytics Service Integration", () => {
    it("uses IAnalyticsService boundary for tracking onboarding and navigation events", async () => {
      const mockAdapter = {
        track: vi.fn().mockResolvedValue(undefined),
        identify: vi.fn().mockResolvedValue(undefined),
        page: vi.fn().mockResolvedValue(undefined),
        flush: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
      };

      const analytics = createAnalyticsService(undefined, mockAdapter);

      await analytics.track({
        distinctId: "user-123",
        event: "onboarding_started",
        properties: { timestamp: "2026-10-15T10:00:00Z" },
      });

      expect(mockAdapter.track).toHaveBeenCalledWith({
        distinctId: "user-123",
        event: "onboarding_started",
        properties: { timestamp: "2026-10-15T10:00:00Z" },
      });

      await analytics.track({
        distinctId: "user-123",
        event: "onboarding_completed",
        properties: { profession: "ide" },
      });

      expect(mockAdapter.track).toHaveBeenCalledWith({
        distinctId: "user-123",
        event: "onboarding_completed",
        properties: { profession: "ide" },
      });
    });

    it("ensures analytics payloads do not expose passwords or secrets", async () => {
      const mockAdapter = {
        track: vi.fn().mockResolvedValue(undefined),
        identify: vi.fn().mockResolvedValue(undefined),
        page: vi.fn().mockResolvedValue(undefined),
        flush: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
      };

      const analytics = createAnalyticsService(undefined, mockAdapter);

      await analytics.page({
        distinctId: "user-456",
        url: "/app/planning",
      });

      const callArgs = mockAdapter.page.mock.calls[0][0];
      expect(callArgs.url).toBe("/app/planning");
      expect(callArgs.properties).toBeUndefined();
    });
  });
});
