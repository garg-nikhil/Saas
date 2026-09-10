import { useLoaderData } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/app.parametres.gardes";
import { getAppEnv } from "../context";
import { requireAuth, syncUserProfile } from "../auth";
import { withDb } from "../db/client";
import { shiftTypes } from "../db/schema/planning/shift-types";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);
  const { user } = await requireAuth(request, env);

  let shiftTypesList: Array<{
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
      shiftTypesList = await withDb(env.HYPERDRIVE, async (db) => {
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
    shiftTypesList,
  };
}

export default function ParametresGardes() {
  const { shiftTypesList } = useLoaderData<typeof loader>();

  return (
    <div className="settings-section" id="section-gardes">
      <h2 className="section-title" id="gardes-title">Configuration des Types de Gardes</h2>
      <p className="info-muted" style={{ marginBottom: "1rem" }} id="gardes-desc">
        Vos codes de gardes configurés pour le planning.
      </p>

      {shiftTypesList.length > 0 ? (
        <div className="info-grid" id="gardes-list">
          {shiftTypesList.map((st) => (
            <div key={st.id} className="info-item" id={`garde-item-${st.id}`}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span
                    className="shift-color-dot"
                    style={{ backgroundColor: st.color || "#0284c7" }}
                  />
                  <strong>{st.name}</strong> ({st.shortCode || "-"})
                </div>
                <span className="info-label">
                  {st.isWork ? "Travail" : "Repos/Congé"}
                </span>
              </div>
              <div className="info-value" style={{ marginTop: "0.25rem" }}>
                {st.startTime ? `Horaires : ${st.startTime} à ${st.endTime}` : "Pas d'horaires fixes"}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="info-muted" id="gardes-empty">
          Aucun type de garde n'a encore été configuré.
        </p>
      )}
    </div>
  );
}
