import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/app.onboarding";
import { getAppEnv } from "../context";
import { requireAuth, syncUserProfile } from "../auth";
import { withDb } from "../db/client";
import { profiles } from "../db/schema/profiles";
import {
  nurseProfiles,
  normalizeProfession,
  SUPPORTED_PROFESSIONS,
} from "../db/schema/planning/nurse-profiles";
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

  if (env.HYPERDRIVE) {
    const profile = await syncUserProfile(env.HYPERDRIVE, user);
    if (profile) {
      await withDb(env.HYPERDRIVE, async (db) => {
        const existingNurseProfiles = await db
          .select()
          .from(nurseProfiles)
          .where(eq(nurseProfiles.profileId, profile.id))
          .limit(1);

        // Track onboarding_started ONLY once when entering the onboarding journey for the first time
        if (existingNurseProfiles.length === 0) {
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
            // Analytics failures must never block request execution
          }

          // Mark onboarding as started in DB to prevent duplicate started events on loader revalidations
          await db
            .insert(nurseProfiles)
            .values({
              profileId: profile.id,
              profession: "PENDING",
            })
            .onConflictDoNothing();
        }
      });
    }
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
  const rawProfession = formData.get("profession")?.toString().trim();

  if (!displayName || displayName.length < 2) {
    return {
      error: "Veuillez indiquer votre nom ou votre prénom (au moins 2 caractères).",
    };
  }

  const validatedProfession = normalizeProfession(rawProfession);
  if (!validatedProfession) {
    return {
      error: "Veuillez sélectionner une profession valide.",
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

  // Save profile display name, persist nurse profession, and seed default shift types idempotently
  await withDb(env.HYPERDRIVE, async (db) => {
    await db
      .update(profiles)
      .set({
        displayName,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profile.id));

    await db
      .insert(nurseProfiles)
      .values({
        profileId: profile.id,
        profession: validatedProfession,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: nurseProfiles.profileId,
        set: {
          profession: validatedProfession,
          updatedAt: new Date(),
        },
      });

    await seedDefaultShiftTypes(db, profile.id);
  });

  // Track onboarding completed event via IAnalyticsService boundary ONLY upon success
  try {
    const analytics = createAnalyticsService(env);
    await analytics.track({
      distinctId: user.id,
      event: "onboarding_completed",
      properties: {
        profession: validatedProfession,
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
            Profession / Rôle *
          </label>

          <select id="profession" name="profession" className="form-input" defaultValue="IDE" required>
            {SUPPORTED_PROFESSIONS.map((prof) => (
              <option key={prof} value={prof}>
                {prof === "IDE" && "Infirmier(ère) Diplômé(e) d'État (IDE)"}
                {prof === "IADE" && "Infirmier(ère) Anesthésiste (IADE)"}
                {prof === "IBODE" && "Infirmier(ère) de Bloc Opératoire (IBODE)"}
                {prof === "IPDE" && "Infirmier(ère) Puéricultrice (IPDE)"}
                {prof === "AS" && "Aide-Soignant(e) (AS)"}
                {prof === "Cadre" && "Cadre de Santé"}
                {prof === "Autre" && "Autre professionnel de santé"}
              </option>
            ))}
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
