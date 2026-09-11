import { useState } from "react";
import {
  Form,
  redirect,
  useActionData,
  useNavigation,
} from "react-router";
import {
  MailIcon,
  LockIcon,
  UserIcon,
  EyeIcon,
  EyeOffIcon,
  AlertCircleIcon,
  Loader2Icon,
  ArrowRightIcon,
  CheckCircle2Icon,
  XCircleIcon,
} from "../components/Icons";
import { PasswordStrengthMeter } from "../components/PasswordStrengthMeter";
import type { Route } from "./+types/signup";
import { getAppEnv } from "../context";
import {
  createAuthService,
  getOptionalAuth,
  syncUserProfile,
} from "../auth";

export function meta() {
  return [
    { title: "Créer un compte — Planning Infirmier" },
    { name: "description", content: "Inscription sécurisée à Planning Infirmier" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);
  const { user } = await getOptionalAuth(request, env);

  if (user) {
    throw redirect("/app");
  }

  return {};
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function action({ request, context }: Route.ActionArgs) {
  const env = getAppEnv(context);
  const formData = await request.formData();
  const email = (formData.get("email") as string | null)?.trim().toLowerCase() || "";
  const password = (formData.get("password") as string | null) || "";
  const passwordConfirmation =
    (formData.get("passwordConfirmation") as string | null) ||
    (formData.get("confirmPassword") as string | null) ||
    "";
  const displayName =
    (formData.get("displayName") as string | null)?.trim() || undefined;

  // Validation
  if (!email) {
    return { error: "Veuillez renseigner votre adresse email." };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { error: "L'adresse email renseignée est invalide." };
  }

  if (!password) {
    return { error: "Veuillez renseigner un mot de passe." };
  }

  if (password.length < 8) {
    return {
      error: "Le mot de passe doit contenir au moins 8 caractères.",
    };
  }

  if (password !== passwordConfirmation) {
    return {
      error: "Les mots de passe saisis ne correspondent pas.",
    };
  }

  const { authService } = createAuthService(request, env);
  const { data, error } = await authService.signUp({
    email,
    password,
    displayName,
  });

  if (error) {
    return {
      error:
        error.message ||
        "Une erreur est survenue lors de la création de votre compte.",
    };
  }

  if (data?.user && env.HYPERDRIVE) {
    await syncUserProfile(env.HYPERDRIVE, data.user, displayName);
  }

  // Redirect to email verification page
  return redirect(`/verify-email?email=${encodeURIComponent(email)}&registered=true`);
}

export default function Signup() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [touched, setTouched] = useState<{
    email?: boolean;
    password?: boolean;
    passwordConfirmation?: boolean;
  }>({});

  const [clientErrors, setClientErrors] = useState<{
    email?: string;
    password?: string;
    passwordConfirmation?: string;
  }>({});

  const validateField = (
    field: "email" | "password" | "passwordConfirmation",
    val: string,
    currentPassword = password,
  ): string => {
    if (field === "email") {
      const trimmed = val.trim();
      if (!trimmed) {
        return "L'adresse email est requise.";
      }
      if (!EMAIL_REGEX.test(trimmed)) {
        return "Veuillez saisir une adresse email valide (ex: marie.curie@hopital.fr).";
      }
    } else if (field === "password") {
      if (!val) {
        return "Le mot de passe est requis.";
      }
      if (val.length < 8) {
        return "Le mot de passe doit comporter au moins 8 caractères.";
      }
    } else if (field === "passwordConfirmation") {
      if (!val) {
        return "Veuillez confirmer votre mot de passe.";
      }
      if (val !== currentPassword) {
        return "Les mots de passe ne correspondent pas.";
      }
    }
    return "";
  };

  const handleBlur = (field: "email" | "password" | "passwordConfirmation") => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    let val = "";
    if (field === "email") val = email;
    else if (field === "password") val = password;
    else if (field === "passwordConfirmation") val = passwordConfirmation;

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
    if (touched.passwordConfirmation && passwordConfirmation) {
      setClientErrors((prev) => ({
        ...prev,
        passwordConfirmation: validateField("passwordConfirmation", passwordConfirmation, val),
      }));
    }
  };

  const handleConfirmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPasswordConfirmation(val);
    if (touched.passwordConfirmation) {
      setClientErrors((prev) => ({
        ...prev,
        passwordConfirmation: validateField("passwordConfirmation", val, password),
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const emailErr = validateField("email", email);
    const passwordErr = validateField("password", password);
    const confirmErr = validateField("passwordConfirmation", passwordConfirmation, password);

    setTouched({ email: true, password: true, passwordConfirmation: true });
    setClientErrors({
      email: emailErr,
      password: passwordErr,
      passwordConfirmation: confirmErr,
    });

    if (emailErr || passwordErr || confirmErr) {
      e.preventDefault();
      const firstInvalid = emailErr
        ? document.getElementById("signup-email")
        : passwordErr
        ? document.getElementById("signup-password")
        : document.getElementById("signup-password-confirm");
      firstInvalid?.focus();
    }
  };

  const isMinLength = password.length >= 8;
  const isMatching = password && passwordConfirmation && password === passwordConfirmation;

  return (
    <main className="container" id="signup-view">
      <div className="card" id="signup-card" style={{ maxWidth: "520px", margin: "0 auto" }}>
        {/* Brand Header */}
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }} id="signup-brand-header">
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
            id="signup-brand-icon"
          >
            +
          </div>
          <h1 id="signup-title" style={{ fontSize: "1.65rem", fontWeight: 700, marginBottom: "0.35rem" }}>
            Créer un compte
          </h1>
          <p className="subtitle" id="signup-subtitle" style={{ marginBottom: "0", fontSize: "0.95rem" }}>
            Rejoignez la plateforme Planning Infirmier pour gérer vos gardes
          </p>
        </div>

        {/* Server Action Error Alert */}
        {actionData?.error && (
          <div
            className="alert alert-error"
            id="signup-error"
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
                Impossible de créer le compte
              </strong>
              <span>{actionData.error}</span>
            </div>
          </div>
        )}

        <Form
          method="post"
          action="/signup"
          className="auth-form"
          id="signup-form"
          onSubmit={handleSubmit}
          noValidate
        >
          {/* Display Name Field (Optional) */}
          <div className="form-group" id="signup-group-name">
            <label htmlFor="signup-name" className="form-label" style={{ fontWeight: 600 }}>
              Nom & Prénom <span style={{ color: "#94a3b8", fontWeight: 400 }}>(optionnel)</span>
            </label>
            <div style={{ position: "relative" }}>
              <UserIcon
                size={18}
                style={{
                  position: "absolute",
                  left: "0.85rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94a3b8",
                  pointerEvents: "none",
                }}
              />
              <input
                type="text"
                id="signup-name"
                name="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                disabled={isSubmitting}
                className="form-input"
                placeholder="ex: Marie Curie"
                style={{ paddingLeft: "2.5rem" }}
              />
            </div>
          </div>

          {/* Email Field */}
          <div className="form-group" id="signup-group-email">
            <label htmlFor="signup-email" className="form-label" style={{ fontWeight: 600 }}>
              Adresse email professionnelle <span style={{ color: "#ef4444" }}>*</span>
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
                id="signup-email"
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
                aria-describedby={clientErrors.email ? "signup-email-error" : undefined}
              />
            </div>
            {touched.email && clientErrors.email && (
              <p
                id="signup-email-error"
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

          {/* Password Field */}
          <div className="form-group" id="signup-group-password">
            <label htmlFor="signup-password" className="form-label" style={{ fontWeight: 600 }}>
              Mot de passe <span style={{ color: "#ef4444" }}>*</span>
            </label>
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
                id="signup-password"
                name="password"
                required
                minLength={8}
                autoComplete="new-password"
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
                aria-describedby={clientErrors.password ? "signup-password-error" : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                aria-pressed={showPassword}
                aria-controls="signup-password"
                title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                id="signup-toggle-password"
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
                {showPassword ? <EyeOffIcon size={18} aria-hidden="true" /> : <EyeIcon size={18} aria-hidden="true" />}
              </button>
            </div>
            {touched.password && clientErrors.password && (
              <p
                id="signup-password-error"
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

            {/* Real-Time Password Strength Meter */}
            <PasswordStrengthMeter password={password} />
          </div>

          {/* Password Confirmation Field */}
          <div className="form-group" id="signup-group-confirmation">
            <label htmlFor="signup-password-confirm" className="form-label" style={{ fontWeight: 600 }}>
              Confirmer le mot de passe <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <LockIcon
                size={18}
                style={{
                  position: "absolute",
                  left: "0.85rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color:
                    touched.passwordConfirmation && clientErrors.passwordConfirmation
                      ? "#dc2626"
                      : "#94a3b8",
                  pointerEvents: "none",
                }}
              />
              <input
                type={showConfirmPassword ? "text" : "password"}
                id="signup-password-confirm"
                name="passwordConfirmation"
                required
                minLength={8}
                autoComplete="new-password"
                value={passwordConfirmation}
                onChange={handleConfirmChange}
                onBlur={() => handleBlur("passwordConfirmation")}
                disabled={isSubmitting}
                className="form-input"
                placeholder="••••••••"
                style={{
                  paddingLeft: "2.5rem",
                  paddingRight: "2.5rem",
                  borderColor:
                    touched.passwordConfirmation && clientErrors.passwordConfirmation
                      ? "#ef4444"
                      : undefined,
                  backgroundColor:
                    touched.passwordConfirmation && clientErrors.passwordConfirmation
                      ? "#fffbfa"
                      : undefined,
                }}
                aria-invalid={
                  touched.passwordConfirmation && Boolean(clientErrors.passwordConfirmation)
                }
                aria-describedby={
                  clientErrors.passwordConfirmation ? "signup-confirm-error" : undefined
                }
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={
                  showConfirmPassword ? "Masquer la confirmation du mot de passe" : "Afficher la confirmation du mot de passe"
                }
                aria-pressed={showConfirmPassword}
                aria-controls="signup-password-confirm"
                title={
                  showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"
                }
                id="signup-toggle-confirm-password"
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
                  color: showConfirmPassword ? "#0284c7" : "#64748b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "color 0.15s ease, background-color 0.15s ease",
                }}
              >
                {showConfirmPassword ? <EyeOffIcon size={18} aria-hidden="true" /> : <EyeIcon size={18} aria-hidden="true" />}
              </button>
            </div>
            {touched.passwordConfirmation && clientErrors.passwordConfirmation && (
              <p
                id="signup-confirm-error"
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
                <span>{clientErrors.passwordConfirmation}</span>
              </p>
            )}
          </div>

          {/* Password Match Indicator */}
          {password && passwordConfirmation && (
            <div
              style={{
                backgroundColor: isMatching ? "#f0fdf4" : "#fef2f2",
                border: `1px solid ${isMatching ? "#bbf7d0" : "#fecaca"}`,
                borderRadius: "0.5rem",
                padding: "0.5rem 0.75rem",
                fontSize: "0.8rem",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                color: isMatching ? "#166534" : "#991b1b",
              }}
              id="signup-password-match-indicator"
            >
              {isMatching ? (
                <CheckCircle2Icon size={14} color="#16a34a" />
              ) : (
                <XCircleIcon size={14} color="#dc2626" />
              )}
              <span>{isMatching ? "Les mots de passe correspondent" : "Les mots de passe ne correspondent pas"}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="btn btn-primary btn-block"
            id="signup-submit"
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
                <span>Création de votre compte...</span>
              </>
            ) : (
              <>
                <span>Créer mon compte</span>
                <ArrowRightIcon size={18} />
              </>
            )}
          </button>
        </Form>

        {/* Footer */}
        <div
          className="auth-footer"
          id="signup-footer"
          style={{
            marginTop: "1.5rem",
            paddingTop: "1.25rem",
            borderTop: "1px solid #f1f5f9",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "0.9rem", color: "#64748b", marginBottom: "0.75rem" }}>
            Déjà un compte ?{" "}
            <a
              href="/login"
              className="nav-link"
              id="signup-login-link"
              style={{ fontWeight: 600, color: "#0284c7" }}
            >
              Se connecter
            </a>
          </p>
          <a
            href="/"
            className="nav-link-back"
            id="signup-back-link"
            style={{ fontSize: "0.85rem", color: "#94a3b8", textDecoration: "none" }}
          >
            &larr; Retour à l&apos;accueil
          </a>
        </div>
      </div>
    </main>
  );
}
