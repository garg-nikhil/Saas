import { NavLink, Outlet, useLocation } from "react-router";
import type { Route } from "./+types/app.parametres";
import { getAppEnv } from "../context";
import { requireAuth } from "../auth";

export function meta() {
  return [
    { title: "Paramètres — Planning Infirmier" },
    { name: "description", content: "Configuration et préférences de l'application" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);
  await requireAuth(request, env);
  return null;
}

export default function ParametresLayout() {
  const location = useLocation();

  const isCurrent = (path: string) => location.pathname === path;

  return (
    <div className="card" id="parametres-card">
      <h1 id="parametres-title">Paramètres</h1>
      <p className="subtitle" id="parametres-subtitle">
        Gérez les préférences de votre compte et la configuration de votre roulement
      </p>

      {/* Settings Sub-Navigation Tabs */}
      <nav className="settings-nav" aria-label="Sous-navigation des paramètres" id="settings-nav">
        <NavLink
          to="/app/parametres/profil"
          className="settings-tab"
          aria-current={isCurrent("/app/parametres/profil") ? "page" : undefined}
          id="tab-profil"
        >
          Profil
        </NavLink>

        <NavLink
          to="/app/parametres/gardes"
          className="settings-tab"
          aria-current={isCurrent("/app/parametres/gardes") ? "page" : undefined}
          id="tab-gardes"
        >
          Types de Gardes
        </NavLink>

        <NavLink
          to="/app/parametres/notifications"
          className="settings-tab"
          aria-current={isCurrent("/app/parametres/notifications") ? "page" : undefined}
          id="tab-notifications"
        >
          Notifications
        </NavLink>

        <NavLink
          to="/app/parametres/abonnement"
          className="settings-tab"
          aria-current={isCurrent("/app/parametres/abonnement") ? "page" : undefined}
          id="tab-abonnement"
        >
          Abonnement
        </NavLink>
      </nav>

      <Outlet />
    </div>
  );
}
