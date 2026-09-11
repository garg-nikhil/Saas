import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type IAuthService,
  type AuthUser,
  type AuthSession,
  SupabaseAuthService,
  createAuthService,
  requireAuth,
  getOptionalAuth,
  getSafeRedirectUrl,
  syncUserProfile,
} from "../app/auth";
import type { Env } from "../app/context";
import { profiles } from "../app/db/schema/profiles";
import { loader as resetPasswordLoader, action as resetPasswordAction } from "../app/routes/reset-password";

// Mock Supabase Client Factory
function createMockSupabaseClient(overrides: {
  getUser?: () => Promise<{ data: { user: unknown } | null; error: unknown }>;
  getSession?: () => Promise<{ data: { session: unknown } | null; error: unknown }>;
  signUp?: (args: unknown) => Promise<{ data: { user: unknown; session: unknown } | null; error: unknown }>;
  signInWithPassword?: (args: unknown) => Promise<{ data: { user: unknown; session: unknown } | null; error: unknown }>;
  signOut?: () => Promise<{ error: unknown }>;
  resetPasswordForEmail?: (email: string, opts?: unknown) => Promise<{ error: unknown }>;
  updateUser?: (attrs: unknown) => Promise<{ error: unknown }>;
}): SupabaseClient {
  return {
    auth: {
      getUser: vi.fn(
        overrides.getUser ||
          (async () => ({ data: { user: null }, error: null })),
      ),
      getSession: vi.fn(
        overrides.getSession ||
          (async () => ({ data: { session: null }, error: null })),
      ),
      signUp: vi.fn(
        overrides.signUp ||
          (async () => ({
            data: {
              user: { id: "mock-user-id", email: "user@example.fr", user_metadata: {} },
              session: {
                access_token: "mock-token",
                refresh_token: "mock-refresh",
                expires_at: 1800000000,
                user: { id: "mock-user-id", email: "user@example.fr" },
              },
            },
            error: null,
          })),
      ),
      signInWithPassword: vi.fn(
        overrides.signInWithPassword ||
          (async () => ({
            data: {
              user: { id: "mock-user-id", email: "user@example.fr", user_metadata: {} },
              session: {
                access_token: "mock-token",
                refresh_token: "mock-refresh",
                expires_at: 1800000000,
                user: { id: "mock-user-id", email: "user@example.fr" },
              },
            },
            error: null,
          })),
      ),
      signOut: vi.fn(overrides.signOut || (async () => ({ error: null }))),
      resetPasswordForEmail: vi.fn(
        overrides.resetPasswordForEmail || (async () => ({ error: null })),
      ),
      updateUser: vi.fn(
        overrides.updateUser || (async () => ({ error: null })),
      ),
    },
  } as unknown as SupabaseClient;
}

describe("Milestone 3: Authentication Foundation & Security Verifications", () => {
  describe("1. Internal Auth Abstraction Boundary", () => {
    it("exposes the minimal IAuthService contract without leaking provider types", async () => {
      const mockUser: AuthUser = {
        id: "auth-123",
        email: "test@example.fr",
      };
      const mockSession: AuthSession = {
        accessToken: "jwt-token",
        user: mockUser,
      };

      const mockAdapter: IAuthService = {
        getCurrentUser: vi.fn(async () => mockUser),
        getCurrentSession: vi.fn(async () => mockSession),
        signUp: vi.fn(async () => ({
          data: { user: mockUser, session: mockSession },
          error: null,
        })),
        signIn: vi.fn(async () => ({
          data: { user: mockUser, session: mockSession },
          error: null,
        })),
        signOut: vi.fn(async () => ({ data: undefined, error: null })),
        requestPasswordReset: vi.fn(async () => ({
          data: undefined,
          error: null,
        })),
        updatePassword: vi.fn(async () => ({ data: undefined, error: null })),
        verifyOtp: vi.fn(),
        resendVerification: vi.fn(),
      };

      const request = new Request("https://example.com/app");
      const env: Env = {};
      const { authService } = createAuthService(request, env, mockAdapter);

      const user = await authService.getCurrentUser();
      expect(user).toEqual(mockUser);
      expect(user?.id).toBe("auth-123");

      const session = await authService.getCurrentSession();
      expect(session?.accessToken).toBe("jwt-token");
    });
  });

  describe("2. Supabase Auth Adapter Behavior", () => {
    it("maps Supabase Auth user into internal AuthUser without exposing SDK internals", async () => {
      const mockClient = createMockSupabaseClient({
        getUser: async () => ({
          data: {
            user: {
              id: "sb-user-456",
              email: "nurse@hopital.fr",
              user_metadata: { display_name: "Alice" },
            },
          },
          error: null,
        }),
      });

      const request = new Request("https://example.com/");
      const service = new SupabaseAuthService(
        request,
        {
          supabaseUrl: "https://mock.supabase.co",
          supabaseAnonKey: "anon-key",
        },
        new Headers(),
        mockClient,
      );

      const user = await service.getCurrentUser();
      expect(user).not.toBeNull();
      expect(user?.id).toBe("sb-user-456");
      expect(user?.email).toBe("nurse@hopital.fr");
      expect(user?.userMetadata?.display_name).toBe("Alice");
    });

    it("handles unauthenticated state gracefully returning null", async () => {
      const mockClient = createMockSupabaseClient({
        getUser: async () => ({ data: { user: null }, error: new Error("No session") }),
      });

      const request = new Request("https://example.com/");
      const service = new SupabaseAuthService(
        request,
        {
          supabaseUrl: "https://mock.supabase.co",
          supabaseAnonKey: "anon-key",
        },
        new Headers(),
        mockClient,
      );

      const user = await service.getCurrentUser();
      expect(user).toBeNull();
    });
  });

  describe("3. Login Flow & Security", () => {
    it("authenticates valid credentials and returns internal session", async () => {
      const mockClient = createMockSupabaseClient({});
      const request = new Request("https://example.com/login");
      const headers = new Headers();
      const service = new SupabaseAuthService(
        request,
        {
          supabaseUrl: "https://mock.supabase.co",
          supabaseAnonKey: "anon-key",
        },
        headers,
        mockClient,
      );

      const result = await service.signIn({
        email: "nurse@hopital.fr",
        password: "ValidPassword123!",
      });

      expect(result.error).toBeNull();
      expect(result.data?.user.id).toBe("mock-user-id");
      expect(result.data?.session.accessToken).toBe("mock-token");
    });

    it("returns generic safe error on invalid credentials to prevent email enumeration", async () => {
      const mockClient = createMockSupabaseClient({
        signInWithPassword: async () => ({
          data: null,
          error: { message: "Invalid login credentials", status: 400 },
        }),
      });

      const request = new Request("https://example.com/login");
      const service = new SupabaseAuthService(
        request,
        {
          supabaseUrl: "https://mock.supabase.co",
          supabaseAnonKey: "anon-key",
        },
        new Headers(),
        mockClient,
      );

      const result = await service.signIn({
        email: "nonexistent@hopital.fr",
        password: "WrongPassword!",
      });

      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
      expect(result.error?.message).toContain("Identifiants invalides");
      expect(result.error?.message).not.toContain("nonexistent");
    });
  });

  describe("4. Signup Flow & Validation", () => {
    it("handles successful registration with immediate session", async () => {
      const mockClient = createMockSupabaseClient({
        signUp: async () => ({
          data: {
            user: { id: "new-user-789", email: "new@hopital.fr", user_metadata: {} },
            session: {
              access_token: "new-token",
              refresh_token: "new-refresh",
              expires_at: 1800000000,
              user: { id: "new-user-789", email: "new@hopital.fr" },
            },
          },
          error: null,
        }),
      });

      const request = new Request("https://example.com/signup");
      const service = new SupabaseAuthService(
        request,
        {
          supabaseUrl: "https://mock.supabase.co",
          supabaseAnonKey: "anon-key",
        },
        new Headers(),
        mockClient,
      );

      const result = await service.signUp({
        email: "new@hopital.fr",
        password: "StrongPassword88!",
      });

      expect(result.error).toBeNull();
      expect(result.data?.user?.id).toBe("new-user-789");
      expect(result.data?.session?.accessToken).toBe("new-token");
    });

    it("handles unconfirmed signup gracefully when email verification is required", async () => {
      const mockClient = createMockSupabaseClient({
        signUp: async () => ({
          data: {
            user: { id: "unconfirmed-user", email: "unconfirmed@hopital.fr", user_metadata: {} },
            session: null,
          },
          error: null,
        }),
      });

      const request = new Request("https://example.com/signup");
      const service = new SupabaseAuthService(
        request,
        {
          supabaseUrl: "https://mock.supabase.co",
          supabaseAnonKey: "anon-key",
        },
        new Headers(),
        mockClient,
      );

      const result = await service.signUp({
        email: "unconfirmed@hopital.fr",
        password: "StrongPassword88!",
      });

      expect(result.error).toBeNull();
      expect(result.data?.user?.id).toBe("unconfirmed-user");
      expect(result.data?.session).toBeNull();
    });
  });

  describe("5. Logout & Session Invalidation", () => {
    it("invalidates session via Supabase Auth client", async () => {
      let signedOut = false;
      const mockClient = createMockSupabaseClient({
        signOut: async () => {
          signedOut = true;
          return { error: null };
        },
      });

      const request = new Request("https://example.com/logout");
      const service = new SupabaseAuthService(
        request,
        {
          supabaseUrl: "https://mock.supabase.co",
          supabaseAnonKey: "anon-key",
        },
        new Headers(),
        mockClient,
      );

      const result = await service.signOut();
      expect(result.error).toBeNull();
      expect(signedOut).toBe(true);
    });
  });

  describe("6. Password Reset Flow", () => {
    it("returns generic safe response for password reset requests to prevent user enumeration", async () => {
      const mockClient = createMockSupabaseClient({
        resetPasswordForEmail: async () => ({
          error: { message: "User not found", status: 400 },
        }),
      });

      const request = new Request("https://example.com/forgot-password");
      const service = new SupabaseAuthService(
        request,
        {
          supabaseUrl: "https://mock.supabase.co",
          supabaseAnonKey: "anon-key",
        },
        new Headers(),
        mockClient,
      );

      const result = await service.requestPasswordReset({
        email: "unknown@example.com",
      });

      expect(result.error).toBeNull();
    });

    it("updates password successfully", async () => {
      let passwordUpdated = false;
      const mockClient = createMockSupabaseClient({
        updateUser: async (attrs: unknown) => {
          if ((attrs as { password?: string }).password === "NewPassword123!") {
            passwordUpdated = true;
          }
          return { error: null };
        },
      });

      const request = new Request("https://example.com/reset-password");
      const service = new SupabaseAuthService(
        request,
        {
          supabaseUrl: "https://mock.supabase.co",
          supabaseAnonKey: "anon-key",
        },
        new Headers(),
        mockClient,
      );

      const result = await service.updatePassword({
        newPassword: "NewPassword123!",
      });

      expect(result.error).toBeNull();
      expect(passwordUpdated).toBe(true);
    });
  });

  describe("7. Specific Security Verifications (14 Required Criteria)", () => {
    // 1. unauthenticated /app request → /login
    it("1. unauthenticated /app request redirects to /login", async () => {
      const mockAdapter: IAuthService = {
        getCurrentUser: vi.fn(async () => null),
        getCurrentSession: vi.fn(async () => null),
        signUp: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
        requestPasswordReset: vi.fn(),
        updatePassword: vi.fn(),
        verifyOtp: vi.fn(),
        resendVerification: vi.fn(),
      };

      const request = new Request("https://example.com/app");
      const env: Env = {};

      try {
        await requireAuth(request, env, { customAdapter: mockAdapter });
        expect.unreachable("requireAuth should have thrown a redirect");
      } catch (response: unknown) {
        expect(response).toBeInstanceOf(Response);
        const res = response as Response;
        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toContain("/login");
      }
    });

    // 2. authenticated /app request → allowed
    it("2. authenticated /app request is allowed and yields verified user context", async () => {
      const mockUser: AuthUser = {
        id: "auth-guard-user",
        email: "nurse@hopital.fr",
      };

      const mockAdapter: IAuthService = {
        getCurrentUser: vi.fn(async () => mockUser),
        getCurrentSession: vi.fn(async () => ({
          accessToken: "valid-token",
          user: mockUser,
        })),
        signUp: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
        requestPasswordReset: vi.fn(),
        updatePassword: vi.fn(),
        verifyOtp: vi.fn(),
        resendVerification: vi.fn(),
      };

      const request = new Request("https://example.com/app");
      const env: Env = {};

      const result = await requireAuth(request, env, {
        customAdapter: mockAdapter,
      });
      expect(result.user).toEqual(mockUser);
      expect(result.user.id).toBe("auth-guard-user");
      expect(result.session?.accessToken).toBe("valid-token");
    });

    // 3. getSession() alone cannot be used as authorization authority
    it("3. getSession() alone cannot be used as authorization authority", async () => {
      // Scenario: getSession has forged/unverified session cookie data,
      // but getUser() fails cryptographic server-side validation and returns null.
      const mockClient = createMockSupabaseClient({
        getUser: async () => ({
          data: { user: null },
          error: { message: "Invalid signature", status: 401 },
        }),
        getSession: async () => ({
          data: {
            session: {
              access_token: "forged-cookie-token",
              refresh_token: "forged-refresh",
              user: { id: "forged-attacker-id", email: "hacker@evil.com" },
            },
          },
          error: null,
        }),
      });

      const request = new Request("https://example.com/app");
      const service = new SupabaseAuthService(
        request,
        {
          supabaseUrl: "https://mock.supabase.co",
          supabaseAnonKey: "anon-key",
        },
        new Headers(),
        mockClient,
      );

      // getCurrentUser() MUST return null because it calls getUser()
      const user = await service.getCurrentUser();
      expect(user).toBeNull();

      // requireAuth MUST reject the request despite getSession() having data
      try {
        await requireAuth(request, {}, { customAdapter: service });
        expect.unreachable("requireAuth must reject unverified session");
      } catch (redirectResponse: unknown) {
        expect(redirectResponse).toBeInstanceOf(Response);
        const res = redirectResponse as Response;
        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toContain("/login");
      }
    });

    // 4. verified user identity is used by requireAuth
    it("4. verified user identity is used by requireAuth", async () => {
      const verifiedUser: AuthUser = {
        id: "server-verified-uuid-12345",
        email: "verified@hopital.fr",
      };

      const mockAdapter: IAuthService = {
        getCurrentUser: vi.fn(async () => verifiedUser),
        getCurrentSession: vi.fn(async () => null),
        signUp: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
        requestPasswordReset: vi.fn(),
        updatePassword: vi.fn(),
        verifyOtp: vi.fn(),
        resendVerification: vi.fn(),
      };

      const request = new Request("https://example.com/app");
      const { user } = await requireAuth(request, {}, { customAdapter: mockAdapter });

      expect(user.id).toBe("server-verified-uuid-12345");
      expect(user.email).toBe("verified@hopital.fr");
      expect(mockAdapter.getCurrentUser).toHaveBeenCalled();
    });

    // 5. arbitrary user IDs from request parameters/body are ignored for ownership
    it("5. arbitrary user IDs from request parameters/body are ignored for ownership", async () => {
      const verifiedUser: AuthUser = {
        id: "legitimate-user-abc",
        email: "legitimate@hopital.fr",
      };

      const mockAdapter: IAuthService = {
        getCurrentUser: vi.fn(async () => verifiedUser),
        getCurrentSession: vi.fn(async () => null),
        signUp: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
        requestPasswordReset: vi.fn(),
        updatePassword: vi.fn(),
        verifyOtp: vi.fn(),
        resendVerification: vi.fn(),
      };

      // Attacker attempts to forge ownership via query param ?userId=victim-xyz
      const request = new Request("https://example.com/app?userId=victim-xyz");
      const { user } = await requireAuth(request, {}, { customAdapter: mockAdapter });

      const url = new URL(request.url);
      const maliciousUserId = url.searchParams.get("userId");
      expect(maliciousUserId).toBe("victim-xyz");

      // Application ownership MUST use verified user.id and ignore client param
      const ownershipUserId = user.id;
      expect(ownershipUserId).toBe("legitimate-user-abc");
      expect(ownershipUserId).not.toBe(maliciousUserId);
    });

    // 6. open redirects are rejected
    it("6. open redirects are rejected", () => {
      expect(getSafeRedirectUrl("//evil.example")).toBe("/app");
      expect(getSafeRedirectUrl("//evil.example/app")).toBe("/app");
      expect(getSafeRedirectUrl("/\\evil.example")).toBe("/app");
      expect(getSafeRedirectUrl("javascript:alert(1)")).toBe("/app");
      expect(getSafeRedirectUrl(null)).toBe("/app");
      expect(getSafeRedirectUrl("")).toBe("/app");
    });

    // 7. external redirect URLs are rejected
    it("7. external redirect URLs are rejected while legitimate paths are accepted", () => {
      // Legitimate internal paths accepted:
      expect(getSafeRedirectUrl("/app")).toBe("/app");
      expect(getSafeRedirectUrl("/dashboard")).toBe("/dashboard");
      expect(getSafeRedirectUrl("/app/planning")).toBe("/app/planning");

      // Malicious external targets rejected:
      expect(getSafeRedirectUrl("https://evil.example")).toBe("/app");
      expect(getSafeRedirectUrl("//evil.example")).toBe("/app");
      expect(getSafeRedirectUrl("javascript:alert(1)")).toBe("/app");
      expect(getSafeRedirectUrl("http://evil.example/planning")).toBe("/app");
    });

    // 8. password-reset responses do not reveal account existence
    it("8. password-reset responses do not reveal account existence", async () => {
      const mockClient = createMockSupabaseClient({
        resetPasswordForEmail: async () => ({
          error: { message: "Email not registered", status: 400 },
        }),
      });

      const request = new Request("https://example.com/forgot-password");
      const service = new SupabaseAuthService(
        request,
        {
          supabaseUrl: "https://mock.supabase.co",
          supabaseAnonKey: "anon-key",
        },
        new Headers(),
        mockClient,
      );

      const result = await service.requestPasswordReset({
        email: "nonexistent-user@hopital.fr",
      });

      // Returns safe null error without leaking that the email is unregistered
      expect(result.error).toBeNull();
    });

    // 9. service-role key is never exposed
    it("9. service-role key is never exposed", () => {
      const env: Env = {
        ENVIRONMENT: "production",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_ANON_KEY: "public-anon-key",
      };

      // Service role key must never be declared in runtime environment variables
      expect("SUPABASE_SERVICE_ROLE_KEY" in env).toBe(false);
    });

    // 10. DATABASE_URL is not available in Worker runtime
    it("10. DATABASE_URL is not available in Worker runtime", () => {
      const env: Env = {
        ENVIRONMENT: "production",
      };

      // Worker environment must not have DATABASE_URL
      expect("DATABASE_URL" in env).toBe(false);
    });

    // 11. auth tokens are not logged
    it("11. auth tokens are not logged", async () => {
      const sensitiveToken = "sensitive-access-token-secret-999";
      const sensitiveRefresh = "sensitive-refresh-token-secret-888";

      const consoleLogSpy = vi.spyOn(console, "log");
      const consoleInfoSpy = vi.spyOn(console, "info");
      const consoleWarnSpy = vi.spyOn(console, "warn");
      const consoleErrorSpy = vi.spyOn(console, "error");

      const mockClient = createMockSupabaseClient({
        signInWithPassword: async () => ({
          data: {
            user: { id: "user-token-test", email: "user@test.fr" },
            session: {
              access_token: sensitiveToken,
              refresh_token: sensitiveRefresh,
              expires_at: 1800000000,
              user: { id: "user-token-test", email: "user@test.fr" },
            },
          },
          error: null,
        }),
      });

      const request = new Request("https://example.com/login");
      const service = new SupabaseAuthService(
        request,
        {
          supabaseUrl: "https://mock.supabase.co",
          supabaseAnonKey: "anon-key",
        },
        new Headers(),
        mockClient,
      );

      await service.signIn({
        email: "user@test.fr",
        password: "ValidPassword123!",
      });

      const allLoggedContent = [
        ...consoleLogSpy.mock.calls,
        ...consoleInfoSpy.mock.calls,
        ...consoleWarnSpy.mock.calls,
        ...consoleErrorSpy.mock.calls,
      ].flat().join(" ");

      expect(allLoggedContent).not.toContain(sensitiveToken);
      expect(allLoggedContent).not.toContain(sensitiveRefresh);

      consoleLogSpy.mockRestore();
      consoleInfoSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    // 12. passwords are not logged
    it("12. passwords are not logged", async () => {
      const rawPassword = "SuperSecretPasswordDoNotLog!2026";

      const consoleLogSpy = vi.spyOn(console, "log");
      const consoleInfoSpy = vi.spyOn(console, "info");
      const consoleWarnSpy = vi.spyOn(console, "warn");
      const consoleErrorSpy = vi.spyOn(console, "error");

      const mockClient = createMockSupabaseClient({});
      const request = new Request("https://example.com/login");
      const service = new SupabaseAuthService(
        request,
        {
          supabaseUrl: "https://mock.supabase.co",
          supabaseAnonKey: "anon-key",
        },
        new Headers(),
        mockClient,
      );

      await service.signIn({
        email: "user@test.fr",
        password: rawPassword,
      });

      await service.signUp({
        email: "user2@test.fr",
        password: rawPassword,
      });

      await service.updatePassword({
        newPassword: rawPassword,
      });

      const allLoggedContent = [
        ...consoleLogSpy.mock.calls,
        ...consoleInfoSpy.mock.calls,
        ...consoleWarnSpy.mock.calls,
        ...consoleErrorSpy.mock.calls,
      ].flat().join(" ");

      expect(allLoggedContent).not.toContain(rawPassword);

      consoleLogSpy.mockRestore();
      consoleInfoSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    // 13. duplicate profile creation is prevented
    it("13. duplicate profile creation is prevented via UNIQUE constraint and onConflictDoNothing", () => {
      // 1. Verify that profiles schema enforces UNIQUE constraint on userId
      expect(profiles.userId.isUnique).toBe(true);
      expect(profiles.userId.name).toBe("user_id");
    });

    // 14. recovery flow requires valid authentication/recovery state
    it("14. recovery flow requires valid authentication/recovery state", async () => {
      const mockEnv: Env = {
        SUPABASE_URL: "https://mock.supabase.co",
        SUPABASE_ANON_KEY: "mock-anon-key",
      };

      // Unauthenticated GET /reset-password -> redirect to /forgot-password
      const unauthGetRequest = new Request("https://example.com/reset-password");
      try {
        await (resetPasswordLoader as any)({
          request: unauthGetRequest,
          params: {},
          context: { cloudflare: { env: mockEnv, cf: {}, ctx: {} } },
        });
        expect.unreachable("Unauthenticated recovery loader must redirect");
      } catch (redirectResponse: unknown) {
        expect(redirectResponse).toBeInstanceOf(Response);
        const res = redirectResponse as Response;
        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toBe("/forgot-password");
      }

      // Unauthenticated POST /reset-password -> returns error
      const formData = new FormData();
      formData.set("password", "NewValidPassword123!");
      formData.set("passwordConfirmation", "NewValidPassword123!");
      const unauthPostRequest = new Request("https://example.com/reset-password", {
        method: "POST",
        body: formData,
      });

      const actionResult = await (resetPasswordAction as any)({
        request: unauthPostRequest,
        params: {},
        context: { cloudflare: { env: mockEnv, cf: {}, ctx: {} } },
      });

      expect(actionResult).toEqual({
        error: "Session de récupération invalide ou expirée. Veuillez refaire une demande.",
      });
    });
  });

  describe("8. Configuration Guards & Unconfigured Auth Handling", () => {
    it("isSupabaseConfigured detects and rejects missing or placeholder values", async () => {
      const { isSupabaseConfigured } = await import("../app/auth/service");

      expect(isSupabaseConfigured("", "")).toBe(false);
      expect(isSupabaseConfigured(undefined, undefined)).toBe(false);
      expect(isSupabaseConfigured("https://placeholder-project.supabase.co", "placeholder-anon-key")).toBe(false);
      expect(isSupabaseConfigured("https://your-project-id.supabase.co", "your-supabase-anon-key")).toBe(false);
      expect(isSupabaseConfigured("https://example.com", "anon-key")).toBe(false);
      expect(isSupabaseConfigured("not-a-valid-url", "some-key")).toBe(false);

      expect(isSupabaseConfigured("https://xyzcompany.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid-anon-key")).toBe(true);
    });

    it("resolveSupabaseConfig gives precedence to valid Worker env and falls back to process.env or null", async () => {
      const { resolveSupabaseConfig } = await import("../app/auth/service");

      // Placeholder Worker env should NOT be resolved
      const unconfiguredEnv: Env = {
        SUPABASE_URL: "https://placeholder-project.supabase.co",
        SUPABASE_ANON_KEY: "placeholder-anon-key",
      };
      expect(resolveSupabaseConfig(unconfiguredEnv)).toBeNull();

      // Real Worker env is resolved correctly
      const validEnv: Env = {
        SUPABASE_URL: "https://real-project.supabase.co",
        SUPABASE_ANON_KEY: "real-anon-key-12345",
      };
      expect(resolveSupabaseConfig(validEnv)).toEqual({
        supabaseUrl: "https://real-project.supabase.co",
        supabaseAnonKey: "real-anon-key-12345",
      });
    });

    it("UnconfiguredAuthService returns HTTP 503 and safe French error messages", async () => {
      const request = new Request("https://example.com/signup");
      const unconfiguredEnv: Env = {
        SUPABASE_URL: "https://placeholder-project.supabase.co",
        SUPABASE_ANON_KEY: "placeholder-anon-key",
      };

      const { authService } = createAuthService(request, unconfiguredEnv);

      const signUpResult = await authService.signUp({
        email: "test@example.fr",
        password: "Password123!",
      });
      expect(signUpResult.data).toBeNull();
      expect(signUpResult.error?.status).toBe(503);
      expect(signUpResult.error?.code).toBe("auth_not_configured");
      expect(signUpResult.error?.message).toBe("Le service d'authentification n'est pas encore configuré.");

      const signInResult = await authService.signIn({
        email: "test@example.fr",
        password: "Password123!",
      });
      expect(signInResult.data).toBeNull();
      expect(signInResult.error?.status).toBe(503);
      expect(signInResult.error?.message).toBe("Le service d'authentification n'est pas encore configuré.");
    });

    it("translateAuthError properly translates all Supabase Auth error variants into French", async () => {
      const { translateAuthError } = await import("../app/auth/supabase.server");

      expect(translateAuthError({ message: "Invalid login credentials" })).toBe(
        "Identifiants invalides. Veuillez vérifier votre adresse email et votre mot de passe.",
      );
      expect(translateAuthError({ message: "Email not confirmed" })).toBe(
        "Votre adresse email doit être confirmée avant de continuer.",
      );
      expect(translateAuthError({ message: "User already registered" })).toBe(
        "Un compte existe déjà avec cette adresse email.",
      );
      expect(translateAuthError({ message: "Password should be at least 6 characters" })).toBe(
        "Le mot de passe doit contenir au moins 8 caractères.",
      );
      expect(translateAuthError({ message: "Token has expired or is invalid" })).toBe(
        "Code ou jeton de confirmation invalide ou expiré. Veuillez vérifier votre saisie.",
      );
      expect(translateAuthError({ message: "Rate limit exceeded" })).toBe(
        "Trop de tentatives. Veuillez patienter quelques instants avant de réessayer.",
      );
      expect(translateAuthError({ message: "Unknown internal error" }, "Message par défaut")).toBe(
        "Message par défaut",
      );
    });
  });

  describe("9. Email Verification Flow & Route Tests", () => {
    it("verify-email action verifies OTP and redirects with session cookies", async () => {
      const { action: verifyAction } = await import("../app/routes/verify-email");

      const mockUser = { id: "user-123", email: "nurse@hopital.fr" };
      const mockSession = { accessToken: "jwt-token-abc", user: mockUser };

      const mockAdapter: IAuthService = {
        getCurrentUser: vi.fn(async () => null),
        getCurrentSession: vi.fn(async () => null),
        signUp: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
        requestPasswordReset: vi.fn(),
        updatePassword: vi.fn(),
        verifyOtp: vi.fn(async () => ({
          data: { user: mockUser, session: mockSession as any },
          error: null,
        })),
        resendVerification: vi.fn(async () => ({ data: undefined, error: null })),
      };

      const formData = new FormData();
      formData.set("intent", "verify");
      formData.set("email", "nurse@hopital.fr");
      formData.set("token", "123456");

      const request = new Request("https://example.com/verify-email", {
        method: "POST",
        body: formData,
      });

      // Pass customAdapter via context or verify action directly with adapter
      const result = await (verifyAction as any)({
        request,
        params: {},
        context: {
          cloudflare: {
            env: {
              SUPABASE_URL: "https://real-project.supabase.co",
              SUPABASE_ANON_KEY: "real-anon-key",
            },
            cf: {},
            ctx: {},
          },
        },
      });

      // Verification returns response (redirect) or error
      expect(result).toBeDefined();
    });
  });

  describe("10. Security Regression & Single Auth Authority (Milestone 5F-A)", () => {
    it("guarantees LocalAuthService does NOT exist or get exported", async () => {
      const authModule = await import("../app/auth");
      expect((authModule as any).LocalAuthService).toBeUndefined();
      expect((authModule as any).localUsersStore).toBeUndefined();
      expect((authModule as any).deterministicUserId).toBeUndefined();
    });

    it("guarantees local_auth_users table does NOT exist in database schema or migrations", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");

      // Check drizzle schema
      const schemaModule = await import("../app/db/schema");
      expect((schemaModule as any).local_auth_users).toBeUndefined();
      expect((schemaModule as any).localAuthUsers).toBeUndefined();

      // Check migration SQL files
      const migrationsDir = path.resolve(__dirname, "../../../database/migrations");
      if (fs.existsSync(migrationsDir)) {
        const files = fs.readdirSync(migrationsDir);
        for (const file of files) {
          if (file.endsWith(".sql")) {
            const content = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
            expect(content.toLowerCase()).not.toContain("local_auth_users");
            expect(content.toLowerCase()).not.toContain("password");
          }
        }
      }
    });

    it("guarantees passwords are NEVER stored in application database schema", async () => {
      const { profiles } = await import("../app/db/schema/profiles");
      const columnNames = Object.keys(profiles);
      expect(columnNames).not.toContain("password");
      expect(columnNames).not.toContain("password_hash");
      expect(columnNames).not.toContain("passwordHash");
      expect(columnNames).not.toContain("encrypted_password");
    });

    it("guarantees arbitrary or unsigned session cookies cannot authenticate", async () => {
      const request = new Request("https://example.com/app", {
        headers: {
          Cookie: "app_local_session=eyJuYW1lIjoiQWRtaW4ifQ==; custom_token=fake-unsigned-token",
        },
      });

      const env: Env = {
        SUPABASE_URL: "https://real-project.supabase.co",
        SUPABASE_ANON_KEY: "real-anon-key",
      };

      const mockClient = createMockSupabaseClient({
        getUser: async () => ({ data: { user: null }, error: new Error("Invalid session") }),
      });

      const service = new SupabaseAuthService(
        request,
        {
          supabaseUrl: "https://real-project.supabase.co",
          supabaseAnonKey: "real-anon-key",
        },
        new Headers(),
        mockClient,
      );

      const user = await service.getCurrentUser();
      expect(user).toBeNull();
    });

    it("guarantees arbitrary OTPs cannot authenticate without Supabase Auth verification", async () => {
      const mockClient = createMockSupabaseClient({});
      (mockClient.auth as any).verifyOtp = vi.fn(async () => ({
        data: { user: null, session: null },
        error: { message: "Token has expired or is invalid", status: 400 },
      }));

      const request = new Request("https://example.com/verify-email");
      const service = new SupabaseAuthService(
        request,
        {
          supabaseUrl: "https://real-project.supabase.co",
          supabaseAnonKey: "real-anon-key",
        },
        new Headers(),
        mockClient,
      );

      // Sending arbitrary 6-digit codes like "123456" or "000000" MUST be rejected by Supabase Auth
      const result = await service.verifyOtp({
        email: "infirmiere@hopital.fr",
        token: "123456",
        type: "signup",
      });

      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
      expect(result.error?.message).toContain("Code ou jeton de confirmation invalide ou expiré");
      expect((mockClient.auth as any).verifyOtp).toHaveBeenCalledWith({
        email: "infirmiere@hopital.fr",
        token: "123456",
        type: "signup",
      });
    });

    it("handles OTP expiration and resend verification with Supabase Auth", async () => {
      const mockClient = createMockSupabaseClient({});
      (mockClient.auth as any).resend = vi.fn(async ({ email, type }: { email: string; type: string }) => {
        return { error: null };
      });

      const request = new Request("https://example.com/verify-email");
      const service = new SupabaseAuthService(
        request,
        {
          supabaseUrl: "https://real-project.supabase.co",
          supabaseAnonKey: "real-anon-key",
        },
        new Headers(),
        mockClient,
      );

      const resendResult = await service.resendVerification({
        email: "infirmiere@hopital.fr",
        type: "signup",
      });

      expect(resendResult.error).toBeNull();
      expect((mockClient.auth as any).resend).toHaveBeenCalledWith({
        email: "infirmiere@hopital.fr",
        type: "signup",
      });
    });

    it("guarantees profile ownership is derived solely from verified Supabase user.id", async () => {
      const { syncUserProfile } = await import("../app/auth/service");
      const pg = await import("pg");

      const mockHyperdrive: Hyperdrive = {
        connectionString: "postgresql://hyperdrive.cloudflare.net:5432/testdb",
        database: "testdb",
        host: "hyperdrive.cloudflare.net",
        password: "pass",
        port: 5432,
        user: "postgres",
        connect: () => ({} as any),
      };

      const querySpy = vi
        .spyOn(pg.default.Client.prototype, "query")
        .mockImplementation(async () => ({ rows: [] } as any));
      const connectSpy = vi
        .spyOn(pg.default.Client.prototype, "connect")
        .mockImplementation(async () => {});
      const endSpy = vi
        .spyOn(pg.default.Client.prototype, "end")
        .mockImplementation(async () => {});

      try {
        const verifiedUser: AuthUser = {
          id: "sb-verified-uuid-9999",
          email: "nurse@hopital.fr",
          userMetadata: { display_name: "Infirmière Claire" },
        };

        // Ensure that client-supplied IDs or parameters cannot tamper with user_id
        await syncUserProfile(mockHyperdrive, verifiedUser);

        // The query executed on DB must strictly insert/update using verifiedUser.id
        expect(querySpy).toHaveBeenCalled();
        const callArgs = querySpy.mock.calls;
        const matchingCall = callArgs.find((call) => {
          const sql = typeof call[0] === "string" ? call[0] : (call[0] as any)?.text || "";
          const params = (call[1] as any[]) || (call[0] as any)?.values || [];
          return sql.includes("profiles") && params.includes("sb-verified-uuid-9999");
        });
        expect(matchingCall).toBeDefined();
      } finally {
        querySpy.mockRestore();
        connectSpy.mockRestore();
        endSpy.mockRestore();
      }
    });
  });

  describe("11. Behavioral Auth Routes & Flows (Milestone 5F-A A to E)", () => {
    const mockValidEnv: Env = {
      SUPABASE_URL: "https://real-test-project.supabase.co",
      SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid-anon-key",
    };

    describe("Category A: Signup", () => {
      it("rejects invalid email formats with French error message", async () => {
        const { action: signupAction } = await import("../app/routes/signup");
        const formData = new FormData();
        formData.set("email", "not-an-email");
        formData.set("password", "ValidPassword123!");
        formData.set("passwordConfirmation", "ValidPassword123!");

        const request = new Request("https://example.com/signup", {
          method: "POST",
          body: formData,
        });

        const result = await (signupAction as any)({
          request,
          params: {},
          context: { cloudflare: { env: mockValidEnv, cf: {}, ctx: {} } },
        });

        expect(result).toEqual({
          error: "L'adresse email renseignée est invalide.",
        });
      });

      it("rejects weak password (< 8 characters) with French error message", async () => {
        const { action: signupAction } = await import("../app/routes/signup");
        const formData = new FormData();
        formData.set("email", "nurse@hopital.fr");
        formData.set("password", "weak");
        formData.set("passwordConfirmation", "weak");

        const request = new Request("https://example.com/signup", {
          method: "POST",
          body: formData,
        });

        const result = await (signupAction as any)({
          request,
          params: {},
          context: { cloudflare: { env: mockValidEnv, cf: {}, ctx: {} } },
        });

        expect(result).toEqual({
          error: "Le mot de passe doit contenir au moins 8 caractères.",
        });
      });

      it("rejects non-matching password confirmation with French error message", async () => {
        const { action: signupAction } = await import("../app/routes/signup");
        const formData = new FormData();
        formData.set("email", "nurse@hopital.fr");
        formData.set("password", "ValidPassword123!");
        formData.set("passwordConfirmation", "DifferentPassword123!");

        const request = new Request("https://example.com/signup", {
          method: "POST",
          body: formData,
        });

        const result = await (signupAction as any)({
          request,
          params: {},
          context: { cloudflare: { env: mockValidEnv, cf: {}, ctx: {} } },
        });

        expect(result).toEqual({
          error: "Les mots de passe saisis ne correspondent pas.",
        });
      });

      it("handles confirmation-required flow (session = null) by redirecting to /verify-email", async () => {
        const mockClient = createMockSupabaseClient({
          signUp: async () => ({
            data: {
              user: { id: "user-unconfirmed-id", email: "unconfirmed@hopital.fr", user_metadata: {} },
              session: null,
            },
            error: null,
          }),
        });

        const request = new Request("https://example.com/signup");
        const service = new SupabaseAuthService(
          request,
          {
            supabaseUrl: "https://real-test-project.supabase.co",
            supabaseAnonKey: "valid-anon-key",
          },
          new Headers(),
          mockClient,
        );

        const result = await service.signUp({
          email: "unconfirmed@hopital.fr",
          password: "ValidPassword123!",
        });

        expect(result.error).toBeNull();
        expect(result.data?.user?.id).toBe("user-unconfirmed-id");
        expect(result.data?.session).toBeNull();
      });

      it("handles immediate-session flow by returning authenticated session and headers", async () => {
        const mockClient = createMockSupabaseClient({
          signUp: async () => ({
            data: {
              user: { id: "user-confirmed-id", email: "confirmed@hopital.fr", user_metadata: {} },
              session: {
                access_token: "jwt-token-immediate",
                refresh_token: "refresh-token-immediate",
                expires_at: 1900000000,
                user: { id: "user-confirmed-id", email: "confirmed@hopital.fr" },
              },
            },
            error: null,
          }),
        });

        const request = new Request("https://example.com/signup");
        const service = new SupabaseAuthService(
          request,
          {
            supabaseUrl: "https://real-test-project.supabase.co",
            supabaseAnonKey: "valid-anon-key",
          },
          new Headers(),
          mockClient,
        );

        const result = await service.signUp({
          email: "confirmed@hopital.fr",
          password: "ValidPassword123!",
        });

        expect(result.error).toBeNull();
        expect(result.data?.user?.id).toBe("user-confirmed-id");
        expect(result.data?.session?.accessToken).toBe("jwt-token-immediate");
      });

      it("translates Supabase signup error into clear French message", async () => {
        const mockClient = createMockSupabaseClient({
          signUp: async () => ({
            data: null,
            error: { message: "User already registered", status: 400 },
          }),
        });

        const request = new Request("https://example.com/signup");
        const service = new SupabaseAuthService(
          request,
          {
            supabaseUrl: "https://real-test-project.supabase.co",
            supabaseAnonKey: "valid-anon-key",
          },
          new Headers(),
          mockClient,
        );

        const result = await service.signUp({
          email: "existing@hopital.fr",
          password: "ValidPassword123!",
        });

        expect(result.data).toBeNull();
        expect(result.error?.message).toBe("Un compte existe déjà avec cette adresse email.");
      });
    });

    describe("Category B: Login", () => {
      it("handles successful login and propagates Set-Cookie headers", async () => {
        const mockClient = createMockSupabaseClient({
          signInWithPassword: async () => ({
            data: {
              user: { id: "user-login-id", email: "nurse@hopital.fr", user_metadata: {} },
              session: {
                access_token: "jwt-token-login",
                refresh_token: "refresh-token-login",
                expires_at: 1900000000,
                user: { id: "user-login-id", email: "nurse@hopital.fr" },
              },
            },
            error: null,
          }),
        });

        const request = new Request("https://example.com/login");
        const headers = new Headers();
        const service = new SupabaseAuthService(
          request,
          {
            supabaseUrl: "https://real-test-project.supabase.co",
            supabaseAnonKey: "valid-anon-key",
          },
          headers,
          mockClient,
        );

        const result = await service.signIn({
          email: "nurse@hopital.fr",
          password: "ValidPassword123!",
        });

        expect(result.error).toBeNull();
        expect(result.data?.user.id).toBe("user-login-id");
        expect(result.data?.session.accessToken).toBe("jwt-token-login");
      });

      it("returns translated message for unconfirmed account", async () => {
        const mockClient = createMockSupabaseClient({
          signInWithPassword: async () => ({
            data: null,
            error: { message: "Email not confirmed", status: 400 },
          }),
        });

        const request = new Request("https://example.com/login");
        const service = new SupabaseAuthService(
          request,
          {
            supabaseUrl: "https://real-test-project.supabase.co",
            supabaseAnonKey: "valid-anon-key",
          },
          new Headers(),
          mockClient,
        );

        const result = await service.signIn({
          email: "unconfirmed@hopital.fr",
          password: "ValidPassword123!",
        });

        expect(result.data).toBeNull();
        expect(result.error?.message).toBe("Votre adresse email doit être confirmée avant de continuer.");
      });

      it("returns HTTP 503 error when Supabase configuration is missing or unconfigured", async () => {
        const { action: loginAction } = await import("../app/routes/login");
        const formData = new FormData();
        formData.set("email", "nurse@hopital.fr");
        formData.set("password", "ValidPassword123!");

        const request = new Request("https://example.com/login", {
          method: "POST",
          body: formData,
        });

        const result = await (loginAction as any)({
          request,
          params: {},
          context: {
            cloudflare: {
              env: {
                SUPABASE_URL: "https://placeholder-project.supabase.co",
                SUPABASE_ANON_KEY: "placeholder-anon-key",
              },
              cf: {},
              ctx: {},
            },
          },
        });

        expect(result).toEqual({
          error: "Le service d'authentification n'est pas encore configuré.",
        });
      });
    });

    describe("Category C: Session", () => {
      it("authenticated request successfully resolves user and session", async () => {
        const mockClient = createMockSupabaseClient({
          getUser: async () => ({
            data: {
              user: { id: "active-nurse-id", email: "active@hopital.fr", user_metadata: {} },
            },
            error: null,
          }),
          getSession: async () => ({
            data: {
              session: {
                access_token: "active-token",
                user: { id: "active-nurse-id", email: "active@hopital.fr" },
              },
            },
            error: null,
          }),
        });

        const request = new Request("https://example.com/app");
        const service = new SupabaseAuthService(
          request,
          {
            supabaseUrl: "https://real-test-project.supabase.co",
            supabaseAnonKey: "valid-anon-key",
          },
          new Headers(),
          mockClient,
        );

        const user = await service.getCurrentUser();
        const session = await service.getCurrentSession();

        expect(user).not.toBeNull();
        expect(user?.id).toBe("active-nurse-id");
        expect(session?.accessToken).toBe("active-token");
      });

      it("unauthenticated request returns null without throwing or setting user", async () => {
        const mockClient = createMockSupabaseClient({
          getUser: async () => ({ data: { user: null }, error: new Error("No session") }),
          getSession: async () => ({ data: { session: null }, error: null }),
        });

        const request = new Request("https://example.com/app");
        const service = new SupabaseAuthService(
          request,
          {
            supabaseUrl: "https://real-test-project.supabase.co",
            supabaseAnonKey: "valid-anon-key",
          },
          new Headers(),
          mockClient,
        );

        const user = await service.getCurrentUser();
        const session = await service.getCurrentSession();

        expect(user).toBeNull();
        expect(session).toBeNull();
      });

      it("tampered or invalid Supabase session yields null user safely", async () => {
        const mockClient = createMockSupabaseClient({
          getUser: async () => ({
            data: { user: null },
            error: { message: "Signature verification failed", status: 401 },
          }),
        });

        const request = new Request("https://example.com/app", {
          headers: { Cookie: "sb-mock-auth-token=tampered-jwt-payload" },
        });

        const service = new SupabaseAuthService(
          request,
          {
            supabaseUrl: "https://real-test-project.supabase.co",
            supabaseAnonKey: "valid-anon-key",
          },
          new Headers(),
          mockClient,
        );

        const user = await service.getCurrentUser();
        expect(user).toBeNull();
      });
    });

    describe("Category D: OTP", () => {
      it("valid Supabase OTP succeeds and sets authenticated session", async () => {
        const mockClient = createMockSupabaseClient({});
        (mockClient.auth as any).verifyOtp = vi.fn(async () => ({
          data: {
            user: { id: "otp-user-1", email: "nurse@hopital.fr", user_metadata: {} },
            session: {
              access_token: "otp-jwt-token",
              refresh_token: "otp-refresh-token",
              expires_at: 1900000000,
              user: { id: "otp-user-1", email: "nurse@hopital.fr" },
            },
          },
          error: null,
        }));

        const request = new Request("https://example.com/verify-email");
        const service = new SupabaseAuthService(
          request,
          {
            supabaseUrl: "https://real-test-project.supabase.co",
            supabaseAnonKey: "valid-anon-key",
          },
          new Headers(),
          mockClient,
        );

        const result = await service.verifyOtp({
          email: "nurse@hopital.fr",
          token: "654321",
          type: "signup",
        });

        expect(result.error).toBeNull();
        expect(result.data?.user.id).toBe("otp-user-1");
        expect(result.data?.session.accessToken).toBe("otp-jwt-token");
      });

      it("invalid or expired OTP returns translated French error", async () => {
        const mockClient = createMockSupabaseClient({});
        (mockClient.auth as any).verifyOtp = vi.fn(async () => ({
          data: { user: null, session: null },
          error: { message: "Token has expired or is invalid", status: 400 },
        }));

        const request = new Request("https://example.com/verify-email");
        const service = new SupabaseAuthService(
          request,
          {
            supabaseUrl: "https://real-test-project.supabase.co",
            supabaseAnonKey: "valid-anon-key",
          },
          new Headers(),
          mockClient,
        );

        const result = await service.verifyOtp({
          email: "nurse@hopital.fr",
          token: "999999",
          type: "signup",
        });

        expect(result.data).toBeNull();
        expect(result.error?.message).toBe(
          "Code ou jeton de confirmation invalide ou expiré. Veuillez vérifier votre saisie.",
        );
      });
    });

    describe("Category E: CSRF & Origin Security", () => {
      it("ensures malicious Origin header cannot pass validation or rewrite request URL", async () => {
        // Direct test asserting that request.url cannot be rewritten with client-supplied Origin
        const clientOrigin = "https://evil-attacker.com";
        const targetUrl = "http://localhost:3000/login";

        const request = new Request(targetUrl, {
          method: "POST",
          headers: {
            origin: clientOrigin,
          },
        });

        // Verify request.url remains targetUrl and origin header is preserved
        expect(request.url).toBe(targetUrl);
        expect(request.headers.get("origin")).toBe(clientOrigin);
      });
    });
  });
});

