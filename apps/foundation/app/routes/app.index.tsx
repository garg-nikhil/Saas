import { redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/app.index";
import { getAppEnv } from "../context";
import { requireAuth, syncUserProfile } from "../auth";
import { withDb } from "../db/client";
import { shiftTypes } from "../db/schema/planning/shift-types";
import { nurseProfiles } from "../db/schema/planning/nurse-profiles";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getAppEnv(context);
  const { user } = await requireAuth(request, env);

  let isOnboarded = false;

  if (env.HYPERDRIVE) {
    const profile = await syncUserProfile(env.HYPERDRIVE, user);
    if (profile) {
      const { userShiftTypes, nurseProfile } = await withDb(env.HYPERDRIVE, async (db) => {
        const types = await db
          .select({ id: shiftTypes.id })
          .from(shiftTypes)
          .where(eq(shiftTypes.profileId, profile.id))
          .limit(1);

        const np = await db
          .select({ profession: nurseProfiles.profession })
          .from(nurseProfiles)
          .where(eq(nurseProfiles.profileId, profile.id))
          .limit(1);

        return {
          userShiftTypes: types,
          nurseProfile: np[0] ?? null,
        };
      });

      isOnboarded = Boolean(
        profile.displayName &&
          profile.displayName.trim().length >= 2 &&
          nurseProfile?.profession &&
          userShiftTypes.length > 0,
      );
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
