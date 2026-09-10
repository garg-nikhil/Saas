import { eq } from "drizzle-orm";
import type { AppDatabase } from "../../client";
import { shiftTypes, DEFAULT_SHIFT_TYPES } from "./shift-types";

/**
 * Idempotently seeds default shift types (Matin, Après-midi, Nuit, 12h, Journée, Repos, Congé)
 * for a user profile.
 */
export async function seedDefaultShiftTypes(db: AppDatabase, profileId: string) {
  const existing = await db
    .select({ name: shiftTypes.name })
    .from(shiftTypes)
    .where(eq(shiftTypes.profileId, profileId));

  const existingNames = new Set(existing.map((s) => s.name));
  const missing = DEFAULT_SHIFT_TYPES.filter((st) => !existingNames.has(st.name));

  if (missing.length > 0) {
    await db.insert(shiftTypes).values(
      missing.map((st) => ({
        ...st,
        profileId,
      })),
    );
  }
}
