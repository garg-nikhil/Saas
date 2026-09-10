# ADR-003: Selection of Database Architecture (PostgreSQL, Cloudflare Hyperdrive, Drizzle ORM, node-postgres)

## Status
Accepted

## Date
2026-09-09

## Context
The SaaS Factory requires a durable, scalable, and portable relational database foundation. The application runtime is hosted on Cloudflare Workers (edge compute isolates), which introduces specific connection and lifecycle constraints:
1. **Edge Concurrency & Connection Exhaustion:** Serverless edge workers create and destroy connection contexts rapidly, which can overwhelm a traditional PostgreSQL instance if connecting directly via bare TCP sockets.
2. **Type Safety & Maintainability:** The database layer must provide TypeScript schema definitions, auto-completion, and deterministic SQL migration generation without runtime overhead.
3. **Provider Portability:** The factory uses Supabase PostgreSQL as the initial database provider, but the application code must remain decoupled from provider-specific proprietary abstractions.
4. **Isolate Safety:** Build artifacts and runtime code in the Worker must never bundle migration toolchains (`drizzle-kit`) or hold long-lived server singletons.

## Decision
We establish the following database architecture for the SaaS Factory:

1. **Database Engine & Initial Provider:**
   - Standard **PostgreSQL** hosted initially on **Supabase**.
   - Standard PostgreSQL features: UUID primary keys (`gen_random_uuid()`), timestamptz in UTC, foreign keys with explicit cascade/null rules, indexes on lookup paths, JSONB for metadata.

2. **Connection & Pooling Layer:**
   - **Cloudflare Hyperdrive** is the Worker-side connectivity and pooling layer. Hyperdrive maintains persistent pools to the database close to the origin and provides ultra-low-latency connection endpoints to Worker isolates.
   - For migrations and local development outside Workers, direct connection strings (e.g. Supabase direct connection) are utilized.

3. **ORM & Database Driver:**
   - **Drizzle ORM** (`drizzle-orm`) paired with **node-postgres** (`pg`) running under Cloudflare Worker `nodejs_compat`.
   - Worker runtime uses request-scoped node-postgres Client (`pg.Client`) instances through Cloudflare Hyperdrive. Hyperdrive provides the underlying connection pooling.
   - `pg.Pool` is NOT used in the Worker runtime, avoiding dual application-level pooling.
   - `DATABASE_URL` is reserved for migration/developer/CI tooling and is not a Worker runtime fallback.
   - Database client helper (`createDbClient` / `withDb`) creates and connects request-scoped `pg.Client` instances and releases them cleanly after the request/query lifecycle.

4. **Schema & Migrations:**
   - Schema defined purely in TypeScript (`apps/foundation/app/db/schema/` and re-exported via `database/schema/`).
   - Migrations generated and inspected via **drizzle-kit** (`db:generate`, `db:migrate`).
   - Migrations are committed as plain SQL files in `database/migrations/`.
   - `drizzle-kit` is strictly a development dependency and is excluded from the Worker runtime bundle. Migrations are executed during deployment/CI or locally, never at Worker boot time.

5. **Initial Factory Schema:**
   - Baseline reusable SaaS models: `profiles`, `subscriptions`, `entitlements`, `audit_logs`, `notifications`.
   - No product-specific business logic or premature auth/billing implementations in this foundation milestone.

## Consequences

### Positive
- **Near-Zero Latency Connection Pooling:** Hyperdrive manages TCP handshakes and keeps pooling warm across Cloudflare's global edge network.
- **Zero Runtime Bloat:** Drizzle ORM is lightweight and produces lean SQL without heavy AST overhead or native binaries.
- **Provider Portability:** Applications interact with pure PostgreSQL via standard Drizzle queries; switching underlying PostgreSQL providers (e.g., to Neon, AWS RDS, or self-hosted Postgres) requires zero code changes.
- **Strict Bundle Isolation:** The Worker bundle contains only Drizzle core and `pg`, eliminating migration engine bloat.

### Negative & Tradeoffs
- **Wrangler Hyperdrive Configuration Required:** Production Cloudflare deployment requires binding a configured Hyperdrive ID in `wrangler.jsonc`.
- **Dual Connection Strategy:** Developers connect via direct connection or local Postgres for CLI migrations, while the deployed Worker accesses the database through Hyperdrive.
