import { useState } from "react";
import { useLoaderData, Link } from "react-router";
import { eq, and, gte, lte, asc } from "drizzle-orm";
import type { Route } from "./+types/app.export";
import { getAppEnv } from "../context";
import { requireAuth, syncUserProfile } from "../auth";
import { withDb } from "../db/client";
import { shifts, shiftTypes } from "../db/schema/planning";
import { generateShiftsCsv } from "../domain/planning/shifts/csv";

export function meta() {
  return [
    { title: "Exportation Planning — Planning Infirmier" },
    { name: "description", content: "Export CSV et rapports de planning pour impression et RH" },
  ];
}

const MONTH_NAMES_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);
  const { user } = await requireAuth(request, env);

  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month");

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentMonth = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : defaultMonth;

  const [yearNum, monthNum] = currentMonth.split("-").map(Number);
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const startDateStr = `${currentMonth}-01`;
  const endDateStr = `${currentMonth}-${String(daysInMonth).padStart(2, "0")}`;

  let shiftsList: Array<{
    id: string;
    profileId: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    notes: string | null;
    shiftType?: {
      name: string;
      shortCode: string | null;
      color: string | null;
      isWork: boolean;
    } | null;
  }> = [];

  let nurseDisplayName = user.email?.split("@")[0] || "Infirmier";

  if (env.HYPERDRIVE) {
    const profile = await syncUserProfile(env.HYPERDRIVE, user);
    if (profile) {
      nurseDisplayName = profile.displayName || nurseDisplayName;
      await withDb(env.HYPERDRIVE, async (db) => {
        const rawShifts = await db
          .select({
            id: shifts.id,
            profileId: shifts.profileId,
            date: shifts.date,
            startTime: shifts.startTime,
            endTime: shifts.endTime,
            notes: shifts.notes,
            shiftTypeName: shiftTypes.name,
            shiftTypeShortCode: shiftTypes.shortCode,
            shiftTypeColor: shiftTypes.color,
            shiftTypeIsWork: shiftTypes.isWork,
          })
          .from(shifts)
          .leftJoin(shiftTypes, eq(shifts.shiftTypeId, shiftTypes.id))
          .where(
            and(
              eq(shifts.profileId, profile.id),
              gte(shifts.date, startDateStr),
              lte(shifts.date, endDateStr)
            )
          )
          .orderBy(asc(shifts.date), asc(shifts.startTime));

        shiftsList = rawShifts.map((s) => ({
          id: s.id,
          profileId: s.profileId,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          notes: s.notes,
          shiftType: s.shiftTypeName
            ? {
                name: s.shiftTypeName,
                shortCode: s.shiftTypeShortCode,
                color: s.shiftTypeColor,
                isWork: s.shiftTypeIsWork ?? true,
              }
            : null,
        }));
      });
    }
  }

  return {
    nurseDisplayName,
    currentMonth,
    shiftsList,
  };
}

export default function Export() {
  const { nurseDisplayName, currentMonth, shiftsList } = useLoaderData<typeof loader>();
  const [yearNum, monthNum] = currentMonth.split("-").map(Number);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const prevMonthDate = new Date(yearNum, monthNum - 2, 1);
  const nextMonthDate = new Date(yearNum, monthNum, 1);
  const prevMonth = `${prevMonthDate.getFullYear()}-${String(
    prevMonthDate.getMonth() + 1
  ).padStart(2, "0")}`;
  const nextMonth = `${nextMonthDate.getFullYear()}-${String(
    nextMonthDate.getMonth() + 1
  ).padStart(2, "0")}`;

  const monthLabel = `${MONTH_NAMES_FR[monthNum - 1]} ${yearNum}`;

  const handleExportCsv = () => {
    const csvContent = generateShiftsCsv(shiftsList, monthLabel);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `planning_infirmier_${currentMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 4000);
  };

  return (
    <div className="space-y-6" id="export-page">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 m-0" id="export-title">
            📄 Exportation & Rapports de Planning
          </h1>
          <p className="text-xs text-slate-500 mt-1 m-0" id="export-subtitle">
            Exportez votre relevé d'heures et calendrier pour vos fiches de paie, cadres de santé et RH
          </p>
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <Link
            to={`/app/export?month=${prevMonth}`}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors no-underline"
            id="btn-export-prev-month"
            aria-label="Mois précédent"
          >
            ←
          </Link>
          <span className="px-3 py-1.5 bg-sky-50 text-sky-800 text-xs font-bold rounded-lg border border-sky-200">
            {monthLabel}
          </span>
          <Link
            to={`/app/export?month=${nextMonth}`}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors no-underline"
            id="btn-export-next-month"
            aria-label="Mois suivant"
          >
            →
          </Link>
        </div>
      </div>

      {downloadSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-medium flex items-center gap-2">
          <span>✅</span>
          <span>Le fichier CSV a été téléchargé avec succès (compatible Excel & LibreOffice avec encodage UTF-8).</span>
        </div>
      )}

      {/* Export Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CSV Export Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between" id="card-export-csv">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">📊</span>
              <h2 className="text-base font-bold text-slate-900 m-0">
                Export Tableur (CSV / Excel)
              </h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed m-0">
              Générez un tableau détaillé contenant chaque garde du mois : date, jour de la semaine, libellé, code de garde, heures de début et fin, durée totale, statut nuit et notes associées.
            </p>

            <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1">
              <div className="font-semibold text-slate-800">Détails du fichier exporté :</div>
              <div>• <strong>Période :</strong> {monthLabel}</div>
              <div>• <strong>Nombre de gardes :</strong> {shiftsList.length} garde(s)</div>
              <div>• <strong>Format :</strong> CSV délimité par point-virgule (UTF-8 BOM)</div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              id="btn-download-csv"
            >
              <span>📥</span>
              <span>Télécharger le CSV ({shiftsList.length} gardes)</span>
            </button>
          </div>
        </div>

        {/* Printable Summary Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between" id="card-export-print">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🖨️</span>
              <h2 className="text-base font-bold text-slate-900 m-0">
                Impression & Vue Rapport
              </h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed m-0">
              Imprimez ou enregistrez au format PDF la grille synthétique du mois directement depuis votre navigateur avec mise en page optimisée.
            </p>

            <div className="mt-4 p-3 bg-sky-50 rounded-lg border border-sky-200 text-xs text-sky-800 space-y-1">
              <div className="font-semibold text-sky-900">Conseil d'impression :</div>
              <div>• Utilisez l'orientation <strong>Paysage (Landscape)</strong> pour un affichage pleine largeur de votre planning mensuel.</div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              id="btn-print-schedule"
            >
              <span>🖨️</span>
              <span>Imprimer / Exporter PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Shifts Summary Table for Preview */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <h2 className="text-sm font-bold text-slate-800 mb-3 m-0">
          Aperçu des gardes du mois ({monthLabel})
        </h2>

        {shiftsList.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center m-0">
            Aucune garde enregistrée pour ce mois.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700 border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">Type de garde</th>
                  <th className="py-2 px-3">Horaires</th>
                  <th className="py-2 px-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shiftsList.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60">
                    <td className="py-2 px-3 font-medium text-slate-900">{s.date}</td>
                    <td className="py-2 px-3">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold text-white"
                        style={{ backgroundColor: s.shiftType?.color || "#0284c7" }}
                      >
                        {s.shiftType?.name || "Garde"}
                        {s.shiftType?.shortCode && ` [${s.shiftType.shortCode}]`}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      {s.startTime && s.endTime ? `${s.startTime} - ${s.endTime}` : "Sans horaire"}
                    </td>
                    <td className="py-2 px-3 text-slate-500 truncate max-w-xs">
                      {s.notes || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
