import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type AppDatabase = NodePgDatabase<typeof schema>;

export interface ScopedDatabase extends AppDatabase {
  /** The underlying request-scoped pg.Client instance */
  $client: pg.Client;
  /** Connects the pg.Client to PostgreSQL via Cloudflare Hyperdrive */
  connect: () => Promise<void>;
  /** Closes/releases the request-scoped pg.Client connection */
  close: () => Promise<void>;
  /** Async disposal support */
  [Symbol.asyncDispose]: () => Promise<void>;
}

export type HyperdriveInput =
  | Hyperdrive
  | { HYPERDRIVE: Hyperdrive };

/**
 * Validates that the input is a valid Cloudflare Hyperdrive binding.
 *
 * Strict Architectural Boundary:
 * - Worker runtime database access MUST go through Cloudflare Hyperdrive (env.HYPERDRIVE).
 * - Raw connection strings (`string`) and `{ connectionString: ... }` are strictly forbidden in Worker runtime.
 * - `DATABASE_URL` is strictly forbidden in Worker runtime and reserved for migrations/CLI tooling.
 */
export function resolveHyperdrive(input?: unknown): Hyperdrive {
  if (!input) {
    throw new Error(
      "Worker runtime database error: Cloudflare Hyperdrive binding is required. Pass env.HYPERDRIVE to createDbClient.",
    );
  }

  if (typeof input === "string") {
    throw new Error(
      "Worker runtime database error: createDbClient(connectionString) is not permitted. The Worker runtime must use Cloudflare Hyperdrive (env.HYPERDRIVE).",
    );
  }

  if (typeof input !== "object") {
    throw new Error(
      "Worker runtime database error: invalid input. Expected Cloudflare Hyperdrive binding.",
    );
  }

  const record = input as Record<string, unknown>;

  if ("DATABASE_URL" in record && record.DATABASE_URL) {
    throw new Error(
      "Worker runtime database error: DATABASE_URL is not permitted in the Worker runtime. DATABASE_URL is reserved for migration/developer/CI tooling and is not a Worker runtime fallback.",
    );
  }

  // Support passing the Worker environment object directly: createDbClient(env)
  if ("HYPERDRIVE" in record && record.HYPERDRIVE) {
    return resolveHyperdrive(record.HYPERDRIVE);
  }

  // Reject raw { connectionString: ... } objects that are not Hyperdrive bindings
  if (
    "connectionString" in record &&
    typeof record.connectionString === "string"
  ) {
    if (!("host" in record || "database" in record || "user" in record)) {
      throw new Error(
        "Worker runtime database error: createDbClient({ connectionString: ... }) is not permitted. The Worker runtime must receive the Cloudflare Hyperdrive binding (env.HYPERDRIVE).",
      );
    }
    return record as unknown as Hyperdrive;
  }

  throw new Error(
    "Worker runtime database error: invalid Hyperdrive binding. Expected env.HYPERDRIVE with connection properties.",
  );
}

/**
 * Creates a request-scoped database client using Cloudflare Hyperdrive.
 *
 * Architecture:
 * Worker request → Drizzle ORM → node-postgres Client (pg.Client) → Cloudflare Hyperdrive → PostgreSQL
 *
 * NOTE:
 * - Does NOT create an application-level pg.Pool.
 * - Does NOT create global or module-level connection pools.
 * - Cloudflare Hyperdrive itself manages the underlying connection pooling.
 * - Connects using env.HYPERDRIVE.connectionString.
 */
export function createDbClient(input: HyperdriveInput): ScopedDatabase {
  const hyperdrive = resolveHyperdrive(input);

  const client = new pg.Client({
    connectionString: hyperdrive.connectionString,
  });

  let connected = false;

  const db = drizzle(client, { schema }) as ScopedDatabase;
  db.$client = client;

  db.connect = async () => {
    if (!connected) {
      await client.connect();
      connected = true;
    }
  };

  db.close = async () => {
    if (connected) {
      await client.end().catch(() => {});
      connected = false;
    }
  };

  db[Symbol.asyncDispose] = async () => {
    await db.close();
  };

  return db;
}

/**
 * Creates and connects a request-scoped database client using Cloudflare Hyperdrive.
 *
 * Lifecycle:
 * 1. Creates the client using Hyperdrive's connectionString
 * 2. Connects to PostgreSQL via Hyperdrive
 * 3. Returns the connected Drizzle instance
 * Caller should release the connection via `await db.close()` when finished.
 */
export async function connectDb(input: HyperdriveInput): Promise<ScopedDatabase> {
  const db = createDbClient(input);
  await db.connect();
  return db;
}

/**
 * Executes a scoped database callback within a single Worker request lifecycle.
 *
 * Lifecycle:
 * 1. Creates the client using Hyperdrive's connectionString
 * 2. Connects to PostgreSQL via Hyperdrive
 * 3. Allows Drizzle to execute queries inside `fn`
 * 4. Releases/closes the client in a finally block to prevent hanging connections
 */
export async function withDb<T>(
  input: HyperdriveInput,
  fn: (db: ScopedDatabase) => Promise<T>,
): Promise<T> {
  const db = createDbClient(input);
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.close();
  }
}

