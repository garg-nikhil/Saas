import type {
  IAnalyticsAdapter,
  AnalyticsEvent,
  AnalyticsIdentify,
  AnalyticsPageView,
} from "../types";

export interface PostHogAdapterConfig {
  apiKey?: string;
  host?: string;
  fetchFn?: typeof fetch;
}

const SENSITIVE_KEY_REGEX =
  /(password|token|secret|api[-_]?key|^key$|_key$|auth(?:orization)?|cookie|set-cookie|credit[-_]?card|cvv|database_url|service_role|stripe_secret|resend_api)/i;

/**
 * Sanitizes analytics property payloads to prevent leakage of credentials
 * or sensitive credentials into analytics platforms.
 */
export function sanitizeProperties(
  properties?: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> | undefined {
  if (!properties || depth > 4) return properties;

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      sanitized[key] = sanitizeProperties(value as Record<string, unknown>, depth + 1);
    } else if (typeof value === "string" && /bearer\s+[a-zA-Z0-9_\-\.]+/i.test(value)) {
      sanitized[key] = value.replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer [REDACTED]");
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Cloudflare Workers native PostHog HTTP Analytics Adapter.
 * Direct HTTP API delivery via global fetch avoiding Node background timer dependencies.
 */
export class PostHogAnalyticsAdapter implements IAnalyticsAdapter {
  private isConfigured = false;
  private endpoint: string;
  private fetchImpl: typeof fetch;

  constructor(private config: PostHogAdapterConfig) {
    this.isConfigured = Boolean(config.apiKey && config.apiKey.trim().length > 0);
    const host = (config.host || "https://us.i.posthog.com").replace(/\/+$/, "");
    this.endpoint = `${host}/capture/`;
    this.fetchImpl = config.fetchFn || (typeof fetch !== "undefined" ? fetch : (globalThis.fetch as typeof fetch));
  }

  private async sendPayload(payload: Record<string, unknown>): Promise<void> {
    if (!this.isConfigured || !this.config.apiKey) {
      return;
    }

    try {
      const body = {
        api_key: this.config.apiKey,
        ...payload,
      };

      const res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "SaaS-Factory-Workers/1.0",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        console.error(`PostHog HTTP capture failed: status ${res.status}`);
      }
    } catch (err) {
      // Analytics failures must never break the host application
      console.error("PostHog HTTP dispatch error:", err);
    }
  }

  async track(event: AnalyticsEvent): Promise<void> {
    if (!this.isConfigured) return;

    await this.sendPayload({
      event: event.event,
      distinct_id: event.distinctId,
      properties: {
        distinct_id: event.distinctId,
        ...sanitizeProperties(event.properties),
      },
      timestamp: event.timestamp ? event.timestamp.toISOString() : new Date().toISOString(),
    });
  }

  async identify(payload: AnalyticsIdentify): Promise<void> {
    if (!this.isConfigured) return;

    await this.sendPayload({
      event: "$identify",
      distinct_id: payload.distinctId,
      properties: {
        distinct_id: payload.distinctId,
        $set: sanitizeProperties(payload.properties),
      },
      timestamp: new Date().toISOString(),
    });
  }

  async page(payload: AnalyticsPageView): Promise<void> {
    if (!this.isConfigured) return;

    await this.sendPayload({
      event: "$pageview",
      distinct_id: payload.distinctId,
      properties: {
        distinct_id: payload.distinctId,
        $current_url: payload.url,
        ...sanitizeProperties(payload.properties),
      },
      timestamp: new Date().toISOString(),
    });
  }

  async flush(): Promise<void> {
    // Workers HTTP dispatch is immediate per request; flush is a safe no-op
    return;
  }

  async shutdown(): Promise<void> {
    this.isConfigured = false;
    return;
  }
}
