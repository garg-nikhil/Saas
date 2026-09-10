import { pgTable, uuid, text, numeric, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { profiles } from "../profiles";

/**
 * Salary calculation configuration inputs for Planning Infirmier users.
 *
 * Stores raw hourly, monthly, contracted hours, and bonus multipliers/rates
 * used as input data by future salary estimation logic.
 */
export const salaryProfiles = pgTable(
  "salary_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .unique()
      .references(() => profiles.id, { onDelete: "cascade" }),
    baseHourlyRate: numeric("base_hourly_rate", { precision: 10, scale: 2 }),
    baseMonthlySalary: numeric("base_monthly_salary", { precision: 10, scale: 2 }),
    contractedHoursPerWeek: numeric("contracted_hours_per_week", { precision: 5, scale: 2 }),
    nightBonusRate: numeric("night_bonus_rate", { precision: 5, scale: 2 }),
    sundayBonusRate: numeric("sunday_bonus_rate", { precision: 5, scale: 2 }),
    holidayBonusRate: numeric("holiday_bonus_rate", { precision: 5, scale: 2 }),
    overtimeBonusRate: numeric("overtime_bonus_rate", { precision: 5, scale: 2 }),
    currency: text("currency").default("EUR").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("salary_profiles_profile_id_idx").on(table.profileId),
  ],
);

export type SalaryProfile = typeof salaryProfiles.$inferSelect;
export type NewSalaryProfile = typeof salaryProfiles.$inferInsert;
