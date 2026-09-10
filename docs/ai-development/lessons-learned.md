# AI Development Lessons Learned

This document serves as the permanent register of operational lessons, root-cause analyses, and process adjustments derived from AI-assisted development across all SaaS Factory products.

---

## Log Entry Template

When a non-trivial failure, hallucination, or architectural drift occurs during execution, document it using this standardized format:

```markdown
### [YYYY-MM-DD] - [Product / Milestone] - [Incident Title]

- **Date:** YYYY-MM-DD
- **Product:** SaaS Factory / Planning Infirmier / [Other]
- **Prompt:** [Filename or prompt identifier]
- **Problem:** Clear, factual description of the failure observed (build error, test failure, scope creep, or runtime exception).
- **What the AI Did:** Specific actions taken by the AI agent that triggered or exacerbated the problem.
- **Root Cause:** Fundamental technical or prompt-engineering reason behind the error (e.g., outdated package assumptions, underspecified prompt constraints, ambient environment differences).
- **Correction:** The surgical fix applied to resolve the immediate codebase error.
- **Prompt / Documentation Change:** Updates made to the prompt library, architecture documentation, or `.md` files to prevent recurrence in future sessions.
```

---

## Historical Incident Log

*(New incidents will be appended below as products and milestones are executed)*
