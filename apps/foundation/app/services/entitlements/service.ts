import { and, eq } from "drizzle-orm";
import { withDb } from "../../db/client";
import { entitlements } from "../../db/schema/entitlements";
import { profiles } from "../../db/schema/profiles";
import type { EntitlementRecord, IEntitlementService } from "./types";

/**
 * PostgreSQL/Drizzle implementation of the internal EntitlementService.
 *
 * Architecture:
 * EntitlementService → Drizzle ORM → pg.Client → Cloudflare Hyperdrive → PostgreSQL
 *
 * Strict isolation:
 * - Operates entirely within the PostgreSQL database foundation.
 * - Does not call Supabase database APIs or third-party SDKs.
 * - Resolves ownership via profileId linked to verified user identity.
 */
export class EntitlementService implements IEntitlementService {
  constructor(private readonly hyperdrive: Hyperdrive) {}

  async hasEntitlement(profileId: string, featureKey: string): Promise<boolean> {
    if (!profileId || !featureKey) {
      return false;
    }

    try {
      return await withDb(this.hyperdrive, async (db) => {
        const records = await db
          .select()
          .from(entitlements)
          .where(
            and(
              eq(entitlements.profileId, profileId),
              eq(entitlements.featureKey, featureKey),
            ),
          )
          .limit(1);

        if (records.length === 0) {
          return false;
        }

        return Boolean(records[0].enabled);
      });
    } catch (error) {
      console.error("Entitlement check error:", error);
      return false;
    }
  }

  async getEntitlements(profileId: string): Promise<EntitlementRecord[]> {
    if (!profileId) {
      return [];
    }

    try {
      return await withDb(this.hyperdrive, async (db) => {
        return await db
          .select()
          .from(entitlements)
          .where(
            and(
              eq(entitlements.profileId, profileId),
              eq(entitlements.enabled, true),
            ),
          );
      });
    } catch (error) {
      console.error("Entitlements retrieval error:", error);
      return [];
    }
  }

  async grantEntitlement(
    profileId: string,
    featureKey: string,
    metadata: Record<string, unknown> = {},
  ): Promise<EntitlementRecord> {
    return await withDb(this.hyperdrive, async (db) => {
      const now = new Date();
      const rows = await db
        .insert(entitlements)
        .values({
          profileId,
          featureKey,
          enabled: true,
          metadata,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [entitlements.profileId, entitlements.featureKey],
          set: {
            enabled: true,
            metadata,
            updatedAt: now,
          },
        })
        .returning();

      return rows[0];
    });
  }

  async revokeEntitlement(profileId: string, featureKey: string): Promise<void> {
    if (!profileId || !featureKey) {
      return;
    }

    await withDb(this.hyperdrive, async (db) => {
      await db
        .update(entitlements)
        .set({
          enabled: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(entitlements.profileId, profileId),
            eq(entitlements.featureKey, featureKey),
          ),
        );
    });
  }

  async setPlanEntitlements(
    profileId: string,
    featureKeys: string[],
  ): Promise<void> {
    if (!profileId) {
      return;
    }

    await withDb(this.hyperdrive, async (db) => {
      const now = new Date();

      // 1. Grant all features included in the plan
      for (const key of featureKeys) {
        await db
          .insert(entitlements)
          .values({
            profileId,
            featureKey: key,
            enabled: true,
            metadata: { source: "plan_sync" },
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [entitlements.profileId, entitlements.featureKey],
            set: {
              enabled: true,
              updatedAt: now,
            },
          });
      }

      // 2. Disable existing entitlements that are not in the new plan
      const existing = await db
        .select()
        .from(entitlements)
        .where(eq(entitlements.profileId, profileId));

      for (const ent of existing) {
        if (!featureKeys.includes(ent.featureKey) && ent.enabled) {
          await db
            .update(entitlements)
            .set({
              enabled: false,
              updatedAt: now,
            })
            .where(
              and(
                eq(entitlements.profileId, profileId),
                eq(entitlements.featureKey, ent.featureKey),
              ),
            );
        }
      }
    });
  }
}

/**
 * Creates an EntitlementService instance backed by Cloudflare Hyperdrive.
 */
export function createEntitlementService(
  hyperdrive: Hyperdrive,
  customService?: IEntitlementService,
): IEntitlementService {
  if (customService) {
    return customService;
  }
  return new EntitlementService(hyperdrive);
}

/**
 * Resolves verified profile identity from server-side user ID and checks entitlement.
 * Enforces ownership: never trusts client-supplied profile IDs.
 */
export async function verifyUserEntitlement(
  hyperdrive: Hyperdrive,
  verifiedUserId: string,
  featureKey: string,
  service?: IEntitlementService,
): Promise<boolean> {
  if (!verifiedUserId || !featureKey) {
    return false;
  }

  const entitlementService = createEntitlementService(hyperdrive, service);

  // Resolve application profile from verified auth user.id
  const profile = await withDb(hyperdrive, async (db) => {
    const rows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, verifiedUserId))
      .limit(1);
    return rows[0] ?? null;
  });

  if (!profile) {
    return false;
  }

  return await entitlementService.hasEntitlement(profile.id, featureKey);
}
