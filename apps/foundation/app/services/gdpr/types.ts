/**
 * GDPR & Account Lifecycle Service Contracts
 *
 * Provides a standardized boundary for data export and orchestrated account deletion.
 */

export interface UserDataExport {
  exportedAt: string;
  user: {
    id: string;
    email?: string;
  };
  profile: {
    id: string;
    displayName: string | null;
    email: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  entitlements: Array<{
    featureKey: string;
    enabled: boolean;
    metadata: unknown;
    createdAt: string;
    updatedAt: string;
  }>;
  subscriptions: Array<{
    id: string;
    planId: string;
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  }>;
  notifications: Array<{
    id: string;
    type: string;
    status: string;
    scheduledAt: string | null;
    sentAt: string | null;
    createdAt: string;
  }>;
}

export interface AccountDeletionOptions {
  deleteStorageFiles?: boolean;
  cancelStripeSubscriptions?: boolean;
  deleteAuthAccount?: boolean;
}

export interface AccountDeletionReceipt {
  success: boolean;
  userId: string;
  profileId: string | null;
  deletedCounts: {
    profiles: number;
    entitlements: number;
    subscriptions: number;
    notifications: number;
    storageFiles: number;
  };
  authDeleted: boolean;
  warnings: string[];
}

export interface IGdprService {
  exportUserData(userId: string): Promise<UserDataExport>;
  deleteUserAccount(userId: string, options?: AccountDeletionOptions): Promise<AccountDeletionReceipt>;
}
