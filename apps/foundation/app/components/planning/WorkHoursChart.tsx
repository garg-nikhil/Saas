import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { calculateShiftDuration } from "../../domain/planning/shifts";

export interface WorkHoursChartProps {
  shifts: Array<{
    id: string;
    date: string;
    startTime?: string | null;
    endTime?: string | null;
    notes?: string | null;
    shiftType?: {
      name: string;
      shortCode?: string | null;
      color?: string | null;
      isWork: boolean;
    } | null;
  }>;
  monthLabel?: string;
  nurseName?: string;
}

const WEEKDAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const DEFAULT_PALETTE = [
  "#0284c7", // sky
  "#6366f1", // indigo
  "#0d9488", // teal
  "#f59e0b", // amber
  "#ec4899", // pink
  "#8b5cf6", // purple
  "#10b981", // emerald
];

export function WorkHoursChart({
  shifts,
  monthLabel,
  nurseName,
}: WorkHoursChartProps) {
  const analytics = useMemo(() => {
    let totalMinutesWorked = 0;
    let nightMinutesWorked = 0;
    let dayShiftsCount = 0;
    let nightShiftsCount = 0;
    let restDaysCount = 0;

    const byTypeMap = new Map<
      string,
      {
        name: string;
        shortCode: string;
        color: string;
        minutes: number;
        count: number;
        isWork: boolean;
      }
    >();

    const byWeekdayMap = new Map<
      number,
      { weekdayIndex: number; name: string; minutes: number; count: number }
    >();
    for (let i = 0; i < 7; i++) {
      byWeekdayMap.set(i, {
        weekdayIndex: i,
        name: WEEKDAY_NAMES[i],
        minutes: 0,
        count: 0,
      });
    }

    for (const shift of shifts) {
      const isWork = shift.shiftType ? shift.shiftType.isWork : true;
      const typeName = shift.shiftType?.name || "Garde Standard";
      const shortCode = shift.shiftType?.shortCode || "";
      const color = shift.shiftType?.color || "#0284c7";

      let shiftMinutes = 0;
      let isOvernight = false;

      if (shift.startTime && shift.endTime) {
        const dur = calculateShiftDuration({
          startTime: shift.startTime,
          endTime: shift.endTime,
        });
        if (dur.success) {
          shiftMinutes = dur.durationMinutes;
          isOvernight = dur.isOvernight;
        }
      }

      if (isWork) {
        totalMinutesWorked += shiftMinutes;
        if (isOvernight) {
          nightMinutesWorked += shiftMinutes;
          nightShiftsCount++;
        } else {
          dayShiftsCount++;
        }

        // Add to weekday breakdown
        const [y, m, d] = shift.date.split("-").map(Number);
        const dateObj = new Date(y, m - 1, d);
        // JS Date: 0 = Sun, 1 = Mon ... 6 = Sat -> Convert to 0 = Mon ... 6 = Sun
        const weekdayIdx = (dateObj.getDay() + 6) % 7;
        const currentWd = byWeekdayMap.get(weekdayIdx);
        if (currentWd) {
          currentWd.minutes += shiftMinutes;
          currentWd.count += 1;
        }
      } else {
        restDaysCount++;
      }

      // Add to shift type map
      const existing = byTypeMap.get(typeName) || {
        name: typeName,
        shortCode,
        color,
        minutes: 0,
        count: 0,
        isWork,
      };
      existing.minutes += shiftMinutes;
      existing.count += 1;
      byTypeMap.set(typeName, existing);
    }

    const typeData = Array.from(byTypeMap.values()).map((t, idx) => ({
      name: t.name,
      shortCode: t.shortCode || t.name.slice(0, 3).toUpperCase(),
      hours: Math.round((t.minutes / 60) * 10) / 10,
      count: t.count,
      color: t.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length],
      isWork: t.isWork,
    }));

    const weekdayData = Array.from(byWeekdayMap.values()).map((w) => ({
      name: w.name,
      hours: Math.round((w.minutes / 60) * 10) / 10,
      count: w.count,
    }));

    const totalHours = Math.round((totalMinutesWorked / 60) * 10) / 10;
    const nightHours = Math.round((nightMinutesWorked / 60) * 10) / 10;
    const totalShifts = dayShiftsCount + nightShiftsCount;
    const avgShiftHours =
      totalShifts > 0 ? Math.round((totalHours / totalShifts) * 10) / 10 : 0;

    return {
      totalHours,
      nightHours,
      dayHours: Math.round((totalHours - nightHours) * 10) / 10,
      dayShiftsCount,
      nightShiftsCount,
      totalShifts,
      restDaysCount,
      avgShiftHours,
      typeData,
      weekdayData,
    };
  }, [shifts]);

  const [activeTab, setActiveTab] = React.useState<"types" | "weekdays">(
    "types"
  );

  return (
    <div
      className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs mb-6"
      id="work-hours-visualization"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <h2 className="text-base font-bold text-slate-900 m-0" id="work-hours-title">
              Synthèse des Heures de Travail
            </h2>
            {monthLabel && (
              <span className="bg-sky-50 text-sky-700 text-xs font-semibold px-2 py-0.5 rounded border border-sky-200">
                {monthLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 m-0">
            {nurseName
              ? `Calcul automatisé pour ${nurseName}`
              : "Calcul automatisé des heures travaillées, gardes de nuit et répartition"}
          </p>
        </div>

        {/* View switcher */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-medium self-start sm:self-auto">
          <button
            type="button"
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              activeTab === "types"
                ? "bg-white text-slate-900 font-semibold shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
            onClick={() => setActiveTab("types")}
            id="tab-btn-types"
          >
            Par type de garde
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              activeTab === "weekdays"
                ? "bg-white text-slate-900 font-semibold shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
            onClick={() => setActiveTab("weekdays")}
            id="tab-btn-weekdays"
          >
            Par jour (Lun-Dim)
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/80 flex flex-col">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Total Heures
          </span>
          <span className="text-2xl font-bold text-sky-700 mt-1" id="stat-total-hours">
            {analytics.totalHours} <span className="text-xs font-medium text-slate-500">h</span>
          </span>
          <span className="text-[11px] text-slate-500 mt-0.5">
            {analytics.totalShifts} garde{analytics.totalShifts > 1 ? "s" : ""}
          </span>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/80 flex flex-col">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Gardes de Jour
          </span>
          <span className="text-2xl font-bold text-amber-600 mt-1" id="stat-day-hours">
            {analytics.dayHours} <span className="text-xs font-medium text-slate-500">h</span>
          </span>
          <span className="text-[11px] text-slate-500 mt-0.5">
            {analytics.dayShiftsCount} garde{analytics.dayShiftsCount > 1 ? "s" : ""}
          </span>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/80 flex flex-col">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Heures de Nuit 🌙
          </span>
          <span className="text-2xl font-bold text-indigo-600 mt-1" id="stat-night-hours">
            {analytics.nightHours} <span className="text-xs font-medium text-slate-500">h</span>
          </span>
          <span className="text-[11px] text-slate-500 mt-0.5">
            {analytics.nightShiftsCount} garde{analytics.nightShiftsCount > 1 ? "s" : ""}
          </span>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/80 flex flex-col">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Moyenne / Garde
          </span>
          <span className="text-2xl font-bold text-emerald-600 mt-1" id="stat-avg-hours">
            {analytics.avgShiftHours} <span className="text-xs font-medium text-slate-500">h</span>
          </span>
          <span className="text-[11px] text-slate-500 mt-0.5">
            {analytics.restDaysCount} jour{analytics.restDaysCount > 1 ? "s" : ""} de repos
          </span>
        </div>
      </div>

      {/* Chart Canvas Area */}
      {analytics.totalHours === 0 && analytics.typeData.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
          <p className="text-sm font-medium text-slate-600 m-0">
            Aucune heure de travail comptabilisée pour ce mois.
          </p>
          <p className="text-xs text-slate-400 mt-1 m-0">
            Ajoutez des gardes avec leurs horaires pour générer automatiquement le graphique.
          </p>
        </div>
      ) : (
        <div className="h-64 w-full mt-2" id="recharts-chart-container">
          <ResponsiveContainer width="100%" height="100%">
            {activeTab === "types" ? (
              <BarChart
                data={analytics.typeData}
                margin={{ top: 10, right: 10, left: -15, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  interval={0}
                  tickMargin={8}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  unit="h"
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(value: any, name: any, item: any) => [
                    `${value} h (${item.payload.count} garde${item.payload.count > 1 ? "s" : ""})`,
                    "Volume",
                  ]}
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    fontSize: "12px",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Bar dataKey="hours" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {analytics.typeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <BarChart
                data={analytics.weekdayData}
                margin={{ top: 10, right: 10, left: -15, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  interval={0}
                  tickMargin={8}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  unit="h"
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(value: any, name: any, item: any) => [
                    `${value} h (${item.payload.count} garde${item.payload.count > 1 ? "s" : ""})`,
                    "Total travaillées",
                  ]}
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    fontSize: "12px",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Bar
                  dataKey="hours"
                  fill="#0284c7"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
