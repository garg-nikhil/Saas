import { Form, useLoaderData } from "react-router";
import type { Route } from "./+types/app";
import { getAppEnv } from "../context";
import { requireAuth, syncUserProfile } from "../auth";

export function meta() {
  return [
    { title: "Espace Client - SaaS Factory" },
    { name: "description", content: "Tableau de bord sécurisé SaaS Factory" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);

  // Server-side authentication guard
  const { user } = await requireAuth(request, env);

  // Derive ownership strictly from the authenticated identity
  let profile = null;
  if (env.HYPERDRIVE) {
    profile = await syncUserProfile(env.HYPERDRIVE, user);
  }

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    profile: profile
      ? {
          id: profile.id,
          userId: profile.userId,
          displayName: profile.displayName,
          email: profile.email,
          createdAt: profile.createdAt ? new Date(profile.createdAt).toISOString() : null,
        }
      : null,
  };
}

export default function AppDashboard() {
  const { user, profile } = useLoaderData<typeof loader>();

  return (
    <main className="container" id="app-view">
      <div className="card" id="app-card">
        <div className="card-header-row" id="app-header">
          <div>
            <h1 id="app-title">Tableau de bord</h1>
            <p className="subtitle" id="app-subtitle">
              Session authentifiée avec succès
            </p>
          </div>
          <Form action="/logout" method="post" id="logout-form">
            <button
              type="submit"
              className="btn btn-secondary btn-sm"
              id="btn-logout"
            >
              Se déconnecter
            </button>
          </Form>
        </div>

        <section className="dashboard-section" id="section-identity">
          <h2 className="section-title" id="identity-title">Identité d&apos;authentification</h2>
          <div className="info-grid" id="identity-grid">
            <div className="info-item" id="item-user-id">
              <span className="info-label">ID Utilisateur (Supabase Auth)</span>
              <code className="info-value" id="val-user-id">{user.id}</code>
            </div>
            <div className="info-item" id="item-email">
              <span className="info-label">Adresse Email</span>
              <span className="info-value" id="val-email">{user.email ?? "Non renseigné"}</span>
            </div>
          </div>
        </section>

        <section className="dashboard-section" id="section-profile">
          <h2 className="section-title" id="profile-title">Profil Applicatif (PostgreSQL)</h2>
          {profile ? (
            <div className="info-grid" id="profile-grid">
              <div className="info-item" id="item-profile-id">
                <span className="info-label">ID Profil (UUID)</span>
                <code className="info-value" id="val-profile-id">{profile.id}</code>
              </div>
              <div className="info-item" id="item-profile-user-id">
                <span className="info-label">Clé Étrangère user_id</span>
                <code className="info-value" id="val-profile-user-id">{profile.userId}</code>
              </div>
              <div className="info-item" id="item-profile-created">
                <span className="info-label">Date de création</span>
                <span className="info-value" id="val-profile-created">
                  {profile.createdAt ? new Date(profile.createdAt).toLocaleString("fr-FR") : "N/A"}
                </span>
              </div>
            </div>
          ) : (
            <p className="info-muted" id="profile-pending-notice">
              Profil applicatif en attente de synchronisation base de données.
            </p>
          )}
        </section>

        <div className="app-footer" id="app-footer">
          <a href="/" className="nav-link-back" id="app-back-link">
            &larr; Retour à l&apos;accueil
          </a>
        </div>
      </div>
    </main>
  );
}
