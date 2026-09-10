/**
 * Internal Analytics Service Contracts
 *
 * Provides a provider-agnostic boundary isolating the application
 * from third-party analytics SDKs (e.g. PostHog).
 */

export interface AnalyticsEvent {
  /** Unique user identifier or anonymous session ID */
  distinctId: string;
  /** Name of the event */
  event: string;
  /** Key-value metadata associated with the event */
  properties?: Record<string, unknown>;
  /** Optional event timestamp */
  timestamp?: Date;
}

export interface AnalyticsIdentify {
  distinctId: string;
  properties?: Record<string, unknown>;
}

export interface AnalyticsPageView {
  distinctId: string;
  url: string;
  properties?: Record<string, unknown>;
}

/**
 * Provider-agnostic adapter interface for analytics delivery.
 */
export interface IAnalyticsAdapter {
  track(event: AnalyticsEvent): Promise<void>;
  identify(payload: AnalyticsIdentify): Promise<void>;
  page(payload: AnalyticsPageView): Promise<void>;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * Application-level analytics boundary contract.
 */
export interface IAnalyticsService {
  track(event: AnalyticsEvent): Promise<void>;
  identify(payload: AnalyticsIdentify): Promise<void>;
  page(payload: AnalyticsPageView): Promise<void>;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}
