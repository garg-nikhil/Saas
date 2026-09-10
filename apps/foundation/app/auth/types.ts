/**
 * Internal Authentication Domain Types
 *
 * Strict Architectural Boundary:
 * - Application code MUST depend on these internal types rather than directly on Supabase SDK types.
 * - Decouples application domain logic from specific authentication providers.
 */

export interface AuthUser {
  id: string;
  email: string | null;
  userMetadata?: Record<string, unknown>;
}

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  user: AuthUser;
}

export interface SignUpInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface PasswordResetInput {
  email: string;
  redirectTo?: string;
}

export interface UpdatePasswordInput {
  newPassword: string;
}

export interface AuthError {
  message: string;
  code?: string;
  status?: number;
}

export interface AuthResult<T> {
  data: T | null;
  error: AuthError | null;
}

/**
 * Minimal factory authentication service contract.
 * Exposes only the operations needed by the application.
 */
export interface IAuthService {
  getCurrentUser(): Promise<AuthUser | null>;
  getCurrentSession(): Promise<AuthSession | null>;
  signUp(
    input: SignUpInput,
  ): Promise<
    AuthResult<{ user: AuthUser | null; session: AuthSession | null }>
  >;
  signIn(
    input: SignInInput,
  ): Promise<AuthResult<{ user: AuthUser; session: AuthSession }>>;
  signOut(): Promise<AuthResult<void>>;
  requestPasswordReset(input: PasswordResetInput): Promise<AuthResult<void>>;
  updatePassword(input: UpdatePasswordInput): Promise<AuthResult<void>>;
}

export interface AuthServiceResult {
  authService: IAuthService;
  responseHeaders: Headers;
}
