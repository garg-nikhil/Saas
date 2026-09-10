---
Status: Draft
Factory compatibility: 1.x
Purpose: Setup and configure PostgreSQL (Supabase), Cloudflare Hyperdrive pooling, node-postgres (pg), Drizzle ORM mappings, migration tooling, and database seeders
---

# 03 - PostgreSQL, Cloudflare Hyperdrive & Drizzle ORM Database Integration

> **CRITICAL DIRECTIVES:**
> 1. **Inspect existing code before changing it.** Check `database/migrations/`, `database/seeds/`, `apps/foundation/wrangler.jsonc`, and package dependencies.
> 2. **Do not silently substitute another architecture.** Adhere strictly to PostgreSQL (Supabase) + Cloudflare Hyperdrive + Drizzle ORM + node-postgres (`pg`). Do not substitute Prisma, TypeORM, MongoDB, or alternative runtime drivers like `@neondatabase/serverless` as default.

---

## 1. Purpose
Establish the relational database layer for the SaaS Factory using PostgreSQL hosted on Supabase, connected through Cloudflare Hyperdrive for connection pooling and edge acceleration, accessed via `node-postgres` (`pg`) and Drizzle ORM, with out-of-band migration execution via `drizzle-kit`.

---

## 2. Context & Architectural Overview

Cloudflare Workers execute on an edge isolate runtime. Direct, unpooled TCP connections to a relational database from thousands of transient isolates can rapidly exhaust database connection limits and introduce cold-start latency. 

To solve this, the factory relies on **Cloudflare Hyperdrive** as the edge connection pooling and acceleration layer, with **Supabase** acting as the managed PostgreSQL provider.

### Runtime Architecture:
```
Cloudflare Worker (app.ts)
    ↓
Drizzle ORM (Type-safe query builder)
    ↓
node-postgres (pg - utilizing nodejs_compat)
    ↓
Cloudflare Hyperdrive (TCP pooling & edge acceleration)
    ↓
Supabase PostgreSQL
```

- **Hyperdrive Role:** Performs connection pooling and query caching between Cloudflare Workers and PostgreSQL. It exposes a pooled connection string to the Worker via environment bindings.
- **Driver Role:** Standard `node-postgres` (`pg`) is used inside the Worker through Hyperdrive (supported via the Worker's `nodejs_compat` compatibility flag). A bare, direct `pg` TCP connection without Hyperdrive is strictly prohibited.
- **Provider Role:** Supabase remains the PostgreSQL provider; Hyperdrive is strictly the edge connection/pooling proxy.

### Migration Architecture (Strict Separation):
```
Runtime:
Worker → Drizzle → pg → Hyperdrive → PostgreSQL

Migrations & Schema Management:
Developer / CI Runner → drizzle-kit → PostgreSQL (Direct connection string)
```
- `drizzle-kit` **does not run inside the Cloudflare Worker runtime**.
- Migrations and schema pushes execute from standard Node.js development environments or CI/CD runners with direct PostgreSQL access.

### Portability Requirement:
The application business logic must not be tightly coupled to Supabase, Hyperdrive, or `pg`. Provide a minimal, practical database client abstraction (e.g., exposing a typed database instance / interface) so that the application/domain layer depends on a generic database interface rather than provider-specific SDKs. Avoid premature over-engineering or monolithic abstraction layers.

---

## 3. Preconditions
- Milestone 1 foundation verified with `nodejs_compat` enabled in `wrangler.jsonc`.
- Supabase PostgreSQL instance created with connection credentials.
- Cloudflare Hyperdrive configuration provisioned in Cloudflare dashboard / Wrangler.
- `database/migrations` and `database/seeds` directories present.

---

## 4. Locked Decisions
- **Database Engine:** PostgreSQL 16+ (hosted on Supabase)
- **Edge Connection Pooling:** Cloudflare Hyperdrive
- **Edge Runtime Driver:** `node-postgres` (`pg`) connected via Hyperdrive binding
- **ORM / Query Builder:** Drizzle ORM (`drizzle-orm`)
- **Migration Tooling:** `drizzle-kit` (executed out-of-band via CLI / CI)
- **Portability:** Standard ANSI SQL / PostgreSQL schemas; no proprietary datastore lock-in.

---

## 5. Tasks
1. Add `drizzle-orm` and `pg` (with `@types/pg`) to `apps/foundation/package.json`.
2. Add `drizzle-kit` as a development dependency for migrations.
3. Configure `drizzle.config.ts` targeting `database/schema/` and outputting migrations to `database/migrations/`.
4. Define baseline database client factory in a dedicated module (e.g., `packages/database` or `apps/foundation/app/db/`):
   - Access Hyperdrive connection string from Cloudflare Worker environment bindings (`env.HYPERDRIVE.connectionString`).
   - Instantiate `pg.Pool` / `drizzle(pool)`.
5. Establish initial schema definitions.
6. Configure migration generation and execution scripts (`pnpm db:generate`, `pnpm db:migrate`).
7. Implement baseline seed script in `database/seeds/index.ts`.
8. Document schema and connection lifecycle in `docs/architecture/technical-architecture.md`.

---

## 6. Files Allowed to Change
- `database/**/*`
- `apps/foundation/wrangler.jsonc` (to add Hyperdrive binding)
- `apps/foundation/package.json`
- `package.json`
- `.env.example`
- `docs/architecture/technical-architecture.md`

---

## 7. Files That Must Not Change
- `apps/foundation/app/routes/**/*` (unless wiring database loaders in an explicit feature prompt)
- `prompts/00-foundation/01-project-bootstrap.md`

---

## 8. Security Requirements
- Database connection strings and credentials must remain strictly in environment variables / encrypted Cloudflare secrets.
- Hyperdrive connection strings must never be exposed or bundled to client-side code.
- Enforce parameterized queries via Drizzle to prevent SQL injection.

---

## 9. Testing Requirements
- [ ] TypeScript strict typecheck passes (`pnpm typecheck`).
- [ ] Migration generation produces valid PostgreSQL DDL.
- [ ] Database client factory initializes cleanly in local development / simulated environment.

---

## 10. Acceptance Criteria
- [ ] Drizzle ORM and `pg` installed and configured.
- [ ] Cloudflare Hyperdrive binding configured in `wrangler.jsonc`.
- [ ] Migration workflow operational via `drizzle-kit` outside Worker runtime.
- [ ] Minimal database abstraction implemented without vendor lock-in.

---

## 11. Stop Condition
Stop once database connection, Drizzle client, and migration workflow are verified. Do not implement application business logic.
