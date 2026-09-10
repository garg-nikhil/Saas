import type { Route } from "./+types/app.parametres.abonnement";
import { getAppEnv } from "../context";
import { requireAuth } from "../auth";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);
  await requireAuth(request, env);
  return null;
}

export default function ParametresAbonnement() {
  return (
    <div className="settings-section" id="section-abonnement">
      <h2 className="section-title" id="abonnement-title">Formule d'Abonnement</h2>
      <div className="info-item" style={{ marginBottom: "1rem" }} id="abonnement-status">
        <span className="info-label">Statut Actuel</span>
        <span className="info-value">Offre Découverte (Inclus)</span>
      </div>

      <div className="placeholder-notice" id="abonnement-placeholder">
        <p>
          <strong>Gestion de l'abonnement.</strong>
        </p>
        <p>
          Accédez aux fonctionnalités avancées d'exportation PDF, d'estimation salariale et de partage de planning.
        </p>
      </div>
    </div>
  );
}
