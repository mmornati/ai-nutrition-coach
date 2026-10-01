---
id: SPEC-openplate
companions:
  - stack.md
  - conventions.md
  - ../planning-artifacts/architecture/architecture-openplate-2026-08-13/ARCHITECTURE-SPINE.md
  - ../planning-artifacts/ux-designs/ux-openplate-2026-08-13/DESIGN.md
  - ../planning-artifacts/ux-designs/ux-openplate-2026-08-13/EXPERIENCE.md
sources:
  - ../planning-artifacts/prds/prd-openplate-2026-08-12/prd.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# OpenPlate v1

## Why

A pain + an opportunity + a vision to realize, in that order. MyFitnessPal moved core photo logging behind a paywall (2026-05-01) amid live class-actions and a 2018 breach of 150M+ accounts — opening a migration window for the adult who cooks and wants a family nutrition tool that is **yours to run**. OpenPlate claims an unclaimed cell: a **coach, not a calculator** that behaves like a calm kitchen friend — one tap on a photo, barcode, or typed note logs a meal, then asks a question that teaches ("how's the balance across your plate?") instead of printing a guilt trip and a number. The thesis: not all calories are equal, and a family's eating improves more through understanding than counting. The trust mechanic is architecture, not promise: local-first encrypted data, no account, no telemetry by default, no hosted backend in v1, self-hostable — the fact that we cannot breach your data is an architecture choice.

## Capabilities

- **CAP-1 Photo logging**
  - **intent:** User can log a Plate Log by photographing the plate; the system recognizes foods and resolves them to Database Foods with honest quantity ranges.
  - **success:** A single well-lit plate photo returns recognized Food Entries in ≤3s on a midrange device; ambiguous photos fall back to pick-from-closest-matches or manual entry without failing the log; quantities shown as honest ranges ("~2 fists"), never false-exact kcal. (FR-1, UJ-1)
- **CAP-2 Barcode logging**
  - **intent:** User can log a Database Food by scanning its barcode via Open Food Facts lookup (no API key for reads).
  - **success:** Known barcode resolves to a Database Food in ≤2s; unknown barcode reaches a graceful "not found" state with a manual-add path. (FR-2, UJ-2)
- **CAP-3 Manual/voice logging**
  - **intent:** User can log a Plate Log by typing or voice-inputting a food name; the system resolves it against Database Foods and lets the user adjust quantity.
  - **success:** Partial text ("salmon") returns ranked matches with quantity presets; manual logging stays fully available with the AI tier off and offline. (FR-3, UJ-5)
- **CAP-4 Coach Note generation**
  - **intent:** After a Plate Log resolves, the system generates a Coach Note containing one Coach Question about balance/composition in plain, non-judgmental language.
  - **success:** Every resolved Plate Log can produce a Coach Note (AI on: richer; AI off: template-based on resolved food groups); notes never contain calorie-shaming, streak-pressure, or restriction framing. (FR-4, UJ-1)
- **CAP-5 Coach Question interaction**
  - **intent:** User can answer, dismiss, or request more depth on a Coach Question.
  - **success:** Answering produces a bounded follow-up Coach Note (one response, not a conversational loop); dismissing records no score/streak/guilt; the interaction is logged locally only. (FR-5, UJ-1, UJ-4)
- **CAP-6 AI tier ladder**
  - **intent:** User can opt into AI tutoring through a free-model quota (default) or a bring-your-own-key rung; the no-AI core stays complete and undegraded.
  - **success:** Quota exhaustion downgrades to the no-AI core with a plain-language choice (keep logging without AI / bring your own key / wait for reset) — zero pressure; BYOK key is stored encrypted on-device, never transmitted to any server, and removing it returns the app cleanly to the previous rung. (FR-6, FR-7, UJ-3, UJ-4)
- **CAP-7 Local-first encrypted data**
  - **intent:** System stores all Plate Logs and Coach Note history in an encrypted local store with no server-side mirror and no account requirement, and can export them in a portable format.
  - **success:** Full feature set works with network revoked; at-rest data encrypted (ChaCha20-Poly1305 on mobile; platform-aware); CSV/JSON export available offline. (FR-9, UJ-1, UJ-5)
- **CAP-8 Sync**
  - **intent:** User can sync their local store across their own devices via a mechanism that keeps data on user-controlled infrastructure only.
  - **success:** No third-party sync; sync never drops or duplicates a Plate Log; retries silently on reconnection; a log flips to synced only after durable remote acknowledgment. (FR-10, UJ-5)
- **CAP-9 Self-host & OSS**
  - **intent:** A non-expert can install and run OpenPlate on their own server with a single documented command; a responsive web client is served; the repository is public at launch with a permissive FOSS license and a documented No-Dark-Patterns Standard.
  - **success:** Standard Docker host → one-command install brings the web client up against the local store in ≤5 min (CI smoke-tested); LICENSE, CONTRIBUTING, and a published No-Dark-Patterns Standard exist at tag time; telemetry off by default in all shipped builds. (FR-11, FR-12, UJ-3)
- **CAP-10 Adults-only & no-dark-patterns enforcement**
  - **intent:** v1 offers no child accounts, collects no data attributable to known children, uses no biometric identification, and no surface uses countdown pressure, fabricated urgency, streak-guilt, reward-bait, or age-lying nudges.
  - **success:** No signup flow can produce an under-13 profile; no face/voice-print recognition anywhere in the pipeline; the No-Dark-Patterns Standard is enforced as a QA checklist gate in CI/review with a named reviewer owning the pass. (FR-13, FR-15)

## Constraints

- **AD-1** Shared pure-Dart domain core (`packages/domain_core`), no Flutter/SQLite/HTTP imports; `apps/client` and `packages/integrations` depend on it, it depends on nothing; UI never imports drift/dio/mobile_scanner directly — only through ports.
- **AD-2** One responsive Flutter codebase for iOS/Android/web; `flutter build web` serves the self-host client; desktop deferred, not a separate codebase.
- **AD-3** Local encrypted store is the single source of truth: every domain mutation flows through a core use-case that commits before UI reflects it; Riverpod UI state is derived, never a second source; sync reads from the store and never writes outside it.
- **AD-4** One `FoodCatalog` port in front of OFF + USDA with a local cache adapter; photo, barcode, and manual/voice entry paths all call the same port.
- **AD-5** AI is a swappable tier behind one `AiRung` port with exactly one active implementation chosen by config: `no-op` (complete no-AI core), `hosted-quota`, `byok`, `local` (v2 seam). Core never branches on which rung is active — only on whether a port call succeeded.
- **AD-6** Offline-first writes; sync is an adapter draining a durable outbox queue to user-controlled infrastructure only; retries silently on reconnection; a log is synced only after durable remote acknowledgment; no third-party sync; status chips derive from queue state.
- **AD-7** Every user-facing coach string (whispers, notes, quota notices) is a keyed, localized template in a key store, with no string interpolation in widgets; the No-Dark-Patterns Standard is a QA checklist gate in CI/review owned by a named reviewer.
- **AD-8** At-rest encryption is honest and platform-aware: mobile ChaCha20-Poly1305 (sqlite3mc `chacha20`, pinned) via the sqlite3mc build hook (declared in the workspace-root pubspec), 32-byte DB key from Keychain/Keystore; web runs the same drift schema on sqlite3.wasm with a passphrase-derived PBKDF2 key in memory for the session only, documented as weaker, never asserted equivalent; BYOK key always via Keychain/Keystore, never leaves the device.
- **AD-9** Export is a read-only `Exporter` port streaming the store's Plate Logs to CSV/JSON on demand; available offline; never requires an account.
- Telemetry off by default in all shipped builds; no hosted backend in v1.
- Quantities stored and rendered as honest ranges, never false-exact kcal; no red-as-guilt color, no score, no streak across any surface.
- Stack pins web-verified current Aug 13 2026 — see `stack.md` companion.

## Non-goals

- Not a calorie-counting calculator with a score and a streak.
- Not a kids' app in v1 — no under-13 accounts, no child-facing calorie content, no biometrics.
- Not a diet-plan dispenser, not a medical device, no weight-loss prescriptions.
- Not a hosted cloud service in v1 — self-host is the shipped posture and growth channel.
- Not deep gamification, not a macro playbook, and not a food-database builder (OFF read-only at launch + USDA).
- Not the local-model AI rung (FR-8, v2 — seam reserved), not managed-oversight profiles (FR-14, v2), not desktop clients (v2), not depth/LiDAR portion estimation (v2), not OFF write-back (v2 unless decided).

## Success signal

≥3 Plate Logs/week per active user sustained at day-90 (SM-1), and a measurable share of resolved Plate Logs produce an engaged Coach Note — a Coach Question answered beyond dismiss — across weekly-active users in their first 30 days (SM-2). Supporting: AI-estimated entries accepted with <2 corrections (SM-3), no-AI core actively used by some weekly-actives (SM-4), community growth with the $0 infrastructure run-rate held (SM-5). Guarded by counter-metrics: never optimize telemetry, streaks/badges/countdowns, or Tip Jar revenue.

## Assumptions

- Portion estimates carry an explicit uncertainty/high-range treatment rather than false-exact kcal; ~85–95% food-ID accuracy is vendor-partial and must be validated in-product before any public accuracy claim.
- Launch surfaces are mobile apps + self-host web only (no desktop); launch is adults-first, family/oversight framing is v2.
- COPPA safe-lane reasoning is pending privacy-law review and is not legal advice (PRD OQ4).

## Open Questions

- **OQ-1** Cross-device sync concrete path (FR-10): self-host relay vs manual export/import — v1-minimal; the AD-6 adapter seam is reserved; exact path is a build-time architecture decision.
- **OQ-2** Free-model quota provider (FR-6): Cloudflare Workers AI vs Gemini free tier — an adapter selection behind AD-5, resolvable at build time without a core change.
- **OQ-3** OFF write-back / contribution in v1? Deferred to v2 unless decided; a contribution adapter behind `FoodCatalog` can be added later.
- **OQ-4** COPPA managed-oversight legal validation — phase-blocker for the v2 family build (FR-14); requires an actual privacy-law review before build.
