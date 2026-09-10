# Local Development Runbook

## 1. Prerequisites
- **Node.js**: v18+ or v20+ (matching Worker runtime requirements).
- **Package Manager**: `npm` / `pnpm` workspace setup.
- **PostgreSQL**: A local PostgreSQL instance (e.g. Docker container) or direct connection string to a Supabase PostgreSQL instance.

---

## 2. Repository Setup
1. Clone the repository and navigate to the project root:
   ```bash
   git clone <repository-url>
   cd saas-factory
   ```
2. Install workspace dependencies:
   ```bash
   npm install
   ```

---

## 3. Environment Variables Setup
Copy `.env.example` to `.env` in the root and configure necessary development keys:
```bash
cp .env.example .env
```

Key environment variables:
- `DATABASE_URL`: Direct PostgreSQL connection string (e.g., `postgresql://user:password@localhost:5432/dbname`) used by Drizzle ORM migration tools and CLI scripts.
- `CLOUDFLARE_HYPERDRIVE_ID`: Cloudflare Hyperdrive configuration ID (referenced in `wrangler.jsonc`).
- `STRIPE_SECRET_KEY` & `STRIPE_WEBHOOK_SECRET`: Stripe billing keys.
- `RESEND_API_KEY` & `EMAIL_FROM`: Resend email provider configuration.
- `POSTHOG_KEY` & `POSTHOG_HOST`: PostHog analytics key and host URL.
- `SENTRY_DSN`: Sentry DSN for observability.
- `SUPABASE_URL` & `SUPABASE_ANON_KEY`: Supabase API endpoints for auth and storage.

---

## 4. Local Development Commands
All key commands can be run from the root directory or within `apps/foundation`:

- **Start Local Dev Server**:
  ```bash
  npm run dev
  ```
  Starts the React Router development server.

- **Run Automated Tests**:
  ```bash
  npm test
  ```
  Executes the Vitest test suite across all services and routes.

- **Run Typechecking**:
  ```bash
  npm run typecheck
  ```
  Generates React Router types and executes `tsc` validation.

- **Run Linter**:
  ```bash
  npm run lint
  ```
  Executes ESLint across project files.

- **Production Build**:
  ```bash
  npm run build
  ```
  Compiles SSR server bundle and client assets for Cloudflare Workers.

---

## 5. Database Migration Workflow
The application uses Drizzle ORM for schema management.

1. **Schema Modifications**: Edit files in `apps/foundation/app/db/schema/`.
2. **Generate Migration Files**:
   Using `drizzle-kit`:
   ```bash
   npx drizzle-kit generate --config=apps/foundation/drizzle.config.ts
   ```
3. **Execute Migrations**:
   Run the migration script against your target database using `DATABASE_URL`:
   ```bash
   npx tsx database/migrate.ts
   ```

### Important Architecture Note on Database Connections
- `DATABASE_URL`: Direct connection string used **exclusively** for local development CLI tools, schema migrations (`drizzle-kit`), and CI/CD database tasks.
- `HYPERDRIVE` (Cloudflare Hyperdrive Binding): Connection proxy used at runtime inside Cloudflare Workers (`apps/foundation/wrangler.jsonc`) to maintain connection pooling and query acceleration. Cloudflare Workers **must** connect via Hyperdrive, while migrations **must** run via direct `DATABASE_URL`.

---

## 6. Security Notes
- Never commit actual secrets, API keys, or database credentials to git.
- Server-side secrets (`STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SENTRY_DSN`) must remain strictly on the server/worker side and never be exposed in client-facing bundles.
- Keep `.env` listed in `.gitignore`.
