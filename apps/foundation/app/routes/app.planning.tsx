import { useState, useEffect } from "react";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { eq, and, gte, lte, or, isNull, asc } from "drizzle-orm";
import type { Route } from "./+types/app.planning";
import { getAppEnv } from "../context";
import { requireAuth, syncUserProfile } from "../auth";
import { withDb } from "../db/client";
import { shifts, shiftTypes, seedDefaultShiftTypes, type ShiftType } from "../db/schema/planning";
import { calculateShiftDuration } from "../domain/planning/shifts";
import { createAnalyticsService } from "../services/analytics";

export function meta() {
  return [
    { title: "Planning des Gardes — Planning Infirmier" },
    { name: "description", content: "Consultez et gérez vos gardes infirmières" },
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

const WEEKDAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function getDaysForCalendarMonth(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();

  const startDayOfWeek = (firstDay.getDay() + 6) % 7;

  const days: Array<{
    dateStr: string;
    dayNumber: number;
    isCurrentMonth: boolean;
  }> = [];

  const prevMonthLastDay = new Date(year, month - 1, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dayNum = prevMonthLastDay - i;
    const prevMonthNum = month === 1 ? 12 : month - 1;
    const prevYearNum = month === 1 ? year - 1 : year;
    const dateStr = `${prevYearNum}-${String(prevMonthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    days.push({ dateStr, dayNumber: dayNum, isCurrentMonth: false });
  }

  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    days.push({ dateStr, dayNumber: dayNum, isCurrentMonth: true });
  }

  const remainingCells = (7 - (days.length % 7)) % 7;
  for (let dayNum = 1; dayNum <= remainingCells; dayNum++) {
    const nextMonthNum = month === 12 ? 1 : month + 1;
    const nextYearNum = month === 12 ? year + 1 : year;
    const dateStr = `${nextYearNum}-${String(nextMonthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    days.push({ dateStr, dayNumber: dayNum, isCurrentMonth: false });
  }

  return days;
}

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

  let shiftTypesList: Array<{
    id: string;
    name: string;
    shortCode: string | null;
    startTime: string | null;
    endTime: string | null;
    color: string | null;
    isWork: boolean;
  }> = [];

  let shiftsList: Array<{
    id: string;
    profileId: string;
    shiftTypeId: string | null;
    date: string;
    startTime: string | null;
    endTime: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    shiftType?: {
      name: string;
      shortCode: string | null;
      color: string | null;
      isWork: boolean;
    } | null;
  }> = [];

  if (env.HYPERDRIVE) {
    const profile = await syncUserProfile(env.HYPERDRIVE, user);
    if (profile) {
      await withDb(env.HYPERDRIVE, async (db) => {
        await seedDefaultShiftTypes(db, profile.id);

        shiftTypesList = await db
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
          .where(or(eq(shiftTypes.profileId, profile.id), isNull(shiftTypes.profileId)));

        const rawShifts = await db
          .select({
            id: shifts.id,
            profileId: shifts.profileId,
            shiftTypeId: shifts.shiftTypeId,
            date: shifts.date,
            startTime: shifts.startTime,
            endTime: shifts.endTime,
            notes: shifts.notes,
            createdAt: shifts.createdAt,
            updatedAt: shifts.updatedAt,
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
              lte(shifts.date, endDateStr),
            ),
          )
          .orderBy(asc(shifts.date), asc(shifts.startTime));

        shiftsList = rawShifts.map((s) => ({
          id: s.id,
          profileId: s.profileId,
          shiftTypeId: s.shiftTypeId,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          notes: s.notes,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          shiftType: s.shiftTypeId
            ? {
                name: s.shiftTypeName ?? "Garde",
                shortCode: s.shiftTypeShortCode,
                color: s.shiftTypeColor,
                isWork: s.shiftTypeIsWork ?? true,
              }
            : null,
        }));

        try {
          const analytics = createAnalyticsService(env);
          await analytics.track({
            distinctId: profile.id,
            event: "calendar_viewed",
            properties: {
              month: currentMonth,
            },
          });
        } catch {
          // Analytics errors must never break calendar execution
        }
      });
    }
  }

  return {
    user: { email: user.email },
    currentMonth,
    shiftTypesList,
    shiftsList,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getAppEnv(context);
  const { user } = await requireAuth(request, env);

  if (!env.HYPERDRIVE) {
    return { error: "Erreur système : base de données inaccessible." };
  }

  const profile = await syncUserProfile(env.HYPERDRIVE, user);
  if (!profile) {
    return { error: "Profil utilisateur introuvable." };
  }

  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  const shiftId = formData.get("shiftId")?.toString().trim();
  const date = formData.get("date")?.toString().trim();
  const shiftTypeId = formData.get("shiftTypeId")?.toString().trim();
  const startTime = formData.get("startTime")?.toString().trim() || null;
  const endTime = formData.get("endTime")?.toString().trim() || null;
  const notes = formData.get("notes")?.toString().trim() || null;

  if (intent === "create_shift") {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { error: "Veuillez indiquer une date valide (YYYY-MM-DD)." };
    }
    if (!shiftTypeId) {
      return { error: "Veuillez sélectionner un type de garde." };
    }

    if (startTime || endTime) {
      if (!startTime || !endTime) {
        return { error: "Les heures de début et de fin doivent être toutes les deux renseignées ou vides." };
      }
      const durationCheck = calculateShiftDuration({ startTime, endTime });
      if (!durationCheck.success) {
        return { error: durationCheck.error.message || "Plage horaire de garde invalide." };
      }
    }

    let insertedShiftId: string | null = null;
    try {
      await withDb(env.HYPERDRIVE, async (db) => {
        const validShiftType = await db
          .select({ id: shiftTypes.id })
          .from(shiftTypes)
          .where(
            and(
              eq(shiftTypes.id, shiftTypeId),
              or(eq(shiftTypes.profileId, profile.id), isNull(shiftTypes.profileId)),
            ),
          )
          .limit(1);

        if (validShiftType.length === 0) {
          throw new Error("Type de garde invalide ou non autorisé.");
        }

        const inserted = await db
          .insert(shifts)
          .values({
            profileId: profile.id,
            shiftTypeId,
            date,
            startTime,
            endTime,
            notes,
          })
          .returning({ id: shifts.id });

        if (inserted.length > 0) {
          insertedShiftId = inserted[0].id;
        }
      });

      if (insertedShiftId) {
        try {
          const analytics = createAnalyticsService(env);
          await analytics.track({
            distinctId: profile.id,
            event: "shift_created",
            properties: {
              shift_id: insertedShiftId,
              shift_type_id: shiftTypeId,
            },
          });
        } catch {
          // Analytics error ignored
        }
      }

      return { success: true, message: "Garde ajoutée avec succès." };
    } catch (err: any) {
      return { error: err.message || "Impossible d'enregistrer la garde." };
    }
  }

  if (intent === "update_shift") {
    if (!shiftId) {
      return { error: "Identifiant de garde manquant." };
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { error: "Veuillez indiquer une date valide (YYYY-MM-DD)." };
    }
    if (!shiftTypeId) {
      return { error: "Veuillez sélectionner un type de garde." };
    }

    if (startTime || endTime) {
      if (!startTime || !endTime) {
        return { error: "Les heures de début et de fin doivent être toutes les deux renseignées ou vides." };
      }
      const durationCheck = calculateShiftDuration({ startTime, endTime });
      if (!durationCheck.success) {
        return { error: durationCheck.error.message || "Plage horaire de garde invalide." };
      }
    }

    try {
      await withDb(env.HYPERDRIVE, async (db) => {
        const existing = await db
          .select({ id: shifts.id })
          .from(shifts)
          .where(and(eq(shifts.id, shiftId), eq(shifts.profileId, profile.id)))
          .limit(1);

        if (existing.length === 0) {
          throw new Error("Garde non trouvée ou accès refusé.");
        }

        await db
          .update(shifts)
          .set({
            shiftTypeId,
            date,
            startTime,
            endTime,
            notes,
            updatedAt: new Date(),
          })
          .where(and(eq(shifts.id, shiftId), eq(shifts.profileId, profile.id)));
      });

      try {
        const analytics = createAnalyticsService(env);
        await analytics.track({
          distinctId: profile.id,
          event: "shift_updated",
          properties: {
            shift_id: shiftId,
            shift_type_id: shiftTypeId,
          },
        });
      } catch {
        // Analytics error ignored
      }

      return { success: true, message: "Garde mise à jour avec succès." };
    } catch (err: any) {
      return { error: err.message || "Impossible de modifier la garde." };
    }
  }

  if (intent === "delete_shift") {
    if (!shiftId) {
      return { error: "Identifiant de garde manquant." };
    }

    try {
      await withDb(env.HYPERDRIVE, async (db) => {
        const existing = await db
          .select({ id: shifts.id })
          .from(shifts)
          .where(and(eq(shifts.id, shiftId), eq(shifts.profileId, profile.id)))
          .limit(1);

        if (existing.length === 0) {
          throw new Error("Garde non trouvée ou accès refusé.");
        }

        await db
          .delete(shifts)
          .where(and(eq(shifts.id, shiftId), eq(shifts.profileId, profile.id)));
      });

      try {
        const analytics = createAnalyticsService(env);
        await analytics.track({
          distinctId: profile.id,
          event: "shift_deleted",
          properties: {
            shift_id: shiftId,
          },
        });
      } catch {
        // Analytics error ignored
      }

      return { success: true, message: "Garde supprimée avec succès." };
    } catch (err: any) {
      return { error: err.message || "Impossible de supprimer la garde." };
    }
  }

  return { error: "Action non reconnue." };
}

export default function Planning() {
  const { currentMonth, shiftTypesList, shiftsList } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [yearNum, monthNum] = currentMonth.split("-").map(Number);
  const calendarDays = getDaysForCalendarMonth(yearNum, monthNum);

  const prevMonth = monthNum === 1
    ? `${yearNum - 1}-12`
    : `${yearNum}-${String(monthNum - 1).padStart(2, "0")}`;

  const nextMonth = monthNum === 12
    ? `${yearNum + 1}-01`
    : `${yearNum}-${String(monthNum + 1).padStart(2, "0")}`;

  const today = new Date();
  const todayMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedShift, setSelectedShift] = useState<{
    id?: string;
    date: string;
    shiftTypeId: string;
    startTime: string;
    endTime: string;
    notes: string;
  }>({
    date: todayStr,
    shiftTypeId: shiftTypesList[0]?.id || "",
    startTime: shiftTypesList[0]?.startTime || "",
    endTime: shiftTypesList[0]?.endTime || "",
    notes: "",
  });

  // Close modal when submission completes successfully
  useEffect(() => {
    if (actionData?.success) {
      setModalOpen(false);
    }
  }, [actionData]);

  const handleOpenCreate = (targetDate?: string) => {
    const initialDate = targetDate || todayStr;
    const defaultType = shiftTypesList[0];
    setSelectedShift({
      date: initialDate,
      shiftTypeId: defaultType?.id || "",
      startTime: defaultType?.startTime || "",
      endTime: defaultType?.endTime || "",
      notes: "",
    });
    setModalMode("create");
    setModalOpen(true);
  };

  const handleOpenEdit = (shiftItem: (typeof shiftsList)[0]) => {
    setSelectedShift({
      id: shiftItem.id,
      date: shiftItem.date,
      shiftTypeId: shiftItem.shiftTypeId || "",
      startTime: shiftItem.startTime || "",
      endTime: shiftItem.endTime || "",
      notes: shiftItem.notes || "",
    });
    setModalMode("edit");
    setModalOpen(true);
  };

  const handleShiftTypeChange = (newTypeId: string) => {
    const selectedType = shiftTypesList.find((st) => st.id === newTypeId);
    setSelectedShift((prev) => ({
      ...prev,
      shiftTypeId: newTypeId,
      startTime: selectedType?.startTime || "",
      endTime: selectedType?.endTime || "",
    }));
  };

  // Duration computation for live preview inside modal
  const liveDurationResult =
    selectedShift.startTime && selectedShift.endTime
      ? calculateShiftDuration({
          startTime: selectedShift.startTime,
          endTime: selectedShift.endTime,
        })
      : null;

  return (
    <div className="card" id="planning-card">
      {/* Calendar Header Navigation */}
      <div className="calendar-header-bar" id="planning-header">
        <div>
          <h1 className="calendar-month-title" id="planning-title">
            📅 {MONTH_NAMES_FR[monthNum - 1]} {yearNum}
          </h1>
          <p className="subtitle" id="planning-subtitle" style={{ marginBottom: 0 }}>
            Planning et garde de travail infirmier
          </p>
        </div>

        <div className="calendar-nav-group" id="planning-nav-group">
          <Link
            to={`/app/planning?month=${prevMonth}`}
            className="btn btn-secondary btn-sm"
            id="btn-prev-month"
            aria-label="Mois précédent"
          >
            ←
          </Link>
          <Link
            to={`/app/planning?month=${todayMonth}`}
            className="btn btn-secondary btn-sm"
            id="btn-today-month"
          >
            Aujourd'hui
          </Link>
          <Link
            to={`/app/planning?month=${nextMonth}`}
            className="btn btn-secondary btn-sm"
            id="btn-next-month"
            aria-label="Mois suivant"
          >
            →
          </Link>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => handleOpenCreate()}
            id="btn-add-shift"
            style={{ marginLeft: "0.5rem" }}
          >
            + Ajouter une garde
          </button>
        </div>
      </div>

      {actionData?.error && (
        <div className="alert alert-error" role="alert" id="planning-error-alert">
          {actionData.error}
        </div>
      )}

      {actionData?.success && (
        <div className="alert alert-success" role="status" id="planning-success-alert">
          {actionData.message}
        </div>
      )}

      {/* Calendar Month Grid */}
      <div className="calendar-grid-container" id="planning-calendar-grid">
        <div className="calendar-weekdays" id="planning-weekdays-header">
          {WEEKDAYS_FR.map((day) => (
            <div key={day} className="calendar-weekday" id={`weekday-${day}`}>
              {day}
            </div>
          ))}
        </div>

        <div className="calendar-days-grid" id="planning-days-grid">
          {calendarDays.map((cell) => {
            const dayShifts = shiftsList.filter((s) => s.date === cell.dateStr);
            const isToday = cell.dateStr === todayStr;

            return (
              <div
                key={cell.dateStr}
                className={`calendar-day-cell ${!cell.isCurrentMonth ? "outside-month" : ""} ${
                  isToday ? "is-today" : ""
                }`}
                onClick={() => handleOpenCreate(cell.dateStr)}
                id={`cell-${cell.dateStr}`}
              >
                <div className="calendar-day-header">
                  <span className="calendar-date-num">{cell.dayNumber}</span>
                  <button
                    type="button"
                    className="btn-add-day-shift"
                    title="Ajouter une garde"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenCreate(cell.dateStr);
                    }}
                    id={`btn-add-day-${cell.dateStr}`}
                  >
                    +
                  </button>
                </div>

                {dayShifts.map((s) => {
                  const durationRes =
                    s.startTime && s.endTime
                      ? calculateShiftDuration({ startTime: s.startTime, endTime: s.endTime })
                      : null;

                  const color = s.shiftType?.color || "#0284c7";

                  return (
                    <button
                      type="button"
                      key={s.id}
                      className="shift-badge"
                      style={{ backgroundColor: color }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEdit(s);
                      }}
                      id={`shift-badge-${s.id}`}
                      title={`${s.shiftType?.name || "Garde"} ${
                        s.startTime ? `(${s.startTime}-${s.endTime})` : ""
                      }`}
                    >
                      <div className="shift-badge-header">
                        <span>{s.shiftType?.name || "Garde"}</span>
                        {s.shiftType?.shortCode && (
                          <span style={{ opacity: 0.85 }}>[{s.shiftType.shortCode}]</span>
                        )}
                      </div>

                      {s.startTime && s.endTime && (
                        <div className="shift-badge-time">
                          {s.startTime} - {s.endTime}
                        </div>
                      )}

                      {durationRes?.success && (
                        <div className="shift-badge-duration">
                          ⏱ {durationRes.formatted}
                          {durationRes.isOvernight ? " 🌙" : ""}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Empty State when no shifts in selected month */}
      {shiftsList.length === 0 && (
        <div className="empty-planning-card" id="planning-empty-state">
          <div className="empty-planning-icon">🩺</div>
          <h2 className="empty-planning-title" id="empty-state-title">
            Aucune garde planifiée pour ce mois
          </h2>
          <p className="empty-planning-desc" id="empty-state-desc">
            Commencez par ajouter vos gardes ou roulements pour visualiser votre planning et calculer automatiquement vos heures de travail.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleOpenCreate()}
            id="btn-add-first-shift"
          >
            + Ajouter ma première garde
          </button>
        </div>
      )}

      {/* Modal Dialog for Create / Edit Shift */}
      {modalOpen && (
        <div
          className="modal-backdrop"
          id="shift-modal-backdrop"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="modal-dialog"
            id="shift-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" id="shift-modal-header">
              <h2 className="modal-title" id="shift-modal-title">
                {modalMode === "create" ? "Ajouter une garde" : "Modifier la garde"}
              </h2>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setModalOpen(false)}
                id="btn-close-modal"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <Form method="post" id="shift-form">
              <div className="modal-body" id="shift-modal-body">
                {selectedShift.id && (
                  <input type="hidden" name="shiftId" value={selectedShift.id} />
                )}

                <div className="form-group">
                  <label htmlFor="shift-form-date" className="form-label">
                    Date de la garde *
                  </label>
                  <input
                    type="date"
                    id="shift-form-date"
                    name="date"
                    className="form-input"
                    required
                    value={selectedShift.date}
                    onChange={(e) =>
                      setSelectedShift((prev) => ({ ...prev, date: e.target.value }))
                    }
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="shift-form-type" className="form-label">
                    Type de garde / Roulement *
                  </label>
                  <select
                    id="shift-form-type"
                    name="shiftTypeId"
                    className="form-input"
                    required
                    value={selectedShift.shiftTypeId}
                    onChange={(e) => handleShiftTypeChange(e.target.value)}
                  >
                    {shiftTypesList.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} {st.shortCode ? `(${st.shortCode})` : ""}{" "}
                        {st.startTime ? `[${st.startTime} - ${st.endTime}]` : "[Sans horaire]"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="time-row">
                  <div className="form-group">
                    <label htmlFor="shift-form-start-time" className="form-label">
                      Heure de début
                    </label>
                    <input
                      type="time"
                      id="shift-form-start-time"
                      name="startTime"
                      className="form-input"
                      value={selectedShift.startTime}
                      onChange={(e) =>
                        setSelectedShift((prev) => ({ ...prev, startTime: e.target.value }))
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="shift-form-end-time" className="form-label">
                      Heure de fin
                    </label>
                    <input
                      type="time"
                      id="shift-form-end-time"
                      name="endTime"
                      className="form-input"
                      value={selectedShift.endTime}
                      onChange={(e) =>
                        setSelectedShift((prev) => ({ ...prev, endTime: e.target.value }))
                      }
                    />
                  </div>
                </div>

                {/* Live Duration Calculation Indicator */}
                {liveDurationResult && (
                  <div className="duration-preview-box" id="shift-duration-preview">
                    {liveDurationResult.success ? (
                      <>
                        <span>⏱</span>
                        <span>
                          <strong>Durée calculée :</strong> {liveDurationResult.formatted}
                          {liveDurationResult.isOvernight ? " (Garde de nuit / traverse minuit 🌙)" : ""}
                        </span>
                      </>
                    ) : (
                      <span style={{ color: "#dc2626" }}>
                        ⚠️ {liveDurationResult.error.message}
                      </span>
                    )}
                  </div>
                )}

                <div className="form-group" style={{ marginTop: "1rem" }}>
                  <label htmlFor="shift-form-notes" className="form-label">
                    Notes ou Service (optionnel)
                  </label>
                  <textarea
                    id="shift-form-notes"
                    name="notes"
                    className="form-input"
                    rows={2}
                    placeholder="ex. Urgences, Garde d'astreinte, remplacement..."
                    value={selectedShift.notes}
                    onChange={(e) =>
                      setSelectedShift((prev) => ({ ...prev, notes: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="modal-footer" id="shift-modal-footer">
                {modalMode === "edit" && (
                  <button
                    type="submit"
                    name="intent"
                    value="delete_shift"
                    className="btn btn-danger btn-sm"
                    id="btn-delete-shift"
                    disabled={isSubmitting}
                  >
                    Supprimer
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setModalOpen(false)}
                  id="btn-cancel-modal"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  name="intent"
                  value={modalMode === "create" ? "create_shift" : "update_shift"}
                  className="btn btn-primary btn-sm"
                  id="btn-save-shift"
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? "Enregistrement..."
                    : modalMode === "create"
                    ? "Enregistrer la garde"
                    : "Mettre à jour"}
                </button>
              </div>
            </Form>
          </div>
        </div>
      )}
    </div>
  );
}
