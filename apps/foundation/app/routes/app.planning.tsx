import { useState, useEffect } from "react";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { eq, and, gte, lte, or, isNull, asc } from "drizzle-orm";
import type { Route } from "./+types/app.planning";
import { getAppEnv } from "../context";
import { requireAuth, syncUserProfile } from "../auth";
import { withDb } from "../db/client";
import { shifts, shiftTypes, recurringShifts, seedDefaultShiftTypes, type ShiftType } from "../db/schema/planning";
import { calculateShiftDuration } from "../domain/planning/shifts";
import { validateRecurrenceRule, generateOccurrenceDates } from "../domain/planning/recurrence";
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

  let recurringShiftsList: Array<{
    id: string;
    shiftTypeId: string | null;
    name: string | null;
    frequency: string;
    interval: number;
    daysOfWeek: any;
    startDate: string;
    endDate: string | null;
    isActive: boolean;
    startTime: string | null;
    endTime: string | null;
    notes: string | null;
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

        recurringShiftsList = await db
          .select({
            id: recurringShifts.id,
            shiftTypeId: recurringShifts.shiftTypeId,
            name: recurringShifts.name,
            frequency: recurringShifts.frequency,
            interval: recurringShifts.interval,
            daysOfWeek: recurringShifts.daysOfWeek,
            startDate: recurringShifts.startDate,
            endDate: recurringShifts.endDate,
            isActive: recurringShifts.isActive,
            startTime: recurringShifts.startTime,
            endTime: recurringShifts.endTime,
            notes: recurringShifts.notes,
          })
          .from(recurringShifts)
          .where(eq(recurringShifts.profileId, profile.id))
          .orderBy(asc(recurringShifts.startDate));

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
    recurringShiftsList,
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

  if (intent === "create_recurring_shift") {
    const shiftTypeId = formData.get("shiftTypeId")?.toString().trim();
    const frequency = formData.get("frequency")?.toString().trim() || "weekly";
    const interval = parseInt(formData.get("interval")?.toString() || "1", 10);
    const startDate = formData.get("startDate")?.toString().trim();
    const endDate = formData.get("endDate")?.toString().trim() || null;
    const startTime = formData.get("startTime")?.toString().trim() || null;
    const endTime = formData.get("endTime")?.toString().trim() || null;
    const notes = formData.get("notes")?.toString().trim() || null;

    const rawDays = formData.getAll("daysOfWeek");
    let daysOfWeek: number[] = [];
    if (rawDays.length > 0) {
      daysOfWeek = rawDays
        .flatMap((d) => d.toString().split(","))
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n >= 0 && n <= 6);
    }

    if (!shiftTypeId) {
      return { error: "Veuillez sélectionner un type de garde." };
    }
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return { error: "Veuillez indiquer une date de début valide (YYYY-MM-DD)." };
    }

    const ruleVal = validateRecurrenceRule({
      startDate,
      endDate: endDate || undefined,
      frequency,
      interval,
      daysOfWeek,
    });

    if (!ruleVal.success) {
      return { error: ruleVal.error.message || "Règle de récurrence invalide." };
    }

    let rangeTo = endDate;
    if (!rangeTo) {
      const sObj = new Date(startDate);
      sObj.setDate(sObj.getDate() + 90);
      rangeTo = sObj.toISOString().split("T")[0];
    }

    const genRes = generateOccurrenceDates(
      {
        startDate,
        endDate: endDate || undefined,
        frequency,
        interval,
        daysOfWeek,
      },
      {
        from: startDate,
        to: rangeTo,
      },
    );

    if (!genRes.success) {
      return { error: genRes.error.message || "Erreur lors de la génération des gardes récurrentes." };
    }

    const occurrences = genRes.occurrences;
    if (occurrences.length === 0) {
      return { error: "Aucune occurrence générée pour les dates indiquées." };
    }

    let createdCount = 0;
    let ruleId: string | null = null;

    try {
      await withDb(env.HYPERDRIVE, async (db) => {
        const validShiftType = await db
          .select({
            id: shiftTypes.id,
            name: shiftTypes.name,
            startTime: shiftTypes.startTime,
            endTime: shiftTypes.endTime,
          })
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

        const st = validShiftType[0];
        const finalStart = startTime || st.startTime;
        const finalEnd = endTime || st.endTime;

        const insertedRule = await db
          .insert(recurringShifts)
          .values({
            profileId: profile.id,
            shiftTypeId,
            name: st.name,
            frequency,
            interval,
            daysOfWeek,
            startDate,
            endDate: endDate || null,
            startTime: finalStart,
            endTime: finalEnd,
            isActive: true,
            notes,
          })
          .returning({ id: recurringShifts.id });

        if (insertedRule.length > 0) {
          ruleId = insertedRule[0].id;
        }

        const existingShifts = await db
          .select({ date: shifts.date })
          .from(shifts)
          .where(
            and(
              eq(shifts.profileId, profile.id),
              gte(shifts.date, startDate),
              lte(shifts.date, rangeTo),
            ),
          );

        const existingDateSet = new Set(existingShifts.map((s) => s.date));
        const datesToInsert = occurrences.filter((d) => !existingDateSet.has(d));

        if (datesToInsert.length > 0) {
          const rowsToInsert = datesToInsert.map((d) => ({
            profileId: profile.id,
            shiftTypeId,
            date: d,
            startTime: finalStart,
            endTime: finalEnd,
            notes,
          }));

          await db.insert(shifts).values(rowsToInsert);
          createdCount = rowsToInsert.length;
        }
      });

      if (ruleId) {
        try {
          const analytics = createAnalyticsService(env);
          await analytics.track({
            distinctId: profile.id,
            event: "recurring_shift_created",
            properties: {
              recurring_shift_id: ruleId,
              shift_type_id: shiftTypeId,
              occurrences_count: createdCount,
            },
          });
        } catch {
          // Analytics error ignored
        }
      }

      return {
        success: true,
        message: `Roulement récurrent créé avec succès (${createdCount} garde(s) ajoutée(s) au planning).`,
      };
    } catch (err: any) {
      return { error: err.message || "Impossible de créer le roulement récurrent." };
    }
  }

  if (intent === "delete_recurring_shift") {
    const recurringShiftId = formData.get("recurringShiftId")?.toString().trim();
    if (!recurringShiftId) {
      return { error: "Identifiant de roulement récurrent manquant." };
    }

    try {
      await withDb(env.HYPERDRIVE, async (db) => {
        const existing = await db
          .select({ id: recurringShifts.id })
          .from(recurringShifts)
          .where(and(eq(recurringShifts.id, recurringShiftId), eq(recurringShifts.profileId, profile.id)))
          .limit(1);

        if (existing.length === 0) {
          throw new Error("Roulement récurrent non trouvé ou accès refusé.");
        }

        await db
          .delete(recurringShifts)
          .where(and(eq(recurringShifts.id, recurringShiftId), eq(recurringShifts.profileId, profile.id)));
      });

      try {
        const analytics = createAnalyticsService(env);
        await analytics.track({
          distinctId: profile.id,
          event: "recurring_shift_deleted",
          properties: {
            recurring_shift_id: recurringShiftId,
          },
        });
      } catch {
        // Analytics error ignored
      }

      return {
        success: true,
        message: "Roulement récurrent supprimé. Cette action n'efface pas les gardes déjà créées dans le planning.",
      };
    } catch (err: any) {
      return { error: err.message || "Impossible de supprimer le roulement récurrent." };
    }
  }

  return { error: "Action non reconnue." };
}

export default function Planning() {
  const { currentMonth, shiftTypesList, shiftsList, recurringShiftsList } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [yearNum, monthNum] = currentMonth.split("-").map(Number);
  const calendarDays = getDaysForCalendarMonth(yearNum, monthNum);

  const prevMonth =
    monthNum === 1
      ? `${yearNum - 1}-12`
      : `${yearNum}-${String(monthNum - 1).padStart(2, "0")}`;

  const nextMonth =
    monthNum === 12
      ? `${yearNum + 1}-01`
      : `${yearNum}-${String(monthNum + 1).padStart(2, "0")}`;

  const today = new Date();
  const todayMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Single Shift Modal State
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

  // Recurring Shift Modal States
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  const [manageRecurringModalOpen, setManageRecurringModalOpen] = useState(false);

  const [recurringForm, setRecurringForm] = useState<{
    shiftTypeId: string;
    frequency: "weekly" | "daily";
    interval: number;
    daysOfWeek: number[];
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    notes: string;
  }>({
    shiftTypeId: shiftTypesList[0]?.id || "",
    frequency: "weekly",
    interval: 1,
    daysOfWeek: [1, 3, 5],
    startDate: todayStr,
    endDate: "",
    startTime: shiftTypesList[0]?.startTime || "",
    endTime: shiftTypesList[0]?.endTime || "",
    notes: "",
  });

  // Close modals when submission completes successfully
  useEffect(() => {
    if (actionData?.success) {
      setModalOpen(false);
      setRecurringModalOpen(false);
      setManageRecurringModalOpen(false);
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

  const handleOpenRecurringCreate = () => {
    const defaultType = shiftTypesList[0];
    setRecurringForm({
      shiftTypeId: defaultType?.id || "",
      frequency: "weekly",
      interval: 1,
      daysOfWeek: [1, 3, 5],
      startDate: todayStr,
      endDate: "",
      startTime: defaultType?.startTime || "",
      endTime: defaultType?.endTime || "",
      notes: "",
    });
    setRecurringModalOpen(true);
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

  const handleRecurringShiftTypeChange = (newTypeId: string) => {
    const selectedType = shiftTypesList.find((st) => st.id === newTypeId);
    setRecurringForm((prev) => ({
      ...prev,
      shiftTypeId: newTypeId,
      startTime: selectedType?.startTime || "",
      endTime: selectedType?.endTime || "",
    }));
  };

  const handleDayToggle = (dayNum: number) => {
    setRecurringForm((prev) => {
      const exists = prev.daysOfWeek.includes(dayNum);
      const updated = exists
        ? prev.daysOfWeek.filter((d) => d !== dayNum)
        : [...prev.daysOfWeek, dayNum].sort((a, b) => a - b);
      return { ...prev, daysOfWeek: updated };
    });
  };

  // Duration computation for live preview inside single shift modal
  const liveDurationResult =
    selectedShift.startTime && selectedShift.endTime
      ? calculateShiftDuration({
          startTime: selectedShift.startTime,
          endTime: selectedShift.endTime,
        })
      : null;

  // Dynamic client-side validation for recurring modal
  let recurringValidationError: string | null = null;

  if (recurringForm.frequency === "weekly" && recurringForm.daysOfWeek.length === 0) {
    recurringValidationError = "Veuillez cocher au moins un jour de la semaine (ex. Lun, Mer, Ven).";
  } else if (recurringForm.startDate && recurringForm.endDate && recurringForm.endDate < recurringForm.startDate) {
    recurringValidationError = "La date de fin doit être égale ou postérieure à la date de début.";
  }

  // Calculate live shift duration per occurrence
  const singleShiftDuration =
    recurringForm.startTime && recurringForm.endTime
      ? calculateShiftDuration({
          startTime: recurringForm.startTime,
          endTime: recurringForm.endTime,
        })
      : null;

  const singleShiftHours =
    singleShiftDuration && singleShiftDuration.success
      ? Math.round((singleShiftDuration.durationMinutes / 60) * 10) / 10
      : null;

  // Recurrence occurrence dates preview calculation
  let previewRangeTo = recurringForm.endDate;
  let isDefaultPreviewRange = false;
  if (!previewRangeTo && recurringForm.startDate) {
    const sObj = new Date(recurringForm.startDate);
    sObj.setDate(sObj.getDate() + 90);
    previewRangeTo = sObj.toISOString().split("T")[0];
    isDefaultPreviewRange = true;
  }

  const recurrencePreview =
    !recurringValidationError && recurringForm.startDate && previewRangeTo
      ? generateOccurrenceDates(
          {
            startDate: recurringForm.startDate,
            endDate: recurringForm.endDate || undefined,
            frequency: recurringForm.frequency,
            interval: recurringForm.interval,
            daysOfWeek: recurringForm.daysOfWeek,
          },
          {
            from: recurringForm.startDate,
            to: previewRangeTo,
          },
        )
      : null;

  if (recurrencePreview && !recurrencePreview.success) {
    recurringValidationError = recurrencePreview.error.message;
  }

  const liveOccurrences = recurrencePreview && recurrencePreview.success ? recurrencePreview.occurrences : [];
  const totalEstimatedHours = singleShiftHours && liveOccurrences.length > 0 ? Math.round(liveOccurrences.length * singleShiftHours) : null;

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

          {recurringShiftsList.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setManageRecurringModalOpen(true)}
              id="btn-manage-recurring"
              style={{ marginLeft: "0.25rem" }}
            >
              📋 Roulements ({recurringShiftsList.length})
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleOpenRecurringCreate}
            id="btn-add-recurring"
            style={{ marginLeft: "0.25rem" }}
          >
            🔄 Roulement récurrent
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => handleOpenCreate()}
            id="btn-add-shift"
            style={{ marginLeft: "0.25rem" }}
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
            Commencez par ajouter vos gardes ou roulements récurrents pour visualiser votre planning et calculer automatiquement vos heures de travail.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleOpenCreate()}
              id="btn-add-first-shift"
            >
              + Ajouter ma première garde
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleOpenRecurringCreate}
              id="btn-add-first-recurring"
            >
              🔄 Créer un roulement récurrent
            </button>
          </div>
        </div>
      )}

      {/* Modal Dialog for Create / Edit Single Shift */}
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

      {/* Modal Dialog for Creating a Recurring Shift */}
      {recurringModalOpen && (
        <div
          className="modal-backdrop"
          id="recurring-modal-backdrop"
          onClick={() => setRecurringModalOpen(false)}
        >
          <div
            className="modal-dialog"
            id="recurring-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "560px" }}
          >
            <div className="modal-header" id="recurring-modal-header">
              <h2 className="modal-title" id="recurring-modal-title">
                🔄 Nouveau Roulement Récurrent
              </h2>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setRecurringModalOpen(false)}
                id="btn-close-recurring-modal"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <Form method="post" id="recurring-shift-form">
              <div className="modal-body" id="recurring-modal-body">
                <input type="hidden" name="intent" value="create_recurring_shift" />
                <input type="hidden" name="shiftTypeId" value={recurringForm.shiftTypeId} />
                <input type="hidden" name="frequency" value={recurringForm.frequency} />
                {recurringForm.daysOfWeek.map((d) => (
                  <input key={d} type="hidden" name="daysOfWeek" value={d} />
                ))}

                {/* Section 1: Type de garde */}
                <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                  <div className="section-divider-title">
                    <span>📌 1. Type de garde / Roulement</span>
                  </div>

                  {/* Large touch cards for quick selection on mobile */}
                  <div className="mobile-touch-card-grid" id="recurring-shift-type-cards">
                    {shiftTypesList.map((st) => {
                      const isSelected = recurringForm.shiftTypeId === st.id;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          className={`shift-touch-card ${isSelected ? "is-selected" : ""}`}
                          onClick={() => handleRecurringShiftTypeChange(st.id)}
                        >
                          <div
                            className="shift-color-dot"
                            style={{ backgroundColor: st.color || "#0284c7" }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{st.name}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                              {st.startTime && st.endTime ? `${st.startTime} - ${st.endTime}` : "Sans horaire"}
                            </div>
                          </div>
                          {isSelected && <span style={{ color: "var(--color-primary)", fontWeight: "bold" }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Section 2: Rythme & Fréquence */}
                <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                  <div className="section-divider-title">
                    <span>🔄 2. Rythme & Fréquence</span>
                  </div>

                  {/* Segmented Control for Frequency */}
                  <div className="segmented-control" id="recurring-frequency-segmented">
                    <button
                      type="button"
                      className={`segmented-btn ${recurringForm.frequency === "weekly" ? "is-active" : ""}`}
                      onClick={() =>
                        setRecurringForm((prev) => ({
                          ...prev,
                          frequency: "weekly",
                        }))
                      }
                    >
                      <span>📅</span>
                      <span>Hebdomadaire</span>
                    </button>
                    <button
                      type="button"
                      className={`segmented-btn ${recurringForm.frequency === "daily" ? "is-active" : ""}`}
                      onClick={() =>
                        setRecurringForm((prev) => ({
                          ...prev,
                          frequency: "daily",
                        }))
                      }
                    >
                      <span>📆</span>
                      <span>Quotidien</span>
                    </button>
                  </div>
                </div>

                {/* Interval Control with Large Stepper */}
                <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                  <label htmlFor="recurring-form-interval" className="form-label">
                    Intervalle de répétition *
                  </label>
                  <div className="stepper-control">
                    <button
                      type="button"
                      className="stepper-btn"
                      disabled={recurringForm.interval <= 1}
                      onClick={() =>
                        setRecurringForm((prev) => ({
                          ...prev,
                          interval: Math.max(1, prev.interval - 1),
                        }))
                      }
                      aria-label="Diminuer l'intervalle"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      id="recurring-form-interval"
                      name="interval"
                      className="form-input"
                      style={{ textAlign: "center", fontWeight: 700, fontSize: "1.1rem" }}
                      min={1}
                      max={52}
                      value={recurringForm.interval}
                      onChange={(e) =>
                        setRecurringForm((prev) => ({
                          ...prev,
                          interval: Math.max(1, parseInt(e.target.value, 10) || 1),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="stepper-btn"
                      disabled={recurringForm.interval >= 52}
                      onClick={() =>
                        setRecurringForm((prev) => ({
                          ...prev,
                          interval: Math.min(52, prev.interval + 1),
                        }))
                      }
                      aria-label="Augmenter l'intervalle"
                    >
                      +
                    </button>
                  </div>
                  <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>
                    {recurringForm.frequency === "weekly"
                      ? recurringForm.interval === 1
                        ? "Chaque semaine"
                        : `Toutes les ${recurringForm.interval} semaines`
                      : recurringForm.interval === 1
                      ? "Chaque jour"
                      : `Tous les ${recurringForm.interval} jours`}
                  </span>
                </div>

                {/* Day selector for weekly recurrence */}
                {recurringForm.frequency === "weekly" && (
                  <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                    <label className="form-label">Jours de garde *</label>
                    <div className="day-picker-grid" id="recurring-day-picker">
                      {[
                        { num: 1, label: "Lun" },
                        { num: 2, label: "Mar" },
                        { num: 3, label: "Mer" },
                        { num: 4, label: "Jeu" },
                        { num: 5, label: "Ven" },
                        { num: 6, label: "Sam" },
                        { num: 0, label: "Dim" },
                      ].map((day) => {
                        const isChecked = recurringForm.daysOfWeek.includes(day.num);
                        return (
                          <button
                            key={day.num}
                            type="button"
                            className={`day-picker-btn ${isChecked ? "is-selected" : ""}`}
                            onClick={() => handleDayToggle(day.num)}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Section 3: Période & Horaires */}
                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <div className="section-divider-title">
                    <span>📅 3. Période & Horaires</span>
                  </div>
                </div>

                <div className="time-row" style={{ marginBottom: "1rem" }}>
                  <div className="form-group">
                    <label htmlFor="recurring-form-start-date" className="form-label">
                      Date de début *
                    </label>
                    <input
                      type="date"
                      id="recurring-form-start-date"
                      name="startDate"
                      className="form-input"
                      required
                      value={recurringForm.startDate}
                      onChange={(e) =>
                        setRecurringForm((prev) => ({ ...prev, startDate: e.target.value }))
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="recurring-form-end-date" className="form-label">
                      Date de fin (optionnelle)
                    </label>
                    <input
                      type="date"
                      id="recurring-form-end-date"
                      name="endDate"
                      className="form-input"
                      value={recurringForm.endDate}
                      onChange={(e) =>
                        setRecurringForm((prev) => ({ ...prev, endDate: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="time-row" style={{ marginBottom: "1.25rem" }}>
                  <div className="form-group">
                    <label htmlFor="recurring-form-start-time" className="form-label">
                      Heure de début
                    </label>
                    <input
                      type="time"
                      id="recurring-form-start-time"
                      name="startTime"
                      className="form-input"
                      value={recurringForm.startTime}
                      onChange={(e) =>
                        setRecurringForm((prev) => ({ ...prev, startTime: e.target.value }))
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="recurring-form-end-time" className="form-label">
                      Heure de fin
                    </label>
                    <input
                      type="time"
                      id="recurring-form-end-time"
                      name="endTime"
                      className="form-input"
                      value={recurringForm.endTime}
                      onChange={(e) =>
                        setRecurringForm((prev) => ({ ...prev, endTime: e.target.value }))
                      }
                    />
                  </div>
                </div>

                {/* Dynamic Client-Side Live Validation & Instant Counter Card */}
                <div
                  id="recurring-live-validation"
                  className={`live-validation-card ${recurringValidationError ? "is-invalid" : "is-valid"}`}
                >
                  <div className="live-validation-header">
                    <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      {recurringValidationError ? "⚠️ Validation incomplète" : "✅ Validation dynamique"}
                    </span>
                    {!recurringValidationError && (
                      <span className="live-validation-counter-badge">
                        {liveOccurrences.length} {liveOccurrences.length > 1 ? "gardes" : "garde"}
                      </span>
                    )}
                  </div>

                  {recurringValidationError ? (
                    <div className="live-validation-details">{recurringValidationError}</div>
                  ) : (
                    <div className="live-validation-details">
                      <div>
                        <strong>
                          {liveOccurrences.length} garde(s) récurrente(s) seront générée(s)
                        </strong>{" "}
                        du {recurringForm.startDate.split("-").reverse().join("/")}
                        {recurringForm.endDate
                          ? ` au ${recurringForm.endDate.split("-").reverse().join("/")}`
                          : " (aperçu initial sur 3 mois)"}.
                        {totalEstimatedHours !== null && ` Volume estimé : ~${totalEstimatedHours}h de garde.`}
                      </div>
                      {isDefaultPreviewRange && (
                        <div style={{ fontSize: "0.775rem", opacity: 0.85, marginTop: "0.25rem" }}>
                          💡 Sans date de fin fixée, l'aperçu affiche les 3 prochains mois. La récurrence continue jusqu'à 3 ans max.
                        </div>
                      )}
                      {liveOccurrences.length > 0 && (
                        <div style={{ marginTop: "0.35rem", fontSize: "0.775rem", opacity: 0.9 }}>
                          📅 Premières dates : {liveOccurrences.slice(0, 6).join(", ")}
                          {liveOccurrences.length > 6 ? "..." : ""}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label htmlFor="recurring-form-notes" className="form-label">
                    Notes ou Service (optionnel)
                  </label>
                  <textarea
                    id="recurring-form-notes"
                    name="notes"
                    className="form-input"
                    rows={2}
                    placeholder="ex. Roulement de nuit service Réanimation..."
                    value={recurringForm.notes}
                    onChange={(e) =>
                      setRecurringForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                  />
                </div>

                {/* Section Aide-mémoire */}
                <div className="aide-memoire-box" id="recurring-aide-memoire">
                  <div className="aide-memoire-title">
                    <span>💡 Aide-mémoire — Génération des gardes</span>
                  </div>
                  <ul className="aide-memoire-list">
                    <li>
                      <strong>Plafond de génération (3 ans) :</strong> La récurrence automatique est limitée à <strong>3 ans maximum (1095 jours)</strong> à partir de la date de début pour préserver les performances de votre planning.
                    </li>
                    <li>
                      <strong>Prévention des doublons :</strong> Si une garde existe déjà exactement au même jour et heure, aucun doublon n'est créé.
                    </li>
                    <li>
                      <strong>Type de roulement :</strong> Le mode <em>Hebdomadaire</em> génère la garde uniquement sur les jours cochés (ex. Lun/Mer/Ven). Le mode <em>Quotidien</em> répète la garde tous les N jours.
                    </li>
                    <li>
                      <strong>Gestion individuelle :</strong> Chaque garde générée devient une entité propre dans votre calendrier. Vous pouvez modifier, échanger ou supprimer une date spécifique sans altérer le reste de la série.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="modal-footer" id="recurring-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setRecurringModalOpen(false)}
                  id="btn-cancel-recurring-modal"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  id="btn-save-recurring"
                  disabled={isSubmitting || !!recurringValidationError}
                >
                  {isSubmitting
                    ? "Génération en cours..."
                    : `Générer ${liveOccurrences.length > 0 ? `(${liveOccurrences.length})` : ""} la récurrence`}
                </button>
              </div>
            </Form>
          </div>
        </div>
      )}

      {/* Modal Dialog for Managing Active Recurring Rules */}
      {manageRecurringModalOpen && (
        <div
          className="modal-backdrop"
          id="manage-recurring-modal-backdrop"
          onClick={() => setManageRecurringModalOpen(false)}
        >
          <div
            className="modal-dialog"
            id="manage-recurring-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "600px" }}
          >
            <div className="modal-header" id="manage-recurring-header">
              <h2 className="modal-title" id="manage-recurring-title">
                📋 Mes Roulements Récurrents Configurés
              </h2>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setManageRecurringModalOpen(false)}
                id="btn-close-manage-recurring"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <div className="modal-body" id="manage-recurring-body">
              <p className="subtitle" style={{ marginBottom: "1rem" }}>
                Voici vos règles de récurrence enregistrées. Supprimer une règle interrompt les générations futures mais conserve vos gardes déjà inscrites au planning.
              </p>

              {recurringShiftsList.length === 0 ? (
                <p className="info-muted">Aucun roulement récurrent n'est configuré.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {recurringShiftsList.map((rule) => {
                    const st = shiftTypesList.find((s) => s.id === rule.shiftTypeId);
                    return (
                      <div
                        key={rule.id}
                        className="card"
                        style={{
                          padding: "0.75rem 1rem",
                          backgroundColor: "#f8fafc",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <strong>{rule.name || st?.name || "Roulement"}</strong>{" "}
                            <span style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                              ({rule.frequency === "weekly" ? `Toutes les ${rule.interval} sem` : `Tous les ${rule.interval} jours`})
                            </span>
                          </div>

                          <Form method="post">
                            <input type="hidden" name="intent" value="delete_recurring_shift" />
                            <input type="hidden" name="recurringShiftId" value={rule.id} />
                            <button
                              type="submit"
                              className="btn btn-danger btn-sm"
                              disabled={isSubmitting}
                              title="Supprimer ce roulement"
                            >
                              Supprimer
                            </button>
                          </Form>
                        </div>

                        <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.25rem" }}>
                          Période : du {rule.startDate} {rule.endDate ? `au ${rule.endDate}` : "(sans fin)"}
                          {rule.startTime && ` • Horaires : ${rule.startTime} - ${rule.endTime}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div
                style={{
                  marginTop: "1.25rem",
                  padding: "0.75rem",
                  backgroundColor: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "0.375rem",
                  fontSize: "0.85rem",
                  color: "#1e40af",
                }}
              >
                💡 <strong>Remarque :</strong> La suppression d'un roulement n'efface pas les gardes déjà créées dans le planning.
              </div>
            </div>

            <div className="modal-footer" id="manage-recurring-footer">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setManageRecurringModalOpen(false)}
                id="btn-close-manage"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
