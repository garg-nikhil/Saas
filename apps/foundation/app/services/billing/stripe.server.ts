import Stripe from "stripe";
import type {
  BillingResult,
  CheckoutSessionResult,
  CreateCheckoutSessionInput,
  CreatePortalSessionInput,
  IBillingAdapter,
  PortalSessionResult,
} from "./types";

/**
 * Stripe Billing Adapter executing strictly on the server.
 *
 * Security & Reliability:
 * - Uses Stripe Fetch HTTP client for edge compatibility (Cloudflare Workers).
 * - STRIPE_SECRET_KEY is never exposed to client code or bundles.
 * - All provider exceptions are normalized to sanitized domain errors.
 * - No sensitive tokens, keys, or card details are logged.
 */
export class StripeBillingAdapter implements IBillingAdapter {
  private readonly client: Stripe | null = null;

  constructor(apiKey?: string, customClient?: Stripe) {
    if (customClient) {
      this.client = customClient;
    } else if (apiKey) {
      this.client = new Stripe(apiKey, {
        httpClient: Stripe.createFetchHttpClient(),
      });
    }
  }

  async createCheckoutSession(
    input: CreateCheckoutSessionInput,
    resolvedPriceId: string,
    customerId?: string,
  ): Promise<BillingResult<CheckoutSessionResult>> {
    if (!this.client) {
      return {
        data: null,
        error: {
          message: "Unable to start checkout: Billing service is not configured.",
          code: "UNCONFIGURED",
        },
      };
    }

    try {
      const session = await this.client.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price: resolvedPriceId,
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        customer: customerId || undefined,
        customer_email: customerId ? undefined : input.userEmail,
        client_reference_id: input.profileId,
        metadata: {
          profileId: input.profileId,
          planId: input.planId,
        },
        subscription_data: {
          metadata: {
            profileId: input.profileId,
            planId: input.planId,
          },
        },
      });

      if (!session.url) {
        return {
          data: null,
          error: {
            message: "Unable to start checkout session.",
            code: "NO_URL",
          },
        };
      }

      return {
        data: {
          sessionId: session.id,
          url: session.url,
        },
        error: null,
      };
    } catch (err) {
      console.error("Stripe checkout session error:", {
        type: err instanceof Error ? err.name : "UnknownError",
      });

      return {
        data: null,
        error: {
          message: "Unable to start checkout session.",
          code: "CHECKOUT_FAILED",
        },
      };
    }
  }

  async resolveCustomerId(email: string): Promise<string | null> {
    if (!this.client || !email) {
      return null;
    }

    try {
      const customers = await this.client.customers.list({
        email,
        limit: 1,
      });

      if (customers.data.length > 0) {
        return customers.data[0].id;
      }

      return null;
    } catch (err) {
      console.error("Stripe customer lookup error:", {
        type: err instanceof Error ? err.name : "UnknownError",
      });
      return null;
    }
  }

  async createCustomerPortalSession(
    input: CreatePortalSessionInput,
    customerId: string,
  ): Promise<BillingResult<PortalSessionResult>> {
    if (!this.client) {
      return {
        data: null,
        error: {
          message: "Unable to access billing portal: Billing service is not configured.",
          code: "UNCONFIGURED",
        },
      };
    }

    try {
      const portalSession = await this.client.billingPortal.sessions.create({
        customer: customerId,
        return_url: input.returnUrl,
      });

      return {
        data: {
          url: portalSession.url,
        },
        error: null,
      };
    } catch (err) {
      console.error("Stripe billing portal session error:", {
        type: err instanceof Error ? err.name : "UnknownError",
      });

      return {
        data: null,
        error: {
          message: "Unable to open customer billing portal.",
          code: "PORTAL_FAILED",
        },
      };
    }
  }

  async cancelSubscription(
    providerSubscriptionId: string,
  ): Promise<BillingResult<{ cancelAtPeriodEnd: boolean }>> {
    if (!this.client) {
      return {
        data: null,
        error: {
          message: "Unable to cancel subscription: Billing service is not configured.",
          code: "UNCONFIGURED",
        },
      };
    }

    try {
      await this.client.subscriptions.update(providerSubscriptionId, {
        cancel_at_period_end: true,
      });

      return {
        data: { cancelAtPeriodEnd: true },
        error: null,
      };
    } catch (err) {
      console.error("Stripe subscription cancellation error:", {
        type: err instanceof Error ? err.name : "UnknownError",
      });

      return {
        data: null,
        error: {
          message: "Unable to cancel subscription.",
          code: "CANCEL_FAILED",
        },
      };
    }
  }

  async resumeSubscription(
    providerSubscriptionId: string,
  ): Promise<BillingResult<{ cancelAtPeriodEnd: boolean }>> {
    if (!this.client) {
      return {
        data: null,
        error: {
          message: "Unable to resume subscription: Billing service is not configured.",
          code: "UNCONFIGURED",
        },
      };
    }

    try {
      await this.client.subscriptions.update(providerSubscriptionId, {
        cancel_at_period_end: false,
      });

      return {
        data: { cancelAtPeriodEnd: false },
        error: null,
      };
    } catch (err) {
      console.error("Stripe subscription resume error:", {
        type: err instanceof Error ? err.name : "UnknownError",
      });

      return {
        data: null,
        error: {
          message: "Unable to resume subscription.",
          code: "RESUME_FAILED",
        },
      };
    }
  }

  async constructWebhookEvent(
    rawPayload: string,
    signature: string,
    webhookSecret: string,
  ): Promise<{ event: unknown; error: unknown }> {
    if (!this.client) {
      return {
        event: null,
        error: new Error("Stripe client is not initialized."),
      };
    }

    try {
      const event = await this.client.webhooks.constructEventAsync(
        rawPayload,
        signature,
        webhookSecret,
      );
      return { event, error: null };
    } catch (err) {
      return { event: null, error: err };
    }
  }
}
