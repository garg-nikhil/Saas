import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

/**
 * Account/user subscription state tracking.
 * Provides a provider-agnostic baseline schema for future billing adapters.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    provider: text("provider"),
    providerSubscriptionId: text("provider_subscription_id"),
    status: text("status").notNull().default("incomplete"),
    planId: text("plan_id").notNull(),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true, mode: "date" }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true, mode: "date" }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("subscriptions_profile_id_idx").on(table.profileId),
    index("subscriptions_status_idx").on(table.status),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
