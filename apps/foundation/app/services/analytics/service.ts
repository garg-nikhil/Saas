import type { Env } from "../../context";
import type {
  IAnalyticsService,
  IAnalyticsAdapter,
  AnalyticsEvent,
  AnalyticsIdentify,
  AnalyticsPageView,
} from "./types";
import { PostHogAnalyticsAdapter } from "./adapters/posthog";

export class AnalyticsService implements IAnalyticsService {
  constructor(private adapter: IAnalyticsAdapter) {}

  async track(event: AnalyticsEvent): Promise<void> {
    await this.adapter.track(event);
  }

  async identify(payload: AnalyticsIdentify): Promise<void> {
    await this.adapter.identify(payload);
  }

  async page(payload: AnalyticsPageView): Promise<void> {
    await this.adapter.page(payload);
  }

  async flush(): Promise<void> {
    await this.adapter.flush();
  }

  async shutdown(): Promise<void> {
    await this.adapter.shutdown();
  }
}

/**
 * Factory helper to construct the internal AnalyticsService boundary.
 */
export function createAnalyticsService(
  env?: Env,
  customAdapter?: IAnalyticsAdapter,
): IAnalyticsService {
  if (customAdapter) {
    return new AnalyticsService(customAdapter);
  }

  const adapter = new PostHogAnalyticsAdapter({
    apiKey: env?.POSTHOG_KEY,
    host: env?.POSTHOG_HOST,
  });

  return new AnalyticsService(adapter);
}
