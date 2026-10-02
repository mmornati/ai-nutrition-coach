# No-Dark-Patterns Standard — AI Nutrition Coach v1

The no-pressure UX promise is enforceable, not aspirational. This
page is the named-reviewer QA gate (FR-15 / NFR3 / AD-7). Every PR
that touches user-facing copy is signed off against this list;
every release tag includes this standard at HEAD.

## Banned everywhere

The following patterns are **banned everywhere** in v1. They do
not ship. The named reviewer ticks each one off on every PR.

- **Streaks** — no consecutive-day counts, no "don't break your
  streak" copy, no streak-loss banners.
- **Countdowns** — no "X hours until your quota resets" timers, no
  "X days until…" aff ordances. Honest reset copy only ("the
  quota resets tomorrow" or "at <human-readable local time>").
- **Badges** — no earned badges, no level-ups, no unlockable
  cosmetics tied to usage.
- **Celebratory pop-ups** — no "great job!" modals, no
  confetti, no fireworks, no celebratory sound on a successful
  commit.
- **Push-notification re-engagement** — no "we miss you"
  notifications, no scheduled re-engagement nudges, no
  notifications-as-a-feature.
- **Card sprawl** — no card grid on the Day Board (UX-DR3 / NFR6);
  one hairline-divided vertical stack only.
- **Red-guilt states** — no red on failure (FR-15); muted amber
  only, and only as a calm accent; the failure state is the same
  mono voice as the rest of the chrome.
- **Resolve spinners** — no `CircularProgressIndicator` on the
  resolve path; a quiet inline shimmer at most (UX-DR6); the
  chip-flip is `Opacity`-only.

## Named reviewer

The named reviewer owns the pass on every PR that touches
user-facing copy. The reviewer is recorded in the PR thread and
the durable sign-off lives in the release artefact. v1's named
reviewer is the project's lead maintainer; the role is
documented in `CONTRIBUTING.md` and is the single sanctioned
authority for the gate.

## Gate frequency

- **Every PR that touches user-facing copy** — a PR that touches
  a file under `apps/client/lib/widgets/`, `apps/client/lib/screens/`,
  `apps/client/lib/l10n/app_en.arb`,
  `packages/integrations/lib/src/l10n/coach_strings.dart`, or any
  user-visible string in the docs requires a named-reviewer
  sign-off against this list.
- **Every release tag** — the release checklist
  ([`docs/release-checklist.md`](./release-checklist.md)) re-runs
  the gate end-to-end at tag time. The tag cannot ship until the
  sign-off is recorded.

## Surface where the gate is enforced

The gate has two enforcement surfaces:

1. **Code-level** — every user-facing string is keyed: UI copy in
   `apps/client/lib/l10n/app_en.arb` (`melos run check:i18n` rejects a
   literal handed straight to `Text(` / `tooltip:` / `label:` / ...), coach
   copy in `packages/integrations/lib/src/l10n/coach_strings.dart`. The
   banned widgets and words are pinned by
   `packages/integrations/test/no_dark_patterns_test.dart`.
   The key stores are the single source of truth; a new
   string is a new key, and the named-reviewer tick is required
   for the PR that introduces the key. The `en*` value in the
   same file is the canonical, calm, non-judgmental copy.
2. **Docs-level** — every user-facing privacy / posture claim in
   `docs/ai-tiers.md`, `docs/self-host.md`, `docs/your-data.md`,
   and `docs/telemetry-posture.md` is checked against this list.
   `melos run check:telemetry` pins the docs-vs-code invariant
   (Story 4.5).

## Cross-references

- [`docs/ai-tiers.md`](./ai-tiers.md) — the AI rung surface; same
  no-pressure promise.
- [`docs/telemetry-posture.md`](./telemetry-posture.md) — the
  privacy posture; the no-telemetry invariant is part of this
  gate.
- [`docs/self-host.md`](./self-host.md) — the self-host install;
  same posture.
- [`docs/release-checklist.md`](./release-checklist.md) — the
  release checklist; this standard is the gate.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — the contributor path;
  the named-reviewer sign-off lives here.
