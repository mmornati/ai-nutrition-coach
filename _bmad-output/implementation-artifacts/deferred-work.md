- source_spec: _bmad-output/implementation-artifacts/spec-1-1-scaffold-monorepo-and-build.md
  summary: Replace the deprecated `android.newDsl=false` and `android.builtInKotlin=false` flags in `apps/client/android/gradle.properties` that the Flutter template ships with — both are obsolete on current AGP.
  evidence: Review flagged that these flags predate Flutter's current Android build pipeline and can break modern plugin discovery. Scaffold-only artifact; defer until a build-modernization pass.
- source_spec: _bmad-output/implementation-artifacts/spec-1-1-scaffold-monorepo-and-build.md
  summary: LICENSE, CONTRIBUTING, CODEOWNERS, SECURITY.md, .editorconfig, .nvmrc at the repo root.
  evidence: LICENSE is FR12 (story 4.6). CONTRIBUTING + the No-Dark-Patterns Standard sign-off are also story 4.6. None belong in the scaffold.
- source_spec: _bmad-output/implementation-artifacts/spec-1-1-scaffold-monorepo-and-build.md
  summary: Real CHANGELOG.md entries for `packages/domain_core` and `packages/integrations` recording the AD-1 invariant and the AD-3 derivation seam.
  evidence: Scaffold leaves the auto-generated `## 0.1.0` header. Real changelog entries land with each package's first release.
- source_spec: _bmad-output/implementation-artifacts/spec-1-1-scaffold-monorepo-and-build.md
  summary: A dark-mode `launch_background.xml` variant for legacy Android (API <21).
  evidence: Review found no `drawable-night/launch_background.xml` mirroring the v21 night-mode variant. Defer to the accessibility pass (story 5.4).
- source_spec: _bmad-output/implementation-artifacts/spec-1-1-scaffold-monorepo-and-build.md
  summary: Release signing config for the Android `release` build type.
  evidence: Scaffold ships the Flutter template `release` block, which inherits the debug keystore. Defer to a release-engineering pass.
- source_spec: _bmad-output/implementation-artifacts/spec-1-1-scaffold-monorepo-and-build.md
  summary: First CI run will fail `melos run format:check` because the scaffold files are not `dart format`-clean.
  evidence: The scaffold (Flutter iOS/Android/web templates) is not formatted, and `format:check` runs verbatim from CI. Either run `dart format .` locally + commit the diff before the first merge, or drop the format check from the CI gate until story 1.2 lands the first domain code.
- source_spec: _bmad-output/implementation-artifacts/spec-1-1-scaffold-monorepo-and-build.md
  summary: `apps/client/lib/theme/app_tokens.dart` has an unused private constructor `AppPalette._()` that the analyzer flags as `unused_element`.
  evidence: Cosmetic; a one-line `// ignore: unused_element` or removing the constructor cleans it up. Not in the patch list — flagging for a tidy pass.
- source_spec: _bmad-output/implementation-artifacts/spec-1-6-capture-sheet-fan-out.md
  summary: Four pre-existing date-sensitive tests in `apps/client/test/day_board_screen_test.dart` hard-code `DateTime(2026, 8, 15, ...)` and fail today (2026-08-16) — confirmed to fail identically at the pre-story baseline (`3b24994`).
  evidence: Tests at `apps/client/test/day_board_screen_test.dart:72,92,98,104,187,244` seed plates dated `DateTime(2026, 8, 15, ...)` while the running clock reads `2026-08-16`. The day_board_provider's local-day filter excludes the seeded plate, leaving zero `PlateRow` widgets. The fix is mechanical — replace hard-coded dates with `DateTime.now()`-relative dates — but out of scope for story 1.6 (no 1.6 code drives those tests).
- source_spec: _bmad-output/implementation-artifacts/spec-2-1-coach-taxonomy-and-localization-key-store.md
  summary: `coachProvider` defensive seam relies on `thrown.toString().contains(...)` substring matching (Riverpod 3.x wraps thrown errors in `ProviderException`).
  evidence: `apps/client/test/state/coach_provider_test.dart:62-64` asserts `'coachProvider must be overridden'` and `'UnimplementedError'` substrings rather than the wrapped exception type. Brittle if Riverpod changes its wrapping behavior. Defer to the Riverpod upgrade / test-helper pass; the seam is sound, only the assertion is fragile.
- source_spec: _bmad-output/implementation-artifacts/spec-2-1-coach-taxonomy-and-localization-key-store.md
  summary: `TemplateCoach` returns `NoCoachQuestion` only on missing map entry, not on empty `text`.
  evidence: `packages/integrations/lib/src/coach/template_coach.dart:51-55` collapses `null` to `NoCoachQuestion` but returns `CoachFound(question)` even when `question.text` is empty (an empty entry that slipped past review). The v1 entries are non-empty by construction and `template_coach_test.dart` asserts non-empty at build time, so the EMPTY_KEY_STORE row of the I/O matrix is satisfied vacuously.
- source_spec: _bmad-output/implementation-artifacts/spec-2-1-coach-taxonomy-and-localization-key-store.md
  summary: `bannedFragments` list in `template_coach_test.dart` is curated for v1 and missing some dark-pattern terms (`ideal`, `should`, `limit`, `track`, `avoid`, `unhealthy`).
  evidence: `packages/integrations/test/template_coach_test.dart:62-78`. Current copy is genuinely calm so the gap is latent, but a v1.5 expansion will need a fuller banlist.
- source_spec: _bmad-output/implementation-artifacts/spec-2-1-coach-taxonomy-and-localization-key-store.md
  summary: Three pairs of entries share the same `text` across both anchors (`starchHeavy`, `proteinHeavy`, `vegRich`).
  evidence: `packages/integrations/lib/src/l10n/coach_strings.dart`. `post.resolve.starchHeavy` and `openPlate.starchHeavy` are byte-identical, as are `proteinHeavy` and `vegRich` pairs. Reuse is fine since the suggestion applies equally, but a reviewer/redactor pass should confirm.
- source_spec: _bmad-output/implementation-artifacts/spec-2-1-coach-taxonomy-and-localization-key-store.md
  summary: No sentinel test asserts the AI_OFF_ACTIVE row's "no network call" claim.
  evidence: Spec I/O matrix row AI_OFF_ACTIVE states coach questions resolve from the key store and never touch the network. Structural absence of `package:dio`/`http` imports in `packages/integrations/lib/src/coach/` and `packages/integrations/lib/src/l10n/` covers it; a runtime sentinel test would be valuable but low-priority.
