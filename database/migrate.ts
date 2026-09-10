import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Programmatic migration runner.
 * Connects directly to the PostgreSQL database (e.g. Supabase direct connection or local Postgres)
 * to apply SQL migrations from the database/migrations directory.
 *
 * NOTE: Migrations run in CI/CD, deployment pipelines, or local developer machines.
 * They NEVER execute inside the Cloudflare Worker runtime.
 */
export async function runMigrations(connectionString?: string): Promise<void> {
  const url = connectionString || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL environment variable is required to run migrations.",
    );
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    const db = drizzle(client);
    const migrationsFolder = path.resolve(__dirname, "migrations");
    console.log(`Applying migrations from: ${migrationsFolder}`);
    await migrate(db, { migrationsFolder });
    console.log("Migrations applied successfully.");
  } finally {
    await client.end();
  }
}

// Auto-run if executed directly as a script
if (process.argv[1] === __filename) {
  runMigrations()
    .then(() => {
      console.log("Migration task complete.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration execution error:", err);
      process.exit(1);
    });
}
