import {
  createRequestHandler,
  createContext,
  RouterContextProvider,
} from "react-router";

export interface Env {
  ENVIRONMENT?: string;
  HYPERDRIVE?: Hyperdrive;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  SENTRY_DSN?: string;
  POSTHOG_KEY?: string;
  POSTHOG_HOST?: string;
  STORAGE_BUCKET_DEFAULT?: string;
}

export interface CloudflareContext {
  env: Env;
  ctx: ExecutionContext;
}

export const cloudflareContext = createContext<CloudflareContext>();

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    let req = request;
    const origin = request.headers.get("origin");

    if (origin && origin !== "null") {
      try {
        const originUrl = new URL(origin);
        const reqUrl = new URL(request.url);
        if (reqUrl.origin !== originUrl.origin) {
          const normalizedUrl = `${originUrl.origin}${reqUrl.pathname}${reqUrl.search}${reqUrl.hash}`;
          req = new Request(normalizedUrl, request);
        }
      } catch {
        // Ignore invalid origin URL parse
      }
    } else {
      const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
      const forwardedProto = request.headers.get("x-forwarded-proto") || "http";
      if (forwardedHost) {
        try {
          const reqUrl = new URL(request.url);
          const expectedOrigin = `${forwardedProto}://${forwardedHost}`;
          if (reqUrl.origin !== expectedOrigin) {
            const normalizedUrl = `${expectedOrigin}${reqUrl.pathname}${reqUrl.search}${reqUrl.hash}`;
            req = new Request(normalizedUrl, request);
          }
        } catch {
          // Ignore invalid host parse
        }
      }
    }

    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    return requestHandler(req, context);
  },
} satisfies ExportedHandler<Env>;
