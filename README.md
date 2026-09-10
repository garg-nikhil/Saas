# SaaS Factory

A reproducible, high-velocity development framework and asset library designed to build, launch, and operate independent, localized SaaS applications.

The first product built on this foundation will be **Planning Infirmier**, a dedicated shift-planning application for nurses in the French healthcare ecosystem. Future products built from this factory may address entirely distinct markets while leveraging the exact same core infrastructure, architecture, and AI development systems.

---

## 1. The SaaS Factory Concept

Rather than treating each new SaaS product as a greenfield effort, the SaaS Product Factory treats infrastructure, operational runbooks, and implementation prompts as **reusable manufacturing assets**:

1. **Reusable Code & Infrastructure:** Standardized pnpm monorepo layout, Cloudflare Workers edge runtime with server-side rendering (SSR), portable PostgreSQL schemas via Drizzle ORM, and swappable vendor adapters (Stripe, Resend, Auth).
2. **Reusable Documentation:** Standardized Architecture Decision Records (ADRs), operational runbooks, and strict AI development protocols.
3. **Reusable AI Prompt System:** Version-controlled implementation prompts that allow AI coding agents to reliably execute milestones without hallucinating unrequested architecture or scope creep.

---

## 2. Technology Stack

- **Language:** TypeScript 5.8+ (Strict Mode enabled)
- **Monorepo Management:** pnpm Workspaces
- **Frontend Framework:** React Router v8 Framework Mode
- **UI Library:** React 19
- **Build & Development Tooling:** Vite 8.2.x (compatible with Vite 7+)
- **Edge Compute & Runtime:** Cloudflare Workers (`workerd`)
- **Edge DB Connectivity:** Cloudflare Hyperdrive
- **Database (Foundation Standard):** PostgreSQL 16+ (Supabase)
- **ORM & Runtime Driver:** Drizzle ORM + `pg` (connected through Hyperdrive)
- **Testing:** Vitest 3+

### Why These Technologies?
- **Cloudflare Workers & Hyperdrive:** Zero server maintenance, sub-10ms global cold starts, unified edge asset and SSR delivery, and managed connection pooling to PostgreSQL via Hyperdrive.
- **React Router v8 Framework Mode:** Combines declarative data loaders and actions with streaming SSR and standard Web Fetch APIs.
- **PostgreSQL + Drizzle:** Uncompromised data portability. Schemas and migrations are managed via `drizzle-kit` outside the Worker runtime, while the application interacts with PostgreSQL via type-safe Drizzle queries.

---

## 3. Repository Layout

```
saas-factory/
├── apps/
│   └── foundation/                 # React Router v8 + Cloudflare Workers app
│       ├── app/
│       │   ├── routes/             # Baseline route modules (/, /login, /signup, /app)
│       │   ├── app.css             # Minimal, responsive stylesheet
│       │   ├── root.tsx            # HTML document shell & error boundaries
│       │   └── routes.ts           # Route definitions
│       ├── workers/
│       │   └── app.ts              # Cloudflare Worker SSR fetch handler
│       ├── tests/
│       │   └── routes.test.ts      # Automated route & configuration assertions
│       ├── react-router.config.ts  # Framework SSR configuration
│       ├── vite.config.ts          # Vite build configuration with Cloudflare plugin
│       └── wrangler.jsonc          # Cloudflare Workers configuration
├── packages/                       # Shared internal packages & vendor adapters
├── database/
│   ├── migrations/                 # PostgreSQL SQL migrations
│   └── seeds/                      # Database seed scripts
├── docs/
│   ├── architecture/               # Technical & factory architecture specs
│   ├── decisions/                  # Architecture Decision Records (ADR-001, ADR-002)
│   ├── implementation/             # Phase 2 implementation plans
│   └── ai-development/             # Development protocols, failure registries, changelogs
├── prompts/
│   ├── 00-foundation/              # Reusable factory infrastructure prompts
│   ├── 01-product/                 # Product-specific prompt library
│   ├── 02-maintenance/             # Maintenance and upgrade prompts
│   ├── templates/                  # Prompt authoring template
│   └── README.md                   # Prompt library guide and philosophy
├── .github/
│   └── workflows/
│       └── ci.yml                  # GitHub Actions CI workflow
├── pnpm-workspace.yaml             # pnpm workspace definition
├── tsconfig.json                   # Root TypeScript project references
├── .env.example                    # Documented placeholder environment variables
└── package.json                    # Workspace orchestration scripts
```

---

## 4. Getting Started

### Prerequisites
- Node.js >= 22.0.0
- Corepack enabled (`corepack enable`) or pnpm installed globally

### Installation
```bash
# Install all workspace dependencies
pnpm install
```

### Local Development
```bash
# Start the local development server with Vite & React Router
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) to view the server-rendered application.

### Running Tests
```bash
# Execute Vitest automated tests
pnpm test
```

### Typechecking
```bash
# Run React Router typegen and TypeScript compiler validation
pnpm typecheck
```

### Production Build
```bash
# Generate production client assets (build/client) and Cloudflare Worker bundle (build/server)
pnpm build
```

---

## 5. AI Prompt System

All AI-assisted development in this repository adheres to the protocol defined in `docs/ai-development/development-protocol.md`.

Before drafting or modifying code:
1. Consult the architecture documentation in `docs/` (the ultimate source of truth).
2. Use the standardized prompt structure in `prompts/templates/prompt-template.md`.
3. Adhere strictly to locked technical decisions; never substitute unrequested technologies.
