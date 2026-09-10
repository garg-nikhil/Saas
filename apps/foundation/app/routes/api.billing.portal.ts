import { eq } from "drizzle-orm";
import type { Route } from "./+types/api.billing.portal";
import { requireAuth, syncUserProfile } from "../auth";
import { getAppEnv } from "../context";
import { withDb } from "../db/client";
import { profiles, type Profile } from "../db/schema/profiles";
import { createBillingService } from "../services/billing";

/**
 * Creates a Stripe Customer Portal session for managing subscriptions.
 *
 * Security:
 * - Derives customer identity exclusively from authenticated user profile.
 * - Requires verified server-side authentication.
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
      { error: "Profile not found." },
      { status: 404, headers },
    );
  }

  const url = new URL(request.url);
  const returnUrl = `${url.origin}/app`;

  const billingService =
    ((context as Record<string, unknown> | undefined)?.billingService as any) ||
    createBillingService(env.HYPERDRIVE, env);
  const result = await billingService.createCustomerPortalSession({
    profileId: profile.id,
    userEmail: user.email || "",
    returnUrl,
  });

  if (result.error || !result.data) {
    return Response.json(
      { error: result.error?.message || "Customer portal session initialization failed." },
      { status: 400, headers },
    );
  }

  return Response.json(
    { url: result.data.url },
    { status: 200, headers },
  );
}
