---
Status: Draft
Factory compatibility: 1.x
Purpose: Template for authoring standardized, high-reliability SaaS Factory AI prompts
---

# [Prompt Title]

> **CRITICAL DIRECTIVES FOR AI AGENT:**
> 1. **Inspect the existing code before changing it.** Never assume file content, package versions, or directory structures.
> 2. **Do not silently substitute another architecture.** Adhere strictly to the locked decisions below. Never replace specified frameworks, ORMs, runtimes, or libraries with alternatives.

---

## 1. Purpose
State the single, unambiguous objective of this prompt in 1-2 concise paragraphs.

---

## 2. Context
Explain how this task fits into the larger SaaS Factory roadmap and repository structure. Reference relevant architectural decision records (ADRs) or design docs.

---

## 3. Preconditions
List the exact state that must exist in the repository prior to executing this prompt:
- [ ] Preceding milestone or prompt validated
- [ ] Dependencies installed and lockfile clean
- [ ] Specific directory or service available

---

## 4. Locked Decisions
Define immutable technical constraints for this task:
- **Language:** TypeScript (strict mode enabled)
- **Framework:** React Router v8 Framework Mode
- **Frontend:** React 19
- **Build:** Vite 7+
- **Runtime:** Cloudflare Workers
- **Database:** PostgreSQL (via Drizzle ORM when applicable)
- **Banned Technologies:** Express, Next.js, Hono (unless explicitly approved), Redis, Pinecone, complex UI kits (Material UI, Chakra, AntD).

---

## 5. Tasks
Provide a sequenced, numbered breakdown of implementation steps:
1. Step 1: Read existing context and inspect target files.
2. Step 2: Implement minimal required changes.
3. Step 3: Run validation checks (typecheck, tests, build).

---

## 6. Files Allowed to Change
Explicitly enumerate file paths or patterns that may be created or modified:
- `apps/foundation/...`
- `docs/...`

---

## 7. Files That Must Not Change
Enumerate protected files that the agent must leave untouched:
- `pnpm-workspace.yaml` (unless workspace packages are explicitly being added)
- Core architectural documentation unless updating implementation notes

---

## 8. Security Requirements
- Zero secrets committed to version control.
- All configuration values parameterized via environment variables documented in `.env.example`.
- Server secrets must never be exposed or bundled to client-side bundles.

---

## 9. Testing Requirements
Specify the exact verification suite required:
- [ ] Typecheck passes without errors (`pnpm typecheck`).
- [ ] Unit/integration tests pass (`pnpm test`).
- [ ] Production build succeeds (`pnpm build`).
- [ ] Local runtime verified (`pnpm dev` response check).

---

## 10. Documentation Requirements
Specify which documentation files must be created or updated:
- Update relevant architecture or implementation documents.
- Record any lessons learned or common failure modes encountered.

---

## 11. Acceptance Criteria
Checkbox list of conditions required for milestone completion:
- [ ] Criteria 1
- [ ] Criteria 2
- [ ] Criteria 3

---

## 12. Required Final Report
The AI agent must provide a structured final summary including:
1. Files created
2. Files modified
3. Dependencies added
4. Exact execution commands (install, dev, test, build)
5. Validation results (types, tests, build)
6. Explicit list of any deviations and technical rationale

---

## 13. Stop Condition
> **STOP CONDITION:** Stop immediately once all acceptance criteria are met. Do not proceed to future milestones or unrequested features.
