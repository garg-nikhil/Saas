import { useState } from "react";
import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/verify-email";
import { getAppEnv } from "../context";
import { createAuthService, getOptionalAuth, syncUserProfile } from "../auth";
import {
  MailIcon,
  KeyRoundIcon,
  ShieldCheckIcon,
  Loader2Icon,
  AlertCircleIcon,
  CheckCircle2Icon,
  RefreshCwIcon,
  ArrowRightIcon,
} from "../components/Icons";

export function meta() {
  return [
    { title: "Vérification de l'email — Planning Infirmier" },
    { name: "description", content: "Confirmez votre adresse email pour accéder à Planning Infirmier" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);
  const url = new URL(request.url);
  const email = url.searchParams.get("email") || "";
  const token = url.searchParams.get("token") || "";

  // If user is already authenticated with verified session, redirect to /app
  const { user } = await getOptionalAuth(request, env);
  if (user) {
    throw redirect("/app");
  }

  return { email, tokenPrefill: token };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getAppEnv(context);
  const formData = await request.formData();
  const intent = formData.get("intent") as string | null;
  const email = (formData.get("email") as string | null)?.trim().toLowerCase() || "";
  const token = (formData.get("token") as string | null)?.trim() || "";

  if (!email) {
    return { error: "Veuillez renseigner votre adresse email." };
  }

  const { authService, responseHeaders } = createAuthService(request, env);

  // Handle Resend Verification Code
  if (intent === "resend") {
    const { error } = await authService.resendVerification({ email, type: "signup" });
    if (error) {
      return { error: error.message || "Impossible de renvoyer l'email de confirmation pour le moment." };
    }
    return {
      success: true,
      message: "Un nouvel email avec votre code de confirmation a été envoyé à votre adresse.",
      email,
    };
  }

  // Handle Verify OTP / Code
  if (!token) {
    return { error: "Veuillez renseigner le code ou jeton de confirmation reçu par email." };
  }

  const { data, error } = await authService.verifyOtp({
    email,
    token,
    type: "signup",
  });

  if (error || !data?.user) {
    return {
      error: error?.message || "Code de confirmation invalide ou expiré. Veuillez vérifier votre saisie.",
      email,
    };
  }

  if (env.HYPERDRIVE) {
    await syncUserProfile(env.HYPERDRIVE, data.user);
  }

  return redirect("/app/onboarding?toast=Votre%20compte%20a%20%C3%A9t%C3%A9%20v%C3%A9rifi%C3%A9%20avec%20succ%C3%A8s&toastType=success", {
    headers: responseHeaders,
  });
}

export default function VerifyEmail() {
  const { email: initialEmail, tokenPrefill } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [email, setEmail] = useState(initialEmail || "");
  const [token, setToken] = useState(tokenPrefill || "");
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  return (
    <main className="container" id="verify-email-view">
      <div className="card" id="verify-email-card" style={{ maxWidth: "480px", margin: "0 auto" }}>
        {/* Brand Icon Header */}
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }} id="verify-brand-header">
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "16px",
              backgroundColor: "#f0f9ff",
              border: "1px solid #bae6fd",
              color: "#0284c7",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "1rem",
              boxShadow: "0 2px 8px rgba(2, 132, 199, 0.15)",
            }}
            id="verify-brand-icon"
          >
            <ShieldCheckIcon size={28} />
          </div>
          <h1 id="verify-title" style={{ fontSize: "1.65rem", fontWeight: 700, marginBottom: "0.35rem" }}>
            Vérifiez votre email
          </h1>
          <p className="subtitle" id="verify-subtitle" style={{ marginBottom: 0, fontSize: "0.95rem" }}>
            Un email de confirmation avec votre code d'accès a été envoyé à{" "}
            {email ? <strong>{email}</strong> : "votre adresse email"}.
          </p>
        </div>

        {/* Action Error Alert */}
        {actionData?.error && (
          <div
            className="alert alert-error"
            id="verify-error"
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
                Erreur de validation
              </strong>
              <span>{actionData.error}</span>
            </div>
          </div>
        )}

        {/* Action Success Alert (e.g. Resend) */}
        {actionData && "success" in actionData && actionData.success && (
          <div
            className="alert alert-success"
            id="verify-success"
            role="status"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              backgroundColor: "#f0fdf4",
              borderColor: "#bbf7d0",
              color: "#166534",
              borderWidth: "1px",
              borderStyle: "solid",
              borderRadius: "0.5rem",
              padding: "0.875rem 1rem",
              marginBottom: "1.25rem",
            }}
          >
            <CheckCircle2Icon size={20} style={{ flexShrink: 0, marginTop: "2px", color: "#16a34a" }} />
            <div style={{ fontSize: "0.875rem" }}>
              <strong style={{ display: "block", fontWeight: 600, marginBottom: "0.2rem" }}>
                Email envoyé
              </strong>
              <span>{actionData.message}</span>
            </div>
          </div>
        )}

        {/* Verification Form */}
        <Form method="post" className="auth-form" id="verify-email-form">
          <input type="hidden" name="intent" value="verify" />

          {/* Email input if not prefilled */}
          <div className="form-group" id="verify-group-email">
            <label htmlFor="verify-email" className="form-label" style={{ fontWeight: 600 }}>
              Adresse email <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <MailIcon
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
                type="email"
                id="verify-email"
                name="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                className="form-input"
                placeholder="prenom.nom@hopital.fr"
                style={{ paddingLeft: "2.5rem" }}
              />
            </div>
          </div>

          {/* Token / Code Input */}
          <div className="form-group" id="verify-group-token">
            <label htmlFor="verify-token" className="form-label" style={{ fontWeight: 600 }}>
              Code de vérification ou jeton à 6 chiffres <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <KeyRoundIcon
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
                id="verify-token"
                name="token"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={isSubmitting}
                className="form-input"
                placeholder="Ex: 123456 ou jeton reçu"
                style={{
                  paddingLeft: "2.5rem",
                  letterSpacing: "0.1em",
                  fontWeight: 600,
                  fontSize: "1.05rem",
                }}
                autoFocus
              />
            </div>
            <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.35rem" }}>
              Saisissez le code à 6 chiffres ou le jeton de sécurité reçu par email.
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="btn btn-primary btn-block"
            id="verify-submit"
            disabled={isSubmitting || !email || !token}
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
                <span>Vérification en cours...</span>
              </>
            ) : (
              <>
                <span>Valider mon compte</span>
                <ArrowRightIcon size={18} />
              </>
            )}
          </button>
        </Form>

        {/* Resend Section */}
        <div
          style={{
            marginTop: "1.5rem",
            paddingTop: "1.25rem",
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            alignItems: "center",
          }}
          id="verify-resend-section"
        >
          <Form method="post" id="verify-resend-form" style={{ width: "100%", textAlign: "center" }}>
            <input type="hidden" name="intent" value="resend" />
            <input type="hidden" name="email" value={email} />
            <button
              type="submit"
              disabled={isSubmitting || !email}
              className="btn btn-secondary"
              id="verify-resend-btn"
              style={{
                width: "100%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                fontSize: "0.875rem",
              }}
            >
              <RefreshCwIcon size={16} />
              <span>Renvoyer un email de vérification</span>
            </button>
          </Form>

          <div style={{ display: "flex", gap: "1rem", fontSize: "0.85rem" }}>
            <a href="/login" id="verify-login-link" style={{ color: "#0284c7", fontWeight: 500, textDecoration: "none" }}>
              Retour à la connexion
            </a>
            <span style={{ color: "#cbd5e1" }}>•</span>
            <a href="/signup" id="verify-signup-link" style={{ color: "#64748b", textDecoration: "none" }}>
              Modifier l'adresse
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
