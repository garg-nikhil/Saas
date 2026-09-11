import { useState } from "react";
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "react-router";
import {
  MailIcon,
  LockIcon,
  EyeIcon,
  EyeOffIcon,
  AlertCircleIcon,
  Loader2Icon,
  ArrowRightIcon,
  CheckCircle2Icon,
} from "../components/Icons";
import type { Route } from "./+types/login";
import { getAppEnv } from "../context";
import {
  createAuthService,
  getOptionalAuth,
  getSafeRedirectUrl,
  syncUserProfile,
} from "../auth";

export function meta() {
  return [
    { title: "Connexion — Planning Infirmier" },
    { name: "description", content: "Connexion sécurisée à votre compte Planning Infirmier" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);
  const url = new URL(request.url);
  const isSignupSuccess = url.searchParams.get("signup") === "success";
  const email = url.searchParams.get("email") || "";

  if (!isSignupSuccess) {
    const { user } = await getOptionalAuth(request, env);
    if (user) {
      throw redirect("/app");
    }
  }

  return {
    signupSuccess: isSignupSuccess,
    email,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getAppEnv(context);
  const formData = await request.formData();
  const email = (formData.get("email") as string | null)?.trim().toLowerCase() || "";
  const password = (formData.get("password") as string | null) || "";
  const redirectTo = formData.get("redirectTo") as string | null;

  if (!email || !password) {
    return {
      error: "Veuillez renseigner votre adresse email et votre mot de passe.",
    };
  }

  const { authService, responseHeaders } = createAuthService(request, env);
  const { data, error } = await authService.signIn({ email, password });

  if (error || !data) {
    return {
      error:
        error?.message ||
        "Identifiants invalides. Veuillez vérifier votre adresse email et votre mot de passe.",
    };
  }

  // Idempotently sync application profile if Hyperdrive is bound
  if (env.HYPERDRIVE && data.user) {
    await syncUserProfile(env.HYPERDRIVE, data.user);
  }

  const destination = getSafeRedirectUrl(redirectTo, "/app");

  return redirect(destination, {
    headers: responseHeaders,
  });
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const isSubmitting = navigation.state === "submitting";
  const redirectTo = searchParams.get("redirectTo");
  const isSignupSuccess =
    loaderData?.signupSuccess || searchParams.get("signup") === "success";
  const defaultEmail = loaderData?.email || searchParams.get("email") || "";

  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({
    email: Boolean(defaultEmail),
  });
  const [clientErrors, setClientErrors] = useState<{ email?: string; password?: string }>({});

  const validateField = (name: "email" | "password", value: string): string => {
    if (name === "email") {
      const trimmed = value.trim();
      if (!trimmed) {
        return "L'adresse email est requise.";
      }
      if (!EMAIL_REGEX.test(trimmed)) {
        return "Veuillez saisir une adresse email valide (ex: marie.curie@hopital.fr).";
      }
    } else if (name === "password") {
      if (!value) {
        return "Le mot de passe est requis.";
      }
    }
    return "";
  };

  const handleBlur = (field: "email" | "password") => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const val = field === "email" ? email : password;
    const err = validateField(field, val);
    setClientErrors((prev) => ({ ...prev, [field]: err }));
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEmail(val);
    if (touched.email) {
      setClientErrors((prev) => ({ ...prev, email: validateField("email", val) }));
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPassword(val);
    if (touched.password) {
      setClientErrors((prev) => ({ ...prev, password: validateField("password", val) }));
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const emailErr = validateField("email", email);
    const passwordErr = validateField("password", password);

    setTouched({ email: true, password: true });
    setClientErrors({ email: emailErr, password: passwordErr });

    if (emailErr || passwordErr) {
      e.preventDefault();
      const firstInvalid = emailErr
        ? document.getElementById("login-email")
        : document.getElementById("login-password");
      firstInvalid?.focus();
    }
  };

  return (
    <main className="container" id="login-view">
      <div className="card" id="login-card" style={{ maxWidth: "480px", margin: "0 auto" }}>
        {/* Brand Header */}
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }} id="login-brand-header">
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              backgroundColor: "#0284c7",
              color: "#ffffff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "1.5rem",
              marginBottom: "0.75rem",
              boxShadow: "0 2px 8px rgba(2, 132, 199, 0.25)",
            }}
            id="login-brand-icon"
          >
            +
          </div>
          <h1 id="login-title" style={{ fontSize: "1.65rem", fontWeight: 700, marginBottom: "0.35rem" }}>
            Connexion
          </h1>
          <p className="subtitle" id="login-subtitle" style={{ marginBottom: "0", fontSize: "0.95rem" }}>
            Accédez à votre espace planning et gestion des gardes
          </p>
        </div>

        {/* Signup Success Banner */}
        {isSignupSuccess && (
          <div
            className="alert alert-success"
            id="signup-success-alert"
            role="status"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              backgroundColor: "#ecfdf5",
              borderColor: "#6ee7b7",
              color: "#065f46",
              borderWidth: "1px",
              borderStyle: "solid",
              borderRadius: "0.5rem",
              padding: "0.875rem 1rem",
              marginBottom: "1.25rem",
            }}
          >
            <CheckCircle2Icon size={20} style={{ flexShrink: 0, marginTop: "2px", color: "#059669" }} />
            <div>
              <strong style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>
                Compte créé avec succès !
              </strong>
              <span style={{ fontSize: "0.875rem" }}>
                Votre compte a bien été configuré. Vous pouvez maintenant vous connecter avec votre mot de passe.
              </span>
            </div>
          </div>
        )}

        {/* Server Action Error Banner with recovery suggestion */}
        {actionData?.error && (
          <div
            className="alert alert-error"
            id="login-error"
            role="alert"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              backgroundColor: "#fef2f2",
              borderColor: "#fecaca",
              color: "#991b1b",
              borderWidth: "1px",
              borderStyle: "solid",
              borderRadius: "0.5rem",
              padding: "0.875rem 1rem",
              marginBottom: "1.25rem",
            }}
          >
            <AlertCircleIcon size={20} style={{ flexShrink: 0, marginTop: "2px", color: "#dc2626" }} />
            <div style={{ fontSize: "0.875rem" }}>
              <strong style={{ display: "block", fontWeight: 600, marginBottom: "0.2rem" }}>
                Échec de la connexion
              </strong>
              <span>{actionData.error}</span>
              <div style={{ marginTop: "0.4rem" }}>
                <a
                  href="/forgot-password"
                  style={{ color: "#0284c7", textDecoration: "underline", fontWeight: 500 }}
                  id="login-error-forgot-link"
                >
                  Mot de passe oublié ? Réinitialiser
                </a>
              </div>
            </div>
          </div>
        )}

        <Form
          method="post"
          action="/login"
          className="auth-form"
          id="login-form"
          onSubmit={handleSubmit}
          noValidate
        >
          {redirectTo && (
            <input type="hidden" name="redirectTo" value={redirectTo} />
          )}

          {/* Email field */}
          <div className="form-group" id="login-group-email">
            <label htmlFor="login-email" className="form-label" style={{ fontWeight: 600 }}>
              Adresse email professionnelle
            </label>
            <div style={{ position: "relative" }}>
              <MailIcon
                size={18}
                style={{
                  position: "absolute",
                  left: "0.85rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: touched.email && clientErrors.email ? "#dc2626" : "#94a3b8",
                  pointerEvents: "none",
                }}
              />
              <input
                type="email"
                id="login-email"
                name="email"
                required
                autoComplete="email"
                value={email}
                onChange={handleEmailChange}
                onBlur={() => handleBlur("email")}
                disabled={isSubmitting}
                className="form-input"
                placeholder="prenom.nom@hopital.fr"
                style={{
                  paddingLeft: "2.5rem",
                  borderColor: touched.email && clientErrors.email ? "#ef4444" : undefined,
                  backgroundColor: touched.email && clientErrors.email ? "#fffbfa" : undefined,
                }}
                aria-invalid={touched.email && Boolean(clientErrors.email)}
                aria-describedby={clientErrors.email ? "login-email-error" : undefined}
              />
            </div>
            {touched.email && clientErrors.email && (
              <p
                id="login-email-error"
                role="alert"
                style={{
                  fontSize: "0.8rem",
                  color: "#dc2626",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  marginTop: "0.25rem",
                }}
              >
                <AlertCircleIcon size={14} />
                <span>{clientErrors.email}</span>
              </p>
            )}
          </div>

          {/* Password field */}
          <div className="form-group" id="login-group-password">
            <div className="form-label-row">
              <label htmlFor="login-password" className="form-label" style={{ fontWeight: 600 }}>
                Mot de passe
              </label>
              <a
                href="/forgot-password"
                className="form-helper-link"
                id="login-forgot-link"
                style={{ fontSize: "0.825rem", fontWeight: 500 }}
              >
                Mot de passe oublié ?
              </a>
            </div>
            <div style={{ position: "relative" }}>
              <LockIcon
                size={18}
                style={{
                  position: "absolute",
                  left: "0.85rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: touched.password && clientErrors.password ? "#dc2626" : "#94a3b8",
                  pointerEvents: "none",
                }}
              />
              <input
                type={showPassword ? "text" : "password"}
                id="login-password"
                name="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={handlePasswordChange}
                onBlur={() => handleBlur("password")}
                disabled={isSubmitting}
                className="form-input"
                placeholder="••••••••"
                style={{
                  paddingLeft: "2.5rem",
                  paddingRight: "2.5rem",
                  borderColor: touched.password && clientErrors.password ? "#ef4444" : undefined,
                  backgroundColor: touched.password && clientErrors.password ? "#fffbfa" : undefined,
                }}
                aria-invalid={touched.password && Boolean(clientErrors.password)}
                aria-describedby={clientErrors.password ? "login-password-error" : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                aria-pressed={showPassword}
                aria-controls="login-password"
                title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                id="login-toggle-password"
                className="password-toggle-btn"
                style={{
                  position: "absolute",
                  right: "0.75rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  borderRadius: "0.375rem",
                  padding: "0.35rem",
                  cursor: "pointer",
                  color: showPassword ? "#0284c7" : "#64748b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "color 0.15s ease, background-color 0.15s ease",
                }}
              >
                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
            {touched.password && clientErrors.password && (
              <p
                id="login-password-error"
                role="alert"
                style={{
                  fontSize: "0.8rem",
                  color: "#dc2626",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  marginTop: "0.25rem",
                }}
              >
                <AlertCircleIcon size={14} />
                <span>{clientErrors.password}</span>
              </p>
            )}
          </div>

          {/* Submit Button with Loading State */}
          <button
            type="submit"
            className="btn btn-primary btn-block"
            id="login-submit"
            disabled={isSubmitting}
            style={{
              marginTop: "0.5rem",
              padding: "0.75rem 1.25rem",
              fontWeight: 600,
              fontSize: "0.95rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2Icon size={18} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} />
                <span>Connexion en cours...</span>
              </>
            ) : (
              <>
                <span>Se connecter</span>
                <ArrowRightIcon size={18} />
              </>
            )}
          </button>
        </Form>

        {/* Footer */}
        <div
          className="auth-footer"
          id="login-footer"
          style={{
            marginTop: "1.5rem",
            paddingTop: "1.25rem",
            borderTop: "1px solid #f1f5f9",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "0.9rem", color: "#64748b", marginBottom: "0.75rem" }}>
            Pas encore de compte ?{" "}
            <a
              href="/signup"
              className="nav-link"
              id="login-signup-link"
              style={{ fontWeight: 600, color: "#0284c7" }}
            >
              Créer un compte infirmier
            </a>
          </p>
          <a
            href="/"
            className="nav-link-back"
            id="login-back-link"
            style={{ fontSize: "0.85rem", color: "#94a3b8", textDecoration: "none" }}
          >
            &larr; Retour à l&apos;accueil
          </a>
        </div>
      </div>
    </main>
  );
}
