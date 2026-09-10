import { describe, it, expect, vi } from "vitest";
import {
  AnalyticsService,
  PostHogAnalyticsAdapter,
  createAnalyticsService,
  sanitizeProperties,
  type IAnalyticsAdapter,
} from "../app/services/analytics";

describe("Milestone 4B — Analytics Service & PostHog Adapter", () => {
  describe("1. Sensitive Properties Redaction & Security", () => {
    it("redacts sensitive credential keys in analytics properties", () => {
      const properties = {
        plan: "pro",
        amountCents: 2900,
        stripe_secret_key: "sk_live_99999",
        password: "MySecretPassword",
        authorization: "Bearer eyJhbGciOi...",
        nested: {
          token: "secret_access_token",
          feature: "dark_mode",
        },
      };

      const sanitized = sanitizeProperties(properties);

      expect(sanitized?.plan).toBe("pro");
      expect(sanitized?.amountCents).toBe(2900);
      expect(sanitized?.stripe_secret_key).toBe("[REDACTED]");
      expect(sanitized?.password).toBe("[REDACTED]");
      expect(sanitized?.authorization).toBe("[REDACTED]");
      expect((sanitized?.nested as any)?.token).toBe("[REDACTED]");
      expect((sanitized?.nested as any)?.feature).toBe("dark_mode");
    });
  });

  describe("2. Unconfigured / Graceful Fallback Behavior", () => {
    it("safely handles unconfigured PostHogAdapter without throwing", async () => {
      const adapter = new PostHogAnalyticsAdapter({ apiKey: undefined });

      await expect(
        adapter.track({ distinctId: "usr_1", event: "user_signed_up" }),
      ).resolves.not.toThrow();

      await expect(
        adapter.identify({ distinctId: "usr_1", properties: { role: "admin" } }),
      ).resolves.not.toThrow();

      await expect(
        adapter.page({ distinctId: "usr_1", url: "https://example.com/pricing" }),
      ).resolves.not.toThrow();

      await expect(adapter.flush()).resolves.not.toThrow();
      await expect(adapter.shutdown()).resolves.not.toThrow();
    });

    it("sends HTTP payload via fetch when configured", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      const adapter = new PostHogAnalyticsAdapter({
        apiKey: "phc_test_12345",
        host: "https://eu.i.posthog.com",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      await adapter.track({
        distinctId: "usr_42",
        event: "test_event",
        properties: { secret_key: "sensitive_value", normal: "ok" },
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, req] = mockFetch.mock.calls[0];
      expect(url).toBe("https://eu.i.posthog.com/capture/");
      expect(req.method).toBe("POST");

      const body = JSON.parse(req.body);
      expect(body.api_key).toBe("phc_test_12345");
      expect(body.event).toBe("test_event");
      expect(body.distinct_id).toBe("usr_42");
      expect(body.properties.secret_key).toBe("[REDACTED]");
      expect(body.properties.normal).toBe("ok");
    });
  });

  describe("3. Analytics Service Boundary Delegation", () => {
    it("delegates track, identify, page, flush and shutdown to adapter", async () => {
      const mockAdapter: IAnalyticsAdapter = {
        track: vi.fn().mockResolvedValue(undefined),
        identify: vi.fn().mockResolvedValue(undefined),
        page: vi.fn().mockResolvedValue(undefined),
        flush: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
      };

      const service = new AnalyticsService(mockAdapter);

      await service.track({
        distinctId: "usr_100",
        event: "subscription_created",
        properties: { planId: "starter" },
      });
      expect(mockAdapter.track).toHaveBeenCalledWith({
        distinctId: "usr_100",
        event: "subscription_created",
        properties: { planId: "starter" },
      });

      await service.identify({
        distinctId: "usr_100",
        properties: { email: "user@example.com" },
      });
      expect(mockAdapter.identify).toHaveBeenCalledWith({
        distinctId: "usr_100",
        properties: { email: "user@example.com" },
      });

      await service.page({
        distinctId: "usr_100",
        url: "https://example.com/dashboard",
      });
      expect(mockAdapter.page).toHaveBeenCalledWith({
        distinctId: "usr_100",
        url: "https://example.com/dashboard",
      });

      await service.flush();
      expect(mockAdapter.flush).toHaveBeenCalled();

      await service.shutdown();
      expect(mockAdapter.shutdown).toHaveBeenCalled();
    });

    it("creates AnalyticsService via factory function", () => {
      const service = createAnalyticsService({
        POSTHOG_API_KEY: "phc_test_123",
        POSTHOG_HOST: "https://us.i.posthog.com",
      } as any);

      expect(service).toBeInstanceOf(AnalyticsService);
    });
  });
});
