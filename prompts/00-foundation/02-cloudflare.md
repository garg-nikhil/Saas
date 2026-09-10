---
Status: Draft
Factory compatibility: 1.x
Purpose: Instructions for configuring and validating Cloudflare Workers runtime, Vite environment bindings, and deployment pipelines
---

# 02 - Cloudflare Workers Configuration & Deployment

> **CRITICAL DIRECTIVES:**
> 1. **Inspect existing code before changing it.** Inspect `apps/foundation/wrangler.jsonc`, `vite.config.ts`, and `workers/app.ts`.
> 2. **Do not silently substitute another architecture.** Cloudflare Workers is the locked edge runtime. Do not substitute Node/Express servers or alternative edge platforms.

---

## 1. Purpose
Configure and validate full-stack SSR execution on Cloudflare Workers using the official `@cloudflare/vite-plugin` and Wrangler integration.

---

## 2. Context
The SaaS Factory relies on Cloudflare Workers to deliver low-latency SSR, global asset distribution, and cost-effective edge compute. This prompt outlines the configuration and deployment steps for deploying the foundation app or any subsequent factory product to Cloudflare Workers.

---

## 3. Preconditions
- Milestone 1 project bootstrap completed
- `apps/foundation/wrangler.jsonc` present with valid compatibility dates
- Cloudflare account credentials available in execution environment (e.g., `CLOUDFLARE_API_TOKEN`)

---

## 4. Locked Decisions
- **Runtime:** Cloudflare Workers (`workerd`)
- **Plugin:** `@cloudflare/vite-plugin` configuring `viteEnvironment: { name: "ssr" }`
- **Configuration Format:** `wrangler.jsonc` (standardized on JSON with comments)
- **SSR Worker Entry:** `workers/app.ts` utilizing `createRequestHandler`
- **Asset Handling:** Cloudflare Workers Static Assets pointing to `./build/client`
- **Prohibited:** Speculatively adding KV, D1, R2, or Queues until an explicit milestone requires them.

---

## 5. Tasks
1. Verify `wrangler.jsonc` configuration schema, worker entry point, and assets directory.
2. Confirm `vite.config.ts` integration with `@cloudflare/vite-plugin`.
3. Validate worker request handler in `workers/app.ts` correctly processes incoming requests and returns SSR responses.
4. Execute `pnpm --filter foundation build` to produce `./build/client` and `./build/server`.
5. Execute dry-run or live deployment using `wrangler deploy --dry-run`.

---

## 6. Files Allowed to Change
- `apps/foundation/wrangler.jsonc`
- `apps/foundation/workers/app.ts`
- `apps/foundation/vite.config.ts`
- `apps/foundation/package.json`

---

## 7. Files That Must Not Change
- `database/`
- Application route business logic

---

## 8. Security Requirements
- Cloudflare API tokens and account IDs must never be committed to repository files.
- Secrets must be passed via CI/CD secrets or Wrangler secret bindings.

---

## 9. Testing Requirements
- `pnpm test`: Cloudflare config validation test passes.
- `pnpm build`: Both server and client bundles generate cleanly.
- Edge fetch handler responds with appropriate HTTP headers and status codes.

---

## 10. Acceptance Criteria
- [ ] `wrangler.jsonc` validates against Cloudflare Workers schema.
- [ ] Build outputs server worker bundle in `build/server` and client static assets in `build/client`.
- [ ] Application responds properly in local `workerd` emulation.

---

## 11. Stop Condition
Stop after Cloudflare configuration and deployment readiness are verified.
