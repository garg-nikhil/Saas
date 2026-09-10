---
Status: Validated
Factory compatibility: 1.x
Last validated: 2026-09-09
Purpose: Bootstrap the SaaS Factory pnpm monorepo, documentation tree, prompt library, and initial React Router v8 foundation
---

# 01 - Project Bootstrap

> **CRITICAL DIRECTIVES:**
> 1. **Inspect existing code before changing it.** Review existing workspace settings, package manifests, and dependencies.
> 2. **Do not silently substitute another architecture.** Adhere to React Router v8 Framework Mode, React 19, Vite 7+, and Cloudflare Workers.

---

## 1. Purpose
Initialize the core SaaS Factory repository structure, establish pnpm monorepo workspace configuration, setup the documentation hierarchy, configure the prompt library, and deploy the initial foundation app skeleton with baseline routes (`/`, `/login`, `/signup`, `/app`).

---

## 2. Context
This is Milestone 1 of the SaaS Factory. It establishes the reproducible foundation for future SaaS products without introducing product-specific code (e.g., Planning Infirmier) or premature third-party service implementations (Auth, Stripe, Database).

---

## 3. Preconditions
- Node.js 22+ installed
- pnpm package manager enabled via Corepack (`corepack enable`)
- Clean Git workspace

---

## 4. Locked Decisions
- **Monorepo Manager:** pnpm workspaces (`pnpm-workspace.yaml` targeting `apps/*` and `packages/*`)
- **Language:** TypeScript 5.8+ with strict mode enabled
- **Frontend Framework:** React Router v8 Framework Mode
- **UI Library:** React 19
- **Build Tool:** Vite 7+
- **Styling:** Minimal, accessible responsive CSS (no heavy UI component libraries)
- **Forbidden:** Express, Next.js, Hono, Redis, Pinecone, complex UI kits

---

## 5. Tasks
1. Establish root repository layout with `apps/foundation`, `packages/`, `database/`, `docs/`, `prompts/`, and `.github/`.
2. Configure root `package.json`, `pnpm-workspace.yaml`, and root `tsconfig.json`.
3. Scaffold `apps/foundation` containing React Router v8 framework configuration (`react-router.config.ts`, `vite.config.ts`, `wrangler.jsonc`).
4. Implement baseline routes with server-side rendering:
   - `/` - Landing page with "SaaS Factory", subtitle, and "Login" / "Create account" actions
   - `/login` - Placeholder view
   - `/signup` - Placeholder view
   - `/app` - Placeholder dashboard view
5. Add unit tests verifying route definitions and Cloudflare worker configuration.
6. Verify local development (`pnpm dev`), typechecking (`pnpm typecheck`), and build (`pnpm build`).

---

## 6. Files Allowed to Change
- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.json`
- `apps/foundation/**/*`
- `docs/**/*`
- `prompts/**/*`
- `.github/**/*`
- `.env.example`
- `.gitignore`

---

## 7. Files That Must Not Change
- System configuration files outside the repository root.

---

## 8. Security Requirements
- Ensure `.env.example` contains only non-sensitive placeholder variable documentation.
- No secrets or credentials committed to Git.

---

## 9. Testing Requirements
- `pnpm test`: Execute Vitest route and configuration assertions.
- `pnpm typecheck`: Run React Router typegen and TypeScript compiler validation.
- `pnpm build`: Validate that both client and SSR server bundles build without warnings or errors.

---

## 10. Acceptance Criteria
- [x] Repository and documentation structures fully established.
- [x] Monorepo managed via pnpm workspaces.
- [x] React 19 + React Router v8 Framework Mode configured with SSR.
- [x] Four baseline routes functional and responsive.
- [x] All automated tests, typechecks, and production builds passing.

---

## 11. Stop Condition
Stop once Milestone 1 acceptance criteria are satisfied. Do not implement database, authentication, or billing modules.
