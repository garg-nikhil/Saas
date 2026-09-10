# ADR-002: Adoption of React Router v8 Framework Mode

## Status
Accepted

## Date
2026-09-09

## Context
The SaaS Factory requires a modern, full-stack React framework capable of:
1. **Unified Routing & Data Loading:** Clean loader and action primitives that colocated data requirements with UI components.
2. **First-Class Server-Side Rendering (SSR):** Full HTML generation on the server for public landing pages and critical flows.
3. **Vite Ecosystem Integration:** Seamless build and development workflow powered by Vite 8.2.x (compatible with Vite 7+).
4. **React 19 Support:** Full compatibility with the latest React 19 features and concurrent primitives.
5. **Edge Platform Portability:** First-class compatibility with Cloudflare Workers without relying on Node-specific server runtimes.

Alternatives considered included:
- *Next.js (App Router):* Heavy vendor coupling to Vercel primitives, complex caching mechanics, and difficult deployment on Cloudflare Workers.
- *Remix v2:* Now unified directly into React Router v8.
- *Vanilla React SPA:* Inadequate for SEO, slower initial content paint, and requires separate backend API servers.

## Decision
We adopt **React Router v8 in Framework Mode** (formerly Remix) paired with React 19 and Vite 8.2.x (Vite 7+ compatible) as the standardized full-stack framework across the SaaS Factory.

## Consequences

### Positive
- **Single Cohesive Framework:** Combines industry-standard client routing with server-side loaders, actions, and streaming SSR.
- **Web Standards Native:** Built around standard `Request` and `Response` interfaces, perfectly aligned with Cloudflare Workers.
- **Vite Integration:** Directly leverages the Vite plugin ecosystem (`@react-router/dev/vite` and `@cloudflare/vite-plugin`).
- **Automatic Type Safety:** Built-in `typegen` generates typed loaders and action arguments automatically without manual typing boilerplate.

### Negative & Tradeoffs
- **Framework Mode Conventions:** Requires adhering to React Router v8 directory conventions (`app/routes.ts`, `app/root.tsx`, `react-router.config.ts`).
- **Learning Curve:** Developers must understand the distinction between server execution (`loader`, `action`) and client hydration components.
