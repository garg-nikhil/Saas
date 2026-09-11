import { Form, isRouteErrorResponse, NavLink, Outlet, redirect, useLoaderData, useLocation } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/app";
import { getAppEnv } from "../context";
import { requireAuth, syncUserProfile } from "../auth";
import { withDb } from "../db/client";
import { shiftTypes } from "../db/schema/planning/shift-types";
import { nurseProfiles } from "../db/schema/planning/nurse-profiles";
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

      const { userShiftTypes, nurseProfile } = await withDb(env.HYPERDRIVE, async (db) => {
        const types = await db
          .select({ id: shiftTypes.id })
          .from(shiftTypes)
          .where(eq(shiftTypes.profileId, profile.id))
          .limit(1);

        const np = await db
          .select({ profession: nurseProfiles.profession })
          .from(nurseProfiles)
          .where(eq(nurseProfiles.profileId, profile.id))
          .limit(1);

        return {
          userShiftTypes: types,
          nurseProfile: np[0] ?? null,
        };
      });

      isOnboarded = Boolean(
        profile.displayName &&
          profile.displayName.trim().length >= 2 &&
          nurseProfile?.profession &&
          userShiftTypes.length > 0,
      );
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

  if (pathname === "/app" || pathname === "/app/") {
    throw redirect(isOnboarded ? "/app/planning" : "/app/onboarding");
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

  const navItems = [
    {
      to: "/app/planning",
      label: "Planning",
      icon: "📅",
      id: "nav-planning",
      description: "Gardes & Calendrier",
    },
    {
      to: "/app/statistiques",
      label: "Statistiques",
      icon: "📊",
      id: "nav-statistiques",
      description: "Heures & Répartition",
    },
    {
      to: "/app/salaire",
      label: "Salaire",
      icon: "💶",
      id: "nav-salaire",
      description: "Primes & Estimations",
    },
    {
      to: "/app/export",
      label: "Export",
      icon: "📄",
      id: "nav-export",
      description: "PDF & Rapports",
    },
    {
      to: "/app/parametres",
      label: "Paramètres",
      icon: "⚙️",
      id: "nav-parametres",
      description: "Profil & Gardes",
    },
  ];

  const userInitial = (profile?.displayName || user.email || "I")[0].toUpperCase();

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-900" id="app-shell">
      {/* Desktop Navigation Sidebar */}
      {isOnboarded && (
        <aside
          className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 shrink-0 sticky top-0 h-screen z-30 shadow-sm"
          id="app-desktop-sidebar"
        >
          {/* Brand Header */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <NavLink
              to="/app/planning"
              className="flex items-center gap-2.5 font-bold text-slate-800 text-base no-underline hover:text-sky-600 transition-colors"
              id="sidebar-brand"
            >
              <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center text-lg shadow-sm">
                🩺
              </div>
              <div className="flex flex-col">
                <span className="leading-tight">Planning Infirmier</span>
                <span className="text-[11px] font-medium text-slate-500">Espace Soignant</span>
              </div>
            </NavLink>
            <span className="bg-sky-50 text-sky-700 text-[11px] font-semibold px-2 py-0.5 rounded border border-sky-200">
              Pro
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Navigation latérale" id="sidebar-nav">
            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Menu Principal
            </div>
            {navItems.map((item) => {
              const active = isCurrent(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  id={`sidebar-${item.id}`}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all no-underline ${
                    active
                      ? "bg-sky-50 text-sky-700 font-semibold shadow-xs"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span className="text-lg leading-none">{item.icon}</span>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate">{item.label}</span>
                    <span className="text-[11px] font-normal text-slate-400 truncate">
                      {item.description}
                    </span>
                  </div>
                  {active && (
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-600 shrink-0" />
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* Quick Action Button */}
          <div className="p-3 border-t border-slate-100">
            <NavLink
              to="/app/planning"
              className="flex items-center justify-center gap-2 w-full py-2 px-3 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors no-underline"
              id="sidebar-quick-add-btn"
            >
              <span>+</span>
              <span>Gérer mon planning</span>
            </NavLink>
          </div>

          {/* User Profile Card & Logout */}
          <div className="p-3 border-t border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 font-bold text-xs flex items-center justify-center shrink-0 border border-sky-200">
                  {userInitial}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-slate-800 truncate" id="sidebar-user-name">
                    {profile?.displayName ?? user.email?.split("@")[0] ?? "Infirmier"}
                  </span>
                  <span className="text-[11px] text-slate-400 truncate" id="sidebar-user-email">
                    {user.email}
                  </span>
                </div>
              </div>

              <Form action="/logout" method="post">
                <button
                  type="submit"
                  title="Se déconnecter"
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors text-xs font-medium cursor-pointer border border-transparent hover:border-red-100"
                  id="btn-sidebar-logout"
                >
                  🚪
                </button>
              </Form>
            </div>
          </div>
        </aside>
      )}

      {/* Main Content & Mobile View Wrapper */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header
          className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-xs"
          id="app-header"
        >
          <NavLink to="/app/planning" className="flex items-center gap-2 text-slate-900 font-bold text-sm no-underline" id="app-brand">
            <span className="text-lg">🩺</span>
            <span>Planning Infirmier</span>
            <span className="bg-sky-50 text-sky-700 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-sky-200" id="app-badge">
              Pro
            </span>
          </NavLink>

          <div className="flex items-center gap-2" id="app-user-bar">
            <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200" id="app-user-pill">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="truncate max-w-[120px]" id="app-user-display-name">
                {profile?.displayName ?? user.email?.split("@")[0] ?? "Infirmier"}
              </span>
            </div>

            <Form action="/logout" method="post" id="app-logout-form">
              <button
                type="submit"
                className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded border border-slate-200 transition-colors"
                id="btn-app-logout"
              >
                Déconnexion
              </button>
            </Form>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-6 lg:p-8 pb-20 md:pb-8" id="app-main">
          <Outlet context={{ user, profile, isOnboarded }} />
        </main>

        {/* Mobile Bottom Navigation Bar */}
        {isOnboarded && (
          <nav
            className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around items-center h-14 z-50 shadow-lg"
            aria-label="Navigation principale"
            id="app-navigation"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center justify-center flex-1 h-full text-[10px] font-medium transition-colors no-underline ${
                  isCurrent(item.to)
                    ? "text-sky-600 font-bold"
                    : "text-slate-500 hover:text-slate-900"
                }`}
                aria-current={isCurrent(item.to) ? "page" : undefined}
                id={item.id}
              >
                <span className="text-base leading-none mb-0.5">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

export function ErrorBoundary({ error }: { error: unknown }) {
  let message = "Une erreur est survenue dans l'application";
  let details = "Une erreur inattendue est survenue.";

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Section introuvable" : `Erreur ${error.status}`;
    details = error.statusText || details;
  } else if (error instanceof Error) {
    details = error.message;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" id="app-error-view">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center" id="app-error-card">
        <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4 text-xl" id="app-error-icon">
          ⚠️
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2" id="app-error-title">{message}</h1>
        <p className="text-sm text-slate-600 mb-6" id="app-error-details">{details}</p>
        <div className="flex gap-3 justify-center" id="app-error-actions">
          <a
            href="/app/planning"
            className="inline-flex items-center justify-center px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition-colors"
            id="app-error-retry-btn"
          >
            Retour au planning
          </a>
          <a
            href="/logout"
            className="inline-flex items-center justify-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
            id="app-error-logout-btn"
          >
            Se déconnecter
          </a>
        </div>
      </div>
    </div>
  );
}
