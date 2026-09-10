import { Form, NavLink, Outlet, redirect, useLoaderData, useLocation } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/app";
import { getAppEnv } from "../context";
import { requireAuth, syncUserProfile } from "../auth";
import { withDb } from "../db/client";
import { shiftTypes } from "../db/schema/planning/shift-types";
import { createAnalyticsService } from "../services/analytics";

export function meta() {
  return [
    { title: "Planning Infirmier — Application" },
    { name: "description", content: "Gestion de planning pour infirmiers et infirmières" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);

  // 1. Server-side authentication guard
  const { user } = await requireAuth(request, env);

  // 2. Profile resolution & onboarding check
  let profileData: {
    id: string;
    userId: string;
    displayName: string | null;
    email: string | null;
    createdAt: string | null;
  } | null = null;

  let isOnboarded = false;

  if (env.HYPERDRIVE) {
    const profile = await syncUserProfile(env.HYPERDRIVE, user);
    if (profile) {
      profileData = {
        id: profile.id,
        userId: profile.userId,
        displayName: profile.displayName,
        email: profile.email,
        createdAt: profile.createdAt ? new Date(profile.createdAt).toISOString() : null,
      };

      const userShiftTypes = await withDb(env.HYPERDRIVE, async (db) => {
        return db
          .select({ id: shiftTypes.id })
          .from(shiftTypes)
          .where(eq(shiftTypes.profileId, profile.id))
          .limit(1);
      });

      isOnboarded = Boolean(profile.displayName && userShiftTypes.length > 0);
    }
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  // 3. Onboarding route protection & redirection
  if (!isOnboarded && pathname !== "/app/onboarding") {
    throw redirect("/app/onboarding");
  }

  if (isOnboarded && pathname === "/app/onboarding") {
    throw redirect("/app/planning");
  }

  // 4. Track page view event via IAnalyticsService boundary
  try {
    const analytics = createAnalyticsService(env);
    await analytics.page({
      distinctId: user.id,
      url: pathname,
    });
  } catch {
    // Analytics failure must never disrupt request processing
  }

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    profile: profileData,
    isOnboarded,
  };
}

export default function AppLayout() {
  const { user, profile, isOnboarded } = useLoaderData<typeof loader>();
  const location = useLocation();

  const isCurrent = (path: string) => {
    if (path === "/app/parametres") {
      return location.pathname.startsWith("/app/parametres");
    }
    return location.pathname === path;
  };

  return (
    <div className="app-shell" id="app-shell">
      {/* Header */}
      <header className="app-header" id="app-header">
        <NavLink to="/app/planning" className="app-brand" id="app-brand">
          <span>🩺 Planning Infirmier</span>
          <span className="app-brand-badge" id="app-badge">
            Pro
          </span>
        </NavLink>

        <div className="app-user-bar" id="app-user-bar">
          <div className="app-user-pill" id="app-user-pill">
            <span id="app-user-display-name">
              {profile?.displayName ?? user.email ?? "Infirmier"}
            </span>
          </div>

          <Form action="/logout" method="post" id="app-logout-form">
            <button type="submit" className="btn btn-secondary btn-sm" id="btn-app-logout">
              Déconnexion
            </button>
          </Form>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="app-main" id="app-main">
        <Outlet context={{ user, profile, isOnboarded }} />
      </main>

      {/* Mobile-First Navigation Bar */}
      {isOnboarded && (
        <nav className="app-nav" aria-label="Navigation principale" id="app-navigation">
          <NavLink
            to="/app/planning"
            className="nav-item"
            aria-current={isCurrent("/app/planning") ? "page" : undefined}
            id="nav-planning"
          >
            <span className="nav-icon">📅</span>
            <span className="nav-label">Planning</span>
          </NavLink>

          <NavLink
            to="/app/statistiques"
            className="nav-item"
            aria-current={isCurrent("/app/statistiques") ? "page" : undefined}
            id="nav-statistiques"
          >
            <span className="nav-icon">📊</span>
            <span className="nav-label">Stats</span>
          </NavLink>

          <NavLink
            to="/app/salaire"
            className="nav-item"
            aria-current={isCurrent("/app/salaire") ? "page" : undefined}
            id="nav-salaire"
          >
            <span className="nav-icon">💶</span>
            <span className="nav-label">Salaire</span>
          </NavLink>

          <NavLink
            to="/app/export"
            className="nav-item"
            aria-current={isCurrent("/app/export") ? "page" : undefined}
            id="nav-export"
          >
            <span className="nav-icon">📄</span>
            <span className="nav-label">Export</span>
          </NavLink>

          <NavLink
            to="/app/parametres"
            className="nav-item"
            aria-current={isCurrent("/app/parametres") ? "page" : undefined}
            id="nav-parametres"
          >
            <span className="nav-icon">⚙️</span>
            <span className="nav-label">Réglages</span>
          </NavLink>
        </nav>
      )}
    </div>
  );
}
