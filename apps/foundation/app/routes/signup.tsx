import { Form, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/signup";
import { getAppEnv } from "../context";
import {
  createAuthService,
  getOptionalAuth,
  syncUserProfile,
} from "../auth";

export function meta() {
  return [
    { title: "Créer un compte - SaaS Factory" },
    { name: "description", content: "Inscription sécurisée à SaaS Factory" },
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

export async function action({ request, context }: Route.ActionArgs) {
  const env = getAppEnv(context);
  const formData = await request.formData();
  const email = (formData.get("email") as string | null)?.trim() || "";
  const password = (formData.get("password") as string | null) || "";
  const passwordConfirmation =
    (formData.get("passwordConfirmation") as string | null) || "";
  const displayName =
    (formData.get("displayName") as string | null)?.trim() || undefined;

  // Validation
  if (!email) {
    return { error: "Veuillez renseigner votre adresse email." };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
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

  const { authService, responseHeaders } = createAuthService(request, env);
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

  // Check if session was immediately established (email confirmation disabled/auto-confirmed)
  if (data?.session && data?.user) {
    if (env.HYPERDRIVE) {
      await syncUserProfile(env.HYPERDRIVE, data.user, displayName);
    }

    return redirect("/app", {
      headers: responseHeaders,
    });
  }

  // If email confirmation is required, handle unconfirmed state gracefully
  return {
    success: true,
    message:
      "Votre compte a été créé avec succès ! Si la confirmation par email est activée, veuillez vérifier votre boîte de réception pour valider votre compte avant de vous connecter.",
  };
}

export default function Signup() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <main className="container" id="signup-view">
      <div className="card" id="signup-card">
        <h1 id="signup-title">Créer un compte</h1>
        <p className="subtitle" id="signup-subtitle">
          Rejoignez la plateforme SaaS Factory
        </p>

        {actionData?.error && (
          <div className="alert alert-error" id="signup-error" role="alert">
            {actionData.error}
          </div>
        )}

        {actionData && "success" in actionData && actionData.success && (
          <div className="alert alert-success" id="signup-success" role="status">
            {actionData.message}
            <div className="alert-action">
              <a href="/login" className="btn btn-primary btn-sm" id="signup-to-login">
                Aller à la page de connexion
              </a>
            </div>
          </div>
        )}

        {(!actionData || !("success" in actionData) || !actionData.success) && (
          <Form method="post" className="auth-form" id="signup-form">
            <div className="form-group" id="signup-group-email">
              <label htmlFor="signup-email" className="form-label">
                Adresse email
              </label>
              <input
                type="email"
                id="signup-email"
                name="email"
                required
                autoComplete="email"
                className="form-input"
                placeholder="nom@exemple.fr"
              />
            </div>

            <div className="form-group" id="signup-group-password">
              <label htmlFor="signup-password" className="form-label">
                Mot de passe (8 caractères minimum)
              </label>
              <input
                type="password"
                id="signup-password"
                name="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="form-input"
                placeholder="••••••••"
              />
            </div>

            <div className="form-group" id="signup-group-confirmation">
              <label htmlFor="signup-password-confirm" className="form-label">
                Confirmer le mot de passe
              </label>
              <input
                type="password"
                id="signup-password-confirm"
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
              id="signup-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Création en cours..." : "S'inscrire"}
            </button>
          </Form>
        )}

        <div className="auth-footer" id="signup-footer">
          <p>
            Déjà un compte ?{" "}
            <a href="/login" className="nav-link" id="signup-login-link">
              Se connecter
            </a>
          </p>
          <a href="/" className="nav-link-back" id="signup-back-link">
            &larr; Retour à l&apos;accueil
          </a>
        </div>
      </div>
    </main>
  );
}
