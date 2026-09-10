# Deployment Runbook

## 1. Overview & Target Architecture
The foundation application is designed for deployment on **Cloudflare Workers** with **Supabase PostgreSQL** as the database backend.

- **Edge Application Runtime**: Cloudflare Workers running React Router SSR (`apps/foundation/wrangler.jsonc`).
- **Database Connection Pooling**: Cloudflare Hyperdrive proxy binding (`HYPERDRIVE`).
- **Database**: PostgreSQL (hosted on Supabase or dedicated Cloud Postgres).
- **External Platform Services**: Stripe (billing), Resend (email), PostHog (analytics), Sentry (observability), Supabase Storage (object storage).

---

## 2. Cloudflare Configuration & Secrets Management

### Wrangler Configuration (`apps/foundation/wrangler.jsonc`)
The worker configuration defines runtime bindings and environment variables:
- `main`: `./workers/app.ts` (worker entrypoint).
- `assets`: `./build/client` (static assets directory).
- `hyperdrive`: Hyperdrive binding named `HYPERDRIVE`.
- `vars`: Public non-secret environment variables (e.g. `ENVIRONMENT`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`).

### Setting Production Secrets
Secrets MUST NOT be committed to git or `wrangler.jsonc`. Use Cloudflare Wrangler CLI or Cloudflare Dashboard:
```bash
npx wrangler secret put STRIPE_SECRET_KEY --name foundation
npx wrangler secret put STRIPE_WEBHOOK_SECRET --name foundation
npx wrangler secret put RESEND_API_KEY --name foundation
npx wrangler secret put POSTHOG_KEY --name foundation
npx wrangler secret put SENTRY_DSN --name foundation
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name foundation
```

---

## 3. Database Migration vs Application Deployment

### Distinction Between Deployments
- **Application Deployment**: Uploads the compiled Worker code and static client assets to Cloudflare Workers edge network.
- **Database Migrations**: Alters PostgreSQL tables and indices. Migrations **never** execute inside the Cloudflare Worker runtime.

### Running Production Database Migrations
Migrations must be executed prior to or alongside application deployment from a secure build runner or CI operator using direct `DATABASE_URL`:
```bash
DATABASE_URL="postgresql://user:password@db-host:5432/dbname" npx tsx database/migrate.ts
```

### Hyperdrive Setup
1. Create a Hyperdrive configuration in Cloudflare dashboard pointing to your target PostgreSQL database.
2. Update `apps/foundation/wrangler.jsonc` with the Hyperdrive ID:
   ```json
   "hyperdrive": [
     {
       "binding": "HYPERDRIVE",
       "id": "your-hyperdrive-id"
     }
   ]
   ```

---

## 4. Application Deployment Workflow
1. **Verification**:
   Run the verification pipeline before deploying:
   ```bash
   npm test
   npm run typecheck
   npm run lint
   npm run build
   ```
2. **Deploy via Wrangler**:
   From `apps/foundation`:
   ```bash
   cd apps/foundation
   npx wrangler deploy
   ```

---

## 5. GitHub Actions / CI Integration
The repository includes `.github/workflows/ci.yml` which automatically validates pull requests and main branch pushes:
- Executes `lint`, `typecheck`, `test`, and `build`.
- Ensures build artifacts compile successfully without errors.

For automated deployment via GitHub Actions, configure a deployment job using `@cloudflare/wrangler-action` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` stored in repository secrets.

---

## 6. Production Verification & Monitoring
After deployment:
1. **HTTP Status Check**: Request the main application URL and verify HTTP 200 responses with rendered HTML.
2. **Observability**: Verify that Sentry (if configured) receives exception events without errors.
3. **Analytics**: Verify event delivery in PostHog dashboard.
4. **Logs**: Monitor Worker logs in real-time via `npx wrangler tail --name foundation`.

---

## 7. Rollback & Recovery Procedure
1. **Worker Code Rollback**:
   To revert to a previous worker deployment immediately:
   ```bash
   npx wrangler rollback --name foundation
   ```
2. **Database Migration Recovery**:
   Database migrations require forward-fix migrations or careful execution of down scripts. Never roll back database migrations automatically without verifying data integrity.
