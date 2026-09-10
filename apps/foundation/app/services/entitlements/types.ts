import type { Entitlement } from "../../db/schema/entitlements";

export type EntitlementRecord = Entitlement;

/**
 * Service contract for managing account-level feature capabilities.
 *
 * Entitlements answer: "Is this account currently allowed to use feature X?"
 * They are intentionally decoupled from authentication, RBAC roles, Stripe SDK types,
 * and product-specific business rules.
 */
export interface IEntitlementService {
  /**
   * Checks whether an account has a specific feature enabled.
   * Defaults to false for unknown feature keys or revoked entitlements.
   */
  hasEntitlement(profileId: string, featureKey: string): Promise<boolean>;

  /**
   * Retrieves all enabled feature entitlements for a profile.
   */
  getEntitlements(profileId: string): Promise<EntitlementRecord[]>;

  /**
   * Grants or enables a feature entitlement for a profile.
   */
  grantEntitlement(
    profileId: string,
    featureKey: string,
    metadata?: Record<string, unknown>,
  ): Promise<EntitlementRecord>;

  /**
   * Revokes or disables a feature entitlement for a profile.
   */
  revokeEntitlement(profileId: string, featureKey: string): Promise<void>;

  /**
   * Synchronizes a set of plan entitlements for an account, granting new ones
   * and disabling obsolete ones if needed.
   */
  setPlanEntitlements(profileId: string, featureKeys: string[]): Promise<void>;
}
