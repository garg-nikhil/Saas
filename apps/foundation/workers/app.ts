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

    // Normalize request.url ONLY if trusted proxy forwarding headers are present.
    // NEVER use the client-provided Origin header to rewrite request.url, as doing so
    // would bypass React Router's CSRF protection (which validates Origin against request.url).
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";

    if (forwardedHost) {
      try {
        const reqUrl = new URL(request.url);
        const host = forwardedHost.split(",")[0].trim();
        const proto = forwardedProto.split(",")[0].trim().replace(/:$/, "");

        if (host) {
          const expectedOrigin = `${proto}://${host}`;
          if (reqUrl.origin !== expectedOrigin) {
            const normalizedUrl = `${expectedOrigin}${reqUrl.pathname}${reqUrl.search}${reqUrl.hash}`;
            req = new Request(normalizedUrl, request);
          }
        }
      } catch {
        // Ignore invalid URL/host parse
      }
    }

    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    return requestHandler(req, context);
  },
} satisfies ExportedHandler<Env>;
