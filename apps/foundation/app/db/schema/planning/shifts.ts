import { pgTable, uuid, text, date, timestamp, index } from "drizzle-orm/pg-core";
import { profiles } from "../profiles";
import { shiftTypes } from "./shift-types";

/**
 * Individual planned shifts for Planning Infirmier.
 *
 * Overnight shifts (e.g., start 22:00, end 07:00) are represented with start/end time strings
 * on the shift's calendar date without hardcoding precomputed duration values.
 */
export const shifts = pgTable(
  "shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    shiftTypeId: uuid("shift_type_id").references(() => shiftTypes.id, { onDelete: "set null" }),
    date: date("date", { mode: "string" }).notNull(),
    startTime: text("start_time"),
    endTime: text("end_time"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("shifts_profile_id_idx").on(table.profileId),
    index("shifts_profile_date_idx").on(table.profileId, table.date),
    index("shifts_shift_type_id_idx").on(table.shiftTypeId),
  ],
);

export type Shift = typeof shifts.$inferSelect;
export type NewShift = typeof shifts.$inferInsert;
