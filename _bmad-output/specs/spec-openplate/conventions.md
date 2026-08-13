# Conventions

## Naming

- Domain entities in `domain_core`: PlateLog, FoodEntry, DatabaseFood, CoachNote, CoachQuestion; ports named by role (`FoodCatalog`, `Exporter`, `AiRung`); files kebab-case; packages snake_case.

## Data & formats

- Local DB ids: autoincrement ints; external refs kept verbatim: OFF barcode strings, USDA FDC id strings.
- Dates: UTC ISO-8601, rendered in local time.
- Quantities: stored as honest ranges ("~2 fists"), never false-exact kcal.
- Errors: typed domain results (nearest-match, not-found, quota-exhausted), never raw exceptions crossing ports.

## State & cross-cutting

- One mutation path through use-cases (AD-3); Riverpod providers are read-only views.
- No account in v1 (single local identity); telemetry off by default in all shipped builds (FR-12).
- Coach strings via localization key store (AD-7), never hardcoded/interpolated in widgets.
- Status chips (`· local` / `· pending` / `· synced`) derive from sync queue state (AD-6).