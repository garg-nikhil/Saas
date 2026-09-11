import { redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Env } from "../context";
import { withDb } from "../db/client";
import { profiles, type Profile } from "../db/schema/profiles";
import { SupabaseAuthService } from "./supabase.server";
import { LocalAuthService } from "./local.server";
import type {
  AuthSession,
  AuthUser,
  IAuthService,
  AuthServiceResult,
} from "./types";

/**
 * Validates that a redirect path is internal and safe against open-redirect attacks.
 * Rejects external URLs, protocol-relative paths, javascript: URLs, and backslash bypasses.
 */
export function getSafeRedirectUrl(
  urlStr: string | null | undefined,
  defaultUrl = "/app",
): string {
  if (!urlStr || typeof urlStr !== "string") {
    return defaultUrl;
  }

  const trimmed = urlStr.trim();

  // Must begin with a single slash, cannot start with // or /\, cannot contain colon or backslash
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.startsWith("/\\") &&
    !trimmed.includes(":") &&
    !trimmed.includes("\\")
  ) {
    try {
      const parsed = new URL(trimmed, "https://factory.local");
      if (
        parsed.origin === "https://factory.local" &&
        parsed.pathname.startsWith("/") &&
        !parsed.pathname.startsWith("//")
      ) {
        return parsed.pathname + parsed.search + parsed.hash;
      }
    } catch {
      return defaultUrl;
    }
  }

  return defaultUrl;
}

/**
 * Verifies if Supabase credentials are valid and not placeholders or empty.
 */
export function isSupabaseConfigured(
  url?: string | null,
  key?: string | null,
): boolean {
  if (!url || !key) return false;
  const trimmedUrl = url.trim();
  const trimmedKey = key.trim();
  if (trimmedUrl.length === 0 || trimmedKey.length === 0) return false;

  // Filter out placeholder domains and dummy values
  if (
    trimmedUrl.includes("placeholder-project") ||
    trimmedUrl.includes("your-project-id") ||
    trimmedKey.includes("placeholder-anon-key") ||
    trimmedKey.includes("your-supabase-anon-key")
  ) {
    return false;
  }

  try {
    const parsed = new URL(trimmedUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (parsed.hostname === "placeholder-project.supabase.co") {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

/**
 * Creates the internal AuthService boundary instance for the current request.
 *
 * Encapsulates the responseHeaders collector to capture Set-Cookie headers
 * produced during authentication state changes.
 */
export function createAuthService(
  request: Request,
  env: Env,
  customAdapter?: IAuthService,
): AuthServiceResult {
  const responseHeaders = new Headers();

  if (customAdapter) {
    return {
      authService: customAdapter,
      responseHeaders,
    };
  }

  const supabaseUrl = env.SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey && isSupabaseConfigured(supabaseUrl, supabaseAnonKey)) {
    const authService = new SupabaseAuthService(
      request,
      {
        supabaseUrl,
        supabaseAnonKey,
      },
      responseHeaders,
    );

    return {
      authService,
      responseHeaders,
    };
  }

  // Fallback to local cookie-based session auth service
  const localAuthService = new LocalAuthService(
    request,
    responseHeaders,
    env?.HYPERDRIVE,
  );

  return {
    authService: localAuthService,
    responseHeaders,
  };
}

/**
 * Server-side route guard for protected routes.
 *
 * Validates the authentication session cryptographically on the server.
 * If unauthenticated, throws a redirect to /login with the original URL preserved.
 */
export async function requireAuth(
  request: Request,
  env: Env,
  options?: {
    customAdapter?: IAuthService;
  },
): Promise<{
  user: AuthUser;
  session: AuthSession | null;
  headers: Headers;
}> {
  const { authService, responseHeaders } = createAuthService(
    request,
    env,
    options?.customAdapter,
  );

  const user = await authService.getCurrentUser();

  if (!user) {
    const url = new URL(request.url);
    const destination = url.pathname + url.search;
    const loginTarget =
      destination !== "/" && destination !== "/app"
        ? `/login?redirectTo=${encodeURIComponent(destination)}`
        : "/login";

    throw redirect(loginTarget, {
      headers: responseHeaders,
    });
  }

  const session = await authService.getCurrentSession();

  return {
    user,
    session,
    headers: responseHeaders,
  };
}

/**
 * Server-side helper to optionally retrieve the current user without throwing a redirect.
 */
export async function getOptionalAuth(
  request: Request,
  env: Env,
  options?: {
    customAdapter?: IAuthService;
  },
): Promise<{
  user: AuthUser | null;
  session: AuthSession | null;
  headers: Headers;
}> {
  const { authService, responseHeaders } = createAuthService(
    request,
    env,
    options?.customAdapter,
  );

  const user = await authService.getCurrentUser();
  const session = user ? await authService.getCurrentSession() : null;

  return {
    user,
    session,
    headers: responseHeaders,
  };
}

/**
 * Synchronizes Supabase Auth identity to the application profiles table.
 *
 * Identity Relationship:
 * Supabase Auth user.id → profiles.user_id (UNIQUE)
 *
 * Database Architecture:
 * Worker → Drizzle ORM → pg.Client → Cloudflare Hyperdrive → PostgreSQL
 *
 * Ensures idempotent profile creation with onConflictDoNothing to prevent duplicates.
 */
export async function syncUserProfile(
  hyperdrive: Hyperdrive,
  user: AuthUser,
  displayName?: string | null,
): Promise<Profile | null> {
  try {
    return await withDb(hyperdrive, async (db) => {
      // 1. Fetch existing profile
      const existing = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, user.id))
        .limit(1);

      if (existing.length > 0) {
        return existing[0];
      }

      // 2. Insert if not existing, resolving concurrent inserts gracefully
      const inserted = await db
        .insert(profiles)
        .values({
          userId: user.id,
          email: user.email,
          displayName:
            displayName ??
            ((user.userMetadata?.display_name as string | undefined) || null),
        })
        .onConflictDoNothing({ target: profiles.userId })
        .returning();

      if (inserted.length > 0) {
        return inserted[0];
      }

      // 3. Concurrent race resolved by onConflictDoNothing; return existing record
      const fallback = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, user.id))
        .limit(1);

      return fallback[0] ?? null;
    });
  } catch (error) {
    console.error("Profile synchronization error:", error);
    return null;
  }
}
