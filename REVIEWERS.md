# Reviewers

The OpenPlate v1 release pipeline is owned by a named reviewer.
The named-reviewer role is durable: a single person (or a small
rotating panel documented here) owns the No-Dark-Patterns
Standard sign-off at every PR that touches user-facing copy and at
every release tag.

## Named reviewer (v1)

- **Lead maintainer** — @openplate-maintainer
  - Owns the FR-15 / NFR-3 / AD-7 No-Dark-Patterns gate.
  - Records the durable sign-off in the PR thread + the release
    checklist (`docs/release-checklist.md`, Gate C).
  - Reviews every PR that touches user-facing copy
    (`packages/integrations/lib/src/l10n/coach_strings.dart`,
    `apps/client/lib/widgets/`, `apps/client/lib/screens/`,
    `docs/`).
  - Records the gate frequency on every release tag.

> The named reviewer is a single GitHub handle in v1. A rotating
> panel is a v1.1 follow-up — until then the lead maintainer is
> the sole sign-off authority. The handle is pinned in
> [`.github/CODEOWNERS`](../.github/CODEOWNERS).

## Gate frequency

- **Every PR that touches user-facing copy** — a named-reviewer
  sign-off is required before merge.
- **Every release tag** — the gate is re-run end-to-end and the
  sign-off is recorded in the release checklist.

## Sign-off protocol

The named reviewer ticks off the banned-everywhere list from
[`docs/no-dark-patterns-standard.md`](../docs/no-dark-patterns-standard.md):

1. Streaks
2. Countdowns
3. Badges
4. Celebratory pop-ups
5. Push-notification re-engagement
6. Card sprawl
7. Red-guilt states
8. Resolve spinners

A regression on any of these fails the build via the
`melos run check:release-posture` gate (Story 4.6) + the
`tools/check_adults_only.dart` static check (Story 5.1).

## Why this role exists

The No-Dark-Patterns Standard is enforceable, not aspirational.
The named-reviewer ownership is the durable artefact: it
transforms "we care about no-pressure UX" into a provable gate
with a single accountable human and a CI check that fails the
build on regression.

## Cross-references

- [`docs/no-dark-patterns-standard.md`](../docs/no-dark-patterns-standard.md)
  — the banned-everywhere list + the gate frequency.
- [`docs/release-checklist.md`](../docs/release-checklist.md) —
  the release checklist (Gate C).
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — the contributor path.
- [`.github/CODEOWNERS`](../.github/CODEOWNERS) — the GitHub-side
  ownership pinning.
