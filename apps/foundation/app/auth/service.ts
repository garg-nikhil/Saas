import { redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Env } from "../context";
import { withDb } from "../db/client";
import { profiles, type Profile } from "../db/schema/profiles";
import { SupabaseAuthService } from "./supabase.server";
import type {
  AuthSession,
  AuthUser,
  AuthResult,
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

  const lowerUrl = trimmedUrl.toLowerCase();
  const lowerKey = trimmedKey.toLowerCase();

  // Filter out placeholder domains and dummy values
  const placeholderPatterns = [
    "placeholder-project",
    "placeholder-anon-key",
    "your-project-id",
    "your-supabase-anon-key",
    "placeholder",
    "dummy",
    "example.com",
    "supabase.co/placeholder",
  ];

  for (const pattern of placeholderPatterns) {
    if (lowerUrl.includes(pattern) || lowerKey.includes(pattern)) {
      return false;
    }
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

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/**
 * Resolves valid Supabase configuration from Worker environment or process.env,
 * strictly ignoring placeholder or missing credentials.
 */
export function resolveSupabaseConfig(env?: Env): SupabaseConfig | null {
  // 1. Prefer runtime Cloudflare Worker env
  if (
    env?.SUPABASE_URL &&
    env?.SUPABASE_ANON_KEY &&
    isSupabaseConfigured(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  ) {
    return {
      supabaseUrl: env.SUPABASE_URL.trim(),
      supabaseAnonKey: env.SUPABASE_ANON_KEY.trim(),
    };
  }

  // 2. Check Node / preview runtime environment
  if (
    typeof process !== "undefined" &&
    process.env?.SUPABASE_URL &&
    process.env?.SUPABASE_ANON_KEY &&
    isSupabaseConfigured(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  ) {
    return {
      supabaseUrl: process.env.SUPABASE_URL.trim(),
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY.trim(),
    };
  }

  return null;
}

/**
 * Unconfigured authentication service adapter.
 * Returns safe French error messages and HTTP 503 semantics when Supabase credentials are missing or placeholders.
 */
export class UnconfiguredAuthService implements IAuthService {
  private responseHeaders: Headers;

  constructor(responseHeaders: Headers = new Headers()) {
    this.responseHeaders = responseHeaders;
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    return null;
  }

  async getCurrentSession(): Promise<AuthSession | null> {
    return null;
  }

  async signUp(): Promise<AuthResult<{ user: AuthUser | null; session: AuthSession | null }>> {
    return {
      data: null,
      error: {
        message: "Le service d'authentification n'est pas encore configuré.",
        code: "auth_not_configured",
        status: 503,
      },
    };
  }

  async signIn(): Promise<AuthResult<{ user: AuthUser; session: AuthSession }>> {
    return {
      data: null,
      error: {
        message: "Le service d'authentification n'est pas encore configuré.",
        code: "auth_not_configured",
        status: 503,
      },
    };
  }

  async signOut(): Promise<AuthResult<void>> {
    return {
      data: undefined,
      error: null,
    };
  }

  async requestPasswordReset(): Promise<AuthResult<void>> {
    return {
      data: null,
      error: {
        message: "Le service d'authentification n'est pas encore configuré.",
        code: "auth_not_configured",
        status: 503,
      },
    };
  }

  async updatePassword(): Promise<AuthResult<void>> {
    return {
      data: null,
      error: {
        message: "Le service d'authentification n'est pas encore configuré.",
        code: "auth_not_configured",
        status: 503,
      },
    };
  }

  async verifyOtp(): Promise<AuthResult<{ user: AuthUser; session: AuthSession }>> {
    return {
      data: null,
      error: {
        message: "Le service d'authentification n'est pas encore configuré.",
        code: "auth_not_configured",
        status: 503,
      },
    };
  }

  async resendVerification(): Promise<AuthResult<void>> {
    return {
      data: null,
      error: {
        message: "Le service d'authentification n'est pas encore configuré.",
        code: "auth_not_configured",
        status: 503,
      },
    };
  }
}

/**
 * Creates the internal AuthService boundary instance for the current request.
 *
 * Encapsulates the responseHeaders collector to capture Set-Cookie headers
 * produced during authentication state changes.
 */
export function createAuthService(
  request: Request,
  env?: Env,
  customAdapter?: IAuthService,
): AuthServiceResult {
  const responseHeaders = new Headers();

  if (customAdapter) {
    return {
      authService: customAdapter,
      responseHeaders,
    };
  }

  const config = resolveSupabaseConfig(env);

  if (config) {
    const authService = new SupabaseAuthService(
      request,
      config,
      responseHeaders,
    );

    return {
      authService,
      responseHeaders,
    };
  }

  // When unconfigured, return UnconfiguredAuthService with 503 French error semantics
  return {
    authService: new UnconfiguredAuthService(responseHeaders),
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
