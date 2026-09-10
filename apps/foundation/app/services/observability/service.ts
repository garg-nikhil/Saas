import type { Env } from "../../context";
import type {
  IObservabilityService,
  IObservabilityAdapter,
  ObservabilityContext,
  ObservabilityUser,
  Breadcrumb,
  SeverityLevel,
} from "./types";
import { SentryObservabilityAdapter } from "./adapters/sentry";

export class ObservabilityService implements IObservabilityService {
  constructor(private adapter: IObservabilityAdapter) {}

  captureException(error: unknown, context?: ObservabilityContext): Promise<string | null> | string | null {
    return this.adapter.captureException(error, context);
  }

  captureMessage(
    message: string,
    level: SeverityLevel = "info",
    context?: ObservabilityContext,
  ): Promise<string | null> | string | null {
    return this.adapter.captureMessage(message, level, context);
  }

  setUser(user: ObservabilityUser | null): void {
    this.adapter.setUser(user);
  }

  addBreadcrumb(breadcrumb: Breadcrumb): void {
    this.adapter.addBreadcrumb(breadcrumb);
  }

  flush(timeoutMs?: number): Promise<boolean> {
    return this.adapter.flush(timeoutMs);
  }
}

/**
 * Factory helper to construct the internal ObservabilityService boundary.
 */
export function createObservabilityService(
  env?: Env,
  customAdapter?: IObservabilityAdapter,
): IObservabilityService {
  if (customAdapter) {
    return new ObservabilityService(customAdapter);
  }

  const adapter = new SentryObservabilityAdapter({
    dsn: env?.SENTRY_DSN,
    environment: env?.ENVIRONMENT || "production",
  });

  return new ObservabilityService(adapter);
}
