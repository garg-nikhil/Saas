import type { BillingPlan } from "./types";

/**
 * Server-authoritative catalog of subscription plans and their entitled capabilities.
 *
 * Security Boundary:
 * - Clients may only specify `planId` (e.g., 'pro_monthly', 'pro_yearly').
 * - Stripe Price IDs are NEVER accepted directly from the client.
 * - Unknown or malformed plan IDs are rejected before any payment interaction.
 */
export const FACTORY_PLANS: Record<string, BillingPlan> = {
  free: {
    id: "free",
    name: "Gratuit",
    description: "Accès standard aux fonctionnalités de base",
    features: ["basic_access"],
  },
  pro_monthly: {
    id: "pro_monthly",
    name: "Pro Mensuel",
    description: "Accès complet avec fonctionnalités avancées et export",
    stripePriceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || "price_pro_monthly_placeholder",
    features: ["basic_access", "advanced_planning", "export_pdf", "priority_support"],
  },
  pro_yearly: {
    id: "pro_yearly",
    name: "Pro Annuel",
    description: "Accès complet annuel avec 2 mois offerts",
    stripePriceId: process.env.STRIPE_PRO_YEARLY_PRICE_ID || "price_pro_yearly_placeholder",
    features: ["basic_access", "advanced_planning", "export_pdf", "priority_support"],
  },
};

/**
 * Validates and resolves a plan configuration on the server.
 */
export function resolvePlan(planId: string): BillingPlan | null {
  if (!planId || typeof planId !== "string") {
    return null;
  }
  return FACTORY_PLANS[planId] ?? null;
}

/**
 * Returns all publicly available subscription plans (without sensitive keys).
 */
export function listPublicPlans(): Array<Omit<BillingPlan, "stripePriceId">> {
  return Object.values(FACTORY_PLANS).map(({ id, name, description, features }) => ({
    id,
    name,
    description,
    features,
  }));
}
