import * as Sentry from "@sentry/cloudflare";
import { initAndBind, createTransport, createStackParser, nodeStackLineParser } from "@sentry/core";
import type {
  IObservabilityAdapter,
  ObservabilityContext,
  ObservabilityUser,
  Breadcrumb,
  SeverityLevel,
} from "../types";

export interface SentryAdapterConfig {
  dsn?: string;
  environment?: string;
  release?: string;
  debug?: boolean;
}

const SENSITIVE_KEY_REGEX =
  /(password|token|secret|api[-_]?key|^key$|_key$|auth(?:orization)?|cookie|set-cookie|credit[-_]?card|cvv|database_url|service_role|stripe_secret|resend_api)/i;

/**
 * Sanitizes context objects to prevent credential leakage to error telemetry.
 */
export function sanitizeContext<T>(data: T, depth = 0): T {
  if (depth > 5 || data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string") {
    // Redact JWT or Bearer tokens if present in strings
    if (/bearer\s+[a-zA-Z0-9_\-\.]+/i.test(data)) {
      return data.replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer [REDACTED]") as unknown as T;
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeContext(item, depth + 1)) as unknown as T;
  }

  if (typeof data === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeContext(value, depth + 1);
      }
    }
    return sanitized as T;
  }

  return data;
}

/**
 * Cloudflare Workers compatible Sentry Observability Adapter.
 * Encapsulates @sentry/cloudflare behind the IObservabilityAdapter contract.
 */
export class SentryObservabilityAdapter implements IObservabilityAdapter {
  private isConfigured = false;
  private initialized = false;

  constructor(private config: SentryAdapterConfig) {
    this.isConfigured = Boolean(config.dsn && config.dsn.trim().length > 0);
  }

  private ensureInitialized(): void {
    if (this.initialized || !this.isConfigured || !this.config.dsn) {
      return;
    }

    try {
      const options = {
        dsn: this.config.dsn,
        environment: this.config.environment || "production",
        release: this.config.release,
        debug: this.config.debug ?? false,
      };
      initAndBind(Sentry.CloudflareClient, {
        ...options,
        stackParser: createStackParser(nodeStackLineParser()),
        transport: (transportOptions) =>
          createTransport(transportOptions, (request) => {
            const requestOptions = {
              body: request.body,
              method: "POST",
              headers: transportOptions.headers,
              ...transportOptions.fetchOptions,
            };
            return fetch(transportOptions.url, requestOptions).then(async (response) => {
              try {
                await response.text();
              } catch {
                // ignore body read errors
              }
              return {
                statusCode: response.status,
                headers: {
                  "x-sentry-rate-limits": response.headers.get("X-Sentry-Rate-Limits"),
                  "retry-after": response.headers.get("Retry-After"),
                },
              };
            });
          }),
        integrations: Sentry.getDefaultIntegrations(options),
      });
      this.initialized = true;
    } catch (err) {
      console.error("Failed to initialize Sentry SDK:", err);
      this.isConfigured = false;
    }
  }

  captureException(error: unknown, context?: ObservabilityContext): string | null {
    if (!this.isConfigured) {
      return null;
    }

    try {
      this.ensureInitialized();
      const sanitizedContext = context ? sanitizeContext(context) : undefined;

      const eventId = Sentry.captureException(error, {
        tags: sanitizedContext?.tags,
        extra: sanitizedContext?.extra,
        level: sanitizedContext?.level,
        fingerprint: sanitizedContext?.fingerprint,
        user: sanitizedContext?.user
          ? {
              id: sanitizedContext.user.id,
              email: sanitizedContext.user.email,
              username: sanitizedContext.user.username,
            }
          : undefined,
      });

      return eventId || null;
    } catch (sentryErr) {
      console.error("Sentry captureException failure:", sentryErr);
      return null;
    }
  }

  captureMessage(
    message: string,
    level: SeverityLevel = "info",
    context?: ObservabilityContext,
  ): string | null {
    if (!this.isConfigured) {
      return null;
    }

    try {
      this.ensureInitialized();
      const sanitizedContext = context ? sanitizeContext(context) : undefined;

      const eventId = Sentry.captureMessage(message, {
        level: (sanitizedContext?.level || level) as Sentry.SeverityLevel,
        tags: sanitizedContext?.tags,
        extra: sanitizedContext?.extra,
        fingerprint: sanitizedContext?.fingerprint,
        user: sanitizedContext?.user
          ? {
              id: sanitizedContext.user.id,
              email: sanitizedContext.user.email,
              username: sanitizedContext.user.username,
            }
          : undefined,
      });

      return eventId || null;
    } catch (sentryErr) {
      console.error("Sentry captureMessage failure:", sentryErr);
      return null;
    }
  }

  setUser(user: ObservabilityUser | null): void {
    if (!this.isConfigured) {
      return;
    }

    try {
      this.ensureInitialized();
      if (!user) {
        Sentry.setUser(null);
      } else {
        const sanitizedUser = sanitizeContext(user);
        Sentry.setUser({
          id: sanitizedUser.id,
          email: sanitizedUser.email,
          username: sanitizedUser.username,
        });
      }
    } catch (sentryErr) {
      console.error("Sentry setUser failure:", sentryErr);
    }
  }

  addBreadcrumb(breadcrumb: Breadcrumb): void {
    if (!this.isConfigured) {
      return;
    }

    try {
      this.ensureInitialized();
      const sanitizedData = breadcrumb.data ? sanitizeContext(breadcrumb.data) : undefined;
      Sentry.addBreadcrumb({
        message: breadcrumb.message,
        category: breadcrumb.category,
        level: breadcrumb.level as Sentry.SeverityLevel,
        data: sanitizedData,
        timestamp: breadcrumb.timestamp,
      });
    } catch (sentryErr) {
      console.error("Sentry addBreadcrumb failure:", sentryErr);
    }
  }

  async flush(timeoutMs = 2000): Promise<boolean> {
    if (!this.isConfigured) {
      return true;
    }

    try {
      this.ensureInitialized();
      return await Sentry.flush(timeoutMs);
    } catch (sentryErr) {
      console.error("Sentry flush failure:", sentryErr);
      return false;
    }
  }
}
