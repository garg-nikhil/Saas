# ADR-001: Selection of Cloudflare Workers as Edge Runtime

## Status
Accepted

## Date
2026-09-09

## Context
The SaaS Factory requires an infrastructure runtime to host and execute web applications built across multiple localized markets. Key operational and technical requirements include:
1. **Low Operational Overhead:** No persistent servers, Kubernetes clusters, or VM patching.
2. **Minimal Latency:** Fast global response times for server-side rendering (SSR) and dynamic interactions.
3. **Cost Efficiency:** Extremely low baseline fixed costs with generous free and pay-as-you-grow pricing tiers.
4. **Fast Cold Starts:** Sub-10ms invocation times, avoiding the 1-3 second cold starts typical of containerized lambdas.
5. **Integrated Asset Distribution:** Global CDN delivery of static bundles without separate CDN configuration.

## Decision
We select **Cloudflare Workers** (running on the `workerd` runtime) with Cloudflare Workers Static Assets as the standard edge execution platform for all SaaS Factory products.

The application build pipeline leverages the official `@cloudflare/vite-plugin` alongside Wrangler configuration (`wrangler.jsonc`).

## Consequences

### Positive
- **Instantaneous Invocations:** Worker isolates spin up in milliseconds globally.
- **Unified Delivery:** Server-rendered HTML and client static assets are handled seamlessly within a single Cloudflare Worker deployment.
- **Cost Minimization:** Minimizes infrastructure expenses for early-stage and micro-SaaS products before revenue traction.
- **Standards-Compliant:** Uses native Web Standard APIs (`Request`, `Response`, `FetchEvent`, `Streams`).

### Negative & Tradeoffs
- **Edge Runtime Constraints:** Node.js built-ins (`fs`, `child_process`) are not natively available; code must rely on Web Standards or Cloudflare Node compatibility flags.
- **Connection Pooling:** Direct TCP socket connections to external relational databases require connection pooling proxies (e.g., Supabase Transaction Pooler, Neon serverless driver, or Hyperdrive).
