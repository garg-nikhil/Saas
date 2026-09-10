import type { Subscription } from "../../db/schema/subscriptions";

export type BillingSubscription = Subscription;

export interface BillingPlan {
  id: string;
  name: string;
  description?: string;
  stripePriceId?: string;
  features: string[];
}

export interface CreateCheckoutSessionInput {
  profileId: string;
  userEmail: string;
  planId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

export interface CreatePortalSessionInput {
  profileId: string;
  userEmail: string;
  returnUrl: string;
}

export interface PortalSessionResult {
  url: string;
}

export interface BillingError {
  message: string;
  code?: string;
}

export interface BillingResult<T> {
  data: T | null;
  error: BillingError | null;
}

export interface StripeWebhookEventResult {
  received: boolean;
  duplicate?: boolean;
  eventType?: string;
  error?: string;
}

/**
 * Provider-agnostic adapter boundary for external billing integrations (Stripe, etc.).
 * Application business logic should never interact with provider SDKs directly.
 */
export interface IBillingAdapter {
  createCheckoutSession(
    input: CreateCheckoutSessionInput,
    resolvedPriceId: string,
    customerId?: string,
  ): Promise<BillingResult<CheckoutSessionResult>>;

  createCustomerPortalSession(
    input: CreatePortalSessionInput,
    customerId: string,
  ): Promise<BillingResult<PortalSessionResult>>;

  resolveCustomerId(email: string): Promise<string | null>;

  cancelSubscription(
    providerSubscriptionId: string,
  ): Promise<BillingResult<{ cancelAtPeriodEnd: boolean }>>;

  resumeSubscription(
    providerSubscriptionId: string,
  ): Promise<BillingResult<{ cancelAtPeriodEnd: boolean }>>;

  constructWebhookEvent(
    rawPayload: string,
    signature: string,
    webhookSecret: string,
  ): Promise<{ event: unknown; error: unknown }>;
}

/**
 * Internal BillingService interface consumed by application routers and loaders.
 */
export interface IBillingService {
  createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<BillingResult<CheckoutSessionResult>>;

  createCustomerPortalSession(
    input: CreatePortalSessionInput,
  ): Promise<BillingResult<PortalSessionResult>>;

  getSubscription(
    profileId: string,
  ): Promise<BillingResult<BillingSubscription | null>>;

  cancelSubscription(
    profileId: string,
  ): Promise<BillingResult<BillingSubscription>>;

  resumeSubscription(
    profileId: string,
  ): Promise<BillingResult<BillingSubscription>>;

  handleWebhookEvent(
    rawPayload: string,
    signature: string,
  ): Promise<StripeWebhookEventResult>;
}
