import { pgTable, uuid, text, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { profiles } from "../profiles";

/**
 * User-owned or product-defined shift categories for Planning Infirmier.
 */
export const shiftTypes = pgTable(
  "shift_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    shortCode: text("short_code"),
    startTime: text("start_time"),
    endTime: text("end_time"),
    color: text("color"),
    isWork: boolean("is_work").default(true).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("shift_types_profile_id_idx").on(table.profileId),
  ],
);

export type ShiftType = typeof shiftTypes.$inferSelect;
export type NewShiftType = typeof shiftTypes.$inferInsert;

export const DEFAULT_SHIFT_TYPES = [
  { name: "Matin", shortCode: "M", startTime: "06:45", endTime: "14:15", color: "#3B82F6", isWork: true },
  { name: "Après-midi", shortCode: "A", startTime: "13:45", endTime: "21:15", color: "#F59E0B", isWork: true },
  { name: "Nuit", shortCode: "N", startTime: "21:00", endTime: "07:00", color: "#6366F1", isWork: true },
  { name: "12h", shortCode: "12h", startTime: "07:00", endTime: "19:00", color: "#8B5CF6", isWork: true },
  { name: "Journée", shortCode: "J", startTime: "08:30", endTime: "16:30", color: "#10B981", isWork: true },
  { name: "Repos", shortCode: "R", startTime: null, endTime: null, color: "#6B7280", isWork: false },
  { name: "Congé", shortCode: "C", startTime: null, endTime: null, color: "#EC4899", isWork: false },
] as const;
