import { Form, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/forgot-password";
import { getAppEnv } from "../context";
import { createAuthService } from "../auth";

export function meta() {
  return [
    { title: "Mot de passe oublié - SaaS Factory" },
    { name: "description", content: "Réinitialisation de mot de passe SaaS Factory" },
  ];
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getAppEnv(context);
  const formData = await request.formData();
  const email = (formData.get("email") as string | null)?.trim() || "";

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
  };
}

export default function ForgotPassword() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <main className="container" id="forgot-password-view">
      <div className="card" id="forgot-password-card">
        <h1 id="forgot-password-title">Mot de passe oublié</h1>
        <p className="subtitle" id="forgot-password-subtitle">
          Saisissez votre adresse email pour recevoir un lien de réinitialisation
        </p>

        {actionData?.error && (
          <div className="alert alert-error" id="forgot-password-error" role="alert">
            {actionData.error}
          </div>
        )}

        {actionData && "success" in actionData && actionData.success && (
          <div
            className="alert alert-success"
            id="forgot-password-success"
            role="status"
          >
            {actionData.message}
          </div>
        )}

        <Form method="post" className="auth-form" id="forgot-password-form">
          <div className="form-group" id="forgot-password-group-email">
            <label htmlFor="forgot-password-email" className="form-label">
              Adresse email
            </label>
            <input
              type="email"
              id="forgot-password-email"
              name="email"
              required
              autoComplete="email"
              className="form-input"
              placeholder="nom@exemple.fr"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            id="forgot-password-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Envoi en cours..." : "Envoyer le lien de réinitialisation"}
          </button>
        </Form>

        <div className="auth-footer" id="forgot-password-footer">
          <a href="/login" className="nav-link-back" id="forgot-password-back-link">
            &larr; Retour à la page de connexion
          </a>
        </div>
      </div>
    </main>
  );
}
