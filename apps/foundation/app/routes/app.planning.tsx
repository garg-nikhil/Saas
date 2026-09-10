import { Link, useLoaderData } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/app.planning";
import { getAppEnv } from "../context";
import { requireAuth, syncUserProfile } from "../auth";
import { withDb } from "../db/client";
import { shiftTypes } from "../db/schema/planning/shift-types";

export function meta() {
  return [
    { title: "Planning des Gardes — Planning Infirmier" },
    { name: "description", content: "Consultez et gérez vos gardes infirmières" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);
  const { user } = await requireAuth(request, env);

  let userShifts: Array<{
    id: string;
    name: string;
    shortCode: string | null;
    startTime: string | null;
    endTime: string | null;
    color: string | null;
    isWork: boolean;
  }> = [];

  if (env.HYPERDRIVE) {
    const profile = await syncUserProfile(env.HYPERDRIVE, user);
    if (profile) {
      userShifts = await withDb(env.HYPERDRIVE, async (db) => {
        return db
          .select({
            id: shiftTypes.id,
            name: shiftTypes.name,
            shortCode: shiftTypes.shortCode,
            startTime: shiftTypes.startTime,
            endTime: shiftTypes.endTime,
            color: shiftTypes.color,
            isWork: shiftTypes.isWork,
          })
          .from(shiftTypes)
          .where(eq(shiftTypes.profileId, profile.id));
      });
    }
  }

  return {
    user: {
      email: user.email,
    },
    shiftTypesList: userShifts,
  };
}

export default function Planning() {
  const { shiftTypesList } = useLoaderData<typeof loader>();

  return (
    <div className="card" id="planning-card">
      <div className="card-header-row" id="planning-header">
        <div>
          <h1 id="planning-title">Planning des Gardes</h1>
          <p className="subtitle" id="planning-subtitle">
            Tableau de bord de votre roulement hospitalier
          </p>
        </div>
      </div>

      <div className="alert alert-success" role="status" id="planning-notice">
        <strong>Espace de travail prêt !</strong> Votre compte est initialisé avec vos types de gardes. L'interface de calendrier interactif et la saisie des gardes seront activées dans la prochaine version du module.
      </div>

      <div className="dashboard-section" id="planning-shift-types-section">
        <h2 className="section-title" id="planning-shift-types-title">
          Vos Types de Gardes Configurés ({shiftTypesList.length})
        </h2>

        {shiftTypesList.length > 0 ? (
          <div className="shift-types-preview" id="planning-shift-types-grid">
            {shiftTypesList.map((st) => (
              <div key={st.id} className="shift-type-chip" id={`shift-type-${st.id}`}>
                <span
                  className="shift-color-dot"
                  style={{ backgroundColor: st.color || "#0284c7" }}
                />
                <div>
                  <strong>{st.name}</strong> ({st.shortCode || "-"})
                  <div className="info-muted">
                    {st.startTime ? `${st.startTime} - ${st.endTime}` : "Sans horaire"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="info-muted" id="planning-no-shifts">
            Aucun type de garde configuré pour le moment.
          </p>
        )}

        <div style={{ marginTop: "1rem" }} id="planning-actions">
          <Link to="/app/parametres/gardes" className="btn btn-secondary btn-sm" id="btn-manage-shift-types">
            Gérer les types de gardes →
          </Link>
        </div>
      </div>
    </div>
  );
}
