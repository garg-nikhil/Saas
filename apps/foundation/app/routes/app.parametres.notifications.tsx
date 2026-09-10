import type { Route } from "./+types/app.parametres.notifications";
import { getAppEnv } from "../context";
import { requireAuth } from "../auth";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);
  await requireAuth(request, env);
  return null;
}

export default function ParametresNotifications() {
  return (
    <div className="settings-section" id="section-notifications">
      <h2 className="section-title" id="notifications-title">Notifications & Rappels</h2>
      <div className="placeholder-notice" id="notifications-placeholder">
        <p>
          <strong>Rappels de gardes bientôt disponibles.</strong>
        </p>
        <p>
          Vous pourrez recevoir des rappels par notification ou email avant le début de vos gardes de nuit et vos roulements.
        </p>
      </div>
    </div>
  );
}
