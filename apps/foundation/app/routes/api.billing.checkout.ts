import { eq } from "drizzle-orm";
import type { Route } from "./+types/api.billing.checkout";
import { requireAuth, syncUserProfile } from "../auth";
import { getAppEnv } from "../context";
import { withDb } from "../db/client";
import { profiles, type Profile } from "../db/schema/profiles";
import { createBillingService } from "../services/billing";

/**
 * Initiates a Stripe Checkout session for the authenticated user.
 *
 * Security:
 * - Requires verified server-side authentication (derive identity from session).
 * - Accepts only internal `planId` (e.g. 'pro_monthly'). Rejects arbitrary Stripe Price IDs.
 * - Customer identity and profile association are derived exclusively on the server.
 */
export async function action({ request, context }: Route.ActionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: { Allow: "POST" } },
    );
  }

  const env = getAppEnv(context);
  const customAuth = (context as Record<string, unknown> | undefined)?.authService as any;
  const { user, headers } = await requireAuth(request, env, { customAdapter: customAuth });

  if (!env.HYPERDRIVE) {
    return Response.json(
      { error: "Database service unavailable." },
      { status: 503, headers },
    );
  }

  // Derive profile from verified user
  let profile: Profile | null = await withDb(env.HYPERDRIVE, async (db) => {
    const rows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);
    return rows[0] ?? null;
  });

  if (!profile) {
    profile = await syncUserProfile(env.HYPERDRIVE, user);
  }

  if (!profile) {
    return Response.json(
      { error: "Profile synchronization required before checkout." },
      { status: 400, headers },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "Invalid JSON request payload." },
      { status: 400, headers },
    );
  }

  const planId = body.planId;
  if (!planId || typeof planId !== "string") {
    return Response.json(
      { error: "A valid planId is required." },
      { status: 400, headers },
    );
  }

  const url = new URL(request.url);
  const successUrl = `${url.origin}/app?checkout=success`;
  const cancelUrl = `${url.origin}/app?checkout=cancelled`;

  const billingService =
    ((context as Record<string, unknown> | undefined)?.billingService as any) ||
    createBillingService(env.HYPERDRIVE, env);
  const result = await billingService.createCheckoutSession({
    profileId: profile.id,
    userEmail: user.email || "",
    planId,
    successUrl,
    cancelUrl,
  });

  if (result.error || !result.data) {
    return Response.json(
      { error: result.error?.message || "Checkout session initialization failed." },
      { status: 400, headers },
    );
  }

  return Response.json(
    {
      url: result.data.url,
      sessionId: result.data.sessionId,
    },
    { status: 200, headers },
  );
}
