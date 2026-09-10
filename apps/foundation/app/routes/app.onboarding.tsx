import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/app.onboarding";
import { getAppEnv } from "../context";
import { requireAuth, syncUserProfile } from "../auth";
import { withDb } from "../db/client";
import { profiles } from "../db/schema/profiles";
import { seedDefaultShiftTypes, DEFAULT_SHIFT_TYPES } from "../db/schema/planning";
import { createAnalyticsService } from "../services/analytics";

export function meta() {
  return [
    { title: "Configuration initiale — Planning Infirmier" },
    { name: "description", content: "Mise en place de votre profil et de vos gardes" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);
  const { user } = await requireAuth(request, env);

  // Track onboarding started event via IAnalyticsService
  try {
    const analytics = createAnalyticsService(env);
    await analytics.track({
      distinctId: user.id,
      event: "onboarding_started",
      properties: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // Non-blocking analytics
  }

  return {
    user: {
      email: user.email,
    },
    defaultShiftTypes: DEFAULT_SHIFT_TYPES,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getAppEnv(context);
  const { user } = await requireAuth(request, env);

  const formData = await request.formData();
  const displayName = formData.get("displayName")?.toString().trim();
  const profession = formData.get("profession")?.toString().trim();

  if (!displayName || displayName.length < 2) {
    return {
      error: "Veuillez indiquer votre nom ou votre prénom (au moins 2 caractères).",
    };
  }

  if (!env.HYPERDRIVE) {
    return {
      error: "Erreur système: base de données inaccessible.",
    };
  }

  const profile = await syncUserProfile(env.HYPERDRIVE, user, displayName);
  if (!profile) {
    return {
      error: "Impossible de créer ou mettre à jour le profil utilisateur.",
    };
  }

  // Save profile display name and seed default shift types idempotently
  await withDb(env.HYPERDRIVE, async (db) => {
    await db
      .update(profiles)
      .set({
        displayName,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profile.id));

    await seedDefaultShiftTypes(db, profile.id);
  });

  // Track onboarding completed event via IAnalyticsService boundary ONLY upon success
  try {
    const analytics = createAnalyticsService(env);
    await analytics.track({
      distinctId: user.id,
      event: "onboarding_completed",
      properties: {
        profession: profession || "Infirmier DE",
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // Analytics failure must never block redirection
  }

  throw redirect("/app/planning");
}

export default function Onboarding() {
  const { user, defaultShiftTypes } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="onboarding-card" id="onboarding-container">
      <div className="onboarding-header" id="onboarding-header">
        <span className="onboarding-badge" id="onboarding-badge">
          Étape 1 sur 1
        </span>
        <h1 id="onboarding-title">Bienvenue sur Planning Infirmier</h1>
        <p className="subtitle" id="onboarding-subtitle">
          Configurons votre compte pour préparer votre planning de gardes.
        </p>
      </div>

      {actionData?.error && (
        <div className="alert alert-error" role="alert" id="onboarding-error">
          {actionData.error}
        </div>
      )}

      <Form method="post" className="auth-form" id="onboarding-form">
        <div className="form-group" id="group-display-name">
          <label htmlFor="displayName" className="form-label" id="label-display-name">
            Nom ou Prénom d'affichage *
          </label>
          <input
            type="text"
            id="displayName"
            name="displayName"
            className="form-input"
            placeholder="ex. Infirmière Sophie"
            required
            minLength={2}
            defaultValue={user.email ? user.email.split("@")[0] : ""}
          />
        </div>

        <div className="form-group" id="group-profession">
          <label htmlFor="profession" className="form-label" id="label-profession">
            Profession / Rôle
          </label>

          <select id="profession" name="profession" className="form-input" defaultValue="ide">
            <option value="ide">Infirmier(ère) Diplômé(e) d'État (IDE)</option>
            <option value="iade">Infirmier(ère) Anesthésiste (IADE)</option>
            <option value="ibode">Infirmier(ère) de Bloc Opératoire (IBODE)</option>
            <option value="ipde">Infirmier(ère) Puéricultrice (IPDE)</option>
            <option value="as">Aide-Soignant(e) (AS)</option>
            <option value="cadre">Cadre de Santé</option>
            <option value="autre">Autre professionnel de santé</option>
          </select>
        </div>

        <div className="dashboard-section" id="group-shift-types-preview">
          <h2 className="section-title" id="shift-types-title">
            Types de gardes initialisés
          </h2>
          <p className="info-muted" id="shift-types-desc">
            Votre profil sera automatiquement configuré avec les roulements standards suivants :
          </p>

          <div className="shift-types-preview" id="shift-types-chips">
            {defaultShiftTypes.map((st) => (
              <div key={st.name} className="shift-type-chip" id={`chip-${st.shortCode}`}>
                <span
                  className="shift-color-dot"
                  style={{ backgroundColor: st.color }}
                />
                <span>
                  <strong>{st.name}</strong> {st.startTime ? `(${st.startTime}-${st.endTime})` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={isSubmitting}
          id="btn-submit-onboarding"
        >
          {isSubmitting ? "Initialisation en cours..." : "Valider et accéder à mon planning"}
        </button>
      </Form>
    </div>
  );
}
