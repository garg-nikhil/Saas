import { describe, it, expect, vi } from "vitest";
import {
  ObservabilityService,
  SentryObservabilityAdapter,
  createObservabilityService,
  sanitizeContext,
  type IObservabilityAdapter,
} from "../app/services/observability";

describe("Milestone 4B — Observability Service & Sentry Adapter", () => {
  describe("1. Sensitive Context Redaction & Security", () => {
    it("redacts sensitive credential keys in context objects", () => {
      const sensitiveData = {
        userId: "usr_123",
        password: "SuperSecretPassword123!",
        stripe_secret_key: "sk_live_12345",
        authorization: "Bearer secret_jwt_token",
        database_url: "postgresql://user:pass@host/db",
        nested: {
          token: "ghp_1234567890",
          safeKey: "safe_value",
        },
      };

      const sanitized = sanitizeContext(sensitiveData);

      expect(sanitized.userId).toBe("usr_123");
      expect(sanitized.password).toBe("[REDACTED]");
      expect(sanitized.stripe_secret_key).toBe("[REDACTED]");
      expect(sanitized.authorization).toBe("[REDACTED]");
      expect(sanitized.database_url).toBe("[REDACTED]");
      expect(sanitized.nested.token).toBe("[REDACTED]");
      expect(sanitized.nested.safeKey).toBe("safe_value");
    });

    it("redacts bearer tokens embedded in arbitrary text strings", () => {
      const rawString = "Error during request: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
      const sanitized = sanitizeContext(rawString);
      expect(sanitized).toBe("Error during request: Bearer [REDACTED]");
    });
  });

  describe("2. Unconfigured / Graceful Fallback Behavior", () => {
    it("returns null safely and does not throw when unconfigured", async () => {
      const adapter = new SentryObservabilityAdapter({ dsn: undefined });
      const eventId = adapter.captureException(new Error("Test failure"));
      expect(eventId).toBeNull();

      const msgId = adapter.captureMessage("Test message");
      expect(msgId).toBeNull();

      expect(() => adapter.setUser({ id: "usr_123" })).not.toThrow();
      expect(() => adapter.addBreadcrumb({ message: "step 1" })).not.toThrow();
      const flushResult = await adapter.flush();
      expect(flushResult).toBe(true);
    });
  });

  describe("3. Observability Service Boundary Delegation", () => {
    it("delegates operations to the injected adapter", async () => {
      const mockAdapter: IObservabilityAdapter = {
        captureException: vi.fn().mockReturnValue("sentry-evt-123"),
        captureMessage: vi.fn().mockReturnValue("sentry-msg-456"),
        setUser: vi.fn(),
        addBreadcrumb: vi.fn(),
        flush: vi.fn().mockResolvedValue(true),
      };

      const service = new ObservabilityService(mockAdapter);

      const testError = new Error("DB connection timeout");
      const resultEvt = service.captureException(testError, { tags: { environment: "test" } });
      expect(resultEvt).toBe("sentry-evt-123");
      expect(mockAdapter.captureException).toHaveBeenCalledWith(testError, { tags: { environment: "test" } });

      const resultMsg = service.captureMessage("System warning", "warning");
      expect(resultMsg).toBe("sentry-msg-456");
      expect(mockAdapter.captureMessage).toHaveBeenCalledWith("System warning", "warning", undefined);

      service.setUser({ id: "usr_1", email: "user@example.com" });
      expect(mockAdapter.setUser).toHaveBeenCalledWith({ id: "usr_1", email: "user@example.com" });

      service.addBreadcrumb({ message: "Loaded dashboard", category: "navigation" });
      expect(mockAdapter.addBreadcrumb).toHaveBeenCalledWith({ message: "Loaded dashboard", category: "navigation" });

      const flushed = await service.flush(1000);
      expect(flushed).toBe(true);
      expect(mockAdapter.flush).toHaveBeenCalledWith(1000);
    });

    it("creates ObservabilityService via factory function", () => {
      const service = createObservabilityService({
        SENTRY_DSN: "https://key@sentry.io/123",
        ENVIRONMENT: "production",
      } as any);

      expect(service).toBeInstanceOf(ObservabilityService);
    });
  });
});
