# Phase 2 Foundation Implementation Plan

## 1. Overview

Phase 2 establishes the core technical foundation for the SaaS Factory. It transitions the repository from conceptual documentation to a verified, runnable, edge-compatible application stack.

---

## 2. Milestone 1 Deliverables (Completed)

| Deliverable | Location | Status | Description |
| :--- | :--- | :--- | :--- |
| **Monorepo Structure** | Root / `pnpm-workspace.yaml` | Completed | pnpm workspace linking `apps/foundation`, `packages/`, and `database/`. |
| **Edge SSR Application** | `apps/foundation/` | Completed | React 19 + React Router v8 Framework Mode on Vite 7+ and Cloudflare Workers. |
| **Initial Routes** | `apps/foundation/app/routes/` | Completed | Server-rendered `/`, alongside placeholder views for `/login`, `/signup`, and `/app`. |
| **Prompt Library** | `prompts/` | Completed | Foundation prompts (`01-project-bootstrap.md`, `02-cloudflare.md`, `03-database.md`) and authoring templates. |
| **Documentation Hierarchy** | `docs/` | Completed | Technical architecture, factory operating model, ADRs, and AI development protocols. |
| **Testing Suite** | `apps/foundation/tests/` | Completed | Automated Vitest route definitions and Cloudflare configuration checks. |
| **CI Workflow** | `.github/workflows/ci.yml` | Completed | Automated lint, typecheck, test, and build validation pipeline. |

---

## 3. Subsequent Foundation Steps (Future Milestones)

The following steps will be executed in sequence under separate, dedicated milestones:

### Step 2.1: Data Persistence Foundation
- Implement PostgreSQL connection client in `packages/database` or `database/`.
- Setup Drizzle ORM schema declarations.
- Implement database migration generation and execution scripts (`drizzle-kit`).
- Add local database development seeders.

### Step 2.2: Authentication & User Management Adapter
- Create modular authentication interface (`IAuthService`).
- Implement baseline adapter (e.g., Supabase Auth or Lucia-style session management).
- Wire authenticated session cookies to React Router loaders and actions.

### Step 2.3: Billing & Subscription Adapter
- Define billing contract (`IBillingService`) for subscription lifecycle events.
- Implement Stripe adapter handling checkout sessions, customer portal, and webhooks.

### Step 2.4: Observability & Transactional Email
- Setup Resend transactional email adapter.
- Configure Sentry error boundary logging and Cloudflare analytics.
