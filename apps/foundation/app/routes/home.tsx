import { redirect } from "react-router";
import type { Route } from "./+types/home";
import { getAppEnv } from "../context";
import { getOptionalAuth } from "../auth";
import { ArrowRightIcon, LockIcon, UserIcon } from "../components/Icons";

export function meta() {
  return [
    { title: "Planning Infirmier — Gestion de planning pour infirmiers et infirmières" },
    { name: "description", content: "Gestion simple et efficace de vos gardes infirmières, roulements récurrents et heures de travail." },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);
  const { user, headers } = await getOptionalAuth(request, env);

  // Automatically redirect active authenticated sessions directly to dashboard
  if (user) {
    throw redirect("/app", {
      headers,
    });
  }

  return {
    renderedAt: new Date().toISOString(),
  };
}

export default function Home() {
  return (
    <main className="container" id="home-view">
      <div className="card" id="home-card">
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <span style={{ fontSize: "2.5rem" }}>🩺</span>
          <h1 id="home-title" style={{ marginTop: "0.5rem" }}>Planning Infirmier</h1>
          <p className="subtitle" id="home-subtitle" style={{ maxWidth: "540px", margin: "0.5rem auto 0" }}>
            La solution sur mesure pour gérer vos gardes, vos roulements récurrents et calculer automatiquement vos heures de travail infirmières.
          </p>
        </div>

        <div style={{ display: "grid", gap: "1rem", marginBottom: "2rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div style={{ padding: "1rem", borderRadius: "0.5rem", border: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
            <div style={{ fontSize: "1.25rem", marginBottom: "0.25rem" }}>📅</div>
            <strong>Gardes & Planning</strong>
            <p style={{ fontSize: "0.875rem", color: "#64748b", marginTop: "0.25rem", marginBottom: 0 }}>
              Visualisez clairement votre mois de garde, vos jours travaillés et vos repos.
            </p>
          </div>

          <div style={{ padding: "1rem", borderRadius: "0.5rem", border: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
            <div style={{ fontSize: "1.25rem", marginBottom: "0.25rem" }}>🔄</div>
            <strong>Roulements Récurrents</strong>
            <p style={{ fontSize: "0.875rem", color: "#64748b", marginTop: "0.25rem", marginBottom: 0 }}>
              Planifiez facilement vos trames et cycles de travail répétitifs.
            </p>
          </div>

          <div style={{ padding: "1rem", borderRadius: "0.5rem", border: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
            <div style={{ fontSize: "1.25rem", marginBottom: "0.25rem" }}>⏱</div>
            <strong>Calcul d'heures</strong>
            <p style={{ fontSize: "0.875rem", color: "#64748b", marginTop: "0.25rem", marginBottom: 0 }}>
              Gestion automatique des gardes de jour, de nuit et des heures supplémentaires.
            </p>
          </div>
        </div>

        <div className="button-group" id="home-actions" style={{ justifyContent: "center" }}>
          <a
            href="/login"
            className="btn btn-primary"
            id="btn-login"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            <span>Se connecter</span>
            <ArrowRightIcon size={16} />
          </a>
          <a
            href="/signup"
            className="btn btn-secondary"
            id="btn-signup"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            <UserIcon size={16} />
            <span>Créer un compte</span>
          </a>
        </div>
      </div>
    </main>
  );
}
