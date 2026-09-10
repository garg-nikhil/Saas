import type { Route } from "./+types/api.webhooks.stripe";
import { getAppEnv } from "../context";
import { createBillingService } from "../services/billing";

/**
 * Public webhook endpoint for processing incoming Stripe asynchronous lifecycle events.
 *
 * Security & Idempotency:
 * - Publicly reachable without cookie authentication.
 * - Enforces Stripe signature verification using STRIPE_WEBHOOK_SECRET.
 * - Deduplicates events idempotently using the audit_logs table.
 * - Emits sanitized status responses without leaking sensitive metadata.
 */
export async function action({ request, context }: Route.ActionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: { Allow: "POST" } },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json(
      { error: "Missing stripe-signature header." },
      { status: 400 },
    );
  }

  const rawPayload = await request.text();
  const env = getAppEnv(context);

  if (!env.HYPERDRIVE) {
    return Response.json(
      { error: "Service unavailable: Database binding missing." },
      { status: 503 },
    );
  }

  const billingService = createBillingService(env.HYPERDRIVE, env);
  const result = await billingService.handleWebhookEvent(rawPayload, signature);

  if (!result.received) {
    return Response.json(
      { error: result.error || "Webhook signature verification failed." },
      { status: 400 },
    );
  }

  return Response.json(
    {
      received: true,
      duplicate: Boolean(result.duplicate),
      eventType: result.eventType,
    },
    { status: 200 },
  );
}
