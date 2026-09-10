/**
 * Observability & Error Monitoring Service Contracts
 *
 * Provides a provider-agnostic boundary isolating the application
 * from third-party error tracking SDKs (e.g. Sentry).
 */

export type SeverityLevel =
  | "fatal"
  | "error"
  | "warning"
  | "log"
  | "info"
  | "debug";

export interface ObservabilityUser {
  id: string;
  email?: string;
  username?: string;
  [key: string]: unknown;
}

export interface Breadcrumb {
  message?: string;
  category?: string;
  level?: SeverityLevel;
  data?: Record<string, unknown>;
  timestamp?: number;
}

export interface ObservabilityContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: ObservabilityUser;
  level?: SeverityLevel;
  fingerprint?: string[];
}

/**
 * Provider adapter interface for error tracking and observability.
 */
export interface IObservabilityAdapter {
  captureException(error: unknown, context?: ObservabilityContext): Promise<string | null> | string | null;
  captureMessage(message: string, level?: SeverityLevel, context?: ObservabilityContext): Promise<string | null> | string | null;
  setUser(user: ObservabilityUser | null): void;
  addBreadcrumb(breadcrumb: Breadcrumb): void;
  flush(timeoutMs?: number): Promise<boolean>;
}

/**
 * High-level ObservabilityService boundary exposed to the application.
 */
export interface IObservabilityService {
  captureException(error: unknown, context?: ObservabilityContext): Promise<string | null> | string | null;
  captureMessage(message: string, level?: SeverityLevel, context?: ObservabilityContext): Promise<string | null> | string | null;
  setUser(user: ObservabilityUser | null): void;
  addBreadcrumb(breadcrumb: Breadcrumb): void;
  flush(timeoutMs?: number): Promise<boolean>;
}
