import { useState } from "react";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/reset-password";
import { getAppEnv } from "../context";
import { createAuthService } from "../auth";
import {
  LockIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  AlertCircleIcon,
  ArrowRightIcon,
  KeyRoundIcon,
  CheckCircle2Icon,
  XCircleIcon,
} from "../components/Icons";
import { PasswordStrengthMeter } from "../components/PasswordStrengthMeter";

export function meta() {
  return [
    { title: "Nouveau mot de passe — Planning Infirmier" },
    { name: "description", content: "Définir un nouveau mot de passe pour votre compte Planning Infirmier" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);
  const { authService } = createAuthService(request, env);
  const user = await authService.getCurrentUser();

  // Recovery flow requires a valid authenticated recovery session
  if (!user) {
    throw redirect("/forgot-password");
  }

  return { user };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getAppEnv(context);
  const formData = await request.formData();
  const password = (formData.get("password") as string | null) || "";
  const passwordConfirmation =
    (formData.get("passwordConfirmation") as string | null) || "";

  if (!password) {
    return { error: "Veuillez renseigner un nouveau mot de passe." };
  }

  if (password.length < 8) {
    return {
      error: "Le mot de passe doit contenir au moins 8 caractères.",
    };
  }

  if (password !== passwordConfirmation) {
    return {
      error: "Les mots de passe ne correspondent pas.",
    };
  }

  const { authService, responseHeaders } = createAuthService(request, env);

  // Verify server-side recovery session identity
  const user = await authService.getCurrentUser();
  if (!user) {
    return {
      error:
        "Session de récupération invalide ou expirée. Veuillez refaire une demande.",
    };
  }

  const { error } = await authService.updatePassword({
    newPassword: password,
  });

  if (error) {
    return {
      error:
        error.message ||
        "Impossible de mettre à jour le mot de passe. Le lien a peut-être expiré.",
    };
  }

  return redirect("/app?toast=Mot%20de%20passe%20mis%20%C3%A0%20jour%20avec%20succ%C3%A8s&toastType=success", {
    headers: responseHeaders,
  });
}

export default function ResetPassword() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const isMatching = password && passwordConfirmation && password === passwordConfirmation;

  return (
    <main className="container" id="reset-password-view">
      <div className="card" id="reset-password-card" style={{ maxWidth: "480px", margin: "0 auto" }}>
        {/* Brand Icon Header */}
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }} id="reset-brand-header">
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "16px",
              backgroundColor: "#f0fdf4",
              border: "1px solid #bbf7d0",
              color: "#16a34a",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "1rem",
              boxShadow: "0 2px 8px rgba(22, 163, 74, 0.15)",
            }}
            id="reset-brand-icon"
          >
            <KeyRoundIcon size={28} />
          </div>
          <h1 id="reset-password-title" style={{ fontSize: "1.65rem", fontWeight: 700, marginBottom: "0.35rem" }}>
            Nouveau mot de passe
          </h1>
          <p className="subtitle" id="reset-password-subtitle" style={{ marginBottom: 0, fontSize: "0.95rem" }}>
            Définissez un mot de passe robuste pour protéger l'accès à votre compte
          </p>
        </div>

        {actionData?.error && (
          <div
            className="alert alert-error"
            id="reset-password-error"
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
                Erreur
              </strong>
              <span>{actionData.error}</span>
            </div>
          </div>
        )}

        <Form method="post" className="auth-form" id="reset-password-form">
          {/* New Password Field */}
          <div className="form-group" id="reset-group-password">
            <label htmlFor="reset-password" className="form-label" style={{ fontWeight: 600 }}>
              Nouveau mot de passe <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <LockIcon
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
                type={showPassword ? "text" : "password"}
                id="reset-password"
                name="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                className="form-input"
                placeholder="••••••••"
                style={{ paddingLeft: "2.5rem", paddingRight: "2.75rem" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
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
                }}
              >
                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
            {/* Real-time strength meter */}
            <PasswordStrengthMeter password={password} />
          </div>

          {/* Confirm New Password Field */}
          <div className="form-group" id="reset-group-confirm">
            <label htmlFor="reset-password-confirm" className="form-label" style={{ fontWeight: 600 }}>
              Confirmer le nouveau mot de passe <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <LockIcon
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
                type={showConfirmPassword ? "text" : "password"}
                id="reset-password-confirm"
                name="passwordConfirmation"
                required
                minLength={8}
                autoComplete="new-password"
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.target.value)}
                disabled={isSubmitting}
                className="form-input"
                placeholder="••••••••"
                style={{ paddingLeft: "2.5rem", paddingRight: "2.75rem" }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
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
                }}
              >
                {showConfirmPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
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
                marginBottom: "0.75rem",
              }}
              id="reset-password-match-indicator"
            >
              {isMatching ? (
                <CheckCircle2Icon size={14} color="#16a34a" />
              ) : (
                <XCircleIcon size={14} color="#dc2626" />
              )}
              <span>{isMatching ? "Les mots de passe correspondent" : "Les mots de passe ne correspondent pas"}</span>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            id="reset-password-submit"
            disabled={isSubmitting || !password || password.length < 8 || password !== passwordConfirmation}
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
                <span>Mise à jour en cours...</span>
              </>
            ) : (
              <>
                <span>Mettre à jour le mot de passe</span>
                <ArrowRightIcon size={18} />
              </>
            )}
          </button>
        </Form>

        <div
          className="auth-footer"
          id="reset-password-footer"
          style={{
            marginTop: "1.5rem",
            paddingTop: "1.25rem",
            borderTop: "1px solid #f1f5f9",
            textAlign: "center",
          }}
        >
          <a
            href="/login"
            className="nav-link-back"
            id="reset-password-back-link"
            style={{ fontSize: "0.85rem", color: "#64748b", textDecoration: "none" }}
          >
            &larr; Retour à la page de connexion
          </a>
        </div>
      </div>
    </main>
  );
}
