# AI Nutrition Coach — v2 managed-oversight seam (Story 5.2 / FR-14 / OQ-4)

The parent/guardian managed-oversight concept is a **declared v2
seam**. It is not in v1. The architecture documents the future
intent so the v2 feature is not precluded, but no v1 implementation
ships — the feature is phase-blocked pending COPPA / privacy-law
review (PRD OQ-4).

## What the seam declares

- **Read-only-from-guardian.** The v2 seam is guardian-initiated
  read-only access, framed as support not surveillance. A
  guardian reads the plate history their household logs; the
  guardian does not write to it. No teen / under-13 profile is
  ever produced by the surface.
- **No biometric identification.** The FR-13 invariant extends to
  v2: no face-detection, no voice-print, no biometric API. The
  seam carries the same adults-only + no-biometric promise
  forward.
- **Support not surveillance.** The v2 surface is explicitly
  framed as a calm support affordance — a guardian's ability to
  see what was logged, not a surveillance tool. No notifications,
  no alerts, no "did you know" copy.

## Why v1 ships no implementation

COPPA's 2025 amendments now treat biometric identifiers as
"personal information" and require verifiable parental consent for
third-party disclosure. The Kurbo $1.5M FTC settlement (including
algorithmic disgorgement) shows the trap in the age-gate that
"encourages lying." A managed-oversight surface that ships before
the privacy-law review is complete is a regulatory risk that v1
does not accept.

The architecture carries the seam forward via a marker
(`ManagedOversightSeam` in `packages/core/src/value-types`, pinned by
`packages/core/test/managed-oversight-seam.test.ts`)
so the v2 implementation can land without an architectural change.

## What this means for v1 copy

- **The Settings → About sub-screen renders a single calm line:**
  *"Family oversight is a v2 seam — not in v1. Read-only,
  support-not-surveillance, pending COPPA review."* The copy is
  keyed in `apps/web/src/i18n/en.ts`.
- **No "coming soon", no countdown, no celebratory pop-up.** The
  FR-15 ban list applies to v2 seam copy as much as to anything
  else — the seam is documented plainly, not promoted.
- **No family / parent / teen framing in v1.** The surface stays
  neutral on family composition; the seam is declared, not
  promoted.

## Static enforcement

- `tools/check_adults_only.mjs` walks the source tree
  and rejects `under13`, `childProfile`, `minorAccount`,
  `teenAccount`, `parentAccount`, `ageGate`, `birthDate`, and the
  PascalCase variants. The `ManagedOversightSeam` marker is the
  only allowed reference.
- `pnpm verify` chains the static check
  alongside the existing telemetry + release-posture checks. A
  regression fails the build.

## Cross-references

- [`docs/adults-only.md`](./adults-only.md) — the FR-13
  invariant (Story 5.1).
- [`docs/no-dark-patterns-standard.md`](./no-dark-patterns-standard.md)
  — the named-reviewer gate (Story 4.6 + Story 5.3 / FR-15).
- [`docs/telemetry-posture.md`](./telemetry-posture.md) — the
  privacy posture (Story 4.5 / FR-12).
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — the contributor path
  + the gate frequency.
