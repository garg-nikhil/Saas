# Common AI Failure Modes & Countermeasures

This document catalogs recurring failure modes observed when AI coding agents implement features in the SaaS Factory repository, alongside explicit guardrails to prevent them.

---

## 1. Architectural Drift & Unauthorized Substitutions
- **Failure Mode:** Replacing designated frameworks (e.g., substituting Next.js, Remix classic, or Express when React Router v8 Framework Mode is specified; substituting Prisma for Drizzle).
- **Impact:** Breaks edge deployment compatibility on Cloudflare Workers and fragments the codebase.
- **Guardrail:** Locked technical decisions in prompts and architecture documents are strictly non-negotiable. Any AI attempting to replace locked technologies must be rejected.

## 2. Hallucinated File Content & Blind Overwrites
- **Failure Mode:** Rewriting or editing files based on outdated training assumptions rather than calling file inspection tools on actual repository contents.
- **Impact:** Erases critical configurations, breaks pnpm workspace links, and introduces syntax mismatches.
- **Guardrail:** AI Protocol Rule 3: Always inspect files and read dependencies before drafting or applying edits.

## 3. Premature Implementation & Scope Creep
- **Failure Mode:** Generating complete authentication logic, payment endpoints, or complex business logic during early foundation milestones where simple placeholders were requested.
- **Impact:** Bloats the repository with unvalidated code, increases surface area for bugs, and violates prompt boundaries.
- **Guardrail:** Strict stop conditions and acceptance checklists. Anything outside the prompt tasks is considered an error.

## 4. Speculative Dependency Sprawl
- **Failure Mode:** Installing redundant packages (e.g., Axios when native `fetch` suffices; heavy UI component systems when minimal CSS is specified; Lodash for simple array operations).
- **Impact:** Drastically inflates bundle sizes, degrades edge cold starts, and introduces security vulnerabilities.
- **Guardrail:** No dependencies may be added without explicit justification in the active prompt.

## 5. Bypassing Type and Build Verification
- **Failure Mode:** Concluding turns or declaring victory without running `tsc`, `vitest`, or `react-router build`.
- **Impact:** Uncaught type mismatches and broken imports break production CI/CD pipelines.
- **Guardrail:** AI Protocol Rules 7 & 8: `pnpm typecheck`, `pnpm test`, and `pnpm build` must be executed and confirmed green before concluding any prompt.

## 6. Secret Leaks & Hardcoded Credentials
- **Failure Mode:** Hardcoding development tokens, database passwords, or API keys directly into source code.
- **Impact:** Catastrophic security breach when code is committed.
- **Guardrail:** Enforce `.env.example` parameterization. Never place real credentials in repository files.
