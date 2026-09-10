import type { Route } from "./+types/app.export";
import { getAppEnv } from "../context";
import { requireAuth } from "../auth";

export function meta() {
  return [
    { title: "Exportation Planning — Planning Infirmier" },
    { name: "description", content: "Export PDF et synchronisation calendrier" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);
  await requireAuth(request, env);
  return null;
}

export default function Export() {
  return (
    <div className="card" id="export-card">
      <h1 id="export-title">Exportation du Planning</h1>
      <p className="subtitle" id="export-subtitle">
        Téléchargement PDF et synchronisation agenda
      </p>

      <div className="placeholder-notice" id="export-placeholder">
        <p>
          <strong>Module en cours de développement.</strong>
        </p>
        <p>
          Vous pourrez très bientôt exporter votre planning mensuel au format PDF imprimable ou le synchroniser directement avec Google Calendar, Apple Calendar ou Outlook.
        </p>
      </div>
    </div>
  );
}
