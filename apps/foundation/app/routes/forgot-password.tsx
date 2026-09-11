import { useState } from "react";
import { Form, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/forgot-password";
import { getAppEnv } from "../context";
import { createAuthService } from "../auth";
import {
  MailIcon,
  KeyRoundIcon,
  Loader2Icon,
  AlertCircleIcon,
  CheckCircle2Icon,
  ArrowRightIcon,
} from "../components/Icons";

export function meta() {
  return [
    { title: "Mot de passe oublié — Planning Infirmier" },
    { name: "description", content: "Réinitialisation de mot de passe Planning Infirmier" },
  ];
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getAppEnv(context);
  const formData = await request.formData();
  const email = (formData.get("email") as string | null)?.trim().toLowerCase() || "";

  if (!email) {
    return { error: "Veuillez renseigner votre adresse email." };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { error: "L'adresse email renseignée est invalide." };
  }

  const requestUrl = new URL(request.url);
  const redirectTo = `${requestUrl.origin}/reset-password`;

  const { authService } = createAuthService(request, env);
  const { error } = await authService.requestPasswordReset({
    email,
    redirectTo,
  });

  if (error && error.status && error.status >= 500) {
    return {
      error:
        "Une erreur temporaire est survenue sur le serveur. Veuillez réessayer plus tard.",
    };
  }

  // Always return generic safe message to prevent email enumeration
  return {
    success: true,
    message:
      "Si cette adresse est associée à un compte, vous recevrez un email contenant les instructions pour réinitialiser votre mot de passe.",
    email,
  };
}

export default function ForgotPassword() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [email, setEmail] = useState("");

  return (
    <main className="container" id="forgot-password-view">
      <div className="card" id="forgot-password-card" style={{ maxWidth: "480px", margin: "0 auto" }}>
        {/* Brand Icon Header */}
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }} id="forgot-brand-header">
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
            id="forgot-brand-icon"
          >
            <KeyRoundIcon size={28} />
          </div>
          <h1 id="forgot-password-title" style={{ fontSize: "1.65rem", fontWeight: 700, marginBottom: "0.35rem" }}>
            Mot de passe oublié
          </h1>
          <p className="subtitle" id="forgot-password-subtitle" style={{ marginBottom: 0, fontSize: "0.95rem" }}>
            Saisissez votre adresse email pour recevoir un lien de réinitialisation sécurisé
          </p>
        </div>

        {actionData?.error && (
          <div
            className="alert alert-error"
            id="forgot-password-error"
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

        {actionData && "success" in actionData && actionData.success && (
          <div
            className="alert alert-success"
            id="forgot-password-success"
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

        <Form method="post" className="auth-form" id="forgot-password-form">
          <div className="form-group" id="forgot-password-group-email">
            <label htmlFor="forgot-password-email" className="form-label" style={{ fontWeight: 600 }}>
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
                  color: "#94a3b8",
                  pointerEvents: "none",
                }}
              />
              <input
                type="email"
                id="forgot-password-email"
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

          <button
            type="submit"
            className="btn btn-primary btn-block"
            id="forgot-password-submit"
            disabled={isSubmitting || !email}
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
                <span>Envoi en cours...</span>
              </>
            ) : (
              <>
                <span>Envoyer le lien de réinitialisation</span>
                <ArrowRightIcon size={18} />
              </>
            )}
          </button>
        </Form>

        <div
          className="auth-footer"
          id="forgot-password-footer"
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
            id="forgot-password-back-link"
            style={{ fontSize: "0.85rem", color: "#64748b", textDecoration: "none" }}
          >
            &larr; Retour à la page de connexion
          </a>
        </div>
      </div>
    </main>
  );
}
