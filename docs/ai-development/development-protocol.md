# AI Development Protocol

This document establishes the mandatory protocol and behavioral constraints for any AI coding agent working within the SaaS Factory repository.

---

## The 17 Operational Directives

1. **Documentation is the Source of Truth:**
   The architectural specifications, Decision Records (ADRs), and product docs in `docs/` govern the system. An AI agent must never treat prompt text as an excuse to override documented architectural principles.

2. **Prompts are Implementation Instructions:**
   Prompts instruct the agent *how* to implement within already decided boundaries. Prompts must not introduce competing architectural paradigms.

3. **Inspect Before Modifying Code:**
   Before editing or generating code, the AI agent must thoroughly inspect existing files, packages, configuration files, and project layout. Never make assumptions based on standard templates or conventions.

4. **Do Not Invent Architecture:**
   Do not introduce speculative patterns, microservices, unnecessary abstraction layers, unrequested caching tiers, or external dependencies.

5. **Do Not Replace Locked Decisions:**
   Core technical choices (React Router v8 Framework Mode, React 19, Vite 7+, Cloudflare Workers, PostgreSQL, Drizzle ORM, pnpm workspaces) are locked. The agent is strictly forbidden from substituting them (e.g., swapping for Next.js, Express, Hono, Prisma, or TypeORM).

6. **Do Not Add Dependencies Without Authorization:**
   Every dependency adds maintenance and security overhead. Do not install additional npm packages or external libraries unless explicitly authorized by the active prompt or task specification.

7. **Always Check TypeScript Before Concluding:**
   Strict mode is required. Execute `pnpm typecheck` (or `react-router typegen && tsc`) and verify zero type errors exist before completing a task.

8. **Always Check Tests Before Concluding:**
   Run the test suite (`pnpm test`). Never conclude a task with broken or failing tests.

9. **Verify the Local Dev Server:**
   Verify that the local development server boots cleanly, binds to the designated host and port, and serves responsive pages without runtime crashes or console exceptions.

10. **Verify Production Build:**
    Ensure `pnpm build` completes cleanly, generating both client static assets and server worker bundles without unhandled build warnings or errors.

11. **Update Documentation When Decisions or Systems Evolve:**
    If an authorized change affects architectural structure, environment variables, or workflows, update the corresponding documentation files (`docs/`, `.env.example`, `README.md`) immediately.

12. **Stop After Completing the Requested Task:**
    Execute the exact scope requested. Do not add unsolicited features, secondary sidebars, extra pages, or speculative helper functions.

13. **Never Begin the Next Milestone Automatically:**
    Upon completing the current milestone or assigned prompt, the agent must halt and await user review. Proceeding into subsequent milestones without human review is strictly prohibited.

14. **Diagnose and Report Unexpected Problems:**
    If a build error, package incompatibility, or unexpected blocker occurs:
    - Diagnose the root cause objectively.
    - Report the problem concisely.
    - Propose a targeted, minimal fix.
    - If the fix would alter an architectural decision or introduce a new paradigm, stop and request approval.

15. **Report Completed Files Clearly:**
    Provide a concise, factual summary detailing:
    - Files created
    - Files modified
    - Verification commands run and their exact outcomes
    - Any deviations or residual risks.

16. **Report Any Remaining Risks:**
    Highlight potential edge cases, platform limitations, or downstream implications identified during development.

17. **Preserve Git-Friendly Repository State:**
    Maintain clean `.gitignore` rules. Never commit secrets, temporary build artifacts, `.wrangler/` caches, or generated lockfile artifacts outside the standard package manager workflow.
