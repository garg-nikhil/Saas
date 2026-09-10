import type { Route } from "./+types/app.salaire";
import { getAppEnv } from "../context";
import { requireAuth } from "../auth";

export function meta() {
  return [
    { title: "Estimation Salaire — Planning Infirmier" },
    { name: "description", content: "Estimation du salaire et calcul des majorations" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);
  await requireAuth(request, env);
  return null;
}

export default function Salaire() {
  return (
    <div className="card" id="salaire-card">
      <h1 id="salaire-title">Estimation de Salaire</h1>
      <p className="subtitle" id="salaire-subtitle">
        Calcul automatique des primes et majorations de gardes
      </p>

      <div className="placeholder-notice" id="salaire-placeholder">
        <p>
          <strong>Module en cours de développement.</strong>
        </p>
        <p>
          Le moteur de calcul de salaire intègrera les majorations de nuit, dimanche, jours fériés et heures supplémentaires selon votre grille indemnitaire.
        </p>
      </div>
    </div>
  );
}
