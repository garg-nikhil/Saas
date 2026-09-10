/**
 * Notification Service Types & Status Lifecycle
 *
 * Provider-agnostic notification tracking and scheduling foundation.
 */

export type NotificationStatus =
  | "pending"
  | "scheduled"
  | "processing"
  | "sent"
  | "failed"
  | "cancelled";

export interface NotificationRecord {
  id: string;
  profileId: string;
  type: string;
  status: NotificationStatus;
  scheduledAt: Date | null;
  sentAt: Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNotificationInput {
  profileId: string;
  type: string;
  scheduledAt?: Date;
  metadata?: Record<string, unknown>;
  status?: "pending" | "scheduled";
}

export interface ListNotificationsOptions {
  profileId?: string;
  status?: NotificationStatus;
  limit?: number;
  offset?: number;
  scheduledBefore?: Date;
}

/**
 * Service interface for notifications foundation.
 */
export interface INotificationService {
  createNotification(input: CreateNotificationInput): Promise<NotificationRecord>;
  getNotification(id: string): Promise<NotificationRecord | null>;
  listNotifications(options?: ListNotificationsOptions): Promise<NotificationRecord[]>;
  markProcessing(id: string): Promise<NotificationRecord>;
  markSent(id: string, metadataUpdates?: Record<string, unknown>): Promise<NotificationRecord>;
  markFailed(id: string, errorMessage: string, metadataUpdates?: Record<string, unknown>): Promise<NotificationRecord>;
  cancelNotification(id: string): Promise<NotificationRecord>;
}
