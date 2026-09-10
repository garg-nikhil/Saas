import { and, eq, inArray, lte, desc } from "drizzle-orm";
import { withDb } from "../../db/client";
import { notifications } from "../../db/schema/notifications";
import type {
  INotificationService,
  NotificationRecord,
  CreateNotificationInput,
  ListNotificationsOptions,
  NotificationStatus,
} from "./types";

export class NotificationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationStateError";
  }
}

/**
 * Validates state transition lifecycle.
 */
export function isValidTransition(from: NotificationStatus, to: NotificationStatus): boolean {
  if (from === to) return true; // Idempotent same-state is allowed

  switch (from) {
    case "pending":
    case "scheduled":
      return to === "processing" || to === "cancelled";
    case "processing":
      return to === "sent" || to === "failed";
    case "failed":
      return to === "processing" || to === "cancelled";
    case "sent":
    case "cancelled":
      // Terminal states cannot transition to anything else
      return false;
    default:
      return false;
  }
}

export class NotificationService implements INotificationService {
  constructor(private readonly hyperdrive: Hyperdrive) {}

  async createNotification(input: CreateNotificationInput): Promise<NotificationRecord> {
    if (!input.profileId) {
      throw new Error("profileId is required to create a notification");
    }
    if (!input.type) {
      throw new Error("type is required to create a notification");
    }

    const initialStatus: NotificationStatus = input.scheduledAt
      ? "scheduled"
      : input.status || "pending";

    return await withDb(this.hyperdrive, async (db) => {
      const [record] = await db
        .insert(notifications)
        .values({
          profileId: input.profileId,
          type: input.type,
          status: initialStatus,
          scheduledAt: input.scheduledAt || null,
          metadata: input.metadata || {},
        })
        .returning();

      return record as unknown as NotificationRecord;
    });
  }

  async getNotification(id: string): Promise<NotificationRecord | null> {
    if (!id) return null;

    return await withDb(this.hyperdrive, async (db) => {
      const [record] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, id))
        .limit(1);

      return (record as unknown as NotificationRecord) || null;
    });
  }

  async listNotifications(options?: ListNotificationsOptions): Promise<NotificationRecord[]> {
    return await withDb(this.hyperdrive, async (db) => {
      let query = db.select().from(notifications);

      const conditions = [];
      if (options?.profileId) {
        conditions.push(eq(notifications.profileId, options.profileId));
      }
      if (options?.status) {
        conditions.push(eq(notifications.status, options.status));
      }
      if (options?.scheduledBefore) {
        conditions.push(lte(notifications.scheduledAt, options.scheduledBefore));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      query = query.orderBy(desc(notifications.createdAt)) as any;

      if (options?.limit) {
        query = query.limit(options.limit) as any;
      }
      if (options?.offset) {
        query = query.offset(options.offset) as any;
      }

      const rows = await query;
      return rows as unknown as NotificationRecord[];
    });
  }

  async markProcessing(id: string): Promise<NotificationRecord> {
    const allowedCurrentStatuses: NotificationStatus[] = ["pending", "scheduled", "failed"];

    return await withDb(this.hyperdrive, async (db) => {
      const [updated] = await db
        .update(notifications)
        .set({
          status: "processing",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(notifications.id, id),
            inArray(notifications.status, allowedCurrentStatuses),
          ),
        )
        .returning();

      if (updated && updated.id) {
        return updated as unknown as NotificationRecord;
      }

      // If update matched 0 rows, check actual state for explicit error
      const current = await this.getNotification(id);
      if (!current) {
        throw new Error(`Notification not found: ${id}`);
      }
      throw new NotificationStateError(
        `Invalid state transition: cannot change notification status from '${current.status}' to 'processing'`,
      );
    });
  }

  async markSent(id: string, metadataUpdates?: Record<string, unknown>): Promise<NotificationRecord> {
    return await withDb(this.hyperdrive, async (db) => {
      const current = await this.getNotification(id);
      if (!current) {
        throw new Error(`Notification not found: ${id}`);
      }

      if (current.status !== "processing") {
        throw new NotificationStateError(
          `Invalid state transition: cannot change notification status from '${current.status}' to 'sent'`,
        );
      }

      const mergedMetadata = {
        ...(current.metadata || {}),
        ...(metadataUpdates || {}),
      };

      const [updated] = await db
        .update(notifications)
        .set({
          status: "sent",
          sentAt: new Date(),
          metadata: mergedMetadata,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.status, "processing"),
          ),
        )
        .returning();

      if (updated && updated.id) {
        return updated as unknown as NotificationRecord;
      }

      throw new NotificationStateError(
        `Invalid state transition: notification '${id}' was modified concurrently`,
      );
    });
  }

  async markFailed(
    id: string,
    errorMessage: string,
    metadataUpdates?: Record<string, unknown>,
  ): Promise<NotificationRecord> {
    return await withDb(this.hyperdrive, async (db) => {
      const current = await this.getNotification(id);
      if (!current) {
        throw new Error(`Notification not found: ${id}`);
      }

      if (current.status !== "processing") {
        throw new NotificationStateError(
          `Invalid state transition: cannot change notification status from '${current.status}' to 'failed'`,
        );
      }

      const mergedMetadata = {
        ...(current.metadata || {}),
        ...(metadataUpdates || {}),
        lastError: errorMessage,
        failedAt: new Date().toISOString(),
      };

      const [updated] = await db
        .update(notifications)
        .set({
          status: "failed",
          metadata: mergedMetadata,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.status, "processing"),
          ),
        )
        .returning();

      if (updated && updated.id) {
        return updated as unknown as NotificationRecord;
      }

      throw new NotificationStateError(
        `Invalid state transition: notification '${id}' was modified concurrently`,
      );
    });
  }

  async cancelNotification(id: string): Promise<NotificationRecord> {
    const allowedCurrentStatuses: NotificationStatus[] = ["pending", "scheduled", "failed"];

    return await withDb(this.hyperdrive, async (db) => {
      const [updated] = await db
        .update(notifications)
        .set({
          status: "cancelled",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(notifications.id, id),
            inArray(notifications.status, allowedCurrentStatuses),
          ),
        )
        .returning();

      if (updated && updated.id) {
        return updated as unknown as NotificationRecord;
      }

      const current = await this.getNotification(id);
      if (!current) {
        throw new Error(`Notification not found: ${id}`);
      }
      throw new NotificationStateError(
        `Invalid state transition: cannot change notification status from '${current.status}' to 'cancelled'`,
      );
    });
  }
}

/**
 * Factory constructor helper for notification service.
 */
export function createNotificationService(hyperdrive: Hyperdrive): INotificationService {
  return new NotificationService(hyperdrive);
}
