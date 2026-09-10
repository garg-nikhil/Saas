# ADR-007: Product-Specific Profession Persistence via Nurse Profiles

## Status
Accepted

## Date
2026-09-10

## Context
In Planning Infirmier, users select their nursing/healthcare profession during initial onboarding (e.g., IDE, IADE, IBODE, IPDE, AS, Cadre, Autre).

The SaaS Factory architecture strictly partitions database schemas into:
1. Platform Core Tables (`profiles`, `subscriptions`, `entitlements`, `audit_logs`, `notifications`) — product-neutral platform infrastructure.
2. Product Domain Tables (`shift_types`, `shifts`, `recurring_shifts`, `salary_profiles`, etc.) — product-specific domain state.

Adding vertical healthcare fields (such as nursing profession enum values) directly to the platform `profiles` table would pollute the product-neutral user identity model and break isolation for future non-healthcare SaaS Factory applications.

## Decision
We create a dedicated product-specific profile table `nurse_profiles` in `apps/foundation/app/db/schema/planning/nurse-profiles.ts`.

- `nurse_profiles.profile_id` references `profiles.id` with `UNIQUE` and `ON DELETE CASCADE`.
- `nurse_profiles.profession` stores the validated canonical profession code (`IDE`, `IADE`, `IBODE`, `IPDE`, `AS`, `Cadre`, `Autre`).
- Server-side validation strictly enforces canonical profession codes and rejects invalid inputs prior to database persistence.

## Consequences

### Positive
- **Platform Decoupling:** The generic Factory `profiles` table remains product-neutral.
- **Domain Isolation:** Healthcare-specific preferences are cleanly encapsulated in the `planning` schema.
- **Data Integrity:** Cascade deletion and foreign key constraints maintain relational cleanliness.

### Negative & Tradeoffs
- Requires a two-table join or secondary query during user session hydration to retrieve both base profile identity and nurse domain metadata.
