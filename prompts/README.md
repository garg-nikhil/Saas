# SaaS Factory Prompt Library

## 1. Why the Prompt Library Exists

In the SaaS Product Factory, AI development prompts are not ephemeral chat messages or informal scratchpads. They are **first-class, version-controlled software assets** treated with the same discipline as code, schemas, and architecture documentation.

The objective of the SaaS Factory is to produce independent, localized SaaS products (such as *Planning Infirmier* and future offerings) faster, more reliably, and at lower cost. Achieving this requires eliminating the repetition of prompting from scratch for every product.

The Prompt Library exists to:
- Codify proven implementation instructions into structured, reusable templates.
- Enforce architectural boundaries and locked technical decisions across AI agent sessions.
- Provide predictable, repeatable instructions that prevent architectural drift or hallucinated dependencies.
- Turn lessons learned from AI development iterations into hardened constraints for subsequent products.

---

## 2. Conceptual Organization

The library is organized into four distinct tiers:

```
prompts/
├── README.md
├── 00-foundation/          # Reusable factory infrastructure prompts
│   ├── 01-project-bootstrap.md
│   ├── 02-cloudflare.md
│   └── 03-database.md
├── 01-product/             # Reusable patterns for product-specific domains
│   └── .gitkeep
├── 02-maintenance/         # Maintenance, bugfix, refactoring, and security prompts
│   └── .gitkeep
└── templates/              # Standardized prompt templates for new prompts and products
    └── prompt-template.md
```

### Hierarchy Descriptions
1. **`00-foundation/`**: Factory-level prompts that configure portable infrastructure common to all SaaS products. Examples include workspace bootstrapping, Cloudflare Workers deployment, database adapters, authentication adapters, payment gateways, and transactional email.
2. **`01-product/`**: Prompts guiding the implementation of product-specific domain logic (e.g., shifts, scheduling algorithms, local labor compliance).
3. **`02-maintenance/`**: Standardized prompts for operational tasks, including dependency upgrades, vulnerability patching, database schema migrations, and performance profiling.
4. **`templates/`**: Boilerplates providing required structures, safety rails, and stop conditions for authoring new prompts.

---

## 3. Prompt Philosophy & Source of Truth

The prompt system follows a strict hierarchy:

```
PRODUCT REQUIREMENTS
        ↓
   ARCHITECTURE
        ↓
IMPLEMENTATION PROMPT
        ↓
    AI CODING AGENT
        ↓
      CODE
        ↓
     TESTS
        ↓
  DOCUMENTATION
```

- **Architecture Documentation is the Source of Truth:** Prompts must never redefine, contradict, or duplicate lengthy architectural justifications. The architecture documentation records *why* a technology was chosen; the prompt instructs the AI agent on *how* to implement within those locked constraints.
- **Inspect Before Editing:** Prompts mandate that agents inspect existing files before proposing or writing code.
- **No Unsolicited Abstractions:** Prompts forbid speculative libraries, alternative runtimes, or unrequested framework substitutions.

---

## 4. Factory Prompts vs. Product Prompts

- **Factory Prompts:** Reusable across multiple independent products. They implement generic adapters, base layouts, CI/CD pipelines, and infrastructure layers.
- **Product Prompts:** Specific to a single product's business domain (e.g., French nurse shift planning rules, collective agreement calculations).
- **Promotion Rule:** A product prompt is **never** promoted to a factory prompt simply because it worked once. A prompt is promoted to `00-foundation` only when a stable, domain-agnostic abstraction has been extracted and validated across more than one implementation context.

---

## 5. Versioning & Lifecycle Metadata

Prompts are versioned directly through Git history. Filenames remain simple and permanent (e.g., `01-project-bootstrap.md`), avoiding artificial version suffixes (such as `-v2-final.md`).

Every reusable prompt contains a standardized metadata block at the top:

```markdown
---
Status: Draft | Validated | Deprecated
Factory compatibility: 1.x
Last validated: YYYY-MM-DD (or omitted if Draft)
Purpose: Concise description of prompt objective
---
```

### Lifecycle States:
- **`Draft`**: Newly drafted prompt, not yet verified end-to-end against a running codebase. Validation dates must never be fabricated.
- **`Validated`**: Executed successfully by an AI agent; tests, builds, and architectural criteria passed without human intervention.
- **`Deprecated`**: Superseded by updated factory architecture. Kept for historical reference.
