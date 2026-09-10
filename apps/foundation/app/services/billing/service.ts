import { and, desc, eq } from "drizzle-orm";
import type { Env } from "../../context";
import { withDb } from "../../db/client";
import { auditLogs } from "../../db/schema/audit-logs";
import { subscriptions } from "../../db/schema/subscriptions";
import { createEntitlementService, type IEntitlementService } from "../entitlements";
import { resolvePlan } from "./plans";
import { StripeBillingAdapter } from "./stripe.server";
import type {
  BillingResult,
  BillingSubscription,
  CheckoutSessionResult,
  CreateCheckoutSessionInput,
  CreatePortalSessionInput,
  IBillingAdapter,
  IBillingService,
  PortalSessionResult,
  StripeWebhookEventResult,
} from "./types";

/**
 * High-level internal BillingService coordinating subscription state,
 * provider adapter calls (Stripe), idempotency tracking, and entitlement updates.
 */
export class BillingService implements IBillingService {
  constructor(
    private readonly hyperdrive: Hyperdrive,
    private readonly env: Env,
    private readonly adapter: IBillingAdapter,
    private readonly entitlementService: IEntitlementService,
  ) {}

  async createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<BillingResult<CheckoutSessionResult>> {
    const plan = resolvePlan(input.planId);

    if (!plan || !plan.stripePriceId || plan.id === "free") {
      return {
        data: null,
        error: {
          message: "Invalid or non-billable plan requested.",
          code: "INVALID_PLAN",
        },
      };
    }

    // Resolve customer ID if one already exists in Stripe
    const customerId = await this.adapter.resolveCustomerId(input.userEmail);

    return await this.adapter.createCheckoutSession(
      input,
      plan.stripePriceId,
      customerId || undefined,
    );
  }

  async createCustomerPortalSession(
    input: CreatePortalSessionInput,
  ): Promise<BillingResult<PortalSessionResult>> {
    const customerId = await this.adapter.resolveCustomerId(input.userEmail);

    if (!customerId) {
      return {
        data: null,
        error: {
          message: "No active billing customer found for this account.",
          code: "CUSTOMER_NOT_FOUND",
        },
      };
    }

    return await this.adapter.createCustomerPortalSession(input, customerId);
  }

  async getSubscription(
    profileId: string,
  ): Promise<BillingResult<BillingSubscription | null>> {
    if (!profileId) {
      return { data: null, error: null };
    }

    try {
      const sub = await withDb(this.hyperdrive, async (db) => {
        const records = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.profileId, profileId))
          .orderBy(desc(subscriptions.createdAt))
          .limit(1);

        return records[0] ?? null;
      });

      return { data: sub, error: null };
    } catch (err) {
      console.error("Failed to retrieve subscription:", err);
      return {
        data: null,
        error: {
          message: "Unable to load subscription record.",
          code: "DB_ERROR",
        },
      };
    }
  }

  async cancelSubscription(
    profileId: string,
  ): Promise<BillingResult<BillingSubscription>> {
    const currentSub = await this.getSubscription(profileId);

    if (!currentSub.data || !currentSub.data.providerSubscriptionId) {
      return {
        data: null,
        error: {
          message: "No active subscription available to cancel.",
          code: "NOT_FOUND",
        },
      };
    }

    const adapterRes = await this.adapter.cancelSubscription(
      currentSub.data.providerSubscriptionId,
    );

    if (adapterRes.error) {
      return {
        data: null,
        error: adapterRes.error,
      };
    }

    const updated = await withDb(this.hyperdrive, async (db) => {
      const rows = await db
        .update(subscriptions)
        .set({
          cancelAtPeriodEnd: true,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, currentSub.data!.id))
        .returning();

      return rows[0];
    });

    return {
      data: updated,
      error: null,
    };
  }

  async resumeSubscription(
    profileId: string,
  ): Promise<BillingResult<BillingSubscription>> {
    const currentSub = await this.getSubscription(profileId);

    if (!currentSub.data || !currentSub.data.providerSubscriptionId) {
      return {
        data: null,
        error: {
          message: "No subscription available to resume.",
          code: "NOT_FOUND",
        },
      };
    }

    const adapterRes = await this.adapter.resumeSubscription(
      currentSub.data.providerSubscriptionId,
    );

    if (adapterRes.error) {
      return {
        data: null,
        error: adapterRes.error,
      };
    }

    const updated = await withDb(this.hyperdrive, async (db) => {
      const rows = await db
        .update(subscriptions)
        .set({
          cancelAtPeriodEnd: false,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, currentSub.data!.id))
        .returning();

      return rows[0];
    });

    return {
      data: updated,
      error: null,
    };
  }

  async handleWebhookEvent(
    rawPayload: string,
    signature: string,
  ): Promise<StripeWebhookEventResult> {
    const webhookSecret =
      this.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return {
        received: false,
        error: "Billing webhook signing secret is not configured.",
      };
    }

    const { event, error } = await this.adapter.constructWebhookEvent(
      rawPayload,
      signature,
      webhookSecret,
    );

    if (error || !event || typeof event !== "object") {
      return {
        received: false,
        error: "Invalid webhook signature or malformed payload.",
      };
    }

    const stripeEvent = event as {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    };

    // Idempotency check using existing audit_logs table
    const isProcessed = await withDb(this.hyperdrive, async (db) => {
      const existing = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityType, "stripe_event"),
            eq(auditLogs.entityId, stripeEvent.id),
          ),
        )
        .limit(1);

      return existing.length > 0;
    });

    if (isProcessed) {
      return {
        received: true,
        duplicate: true,
        eventType: stripeEvent.type,
      };
    }

    // Process event based on type
    try {
      if (stripeEvent.type === "checkout.session.completed") {
        const session = stripeEvent.data.object as {
          client_reference_id?: string;
          subscription?: string;
          metadata?: { profileId?: string; planId?: string };
        };

        const profileId =
          session.client_reference_id || session.metadata?.profileId;
        const planId = session.metadata?.planId || "pro_monthly";
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : null;

        if (profileId) {
          const now = new Date();
          await withDb(this.hyperdrive, async (db) => {
            await db.insert(subscriptions).values({
              profileId,
              provider: "stripe",
              providerSubscriptionId: subscriptionId,
              status: "active",
              planId,
              cancelAtPeriodEnd: false,
              createdAt: now,
              updatedAt: now,
            });
          });

          // Sync entitlements
          const planConfig = resolvePlan(planId);
          if (planConfig) {
            await this.entitlementService.setPlanEntitlements(
              profileId,
              planConfig.features,
            );
          }
        }
      } else if (stripeEvent.type === "customer.subscription.updated") {
        const sub = stripeEvent.data.object as {
          id: string;
          status: string;
          cancel_at_period_end: boolean;
          current_period_start?: number;
          current_period_end?: number;
          metadata?: { profileId?: string; planId?: string };
        };

        const updatedRows = await withDb(this.hyperdrive, async (db) => {
          return await db
            .update(subscriptions)
            .set({
              status: sub.status,
              cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
              currentPeriodStart: sub.current_period_start
                ? new Date(sub.current_period_start * 1000)
                : undefined,
              currentPeriodEnd: sub.current_period_end
                ? new Date(sub.current_period_end * 1000)
                : undefined,
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.providerSubscriptionId, sub.id))
            .returning();
        });

        if (updatedRows.length > 0) {
          const profileId = updatedRows[0].profileId;
          const planId = updatedRows[0].planId;
          const isActive = sub.status === "active" || sub.status === "trialing";

          if (isActive) {
            const planConfig = resolvePlan(planId);
            if (planConfig) {
              await this.entitlementService.setPlanEntitlements(
                profileId,
                planConfig.features,
              );
            }
          } else if (sub.status === "canceled" || sub.status === "unpaid") {
            await this.entitlementService.setPlanEntitlements(profileId, [
              "basic_access",
            ]);
          }
        }
      } else if (stripeEvent.type === "customer.subscription.deleted") {
        const sub = stripeEvent.data.object as { id: string };

        const updatedRows = await withDb(this.hyperdrive, async (db) => {
          return await db
            .update(subscriptions)
            .set({
              status: "canceled",
              cancelAtPeriodEnd: false,
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.providerSubscriptionId, sub.id))
            .returning();
        });

        if (updatedRows.length > 0) {
          const profileId = updatedRows[0].profileId;
          await this.entitlementService.setPlanEntitlements(profileId, [
            "basic_access",
          ]);
        }
      }

      // Record idempotent completion in audit_logs
      await withDb(this.hyperdrive, async (db) => {
        await db.insert(auditLogs).values({
          action: "stripe_event_processed",
          entityType: "stripe_event",
          entityId: stripeEvent.id,
          metadata: {
            eventType: stripeEvent.type,
          },
          createdAt: new Date(),
        });
      });

      return {
        received: true,
        duplicate: false,
        eventType: stripeEvent.type,
      };
    } catch (processError) {
      console.error("Stripe webhook processing error:", processError);
      return {
        received: false,
        error: "Internal processing error during webhook execution.",
      };
    }
  }
}

/**
 * Creates the internal BillingService boundary instance.
 */
export function createBillingService(
  hyperdrive: Hyperdrive,
  env: Env,
  customAdapter?: IBillingAdapter,
  customEntitlementService?: IEntitlementService,
): IBillingService {
  const apiKey = env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  const adapter = customAdapter || new StripeBillingAdapter(apiKey);
  const entitlementService =
    customEntitlementService || createEntitlementService(hyperdrive);

  return new BillingService(hyperdrive, env, adapter, entitlementService);
}
