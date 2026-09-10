# Factory Architecture & Operating Model

## 1. The SaaS Product Factory Vision

The SaaS Product Factory is an operating model and technical framework designed to build, launch, and maintain independent, localized software-as-a-service applications rapidly and predictably.

Traditional SaaS development treats every new product as a greenfield effort, leading to repetitive setup of authentication, billing, routing, database schemas, CI/CD, and deployment infrastructure.

The SaaS Factory shifts this paradigm by treating infrastructure, documentation, and implementation prompts as **reusable manufacturing assets**.

```
                           ┌─────────────────────────────────┐
                           │      SAAS PRODUCT FACTORY       │
                           └────────────────┬────────────────┘
                                            │
        ┌───────────────────────────────────┼───────────────────────────────────┐
        ▼                                   ▼                                   ▼
 [ Reusable Code/Infra ]        [ Reusable Documentation ]           [ Reusable AI Prompts ]
 - pnpm monorepo structure       - Architecture blueprints           - 00-foundation library
 - React Router v8 + Cloudflare  - ADRs and protocols                - Validated prompt templates
 - PostgreSQL / Drizzle layers   - Runbooks and checklist models     - Version-controlled instructions
        │                                   │                                   │
        └───────────────────────────────────┼───────────────────────────────────┘
                                            │
                                            ▼
                    ┌───────────────────────────────────────────────┐
                    │            INDEPENDENT PRODUCTS               │
                    ├───────────────────────┬───────────────────────┤
                    │  Product 1:           │  Product 2:           │
                    │  Planning Infirmier   │  Future Vertical SaaS │
                    │  (Nurse shift planner)│  (Independent domain) │
                    └───────────────────────┴───────────────────────┘
```

---

## 2. The Three Reusable Factory Assets

### A. Reusable Code & Infrastructure
- **Monorepo Foundation:** Standardized workspace layouts (`apps/*`, `packages/*`, `database/`).
- **Edge Deployment Standard:** Cloudflare Workers with server-side rendering and asset hosting.
- **Relational Data Foundation:** PostgreSQL schema patterns with Drizzle ORM.
- **Adapter Contracts:** Pluggable interfaces for authentication, payments (Stripe), email delivery (Resend), and analytics.

### B. Reusable Documentation System
- **Architecture Blueprints:** Pre-established design decisions that prevent bikeshedding on every project.
- **Architectural Decision Records (ADRs):** Explicit documentation of why technologies were chosen and what tradeoffs were accepted.
- **Runbooks & Operational Checklists:** Standard operating procedures for database migrations, deployments, and domain configurations.

### C. Reusable AI Prompt System
- **Structured Instruction Sets:** Rigorous, tested prompts that guide AI coding agents through specific milestone implementations without hallucination.
- **Safety Rails:** Stop conditions, locked technical decisions, and acceptance criteria baked into every prompt template.
- **Continuous Learning Loop:** The `lessons-learned.md` registry feeds directly back into prompt hardening.

---

## 3. Product Lifecycle & Factory Progression

1. **Milestone 1: Factory Foundation (Current)**
   - Monorepo repository setup.
   - React Router v8 Framework Mode + Cloudflare Workers SSR proof.
   - Documentation hierarchy and development protocols.
   - Prompt library with standardized templates.

2. **Milestone 2: Shared Factory Infrastructure Modules**
   - Portable PostgreSQL schema abstractions and database client setup.
   - Authentication adapter interface.
   - Base responsive design tokens and component primitives.

3. **Milestone 3: First Product Implementation (Planning Infirmier)**
   - French-language shift planning SaaS for healthcare professionals.
   - Product-specific scheduling rules, calendar visualizations, and French labor compliance.
   - Validating the factory model on real-world product delivery.

4. **Subsequent Milestones & Products**
   - Launching new vertical SaaS applications in completely different domains by duplicating and adapting the factory infrastructure.
