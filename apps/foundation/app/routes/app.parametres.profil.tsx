import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/app.parametres.profil";
import { getAppEnv } from "../context";
import { requireAuth, syncUserProfile } from "../auth";
import { withDb } from "../db/client";
import { profiles } from "../db/schema/profiles";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);
  const { user } = await requireAuth(request, env);

  let profileData: {
    displayName: string | null;
    email: string | null;
  } | null = null;

  if (env.HYPERDRIVE) {
    const profile = await syncUserProfile(env.HYPERDRIVE, user);
    if (profile) {
      profileData = {
        displayName: profile.displayName,
        email: profile.email,
      };
    }
  }

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    profile: profileData,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getAppEnv(context);
  const { user } = await requireAuth(request, env);

  const formData = await request.formData();
  const displayName = formData.get("displayName")?.toString().trim();

  if (!displayName || displayName.length < 2) {
    return { error: "Veuillez indiquer un nom valide (au moins 2 caractères)." };
  }

  if (env.HYPERDRIVE) {
    const profile = await syncUserProfile(env.HYPERDRIVE, user);
    if (profile) {
      await withDb(env.HYPERDRIVE, async (db) => {
        await db
          .update(profiles)
          .set({ displayName, updatedAt: new Date() })
          .where(eq(profiles.id, profile.id));
      });
    }
  }

  return { success: "Profil mis à jour avec succès." };
}

export default function ParametresProfil() {
  const { user, profile } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="settings-section" id="section-profil">
      <h2 className="section-title" id="profil-title">Profil Utilisateur</h2>

      {actionData?.error && (
        <div className="alert alert-error" role="alert" id="profil-error">
          {actionData.error}
        </div>
      )}

      {actionData?.success && (
        <div className="alert alert-success" role="status" id="profil-success">
          {actionData.success}
        </div>
      )}

      <Form method="post" className="auth-form" id="profil-form">
        <div className="form-group" id="group-profil-email">
          <label htmlFor="email" className="form-label" id="label-profil-email">
            Adresse Email
          </label>
          <input
            type="email"
            id="email"
            className="form-input"
            value={profile?.email || user.email || ""}
            disabled
            style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text-muted)" }}
          />
        </div>

        <div className="form-group" id="group-profil-displayName">
          <label htmlFor="displayName" className="form-label" id="label-profil-displayName">
            Nom / Prénom d'affichage
          </label>
          <input
            type="text"
            id="displayName"
            name="displayName"
            className="form-input"
            defaultValue={profile?.displayName || ""}
            required
            minLength={2}
          />
        </div>

        <div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting}
            id="btn-save-profil"
          >
            {isSubmitting ? "Enregistrement..." : "Enregistrer les modifications"}
          </button>
        </div>
      </Form>
    </div>
  );
}
