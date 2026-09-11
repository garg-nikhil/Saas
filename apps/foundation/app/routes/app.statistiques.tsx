import { useLoaderData, Link } from "react-router";
import { eq, and, gte, lte, asc } from "drizzle-orm";
import type { Route } from "./+types/app.statistiques";
import { getAppEnv } from "../context";
import { requireAuth, syncUserProfile } from "../auth";
import { withDb } from "../db/client";
import { shifts, shiftTypes } from "../db/schema/planning";
import { WorkHoursChart } from "../components/planning/WorkHoursChart";

export function meta() {
  return [
    { title: "Statistiques & Heures — Planning Infirmier" },
    { name: "description", content: "Analyse des heures et statistiques de garde" },
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
          .orderBy(asc(shifts.date));

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

export default function Statistiques() {
  const { nurseDisplayName, currentMonth, shiftsList } =
    useLoaderData<typeof loader>();
  const [yearNum, monthNum] = currentMonth.split("-").map(Number);

  const prevMonthDate = new Date(yearNum, monthNum - 2, 1);
  const nextMonthDate = new Date(yearNum, monthNum, 1);
  const prevMonth = `${prevMonthDate.getFullYear()}-${String(
    prevMonthDate.getMonth() + 1
  ).padStart(2, "0")}`;
  const nextMonth = `${nextMonthDate.getFullYear()}-${String(
    nextMonthDate.getMonth() + 1
  ).padStart(2, "0")}`;

  const monthLabel = `${MONTH_NAMES_FR[monthNum - 1]} ${yearNum}`;

  return (
    <div className="space-y-6" id="statistiques-page">
      {/* Header & Month Navigation */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 m-0" id="statistiques-title">
            📊 Statistiques & Heures Travaillées
          </h1>
          <p className="text-xs text-slate-500 mt-1 m-0" id="statistiques-subtitle">
            Analyse détaillée des heures de travail et des gardes pour {nurseDisplayName}
          </p>
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <Link
            to={`/app/statistiques?month=${prevMonth}`}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors no-underline"
            id="btn-stats-prev-month"
            aria-label="Mois précédent"
          >
            ←
          </Link>
          <span className="px-3 py-1.5 bg-sky-50 text-sky-800 text-xs font-bold rounded-lg border border-sky-200">
            {monthLabel}
          </span>
          <Link
            to={`/app/statistiques?month=${nextMonth}`}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors no-underline"
            id="btn-stats-next-month"
            aria-label="Mois suivant"
          >
            →
          </Link>
        </div>
      </div>

      {/* Main Recharts Visualization */}
      <WorkHoursChart
        shifts={shiftsList}
        monthLabel={monthLabel}
        nurseName={nurseDisplayName}
      />
    </div>
  );
}
