import { Form, redirect, useActionData, useNavigation, useSearchParams } from "react-router";
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

export default function Login() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const isSubmitting = navigation.state === "submitting";
  const redirectTo = searchParams.get("redirectTo");

  return (
    <main className="container" id="login-view">
      <div className="card" id="login-card">
        <h1 id="login-title">Connexion</h1>
        <p className="subtitle" id="login-subtitle">
          Accédez à votre espace sécurisé
        </p>

        {actionData?.error && (
          <div className="alert alert-error" id="login-error" role="alert">
            {actionData.error}
          </div>
        )}

        <Form method="post" className="auth-form" id="login-form">
          {redirectTo && (
            <input type="hidden" name="redirectTo" value={redirectTo} />
          )}

          <div className="form-group" id="login-group-email">
            <label htmlFor="login-email" className="form-label">
              Adresse email
            </label>
            <input
              type="email"
              id="login-email"
              name="email"
              required
              autoComplete="email"
              className="form-input"
              placeholder="nom@exemple.fr"
            />
          </div>

          <div className="form-group" id="login-group-password">
            <div className="form-label-row">
              <label htmlFor="login-password" className="form-label">
                Mot de passe
              </label>
              <a
                href="/forgot-password"
                className="form-helper-link"
                id="login-forgot-link"
              >
                Mot de passe oublié ?
              </a>
            </div>
            <input
              type="password"
              id="login-password"
              name="password"
              required
              autoComplete="current-password"
              className="form-input"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            id="login-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Connexion en cours..." : "Se connecter"}
          </button>
        </Form>

        <div className="auth-footer" id="login-footer">
          <p>
            Pas encore de compte ?{" "}
            <a href="/signup" className="nav-link" id="login-signup-link">
              Créer un compte
            </a>
          </p>
          <a href="/" className="nav-link-back" id="login-back-link">
            &larr; Retour à l&apos;accueil
          </a>
        </div>
      </div>
    </main>
  );
}
