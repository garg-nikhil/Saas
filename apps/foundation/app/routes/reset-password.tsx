import { Form, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/reset-password";
import { getAppEnv } from "../context";
import { createAuthService } from "../auth";

export function meta() {
  return [
    { title: "Nouveau mot de passe - SaaS Factory" },
    { name: "description", content: "Définir un nouveau mot de passe" },
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

  return redirect("/app", {
    headers: responseHeaders,
  });
}

export default function ResetPassword() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <main className="container" id="reset-password-view">
      <div className="card" id="reset-password-card">
        <h1 id="reset-password-title">Nouveau mot de passe</h1>
        <p className="subtitle" id="reset-password-subtitle">
          Définissez un nouveau mot de passe pour votre compte
        </p>

        {actionData?.error && (
          <div className="alert alert-error" id="reset-password-error" role="alert">
            {actionData.error}
          </div>
        )}

        <Form method="post" className="auth-form" id="reset-password-form">
          <div className="form-group" id="reset-group-password">
            <label htmlFor="reset-password" className="form-label">
              Nouveau mot de passe (8 caractères min.)
            </label>
            <input
              type="password"
              id="reset-password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="form-input"
              placeholder="••••••••"
            />
          </div>

          <div className="form-group" id="reset-group-confirm">
            <label htmlFor="reset-password-confirm" className="form-label">
              Confirmer le mot de passe
            </label>
            <input
              type="password"
              id="reset-password-confirm"
              name="passwordConfirmation"
              required
              minLength={8}
              autoComplete="new-password"
              className="form-input"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            id="reset-password-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Mise à jour..." : "Mettre à jour le mot de passe"}
          </button>
        </Form>

        <div className="auth-footer" id="reset-password-footer">
          <a href="/login" className="nav-link-back" id="reset-password-back-link">
            &larr; Retour à la page de connexion
          </a>
        </div>
      </div>
    </main>
  );
}
