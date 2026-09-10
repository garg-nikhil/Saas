# Foundation Application

Minimal proof-of-concept application for Milestone 1 of the SaaS Factory.

## Stack
- **Framework:** React Router v8 Framework Mode
- **Frontend:** React 19
- **Build Tool:** Vite 7+
- **Runtime:** Cloudflare Workers
- **Rendering:** Full SSR (Server-Side Rendering) for public landing pages

## Routes
- `/` - Server-rendered landing page displaying SaaS Factory vision and initial actions
- `/login` - Placeholder authentication view
- `/signup` - Placeholder account creation view
- `/app` - Placeholder dashboard view

## Scripts
- `pnpm dev` - Start local development server with Vite and React Router
- `pnpm build` - Build the application for Cloudflare Workers SSR and client assets
- `pnpm test` - Run architectural route and configuration validation tests
- `pnpm typecheck` - Run React Router typegen and TypeScript compiler checks
