import { redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/app.index";
import { getAppEnv } from "../context";
import { requireAuth, syncUserProfile } from "../auth";
import { withDb } from "../db/client";
import { shiftTypes } from "../db/schema/planning/shift-types";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);
  const { user } = await requireAuth(request, env);

  let isOnboarded = false;

  if (env.HYPERDRIVE) {
    const profile = await syncUserProfile(env.HYPERDRIVE, user);
    if (profile) {
      const userShiftTypes = await withDb(env.HYPERDRIVE, async (db) => {
        return db
          .select({ id: shiftTypes.id })
          .from(shiftTypes)
          .where(eq(shiftTypes.profileId, profile.id))
          .limit(1);
      });

      isOnboarded = Boolean(profile.displayName && userShiftTypes.length > 0);
    }
  }

  if (isOnboarded) {
    throw redirect("/app/planning");
  } else {
    throw redirect("/app/onboarding");
  }
}

export default function AppIndex() {
  return null;
}
