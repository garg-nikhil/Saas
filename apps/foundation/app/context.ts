import { cloudflareContext, type Env } from "../workers/app";

export { cloudflareContext, type Env };

/**
 * Extracts the Worker Env from the React Router AppLoadContext,
 * falling back gracefully to process.env in Node/test environments.
 */
export function getAppEnv(context?: unknown): Env {
  if (context && typeof (context as { get?: unknown }).get === "function") {
    try {
      const cf = (context as { get: (c: unknown) => { env?: Env } }).get(cloudflareContext);
      if (cf?.env) return cf.env;
    } catch {
      // Ignore and fallback
    }
  }

  if (context && typeof context === "object" && "env" in context) {
    const directEnv = (context as { env: Env }).env;
    if (directEnv) return directEnv;
  }

  return {
    ENVIRONMENT: process.env.ENVIRONMENT || process.env.NODE_ENV,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    SENTRY_DSN: process.env.SENTRY_DSN,
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    STORAGE_BUCKET_DEFAULT: process.env.STORAGE_BUCKET_DEFAULT,
  };
}
