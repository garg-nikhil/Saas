# Technical Architecture

## 1. Executive Summary

The SaaS Factory technical architecture is designed to support the rapid, reliable assembly of localized, independent SaaS products. The architecture balances developer speed, operational simplicity, global edge performance, and low fixed infrastructure costs.

---

## 2. Core Technology Stack

| Layer | Technology | Version | Rationale |
| :--- | :--- | :--- | :--- |
| **Language** | TypeScript | 5.8+ (Strict Mode) | End-to-end type safety, eliminating entire classes of runtime errors. |
| **Monorepo** | pnpm Workspaces | 12+ | Efficient dependency deduplication, strict isolation, and fast builds. |
| **Frontend Framework** | React Router | v8 (Framework Mode) | Unified full-stack routing, loader/action data conventions, nested routes, and native SSR. |
| **UI Library** | React | 19 | Standardized component model, modern concurrent rendering primitives. |
| **Bundler & Tooling** | Vite | 8.2.x | Lightning-fast HMR and ESM build pipeline with official Cloudflare environment integration (compatible with Vite 7+). |
| **Compute & Runtime** | Cloudflare Workers | Edge `workerd` | Serverless edge execution with near-zero cold starts, global latency minimization, and minimal operational overhead. |
| **Edge DB Connectivity** | Cloudflare Hyperdrive | Cloudflare binding | Edge connection pooling and query acceleration for PostgreSQL. |
| **Database** | PostgreSQL (Supabase) | 16+ | Industry standard relational database hosted on Supabase, ensuring portable persistence. |
| **ORM & Runtime Driver** | Drizzle ORM + `pg` | Latest | Type-safe SQL-first query builder; `pg` connects through Hyperdrive. |
| **Testing** | Vitest | 3+ | Native Vite test runner sharing bundling pipeline for consistent module resolution. |

---

## 3. System Architecture & Request Lifecycle

```
[ Incoming User Request ]
           │
           ▼
[ Cloudflare Global Edge Network ]
           │
     ┌─────┴─────────────────────────┐
     │ Static Asset Request?         │
     ▼                               ▼
 [ Cloudflare Assets ]         [ Cloudflare Worker ]
 (HTML/CSS/JS in build/client)  (workers/app.ts via workerd)
                                     │
                                     ▼
                              [ React Router v8 SSR ]
                              - Route Matching
                              - Server Loaders Execution
                              - HTML Streaming Generation
                                     │
                                     ▼
                              [ Database Layer ]
                              (PostgreSQL via Drizzle ORM)
```

### Edge Execution Characteristics
- **Server-Side Rendering (SSR):** Public landing pages and initial route entries are server-rendered to deliver optimal SEO, instantaneous First Contentful Paint (FCP), and minimal layout shift.
- **Client Hydration:** React 19 hydrates the DOM progressively in the browser, enabling dynamic client-side interactions and subsequent SPA navigation.
- **Asset Offloading:** Immutable static assets (hashed CSS, client JS, public images) are served directly from Cloudflare edge caches via Cloudflare Workers Static Assets (`build/client`), ensuring zero compute cost for static media.

---

## 4. Data Layer Strategy

### PostgreSQL (Supabase) as the Portable Foundation
Data portability is an immutable architectural principle. The SaaS Factory strictly prohibits proprietary cloud databases (such as DynamoDB or Firebase Firestore) for primary business data.

- **Portability:** Schemas, indexes, constraints, and migrations are authored in standard ANSI SQL / PostgreSQL syntax.
- **Provider:** Supabase serves as the managed PostgreSQL provider, providing standard PostgreSQL compatibility.
- **Drizzle ORM:** Schema definitions live directly in TypeScript (`schema.ts`). Drizzle generates plain SQL migration files in `database/migrations/`, maintaining an auditable, version-controlled history of schema changes.

### Edge Database Connectivity: Cloudflare Hyperdrive
Direct TCP connection pooling to PostgreSQL from serverless edge isolates requires dedicated connection pooling. 
- **Cloudflare Hyperdrive** provides connection pooling, connection reuse, and edge query acceleration.
- In the Cloudflare Worker runtime, `node-postgres` (`pg`) connects via the pooled connection string exposed by Hyperdrive (leveraging `nodejs_compat`). Direct, unpooled `pg` connections from Workers are prohibited.

### Strict Separation: Runtime vs. Migrations
- **Runtime:** Worker $\to$ Drizzle ORM $\to$ `pg` $\to$ Cloudflare Hyperdrive $\to$ Supabase PostgreSQL.
- **Migrations:** `drizzle-kit` runs strictly **outside the Cloudflare Worker runtime** (in standard Node.js development environments or CI runners), connecting directly to PostgreSQL.

---

## 5. Security & Configuration Model

### Environment Variables & Secrets
- Configuration variables are parameterized and documented in `.env.example`.
- Secrets (database connection strings, API keys) are injected at runtime via environment variables or Cloudflare Worker encrypted secrets.
- **Client/Server Isolation:** Server-side secrets are strictly isolated from client bundles. React Router loaders run exclusively on the server, ensuring credentials never leak to the browser.

### Vendor Replacement Strategy
All external SaaS services (e.g., Stripe, Resend, Supabase Auth, PostHog) must be integrated via isolated adapter patterns in `packages/` or dedicated service modules. Business logic must never import vendor SDKs directly.
