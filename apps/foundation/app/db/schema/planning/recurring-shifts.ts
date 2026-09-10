import { pgTable, uuid, text, integer, date, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { profiles } from "../profiles";
import { shiftTypes } from "./shift-types";

/**
 * Recurrence rules for Planning Infirmier.
 *
 * Represents rule definitions for repeating work schedules.
 * Does not store or automatically generate individual shift rows.
 */
export const recurringShifts = pgTable(
  "recurring_shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    shiftTypeId: uuid("shift_type_id").references(() => shiftTypes.id, { onDelete: "set null" }),
    name: text("name"),
    startTime: text("start_time"),
    endTime: text("end_time"),
    frequency: text("frequency").default("weekly").notNull(),
    interval: integer("interval").default(1).notNull(),
    daysOfWeek: jsonb("days_of_week").$type<number[] | string[] | Record<string, unknown>>().default([]),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    isActive: boolean("is_active").default(true).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("recurring_shifts_profile_id_idx").on(table.profileId),
    index("recurring_shifts_shift_type_id_idx").on(table.shiftTypeId),
  ],
);

export type RecurringShift = typeof recurringShifts.$inferSelect;
export type NewRecurringShift = typeof recurringShifts.$inferInsert;
