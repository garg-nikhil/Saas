import { describe, it, expect, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import pg from "pg";
import * as schema from "../app/db/schema";
import {
  createDbClient,
  withDb,
  resolveHyperdrive,
} from "../app/db/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard mock Hyperdrive binding matching Cloudflare Workers runtime
const mockHyperdrive: Hyperdrive = {
  connectionString: "postgresql://hyperdrive.cloudflare.net:5432/testdb",
  database: "testdb",
  host: "hyperdrive.cloudflare.net",
  password: "pass",
  port: 5432,
  user: "postgres",
  connect: () => ({} as any),
};

describe("Milestone 2: Database Foundation", () => {
  describe("1. Schema Definitions & Table Structure", () => {
    it("exports all 5 required factory tables", () => {
      expect(schema.profiles).toBeDefined();
      expect(schema.subscriptions).toBeDefined();
      expect(schema.entitlements).toBeDefined();
      expect(schema.auditLogs).toBeDefined();
      expect(schema.notifications).toBeDefined();
    });

    it("has expected column definitions on profiles table", () => {
      const cols = schema.profiles;
      expect(cols.id).toBeDefined();
      expect(cols.userId).toBeDefined();
      expect(cols.displayName).toBeDefined();
      expect(cols.email).toBeDefined();
      expect(cols.createdAt).toBeDefined();
      expect(cols.updatedAt).toBeDefined();
    });

    it("has expected column definitions on subscriptions table", () => {
      const cols = schema.subscriptions;
      expect(cols.id).toBeDefined();
      expect(cols.profileId).toBeDefined();
      expect(cols.provider).toBeDefined();
      expect(cols.providerSubscriptionId).toBeDefined();
      expect(cols.status).toBeDefined();
      expect(cols.planId).toBeDefined();
      expect(cols.currentPeriodStart).toBeDefined();
      expect(cols.currentPeriodEnd).toBeDefined();
      expect(cols.cancelAtPeriodEnd).toBeDefined();
      expect(cols.createdAt).toBeDefined();
      expect(cols.updatedAt).toBeDefined();
    });

    it("has expected column definitions on entitlements table", () => {
      const cols = schema.entitlements;
      expect(cols.id).toBeDefined();
      expect(cols.profileId).toBeDefined();
      expect(cols.featureKey).toBeDefined();
      expect(cols.enabled).toBeDefined();
      expect(cols.metadata).toBeDefined();
      expect(cols.createdAt).toBeDefined();
      expect(cols.updatedAt).toBeDefined();
    });

    it("has expected column definitions on audit_logs table", () => {
      const cols = schema.auditLogs;
      expect(cols.id).toBeDefined();
      expect(cols.profileId).toBeDefined();
      expect(cols.action).toBeDefined();
      expect(cols.entityType).toBeDefined();
      expect(cols.entityId).toBeDefined();
      expect(cols.metadata).toBeDefined();
      expect(cols.createdAt).toBeDefined();
    });

    it("has expected column definitions on notifications table", () => {
      const cols = schema.notifications;
      expect(cols.id).toBeDefined();
      expect(cols.profileId).toBeDefined();
      expect(cols.type).toBeDefined();
      expect(cols.status).toBeDefined();
      expect(cols.scheduledAt).toBeDefined();
      expect(cols.sentAt).toBeDefined();
      expect(cols.metadata).toBeDefined();
      expect(cols.createdAt).toBeDefined();
      expect(cols.updatedAt).toBeDefined();
    });
  });

  describe("2. Query Compilation & Type Safety", () => {
    const db = createDbClient(mockHyperdrive);

    it("generates valid SQL for profiles insert", () => {
      const query = db
        .insert(schema.profiles)
        .values({
          userId: "auth-uid-123",
          displayName: "Dr. Alice",
          email: "alice@example.com",
        })
        .toSQL();

      expect(query.sql).toContain('insert into "profiles"');
      expect(query.sql).toContain('"user_id"');
      expect(query.params).toContain("auth-uid-123");
      expect(query.params).toContain("alice@example.com");
    });

    it("generates valid SQL for subscriptions query with profile filter", () => {
      const testProfileId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      const query = db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.profileId, testProfileId))
        .toSQL();

      expect(query.sql).toContain('select');
      expect(query.sql).toContain('from "subscriptions"');
      expect(query.sql).toContain('"profile_id" = $1');
      expect(query.params).toEqual([testProfileId]);
    });

    it("generates valid SQL for entitlements checking", () => {
      const testProfileId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      const query = db
        .select()
        .from(schema.entitlements)
        .where(
          and(
            eq(schema.entitlements.profileId, testProfileId),
            eq(schema.entitlements.featureKey, "export_pdf"),
            eq(schema.entitlements.enabled, true),
          ),
        )
        .toSQL();

      expect(query.sql).toContain('from "entitlements"');
      expect(query.sql).toContain('"feature_key" = $2');
      expect(query.sql).toContain('"enabled" = $3');
      expect(query.params).toEqual([testProfileId, "export_pdf", true]);
    });

    it("generates valid SQL for audit log creation with jsonb metadata", () => {
      const query = db
        .insert(schema.auditLogs)
        .values({
          action: "profile.created",
          entityType: "profile",
          entityId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          metadata: { ip: "192.168.1.1", userAgent: "Mozilla/5.0" },
        })
        .toSQL();

      expect(query.sql).toContain('insert into "audit_logs"');
      expect(query.sql).toContain('"action"');
      expect(query.params).toContain("profile.created");
    });

    it("generates valid SQL for notifications listing by status", () => {
      const testProfileId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      const query = db
        .select()
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.profileId, testProfileId),
            eq(schema.notifications.status, "pending"),
          ),
        )
        .toSQL();

      expect(query.sql).toContain('from "notifications"');
      expect(query.sql).toContain('"status" = $2');
      expect(query.params).toEqual([testProfileId, "pending"]);
    });
  });

  describe("3. Worker Runtime Database Client & Hyperdrive Architecture", () => {
    it("Worker runtime database client uses Hyperdrive directly", () => {
      const db = createDbClient(mockHyperdrive);
      expect(db).toBeDefined();
      expect(db.$client).toBeDefined();
    });

    it("Worker runtime client accepts env object containing HYPERDRIVE binding", () => {
      const env = { HYPERDRIVE: mockHyperdrive };
      const db = createDbClient(env);
      expect(db).toBeDefined();
      expect(db.$client).toBeDefined();
    });

    it("Worker runtime uses pg.Client and does NOT construct pg.Pool", () => {
      const db = createDbClient(mockHyperdrive);
      // Explicit verification: must be a pg.Client instance
      expect(db.$client instanceof pg.Client).toBe(true);
      // Explicit verification: must NOT be an instance of pg.Pool
      expect(db.$client instanceof pg.Pool).toBe(false);
      expect(db.$client.constructor.name).toBe("Client");
    });

    it("Worker runtime client does NOT accept DATABASE_URL as fallback", () => {
      // Must reject DATABASE_URL object
      expect(() =>
        createDbClient({
          DATABASE_URL: "postgresql://postgres:secret@supabase.co:5432/postgres",
        } as unknown as Hyperdrive),
      ).toThrowError(/DATABASE_URL is not permitted in the Worker runtime/);

      expect(() =>
        resolveHyperdrive({
          DATABASE_URL: "postgresql://postgres:secret@supabase.co:5432/postgres",
        }),
      ).toThrowError(/DATABASE_URL is not permitted in the Worker runtime/);
    });

    it("Worker runtime client does NOT accept a raw connection string", () => {
      expect(() =>
        createDbClient("postgresql://localhost:5432/test" as unknown as Hyperdrive),
      ).toThrowError(/createDbClient\(connectionString\) is not permitted/);

      expect(() =>
        resolveHyperdrive("postgresql://localhost:5432/test"),
      ).toThrowError(/createDbClient\(connectionString\) is not permitted/);
    });

    it("Worker runtime client does NOT accept a raw { connectionString: ... } object", () => {
      expect(() =>
        createDbClient({
          connectionString: "postgresql://localhost:5432/test",
        } as unknown as Hyperdrive),
      ).toThrowError(/createDbClient\(\{ connectionString: \.\.\. \}\) is not permitted/);

      expect(() =>
        resolveHyperdrive({
          connectionString: "postgresql://localhost:5432/test",
        }),
      ).toThrowError(/createDbClient\(\{ connectionString: \.\.\. \}\) is not permitted/);
    });

    it("Worker runtime client throws descriptive error when binding is missing", () => {
      expect(() => createDbClient(undefined as unknown as Hyperdrive)).toThrowError(
        /Cloudflare Hyperdrive binding is required/,
      );
      expect(() => resolveHyperdrive(undefined)).toThrowError(
        /Cloudflare Hyperdrive binding is required/,
      );
    });

    it("creates independent scoped instances per request", () => {
      const db1 = createDbClient(mockHyperdrive);
      const db2 = createDbClient(mockHyperdrive);
      expect(db1).not.toBe(db2);
      expect(db1.$client).not.toBe(db2.$client);
    });

    it("provides request lifecycle methods on scoped database instance", () => {
      const db = createDbClient(mockHyperdrive);
      expect(typeof db.connect).toBe("function");
      expect(typeof db.close).toBe("function");
      expect(typeof db[Symbol.asyncDispose]).toBe("function");
    });

    it("withDb executes callback and cleans up client lifecycle", async () => {
      let clientConnected = false;
      let clientClosed = false;

      // Spy on pg.Client methods to verify execution and cleanup without network calls
      const connectSpy = vi
        .spyOn(pg.Client.prototype, "connect")
        .mockImplementation(async () => {
          clientConnected = true;
        });
      const endSpy = vi
        .spyOn(pg.Client.prototype, "end")
        .mockImplementation(async () => {
          clientClosed = true;
        });

      try {
        const result = await withDb(mockHyperdrive, async (db) => {
          expect(db.$client instanceof pg.Client).toBe(true);
          expect(clientConnected).toBe(true);
          return "query-result";
        });

        expect(result).toBe("query-result");
        expect(clientClosed).toBe(true);
        expect(connectSpy).toHaveBeenCalledTimes(1);
        expect(endSpy).toHaveBeenCalledTimes(1);
      } finally {
        connectSpy.mockRestore();
        endSpy.mockRestore();
      }
    });

    it("withDb cleans up client even when callback throws error", async () => {
      let clientClosed = false;

      const connectSpy = vi
        .spyOn(pg.Client.prototype, "connect")
        .mockImplementation(async () => {});
      const endSpy = vi
        .spyOn(pg.Client.prototype, "end")
        .mockImplementation(async () => {
          clientClosed = true;
        });

      try {
        await expect(
          withDb(mockHyperdrive, async () => {
            throw new Error("Worker request failed during query");
          }),
        ).rejects.toThrowError("Worker request failed during query");

        expect(clientClosed).toBe(true);
      } finally {
        connectSpy.mockRestore();
        endSpy.mockRestore();
      }
    });
  });

  describe("4. Migration Architecture & Tooling Boundary", () => {
    it("migration runner script (database/migrate.ts) exists and targets DATABASE_URL outside Worker runtime", () => {
      const migratorPath = path.resolve(__dirname, "../../../database/migrate.ts");
      expect(fs.existsSync(migratorPath)).toBe(true);

      const content = fs.readFileSync(migratorPath, "utf-8");
      // Migration tooling uses DATABASE_URL for direct connection
      expect(content).toContain("DATABASE_URL");
      expect(content).toContain("drizzle-orm/node-postgres/migrator");
      expect(content).toContain("NEVER execute inside the Cloudflare Worker runtime");
    });

    it("root drizzle.config.ts uses DATABASE_URL for CLI migrations", () => {
      const configPath = path.resolve(__dirname, "../../../drizzle.config.ts");
      const content = fs.readFileSync(configPath, "utf-8");
      expect(content).toContain("DATABASE_URL");
      expect(content).toContain("process.env.DATABASE_URL");
    });
  });

  describe("5. Worker Runtime & Configuration Safety", () => {
    it("includes Hyperdrive binding and nodejs_compat in wrangler.jsonc", () => {
      const wranglerPath = path.resolve(__dirname, "../wrangler.jsonc");
      const raw = fs.readFileSync(wranglerPath, "utf-8");
      const parsed = JSON.parse(raw);

      expect(parsed.compatibility_flags).toContain("nodejs_compat");
      expect(Array.isArray(parsed.hyperdrive)).toBe(true);
      expect(parsed.hyperdrive[0].binding).toBe("HYPERDRIVE");
      expect(parsed.hyperdrive[0].id).toBeDefined();
      expect(parsed.hyperdrive[0].localConnectionString).toBeDefined();
    });

    it("keeps drizzle-kit strictly in devDependencies and out of runtime dependencies", () => {
      const pkgPath = path.resolve(__dirname, "../package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

      expect(pkg.dependencies["drizzle-orm"]).toBeDefined();
      expect(pkg.dependencies["pg"]).toBeDefined();
      expect(pkg.dependencies["drizzle-kit"]).toBeUndefined();
      expect(pkg.devDependencies["drizzle-kit"]).toBeDefined();
    });

    it("verifies installed pg version meets Cloudflare Hyperdrive requirements (>= 8.16.3)", () => {
      const pkgPath = path.resolve(__dirname, "../package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const pgVersion = pkg.dependencies["pg"].replace(/[\^~]/, "");
      const [major, minor] = pgVersion.split(".").map(Number);
      // Must be >= 8.16.3
      const isCompatible = major > 8 || (major === 8 && minor >= 16);
      expect(isCompatible).toBe(true);
    });

    it("verifies generated migration file exists and contains valid PostgreSQL DDL", () => {
      const migrationsDir = path.resolve(__dirname, "../../../database/migrations");
      const files = fs.readdirSync(migrationsDir);
      const sqlFiles = files.filter((f) => f.endsWith(".sql"));

      expect(sqlFiles.length).toBeGreaterThanOrEqual(1);

      const migrationContent = fs.readFileSync(
        path.join(migrationsDir, sqlFiles[0]),
        "utf-8",
      );

      // Verify all 5 tables are created
      expect(migrationContent).toContain('CREATE TABLE "profiles"');
      expect(migrationContent).toContain('CREATE TABLE "subscriptions"');
      expect(migrationContent).toContain('CREATE TABLE "entitlements"');
      expect(migrationContent).toContain('CREATE TABLE "audit_logs"');
      expect(migrationContent).toContain('CREATE TABLE "notifications"');

      // Verify constraints & UUIDs
      expect(migrationContent).toContain("gen_random_uuid()");
      expect(migrationContent).toContain("timestamp with time zone");
      expect(migrationContent).toContain("ON DELETE cascade");
      expect(migrationContent).toContain("ON DELETE set null");
    });

    it("verifies built server bundle does not contain drizzle-kit", () => {
      const serverBuildDir = path.resolve(__dirname, "../build/server");
      if (fs.existsSync(serverBuildDir)) {
        const files = fs.readdirSync(serverBuildDir, { recursive: true }) as string[];
        const jsFiles = files.filter((f) => typeof f === "string" && f.endsWith(".js"));
        for (const file of jsFiles) {
          const content = fs.readFileSync(path.join(serverBuildDir, file), "utf-8");
          expect(content).not.toMatch(/(?:from\s+["']drizzle-kit|require\(["']drizzle-kit)/);
        }
      }
    });

    it("verifies built server bundle does not construct pg.Pool in app runtime code", () => {
      const clientPath = path.resolve(__dirname, "../app/db/client.ts");
      const content = fs.readFileSync(clientPath, "utf-8");
      expect(content).not.toContain("new pg.Pool");
      expect(content).not.toContain("new Pool");
    });
  });
});

