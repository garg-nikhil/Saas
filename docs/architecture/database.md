# Database Architecture & Operations Guide

## Overview

The SaaS Factory database foundation uses standard **PostgreSQL** (initially hosted on **Supabase**), connected through **Cloudflare Hyperdrive** for connection pooling, queried with **Drizzle ORM** and **node-postgres (`pg`)**, and versioned using **drizzle-kit** migrations.

```
Runtime:
Cloudflare Worker (Isolate)
    ↓
Drizzle ORM
    ↓
node-postgres Client (`pg.Client`)
    ↓
Cloudflare Hyperdrive (Global Edge Pooling & Caching)
    ↓
PostgreSQL (Supabase)

Tooling & Migrations (CI/CD & CLI):
Developer Machine / CI Runner
    ↓
DATABASE_URL
    ↓
drizzle-kit / database/migrate.ts
    ↓
Direct PostgreSQL Connection (Port 5432)
```

> **Strict Runtime Boundaries:**
> - Worker runtime uses request-scoped node-postgres Client (`pg.Client`) instances through Cloudflare Hyperdrive. Hyperdrive provides the underlying connection pooling.
> - `pg.Pool` is NOT used in the Worker runtime, preventing redundant application-level connection pooling.
> - `DATABASE_URL` is reserved for migration/developer/CI tooling and is not a Worker runtime fallback.

---

## 1. Schema Overview

The initial factory schema establishes the core models required for any SaaS product:

1. **`profiles`**
   - Application-level user record decoupled from external auth providers.
   - Fields: `id` (UUID PK), `user_id` (unique external auth ID), `display_name`, `email`, `created_at` (timestamptz), `updated_at` (timestamptz).

2. **`subscriptions`**
   - Tracks subscription status, tier/plan identifier, and billing periods.
   - Fields: `id` (UUID PK), `profile_id` (FK -> `profiles.id`, cascade delete), `provider`, `provider_subscription_id`, `status`, `plan_id`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `created_at`, `updated_at`.
   - Indexed on `profile_id` and `status`.

3. **`entitlements`**
   - Dynamic feature-flagging and capability granting per account.
   - Fields: `id` (UUID PK), `profile_id` (FK -> `profiles.id`, cascade delete), `feature_key`, `enabled` (boolean), `metadata` (jsonb), `created_at`, `updated_at`.
   - Unique index on `(profile_id, feature_key)`.

4. **`audit_logs`**
   - Immutable security and audit events.
   - Fields: `id` (UUID PK), `profile_id` (FK -> `profiles.id`, set null on delete), `action`, `entity_type`, `entity_id`, `metadata` (jsonb), `created_at`.
   - Indexed on `profile_id`, `(entity_type, entity_id)`, and `created_at`.

5. **`notifications`**
   - Reusable notification queue and history for account alerts.
   - Fields: `id` (UUID PK), `profile_id` (FK -> `profiles.id`, cascade delete), `type`, `status`, `scheduled_at`, `sent_at`, `metadata` (jsonb), `created_at`, `updated_at`.
   - Indexed on `profile_id` and `status`.

---

## 2. Cloudflare Hyperdrive Setup

Cloudflare Hyperdrive accelerates database queries and eliminates connection exhaustion from serverless workers by keeping connection pools open across Cloudflare's network.

### Steps to Provision Hyperdrive

1. Create a Hyperdrive configuration via the Cloudflare CLI or dashboard:
   ```bash
   wrangler hyperdrive create saas-factory-hyperdrive \
     --connection-string="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
   ```

2. Copy the returned configuration ID and add it to `apps/foundation/wrangler.jsonc`:
   ```jsonc
   "hyperdrive": [
     {
       "binding": "HYPERDRIVE",
       "id": "YOUR_HYPERDRIVE_ID",
       "localConnectionString": "postgresql://postgres:postgres@127.0.0.1:5432/postgres"
     }
   ]
   ```

3. Inside the Worker runtime (`workers/app.ts` or React Router loaders), access the database client using the Hyperdrive binding:
   ```ts
   import { createDbClient, withDb } from "~/db";

   // Option A: Scoped execution with automatic connection lifecycle cleanup
   const users = await withDb(env.HYPERDRIVE, async (db) => {
     return await db.select().from(profiles);
   });

   // Option B: Explicit request-scoped client lifecycle
   const db = createDbClient(env.HYPERDRIVE);
   await db.connect();
   try {
     const users = await db.select().from(profiles);
   } finally {
     await db.close();
   }
   ```

---

## 3. Migration Workflow

Migrations are generated with `drizzle-kit` and committed as plain SQL files in `database/migrations/`.

### Commands

| Task | Command | Description |
|------|---------|-------------|
| **Generate Migration** | `pnpm db:generate` | Compares TypeScript schema with existing migrations and writes a new SQL file into `database/migrations/`. |
| **Apply Migrations** | `pnpm db:migrate` | Applies pending migrations to the database targeted by `DATABASE_URL`. |
| **Direct Push (Dev only)** | `pnpm db:push` | Directly updates schema in a local/ephemeral development database without generating migration files. |
| **Inspect DB Studio** | `pnpm db:studio` | Launches Drizzle Studio visual schema and data browser. |

### Migration Rules
- **Never run migrations inside the Worker:** The Cloudflare Worker isolate does not contain `drizzle-kit` and must never run DDL operations on request boot.
- **Direct connection for migrations:** When applying migrations, connect directly to PostgreSQL (port 5432 or Supabase direct connection string) rather than through Hyperdrive.

---

## 4. Local Development Options

### Option A: Local PostgreSQL with Docker
```bash
docker run -d --name saas-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=postgres \
  -p 5432:5432 postgres:17
```
Configure `.env`:
```env
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/postgres"
```

### Option B: Local Supabase CLI
```bash
npx supabase start
```
Use the connection string provided by Supabase local outputs.

### Option C: Remote Supabase Development Branch
Connect `DATABASE_URL` directly to a dedicated development or preview Supabase project.

---

## 5. Production Considerations

- **Supabase Direct vs. Pooler Strings:**
  - Hyperdrive should point to the Supabase **Direct connection** (port 5432) or Supabase **Session pooler** (port 5432), because Hyperdrive itself performs edge connection pooling and transaction multiplexing.
  - Migrations (`pnpm db:migrate`) should connect via direct connection (port 5432) to avoid transaction pooler statement locks during DDL migrations.
- **Isolate Safety:**
  - Database instances are instantiated on-demand per request context (`createDbClient(env)`). No global state or persistent sockets leak across isolates.
