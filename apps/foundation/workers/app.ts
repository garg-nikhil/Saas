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
  async () => {
    const build = await import("virtual:react-router/server-build");
    return {
      ...build,
      allowedActionOrigins: [
        ...(Array.isArray(build.allowedActionOrigins) ? build.allowedActionOrigins : []),
        "localhost",
        "localhost:*",
        "127.0.0.1",
        "127.0.0.1:*",
        "0.0.0.0",
        "0.0.0.0:*",
        "*.run.app",
        "**.run.app",
        "*.aistudio-preview.app",
        "**.aistudio-preview.app",
      ],
    };
  },
  import.meta.env.MODE,
);

/**
 * Determines whether URL normalization via proxy forwarding headers should be applied.
 * Restricts header-based host/proto rewriting to specific development or AI Studio proxy
 * environments (e.g., localhost, internal container loops, *.run.app, *.aistudio-preview.app,
 * or non-production environments).
 * Standard production Cloudflare Worker requests targeting public domains remain completely unchanged.
 */
function isTrustedProxyEnvironment(url: URL, env?: Env): boolean {
  // Check if running on local/internal container endpoints
  const isLocalContainer =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "0.0.0.0" ||
    url.hostname === "[::1]";

  if (isLocalContainer) {
    return true;
  }

  // Development / test environments
  if (
    env?.ENVIRONMENT === "development" ||
    env?.ENVIRONMENT === "test" ||
    import.meta.env.DEV
  ) {
    return true;
  }

  // AI Studio / Cloud Run container proxy domains
  if (
    url.hostname.endsWith(".run.app") ||
    url.hostname.endsWith(".aistudio-preview.app")
  ) {
    return true;
  }

  return false;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    let req = request;

    // Normalize request.url ONLY if trusted proxy forwarding headers are present
    // AND restricted to development/preview or AI Studio proxy environments.
    // Standard production Cloudflare worker requests remain unchanged.
    // NEVER use the client-provided Origin header to rewrite request.url, as doing so
    // would bypass React Router's CSRF protection (which validates Origin against request.url).
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";

    if (forwardedHost) {
      try {
        const reqUrl = new URL(request.url);

        if (isTrustedProxyEnvironment(reqUrl, env)) {
          const host = forwardedHost.split(",")[0].trim();
          const proto = forwardedProto.split(",")[0].trim().replace(/:$/, "");

          if (host) {
            const expectedOrigin = `${proto}://${host}`;
            if (reqUrl.origin !== expectedOrigin) {
              const normalizedUrl = `${expectedOrigin}${reqUrl.pathname}${reqUrl.search}${reqUrl.hash}`;
              // Uses normalized URL while preserving the original request headers
              // (including Origin, Content-Type, Cookies) for React Router's internal CSRF checks
              req = new Request(normalizedUrl, request);
            }
          }
        }
      } catch {
        // Fallback to original request if URL parsing/normalization fails
      }
    }

    // URL path alias redirects to prevent 404s for common alternative routes
    try {
      const parsedUrl = new URL(req.url);
      const pathname = parsedUrl.pathname.toLowerCase().replace(/\/+$/, "");

      if (pathname === "/signin" || pathname === "/connexion") {
        return Response.redirect(`${parsedUrl.origin}/login${parsedUrl.search}`, 302);
      }
      if (pathname === "/register" || pathname === "/inscription") {
        return Response.redirect(`${parsedUrl.origin}/signup${parsedUrl.search}`, 302);
      }
      if (pathname === "/deconnexion") {
        return Response.redirect(`${parsedUrl.origin}/logout${parsedUrl.search}`, 302);
      }
      if (pathname === "/dashboard" || pathname === "/planning") {
        return Response.redirect(`${parsedUrl.origin}/app/planning${parsedUrl.search}`, 302);
      }
      if (pathname === "/onboarding") {
        return Response.redirect(`${parsedUrl.origin}/app/onboarding${parsedUrl.search}`, 302);
      }
    } catch {
      // Non-fatal
    }

    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    return requestHandler(req, context);
  },
} satisfies ExportedHandler<Env>;
