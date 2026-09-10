import { eq } from "drizzle-orm";
import { withDb } from "../../db/client";
import { profiles } from "../../db/schema/profiles";
import { entitlements } from "../../db/schema/entitlements";
import { subscriptions } from "../../db/schema/subscriptions";
import { notifications } from "../../db/schema/notifications";
import { auditLogs } from "../../db/schema/audit-logs";
import type { IStorageService } from "../storage";
import type { IBillingService } from "../billing";
import type {
  IGdprService,
  UserDataExport,
  AccountDeletionOptions,
  AccountDeletionReceipt,
} from "./types";

export interface GdprServiceDependencies {
  hyperdrive: Hyperdrive;
  billingService?: IBillingService;
  storageService?: IStorageService;
  authAdminClient?: {
    deleteUser: (userId: string) => Promise<{ error: unknown | null }>;
  };
}

export class GdprService implements IGdprService {
  constructor(private readonly deps: GdprServiceDependencies) {}

  async exportUserData(userId: string): Promise<UserDataExport> {
    if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
      throw new Error("Valid userId is required for data export");
    }

    return await withDb(this.deps.hyperdrive, async (db) => {
      // 1. Fetch Profile
      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .limit(1);

      if (!profile) {
        return {
          exportedAt: new Date().toISOString(),
          user: { id: userId },
          profile: null,
          entitlements: [],
          subscriptions: [],
          notifications: [],
        };
      }

      // 2. Fetch Entitlements
      const userEntitlements = await db
        .select()
        .from(entitlements)
        .where(eq(entitlements.profileId, profile.id));

      // 3. Fetch Subscriptions
      const userSubscriptions = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.profileId, profile.id));

      // 4. Fetch Notifications
      const userNotifications = await db
        .select()
        .from(notifications)
        .where(eq(notifications.profileId, profile.id));

      return {
        exportedAt: new Date().toISOString(),
        user: { id: userId, email: profile.email || undefined },
        profile: {
          id: profile.id,
          displayName: profile.displayName,
          email: profile.email,
          createdAt: profile.createdAt.toISOString(),
          updatedAt: profile.updatedAt.toISOString(),
        },
        entitlements: userEntitlements.map((e) => ({
          featureKey: e.featureKey,
          enabled: Boolean(e.enabled),
          metadata: e.metadata,
          createdAt: e.createdAt.toISOString(),
          updatedAt: e.updatedAt.toISOString(),
        })),
        subscriptions: userSubscriptions.map((s) => ({
          id: s.id,
          planId: s.planId,
          status: s.status,
          currentPeriodStart: s.currentPeriodStart ? s.currentPeriodStart.toISOString() : null,
          currentPeriodEnd: s.currentPeriodEnd ? s.currentPeriodEnd.toISOString() : null,
          cancelAtPeriodEnd: Boolean(s.cancelAtPeriodEnd),
        })),
        notifications: userNotifications.map((n) => ({
          id: n.id,
          type: n.type,
          status: n.status,
          scheduledAt: n.scheduledAt ? n.scheduledAt.toISOString() : null,
          sentAt: n.sentAt ? n.sentAt.toISOString() : null,
          createdAt: n.createdAt.toISOString(),
        })),
      };
    });
  }

  async deleteUserAccount(
    userId: string,
    options?: AccountDeletionOptions,
  ): Promise<AccountDeletionReceipt> {
    if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
      throw new Error("Valid userId is required for account deletion");
    }

    const receipt: AccountDeletionReceipt = {
      success: true,
      userId,
      profileId: null,
      deletedCounts: {
        profiles: 0,
        entitlements: 0,
        subscriptions: 0,
        notifications: 0,
        storageFiles: 0,
      },
      authDeleted: false,
      warnings: [],
    };

    let hasFatalError = false;

    try {
      // Step 1: Fetch Profile ID
      const profile = await withDb(this.deps.hyperdrive, async (db) => {
        const [p] = await db
          .select()
          .from(profiles)
          .where(eq(profiles.userId, userId))
          .limit(1);
        return p || null;
      });

      if (!profile) {
        receipt.warnings.push("No database profile found for user");
      } else {
        receipt.profileId = profile.id;
      }

      // Step 2: Cancel active Stripe subscriptions before deleting local records
      if (options?.cancelStripeSubscriptions !== false && this.deps.billingService && profile) {
        try {
          const subResult = await this.deps.billingService.getSubscription(profile.id);
          if (subResult.data && (subResult.data.status === "active" || subResult.data.status === "trialing")) {
            const cancelResult = await this.deps.billingService.cancelSubscription(profile.id);
            if (cancelResult.error) {
              hasFatalError = true;
              receipt.warnings.push(`Stripe subscription cancellation failed: ${cancelResult.error.message}`);
            }
          }
        } catch (stripeErr: any) {
          hasFatalError = true;
          receipt.warnings.push(`Stripe subscription cancellation error: ${stripeErr?.message || stripeErr}`);
        }
      }

      // Step 3: Database records deletion in ordered sequence
      if (profile) {
        try {
          await withDb(this.deps.hyperdrive, async (db) => {
            // 1. Delete notifications
            const deletedNotifications = await db
              .delete(notifications)
              .where(eq(notifications.profileId, profile.id))
              .returning();
            receipt.deletedCounts.notifications = deletedNotifications.length;

            // 2. Delete entitlements
            const deletedEntitlements = await db
              .delete(entitlements)
              .where(eq(entitlements.profileId, profile.id))
              .returning();
            receipt.deletedCounts.entitlements = deletedEntitlements.length;

            // 3. Delete subscriptions
            const deletedSubscriptions = await db
              .delete(subscriptions)
              .where(eq(subscriptions.profileId, profile.id))
              .returning();
            receipt.deletedCounts.subscriptions = deletedSubscriptions.length;

            // 4. Record audit log for GDPR compliance record
            await db.insert(auditLogs).values({
              profileId: profile.id,
              action: "user_account_deleted",
              entityType: "user",
              entityId: userId,
              metadata: {
                deletedAt: new Date().toISOString(),
                counts: receipt.deletedCounts,
              },
            });

            // 5. Delete profile
            const deletedProfiles = await db
              .delete(profiles)
              .where(eq(profiles.id, profile.id))
              .returning();
            receipt.deletedCounts.profiles = deletedProfiles.length;
          });
        } catch (dbErr: any) {
          hasFatalError = true;
          receipt.warnings.push(`Database record deletion failed: ${dbErr?.message || dbErr}`);
        }
      }

      // Step 4: Recursive storage file cleanup
      if (options?.deleteStorageFiles && this.deps.storageService) {
        try {
          const userPrefix = this.deps.storageService.getUserScopedPath(userId, "").replace(/\/+$/, "");
          const deleteResult = await this.deps.storageService.deleteFolder("user-assets", userPrefix);
          if (deleteResult.error) {
            hasFatalError = true;
            receipt.warnings.push(`Storage cleanup encountered error: ${deleteResult.error.message}`);
          } else if (deleteResult.data?.deleted) {
            receipt.deletedCounts.storageFiles = deleteResult.data.deleted.length;
          }
        } catch (storageErr: any) {
          hasFatalError = true;
          receipt.warnings.push(`Storage cleanup encountered error: ${storageErr?.message || storageErr}`);
        }
      }

      // Step 5: Auth Provider Account Deletion
      if (options?.deleteAuthAccount && this.deps.authAdminClient) {
        try {
          const { error } = await this.deps.authAdminClient.deleteUser(userId);
          if (error) {
            hasFatalError = true;
            receipt.warnings.push(`Auth account deletion warning: ${JSON.stringify(error)}`);
          } else {
            receipt.authDeleted = true;
          }
        } catch (authErr: any) {
          hasFatalError = true;
          receipt.warnings.push(`Auth account deletion error: ${authErr?.message || authErr}`);
        }
      }

      receipt.success = !hasFatalError;
      return receipt;
    } catch (err: any) {
      receipt.success = false;
      receipt.warnings.push(`Account deletion failed: ${err?.message || err}`);
      return receipt;
    }
  }
}

/**
 * Factory constructor helper for GDPR service.
 */
export function createGdprService(deps: GdprServiceDependencies): IGdprService {
  return new GdprService(deps);
}
