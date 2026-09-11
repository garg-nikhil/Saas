import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  IAuthService,
  AuthUser,
  AuthSession,
  SignUpInput,
  SignInInput,
  PasswordResetInput,
  UpdatePasswordInput,
  AuthResult,
} from "./types";

export interface SupabaseAuthOptions {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/**
 * Supabase Auth adapter for Cloudflare Workers SSR.
 *
 * Implements the internal IAuthService interface so that the application
 * never becomes directly coupled to Supabase Auth SDK.
 *
 * Architecture:
 * Application → IAuthService boundary → SupabaseAuthService → Supabase Auth (@supabase/ssr)
 */
export class SupabaseAuthService implements IAuthService {
  private client: SupabaseClient;
  private responseHeaders: Headers;

  constructor(
    request: Request,
    options: SupabaseAuthOptions,
    responseHeaders: Headers = new Headers(),
    customClient?: SupabaseClient,
  ) {
    this.responseHeaders = responseHeaders;

    if (customClient) {
      this.client = customClient;
      return;
    }

    if (!options.supabaseUrl || !options.supabaseAnonKey) {
      throw new Error(
        "SupabaseAuthService requires valid supabaseUrl and supabaseAnonKey.",
      );
    }

    const url = new URL(request.url);
    const isHttps = url.protocol === "https:";

    this.client = createServerClient(
      options.supabaseUrl,
      options.supabaseAnonKey,
      {
        cookies: {
          getAll() {
            const raw = request.headers.get("Cookie") ?? "";
            return parseCookieHeader(raw);
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
              responseHeaders.append(
                "Set-Cookie",
                serializeCookieHeader(name, value, {
                  ...cookieOptions,
                  path: cookieOptions?.path ?? "/",
                  sameSite: cookieOptions?.sameSite ?? "lax",
                  secure: isHttps || process.env.NODE_ENV === "production",
                }),
              );
            });
          },
        },
      },
    );
  }

  /**
   * Retrieves and cryptographically validates the current authenticated user on the server.
   * Does NOT trust unvalidated client JWTs.
   */
  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const { data, error } = await this.client.auth.getUser();
      if (error || !data?.user) {
        return null;
      }
      return {
        id: data.user.id,
        email: data.user.email ?? null,
        userMetadata: data.user.user_metadata,
      };
    } catch {
      return null;
    }
  }

  /**
   * Retrieves the current authentication session.
   */
  async getCurrentSession(): Promise<AuthSession | null> {
    try {
      const { data, error } = await this.client.auth.getSession();
      if (error || !data?.session) {
        return null;
      }
      return {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
        user: {
          id: data.session.user.id,
          email: data.session.user.email ?? null,
          userMetadata: data.session.user.user_metadata,
        },
      };
    } catch {
      return null;
    }
  }

  /**
   * Registers a new user with Supabase Auth.
   */
  async signUp(
    input: SignUpInput,
  ): Promise<
    AuthResult<{ user: AuthUser | null; session: AuthSession | null }>
  > {
    try {
      const { data, error } = await this.client.auth.signUp({
        email: input.email,
        password: input.password,
        options: input.displayName
          ? { data: { display_name: input.displayName } }
          : undefined,
      });

      if (error) {
        return {
          data: null,
          error: {
            message: error.message,
            code: error.code,
            status: error.status,
          },
        };
      }

      return {
        data: {
          user: data.user
            ? {
                id: data.user.id,
                email: data.user.email ?? null,
                userMetadata: data.user.user_metadata,
              }
            : null,
          session: data.session
            ? {
                accessToken: data.session.access_token,
                refreshToken: data.session.refresh_token,
                expiresAt: data.session.expires_at,
                user: {
                  id: data.session.user.id,
                  email: data.session.user.email ?? null,
                  userMetadata: data.session.user.user_metadata,
                },
              }
            : null,
        },
        error: null,
      };
    } catch (err: unknown) {
      return {
        data: null,
        error: {
          message:
            err instanceof Error ? err.message : "Une erreur inattendue est survenue lors de l'inscription.",
        },
      };
    }
  }

  /**
   * Authenticates an existing user.
   * Returns a generic safe error message to prevent user enumeration.
   */
  async signIn(
    input: SignInInput,
  ): Promise<AuthResult<{ user: AuthUser; session: AuthSession }>> {
    try {
      const { data, error } = await this.client.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });

      if (error || !data.user || !data.session) {
        return {
          data: null,
          error: {
            message: "Identifiants invalides. Veuillez vérifier votre adresse email et votre mot de passe.",
            code: "invalid_credentials",
            status: 400,
          },
        };
      }

      return {
        data: {
          user: {
            id: data.user.id,
            email: data.user.email ?? null,
            userMetadata: data.user.user_metadata,
          },
          session: {
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
            expiresAt: data.session.expires_at,
            user: {
              id: data.session.user.id,
              email: data.session.user.email ?? null,
              userMetadata: data.session.user.user_metadata,
            },
          },
        },
        error: null,
      };
    } catch {
      return {
        data: null,
        error: {
          message: "Identifiants invalides. Veuillez vérifier votre adresse email et votre mot de passe.",
          code: "invalid_credentials",
          status: 400,
        },
      };
    }
  }

  /**
   * Logs out the current session and instructs Supabase Auth to invalidate tokens.
   */
  async signOut(): Promise<AuthResult<void>> {
    try {
      const { error } = await this.client.auth.signOut();
      if (error) {
        return {
          data: null,
          error: {
            message: error.message,
            code: error.code,
            status: error.status,
          },
        };
      }
      return { data: undefined, error: null };
    } catch (err: unknown) {
      return {
        data: null,
        error: {
          message:
            err instanceof Error ? err.message : "Erreur lors de la déconnexion.",
        },
      };
    }
  }

  /**
   * Requests a password reset link.
   * Note: Always returns generic success for security unless an internal service error occurs.
   */
  async requestPasswordReset(
    input: PasswordResetInput,
  ): Promise<AuthResult<void>> {
    try {
      const { error } = await this.client.auth.resetPasswordForEmail(
        input.email,
        {
          redirectTo: input.redirectTo,
        },
      );

      // Do not leak whether user exists (status 400 or 422 for non-existent users)
      if (error && error.status !== 400 && error.status !== 422) {
        return {
          data: null,
          error: {
            message: "Une erreur temporaire est survenue. Veuillez réessayer.",
            code: error.code,
            status: error.status,
          },
        };
      }

      return { data: undefined, error: null };
    } catch {
      return {
        data: null,
        error: {
          message: "Une erreur temporaire est survenue. Veuillez réessayer.",
        },
      };
    }
  }

  /**
   * Updates the password for the current recovery/authenticated session.
   */
  async updatePassword(
    input: UpdatePasswordInput,
  ): Promise<AuthResult<void>> {
    try {
      const { error } = await this.client.auth.updateUser({
        password: input.newPassword,
      });

      if (error) {
        return {
          data: null,
          error: {
            message: error.message,
            code: error.code,
            status: error.status,
          },
        };
      }

      return { data: undefined, error: null };
    } catch (err: unknown) {
      return {
        data: null,
        error: {
          message:
            err instanceof Error ? err.message : "Erreur lors de la mise à jour du mot de passe.",
        },
      };
    }
  }

  /**
   * Verifies an OTP or email confirmation token.
   */
  async verifyOtp(
    input: { email: string; token: string; type?: "signup" | "recovery" | "email_change" },
  ): Promise<AuthResult<{ user: AuthUser; session: AuthSession }>> {
    try {
      const { data, error } = await this.client.auth.verifyOtp({
        email: input.email,
        token: input.token,
        type: input.type ?? "signup",
      });

      if (error || !data.user || !data.session) {
        return {
          data: null,
          error: {
            message: error?.message || "Code ou jeton de vérification invalide ou expiré.",
            code: error?.code || "invalid_token",
            status: error?.status || 400,
          },
        };
      }

      return {
        data: {
          user: {
            id: data.user.id,
            email: data.user.email ?? null,
            userMetadata: data.user.user_metadata,
          },
          session: {
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
            expiresAt: data.session.expires_at,
            user: {
              id: data.session.user.id,
              email: data.session.user.email ?? null,
              userMetadata: data.session.user.user_metadata,
            },
          },
        },
        error: null,
      };
    } catch (err: unknown) {
      return {
        data: null,
        error: {
          message:
            err instanceof Error ? err.message : "Erreur lors de la vérification de l'email.",
        },
      };
    }
  }

  /**
   * Resends verification email.
   */
  async resendVerification(
    input: { email: string; type?: "signup" | "email_change" },
  ): Promise<AuthResult<void>> {
    try {
      const { error } = await this.client.auth.resend({
        type: input.type ?? "signup",
        email: input.email,
      });

      if (error) {
        return {
          data: null,
          error: {
            message: error.message,
            code: error.code,
            status: error.status,
          },
        };
      }

      return { data: undefined, error: null };
    } catch (err: unknown) {
      return {
        data: null,
        error: {
          message:
            err instanceof Error ? err.message : "Erreur lors de l'envoi de l'email de confirmation.",
        },
      };
    }
  }
}
