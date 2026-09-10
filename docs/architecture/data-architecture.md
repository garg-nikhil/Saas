# Data Architecture & Product Schema Specification

## 1. Schema Hierarchy & Separation of Concerns

The database schema is partitioned into two distinct architectural domains:

### Factory Core Tables (Platform Foundation)
Managed by the SaaS Factory infrastructure:
- `profiles`: Application-level user account and identity record.
- `subscriptions`: Subscription status, tier, and provider billing state.
- `entitlements`: Feature flags and capability overrides per account.
- `audit_logs`: Immutable security and action tracking.
- `notifications`: Alerting and communication dispatch queue.

### Planning Infirmier Product Tables
Product-specific business data layer:
- `nurse_profiles`: User healthcare profession preference (IDE, IADE, IBODE, IPDE, AS, Cadre, Autre).
- `shift_types`: User-owned or system-default shift categories (Matin, Après-midi, Nuit, 12h, Journée, Repos, Congé).
- `shifts`: Individual planned work shifts linked to calendar dates and shift types.
- `recurring_shifts`: Schedule recurrence rules (defining repeating patterns without auto-generating future shift rows).
- `salary_profiles`: User salary inputs (hourly/monthly rates, contracted hours, bonus multipliers for night, Sunday, holiday, overtime).

---

## 2. Ownership & Identity Boundary

Every product-owned table enforces strict account isolation using foreign key constraints back to `profiles.id`:

```
Authenticated Request (Supabase Auth)
    ↓
getUser() / verified user.id
    ↓
requireAuth() -> Profile lookup
    ↓
profile.id (UUID)
    ↓
Target Query (WHERE profile_id = profile.id)
```

- **Client Identifier Protection**: Client-provided ownership IDs are never trusted. Ownership is derived exclusively from the server-validated user identity.
- **Cascading Deletes**: When a user profile is deleted, all dependent product records (`shift_types`, `shifts`, `recurring_shifts`, `salary_profiles`) are automatically purged via `ON DELETE CASCADE`.

---

## 3. Detailed Schema Specifications

### `shift_types`
Represents shift categories used for schedule planning.
- `id` (UUID, PK)
- `profile_id` (UUID, FK -> `profiles.id`, ON DELETE CASCADE, NULL for global default templates)
- `name` (TEXT, NOT NULL)
- `short_code` (TEXT)
- `start_time` (TEXT, e.g. "06:45")
- `end_time` (TEXT, e.g. "14:15")
- `color` (TEXT, display color)
- `is_work` (BOOLEAN, DEFAULT true)
- `is_active` (BOOLEAN, DEFAULT true)
- `metadata` (JSONB)
- `created_at`, `updated_at` (TIMESTAMPTZ)

### `shifts`
Represents individual planned shift instances on specific calendar dates.
- `id` (UUID, PK)
- `profile_id` (UUID, FK -> `profiles.id`, ON DELETE CASCADE, NOT NULL)
- `shift_type_id` (UUID, FK -> `shift_types.id`, ON DELETE SET NULL)
- `date` (DATE, format "YYYY-MM-DD", NOT NULL)
- `start_time` (TEXT, e.g. "22:00")
- `end_time` (TEXT, e.g. "07:00")
- `notes` (TEXT)
- `created_at`, `updated_at` (TIMESTAMPTZ)
- *Note on Overnight Shifts*: Overnight shifts (e.g. 22:00 -> 07:00) store `start_time` and `end_time` directly on the shift date. Precomputed duration is strictly non-authoritative and derived dynamically by domain engines.

### `recurring_shifts`
Defines recurrence rule patterns for repeating schedules.
- `id` (UUID, PK)
- `profile_id` (UUID, FK -> `profiles.id`, ON DELETE CASCADE, NOT NULL)
- `shift_type_id` (UUID, FK -> `shift_types.id`, ON DELETE SET NULL)
- `name` (TEXT)
- `start_time`, `end_time` (TEXT)
- `frequency` (TEXT, e.g. "weekly", "biweekly", "monthly", DEFAULT "weekly")
- `interval` (INTEGER, DEFAULT 1)
- `days_of_week` (JSONB, e.g. `[1, 3, 5]`)
- `start_date` (DATE, NOT NULL)
- `end_date` (DATE)
- `is_active` (BOOLEAN, DEFAULT true)
- `notes` (TEXT)
- `created_at`, `updated_at` (TIMESTAMPTZ)

### `salary_profiles`
Input data store for future salary calculation engines.
- `id` (UUID, PK)
- `profile_id` (UUID, FK -> `profiles.id`, UNIQUE, ON DELETE CASCADE, NOT NULL)
- `base_hourly_rate` (NUMERIC(10, 2))
- `base_monthly_salary` (NUMERIC(10, 2))
- `contracted_hours_per_week` (NUMERIC(5, 2))
- `night_bonus_rate` (NUMERIC(5, 2))
- `sunday_bonus_rate` (NUMERIC(5, 2))
- `holiday_bonus_rate` (NUMERIC(5, 2))
- `overtime_bonus_rate` (NUMERIC(5, 2))
- `currency` (TEXT, DEFAULT 'EUR')
- `metadata` (JSONB)
- `created_at`, `updated_at` (TIMESTAMPTZ)

---

## 4. Architectural Decisions & Key Assumptions

1. **Overnight Shift Representation**: `start_time` and `end_time` are stored as strings (e.g., "22:00", "07:00"). No precalculated duration column exists in SQL; calculation is handled at runtime.
2. **Recurrence Rules vs. Instances**: `recurring_shifts` stores schedule rules only. No background workers or cron jobs generate future shift rows in advance.
3. **Pure Salary Inputs**: `salary_profiles` holds raw rate and bonus multiplier inputs. No French payroll legislation or calculation logic is embedded in database triggers or SQL procedures.
4. **Idempotent Seed Pattern**: Default shift types (Matin, Après-midi, Nuit, 12h, Journée, Repos, Congé) are seeded via `seedDefaultShiftTypes(db, profileId)` which checks existing types before inserting, guaranteeing idempotency.

---

## 5. Shift Domain Engine Invariants (Milestone 5B)

1. **Pure Functional Domain Module**: `apps/foundation/app/domain/planning/shifts/` provides deterministic, zero-dependency calculation utilities for time validation, overnight detection, shift duration, and formatting.
2. **Canonical HH:mm Validation**: All temporal inputs must pass strict 24-hour `HH:mm` format validation (e.g. `00:00` to `23:59`). Invalid formats or non-string values return structured domain errors.
3. **Integer Minute Durations**: Shift duration is internally represented as integer minutes to eliminate floating-point ambiguity.
4. **Overnight Calculation**: Shifts where `end_time < start_time` (e.g. `22:00` → `07:00`) cross midnight and calculate duration across the 24-hour boundary (`(1440 - start) + end = 540` minutes) without modifying stored database dates.
5. **Equal Time Prohibition**: Equal start and end times (e.g. `08:00` → `08:00`) are rejected with `INVALID_SHIFT_DURATION` to prevent ambiguous zero-minute or 24-hour shifts.
6. **Null/Missing Times**: Non-working shift types or unconfigured times return `MISSING_TIME_INPUTS` rather than coercing values to midnight.
7. **No External Dependencies or Date Parsing**: Time calculations operate directly on clock minute arithmetic without JavaScript `Date` objects, timezone offsets, or external libraries.

---

## 6. Recurrence Domain Engine Invariants (Milestone 5C)

1. **Pure Functional Recurrence Module**: `apps/foundation/app/domain/planning/recurrence/` provides zero-dependency, timezone-independent recurrence date generation.
2. **Canonical Recurrence Frequencies**: V1 explicitly supports `daily` and `weekly` recurrence frequencies with positive integer `interval` spacing.
3. **Timezone-Independent Calendar Arithmetic**: Occurrence dates are represented as ISO `YYYY-MM-DD` strings computed via pure integer calendar arithmetic (no `Date` object timezone conversions).
4. **Inclusive Boundaries**: Both `startDate` and `endDate` (if present), as well as window parameters `from` and `to`, are strictly inclusive.
5. **Weekly Anchor Convention**: Weekly schedules calculate occurrences relative to the anchor week containing `startDate`. `daysOfWeek` integers (0=Sunday, 1=Monday... 6=Saturday) are deduplicated and output in chronological order.
6. **Bounded Range Safeguards**: Infinite sequence generation is prohibited. All generation calls require bounded `from`/`to` windows and enforce a maximum day span safeguard (default 1095 days).
7. **No Side Effects or Persistence**: The engine evaluates rules and returns occurrence date arrays without modifying database records, mutating rule objects, or triggering background jobs.


