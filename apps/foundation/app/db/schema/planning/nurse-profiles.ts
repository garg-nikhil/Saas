import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { profiles } from "../profiles";

/**
 * Supported nurse profession enum values for Planning Infirmier.
 */
export const SUPPORTED_PROFESSIONS = [
  "IDE",
  "IADE",
  "IBODE",
  "IPDE",
  "AS",
  "Cadre",
  "Autre",
] as const;

export type SupportedProfession = (typeof SUPPORTED_PROFESSIONS)[number];

/**
 * Validates and normalizes user-provided profession input against supported values.
 */
export function normalizeProfession(input?: string | null): SupportedProfession | null {
  if (!input) return null;
  const trimmed = input.trim();
  const matched = SUPPORTED_PROFESSIONS.find(
    (p) => p.toLowerCase() === trimmed.toLowerCase(),
  );
  return matched ?? null;
}

/**
 * Product-specific profile/preference record for Planning Infirmier.
 * Isolates healthcare domain data from the generic Factory profiles table.
 */
export const nurseProfiles = pgTable(
  "nurse_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .unique()
      .references(() => profiles.id, { onDelete: "cascade" }),
    profession: text("profession").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("nurse_profiles_profile_id_idx").on(table.profileId),
  ],
);

export type NurseProfile = typeof nurseProfiles.$inferSelect;
export type NewNurseProfile = typeof nurseProfiles.$inferInsert;
