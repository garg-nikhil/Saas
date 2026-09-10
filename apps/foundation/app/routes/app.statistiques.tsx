import type { Route } from "./+types/app.statistiques";
import { getAppEnv } from "../context";
import { requireAuth } from "../auth";

export function meta() {
  return [
    { title: "Statistiques & Heures — Planning Infirmier" },
    { name: "description", content: "Analyse des heures et statistiques de garde" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);
  await requireAuth(request, env);
  return null;
}

export default function Statistiques() {
  return (
    <div className="card" id="statistiques-card">
      <h1 id="statistiques-title">Statistiques & Heures</h1>
      <p className="subtitle" id="statistiques-subtitle">
        Analyse de vos heures de garde et de repos
      </p>

      <div className="placeholder-notice" id="statistiques-placeholder">
        <p>
          <strong>Module en cours de développement.</strong>
        </p>
        <p>
          Cette section permettra de visualiser la répartition de vos heures de travail, vos gardes de nuit, les dimanches travaillés et le suivi du temps de repos réglementaire.
        </p>
      </div>
    </div>
  );
}
