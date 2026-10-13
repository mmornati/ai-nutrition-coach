---
title: OpenPlate PRD
created: 2026-08-12
updated: 2026-08-12
status: final
---

# PRD: OpenPlate
*Working title — confirm.*

## 0. Document Purpose

This PRD defines OpenPlate for build, UX, architecture, and epics/stories teams. It builds on two upstream artifacts and does not duplicate them: the final product brief (`_bmad-output/planning-artifacts/briefs/brief-openplate-2026-08-11/brief.md`) and the go/no-go + positioning research (`_bmad-output/planning-artifacts/research/market-openplate-go-no-go-positioning-2026-08-12/research.md`, 50-source appendix cited inline as `[n]`). Vocabulary is Glossary-anchored (§3); every in-scope capability is a globally numbered FR that realizes specific user journeys (UJ-N); every inference is tagged `[ASSUMPTION]` and indexed (§9). Launch-grade stakes.

## 1. Vision

OpenPlate is the family nutrition coach that is **yours to run** — open-source, self-hostable, kind by design, and aimed at the adult who cooks. It behaves like a coach, not a calculator: one tap on a plate photo, a barcode, or a typed note logs a meal, and OpenPlate then asks a question that teaches — "how's the balance across your plate?" — instead of printing a guilt trip and a number. The thesis behind it: **not all calories are equal**, and a family's eating is improved more by understanding than by counting. The family + trust + data-local/self-host combination is an unclaimed cell in a market where adult "coach" positioning is saturated `[28][13]`.

It is built on a sequence the person owns: a complete no-AI core first, then an AI tutor you opt into — a free-model quota by default, your own OpenAI-compatible key when you want more (BYOK), and a local model if you self-host. There is no subscription, no paywall, no ads, no cloud account. Your data is local-first and offline-capable; the fact that we cannot breach your data is an architecture choice, not a promise.

Why now: MyFitnessPal moved core photo logging behind a paywall (2026-05-01) amid live class-actions and a 2018 breach of 150M+ accounts, opening a migration window `[25][30][41]`; photo recognition is now ~85–95% accurate and the gap is teachable portion estimation `[19]`; and the "coach, not calculator" positioning is saturated at the adult end while **family + trust + data-local/self-host** is an unclaimed cell `[27][28]`. OpenPlate's economics are its ethics: frugal, owned, and kind is the standard to be recognized by.

## 2. Target User

### 2.1 Jobs To Be Done

- **Functional:** log a family meal in under 30 seconds; know whether today's plate is balanced without writing anything down; recognize foods from a photo or barcode; make a record that survives without an account.
- **Emotional:** feed the family without shame; feel competent about what's on the plate; be the calm, knowledgeable one at dinner; avoid the guilt of broken streaks.
- **Social:** model healthy eating for kids without lecturing them about calories; share the "why" of a meal with a partner or teen.
- **Contextual:** cooking dinner while kids interrupt; standing in a kitchen with a phone in one hand; on a table with no signal; on a device that is the family's own.

### 2.2 Non-Users (v1)

- **Under-13 children** — v1 has no under-13 accounts, no child-facing calorie language, no kids' data collected. See §4.6 (Kid-Smart Design) for the rationale `[9][37][38][47]`.
- **Serious macro optimizers** (bodybuilders, competition dieters) — they need precision tracking; OpenPlate trades exact macros for balance and understanding (Cronometer, MacroFactor serve them well).
- **Clinical/diet-plan patients** — no prescribed meal plans, no medical advice, not a medical device.

### 2.3 Key User Journeys

- **UJ-1. Maya photographs dinner and gets a question, not a verdict.**
  - **Persona + context:** Maya, 38, mom of three and the household's "dining manager" (82% of US households have one default manager, usually mom `[15]`) — she cooks 5 nights a week, moderately tech-comfortable, health-minded but not a tracker.
  - **Entry state:** freshly installed app, no account, offline-capable local store initialized. She's mid-dinner-prep in her kitchen.
  - **Path:** taps the camera button (bottom, one thumb away) → snaps the plate (one sheet pan of salmon + vegetables + rice) → preview confirms the frame → the plate logs in ~3 s (DB-grounded pipeline: photo → food items → OFF/USDA entries) → a Coach Note appears: "Nice balance — two colors of veg, lean protein, a fist of carb. Want the fiber breakdown?" with two soft options.
  - **Climax:** she sees the meal *recognized* and learns one concrete thing, without a calorie guilt trip.
  - **Resolution:** she consumes the learning moment or dismisses it; the entry is saved locally and sync-capable; she moves on to serving dinner.
  - **Edge case:** photo is blurry or the food is unrecognizable → the app shows the closest matches and lets her pick or type; she still logs without fear of "missing."
- **UJ-2. Maya scans a barcode on the bread loaf at the store.**
  - **Persona + context:** same Maya, at the store deciding between two breads.
  - **Entry state:** app open, no meal in progress.
  - **Path:** taps scan → points at the barcode → OFF lookup returns the product (no API key needed, ~4M products `[b2]`) → she sees the entry's balance markers, not just the calorie panel.
  - **Climax:** one decision (which bread) becomes a micro-lesson rather than a chore.
  - **Resolution:** product saved as a favorite for fast future logging.
  - **Edge case:** barcode unknown/not in OFF → graceful "not found" with a manual-add flow and an offer to contribute the product to OFF (`[NOTE FOR PM]` decide whether v1 contributes back to OFF or only reads; see Open Question 3).
- **UJ-3. Sam self-hosts OpenPlate and brings his own key.**
  - **Persona + context:** Sam, 44, self-hosting tinkerer, values data ownership, suspicious of cloud trackers.
  - **Entry state:** a Docker host with nothing installed.
  - **Path:** follows the one-command install from the README → server runs, static web client served → he pastes his OpenAI-compatible API key into Settings (stored keychain-encrypted on-device `[22]`) → he snaps a meal and the AI tier lights up through *his* key.
  - **Climax:** a self-hosted AI nutrition coach that reports to no one — isn't available from any closed competitor.
  - **Resolution:** local model path offered as v2; he gets his own infra, telemetry off by default.
  - **Edge case:** he uses no AI at all — the no-AI core is complete and the app is still a full coach via the balanced-plate layer.
- **UJ-4. Maya hits her free AI quota and decides honestly.**
  - **Persona + context:** Maya, week three of daily use, enthusiastic.
  - **Entry state:** she's used her free-model quota.
  - **Path:** the app logs her photo to the no-AI core regardless → a quiet, plain-language notice offers three paths: keep logging without AI (still full coach), bring your own key, or wait for the quota to reset. No countdown, no pressure.
  - **Climax:** she understands the economics are real and the choice is hers — the trust is architectural, not marketing.
  - **Resolution:** she keeps logging; data stays local regardless of her choice.
  - **Edge case:** she tires of the notice → a "don't show again" per-app easter egg keeps it from nagging (no-nagging is a design requirement, §4.7).
- **UJ-5. Maya flies with the app offline.**
  - **Persona + context:** same Maya, wifi-less on a family flight, phone in airplane mode.
  - **Entry state:** local-first store already holds her history.
  - **Path:** logs a snack from memory via manual entry → entry saved locally → on landing, sync is offered silently.
  - **Climax:** tracking works anywhere and never requires connectivity.
  - **Resolution:** she never experiences the "lost my history" failure mode that drives MFP users away `[42]`.
  - **Edge case:** the flight Wi-Fi resets mid-sync — the sync queue keeps the entry locally, retries silently on reconnection, and never duplicates or drops a Plate Log.

## 3. Glossary

- **Plate Log** — one logged eating event (meal or snack). Contains Food Entries, optionally a Coach Note.
- **Food Entry** — a single item in a Plate Log, resolved to a database food (OFF or USDA) with an estimated quantity.
- **Database Food** — a canonical record from Open Food Facts (OFF, barcode-led, ~4M products) or USDA FoodData Central (incl. the Child Nutrition DB `[b2]`). Local resolution layer in front of both `[19]`.
- **Coach Note** — the point of contact for learning: a question or observation the app asks about balance/composition, never a verdict. No calorie shaming, ever.
- **Balanced-Plate** — the coach's core model: visible balance across food groups/colors, in plain language, no mandatory calorie number.
- **AI Tier** — one rung of the AI ladder: (1) no-AI core, (2) free-model quota, (3) BYOK (bring-your-own-key, OpenAI-compatible), (4) local model (v2). Each rung is fully optional; the ladder never degrades the no-AI core.
- **BYOK Key** — a user-supplied OpenAI-compatible API key, stored encrypted on-device (Keychain / encrypted shared prefs) and never uploaded.
- **Coach Question** — an interactive prompt in a Coach Note ("how's the balance?" / "want the fiber breakdown?"), the mechanism for coaching rather than counting.
- **Managed-Oversight** — v2 parent/guardian mode for observing a teen's logs without a child account (see §4.6, Open Question 4).
- **Dining Manager** — the household adult who plans and cooks meals (62–82% likelihood "mom"; she's the primary user) `[15]`.
- **Self-Host** — running OpenPlate on your own server/device via official install; the app is yours to run.

## 4. Features

### 4.1 One-Tap Logging

**Description:** The core interaction — capture a meal with a photo, a barcode, or a manual note. Three surfaces share one result: a Plate Log resolved to Database Foods. Database-grounded, never end-to-end "photo→calories" `[19]`. Realizes UJ-1, UJ-2, UJ-5.

**Functional Requirements:**

#### FR-1: Photo logging with database resolution

A user can log a Plate Log by photographing it; the system recognizes foods (~85–95% food identification on typical plates `[19]`) and resolves them to Database Foods with estimated quantities. Realizes UJ-1.

**Consequences (testable):**
- A single well-lit plate photo returns recognized Food Entries in ≤3 s on a midrange device.
- Portion-size estimates carry an explicit uncertainty treatment (`[ASSUMPTION: we display a confidence/high-range rather than a false-exact kcal figure; the research flags portion-size as the dominant error source, ~15–25% on single 2D photos — see research OQ6]`).
- Ambiguous/unrecognizable photos fall back to a pick-from-closest-matches or manual entry flow without failing the log.

**Out of Scope:**
- Automatic per-portion weight from depth/LiDAR (research: ~5–10% with depth, see research OQ6; deferred to v2 as the open attack on portion accuracy).

#### FR-2: Barcode scanning

A user can log a Database Food by scanning its barcode via OFF lookup (no API key for reads, ~100 req/min ceiling `[b2]`). Realizes UJ-2.

**Consequences (testable):**
- Known barcodes resolve to a Database Food ≤2 s.
- Unknown barcodes reach a "not found" state with a manual-add path (and optional OFF contribution — `[NOTE FOR PM]` / Open Question 3).

#### FR-3: Manual logging

A user can log a Plate Log by typing or voice-inputting a food name; the system resolves it against Database Foods and lets the user adjust quantity. Realizes UJ-5.

**Consequences (testable):**
- Partial text ("salmon") returns ranked matches with quantity presets.
- Manual logging stays available with the AI tier fully off.

**Feature-specific NFRs:**
- All three entry paths converge on the same local Plate Log record and the same Coach Note flow — no UX divergence by input method.

### 4.2 Balanced-Plate Coach

**Description:** The product's soul and its differentiator. Instead of a calorie total and a color, each logged Plate Log can surface a Coach Note built around a Coach Question. The model is balance across food groups/colors in plain language; learning comes from questions, not verdicts. This is independent, strong evidence — not slogan: JMIR's 18-study review (n=525,824) found missing-knowledge/advice is a top quit driver `[5]`; UCL's ~60k-post analysis found ~25% of complaints are shame/demotivation from rigid calorie targets `[6]`; EAT-cohort and systematic reviews associate calorie-focused self-tracking in youth with disordered eating `[8]`. Realizes UJ-1. The AI tier (when on) powers richer Coach Notes; the no-AI core still delivers foundational balance questions. **Coach Question taxonomy is a bounded, curated set in v1 (a handful of balance/composition archetypes, localized) — unbounded generative questions are a v1 NFR limit, avoiding the open-ended "advice" the competitor reviews complain about `[5]`.**

**Functional Requirements:**

#### FR-4: Coach Note generation

After a Plate Log resolves, the system generates a Coach Note containing one Coach Question about balance/composition in plain, non-judgmental language. Realizes UJ-1.

**Consequences (testable):**
- Every resolved Plate Log can produce a Coach Note (AI on: richer; AI off: template-based on resolved food groups).
- Coach Notes never contain a calorie-shaming verdict, streak-pressure, or restriction framing.

#### FR-5: Coach Question interaction

A user can answer, dismiss, or request more depth on a Coach Question; the system acknowledges the signal without gamified reward or penalty. Realizes UJ-1, UJ-4.

**Consequences (testable):**
- Answering ("want the fiber breakdown") produces a follow-up Coach Note; dismissing records no score, no streak, no guilt.
- The interaction is logged locally only for the user's own benefit (no external reward state).

**Feature-specific NFRs:**
- Tone pass required — all Coach Note copy strings live in a localization/key store reviewed against the No-Dark-Patterns Standard (§4.7), never hardcoded ad-hoc.

### 4.3 AI Estimation & Tutor (tier ladder)

**Description:** AI is an optional tutor layered over the no-AI core, exactly as sequenced: free-model quota (default) → BYOK → local model (v2). The user always owns the choice; the ladder never degrades the no-AI experience. Grounded in: BYOK is validated by Fud AI (13 providers, keys in Keychain) `[22][45]`; free vision paths exist (per the 2026 research digest + brief addendum — Cloudflare Workers AI hosted vision, Gemini free tier; `[ASSUMPTION: exact quota figures are digest-level, exact provider is an architecture decision per FR-6]`); local VLMs are not SOTA for portion work yet — fine-tuning needed — hence v2 (per research, no independent replication of vendor benchmarks `[20]`). Realizes UJ-3, UJ-4.

**Functional Requirements:**

#### FR-6: Free-model quota (default AI rung)

A user can use AI estimation through a server-side/model default free tier with a documented per-day quota, with graceful, honest fallback at quota exhaustion. Realizes UJ-4.

**Consequences (testable):**
- Quota exhaustion downgrades to the no-AI core with a plain-language choice (wait / BYOK / keep logging without AI) — zero pressure UI.
- The quota is disclosed in-app and in docs (`[ASSUMPTION: exact provider/quota per launch is TBD — candidates Cloudflare Workers AI or Gemini free tier; this is an implementation decision for architecture, not a PRD shape call]`).

#### FR-7: BYOK (bring-your-own-key)

A user can configure an OpenAI-compatible API key (stored encrypted on-device — Keychain / encrypted shared prefs), which becomes the active AI rung until removed. Realizes UJ-3.

**Consequences (testable):**
- The key is never transmitted to any OpenPlate-owned server nor included in analytics/telemetry (telemetry is off by default §4.4).
- Removing the key returns the app cleanly to the previous rung.

#### FR-8: Local model path (v2, declared now)

Self-hosters can attach a local model as the AI rung. **Not in v1** — tagged here so architecture reserves the seam now. Realizes UJ-3 (extended).

**Consequences (testable):**
- (v2 acceptance, pre-declared) The AI rung interface is provider-swappable so a local endpoint can be bound without rearchitecting FR-6/FR-7.

### 4.4 Local-First Data & Privacy by Architecture

**Description:** The trust mechanic is architecture, not promise: Plate Logs live in a local store (SQLite, encrypted at rest, authenticated cipher — ChaCha20-Poly1305 on mobile per ADR-0001, which supersedes the original AES-256 wording `[b2]`), app is offline-capable, no cloud account required, telemetry off by default. Research: privacy protections are the #1 driver of sharing willingness (JAMA conjoint, 51.5% importance) `[32]`, and "data ownership" is the self-host crowd's core narrative `[11][13]` — but note privacy is a *retention/differentiator* asset, not a pricing lever `[31][32][34]`. Realizes UJ-1, UJ-3, UJ-5.

**Functional Requirements:**

#### FR-9: Local encrypted store

The system stores all Plate Logs and Coach Note history in an encrypted local store with no server-side mirror and no account requirement. Realizes UJ-1, UJ-5.

**Consequences (testable):**
- Full feature set works with network access revoked (offline-first, UJ-5 scenario).
- At-rest data is encrypted (ChaCha20-Poly1305 on mobile — ADR-0001 supersedes the original AES-256 wording); no telemetry is transmitted without explicit user opt-in.
- Export is available in a portable format (CSV/JSON) — the "lost my history" failure mode is impossible by construction `[42]`.

#### FR-10: Sync (v1 scope)

A user can sync their local store across their own devices via a mechanism that keeps data on user-controlled infrastructure only. Realizes UJ-5 (resolution beat).

**Consequences (testable):**
- No third-party sync; at launch, self-hosters get self-managed sync; app users get offline-first with `[ASSUMPTION: exact cross-device sync path (self-host relay / manual export-import) is v1-minimal per the brief's self-host-first posture — architecture decision, not a PRD shape call]`.

### 4.5 Self-Host & Open Source

**Description:** OpenPlate is yours to run, MIT/Apache-licensed FOSS `[b2]`; official install is one-command; a responsive web client is served for self-hosters at launch; native mobile apps are Flutter `[ASSUMPTION: Flutter retained from the brief's suggested stack]` for App Store/Play. The migration window (MFP paywall + class-actions 2026) is the launch channel `[27][30][41][42][43]`. Realizes UJ-3.

**Functional Requirements:**

#### FR-11: One-command self-host install

A non-expert can install and run OpenPlate on their own server with a single documented command (container image + local DB). Realizes UJ-3.

**Consequences (testable):**
- Standard Docker host → `openplate up` or equivalent brings the web client up against the local store in ≤5 min (docs-level acceptance, verified in CI smoke test).
- The build is reproducible (`[b2]` suggests reproducible-build ethos).

#### FR-12: OSS release posture

The repository is public at launch with a contributor/community path, permissive FOSS license, and a No-Dark-Patterns Standard documented in-repo. Realizes UJ-3 (community beat).

**Consequences (testable):**
- LICENSE, CONTRIBUTING, and a published No-Dark-Patterns Standard exist at tag time.
- Telemetry is off by default in all shipped builds (self-host and mobile).

### 4.6 Kid-Smart Design (adults-only core)

**Description:** Kid-safety is design, not a marketing badge — and the research says the compliant lane for v1 is an adults-only core with no under-13 accounts: COPPA's 2025 amendments now treat biometric identifiers (face/voice) as "personal information" and require verifiable parental consent for third-party disclosure `[38][47]`; the Kurbo $1.5M FTC settlement (including algorithmic disgorgement) shows the trap in the age-gate that "encourages lying" `[38]`; pediatric evidence associates calorie self-tracking in kids with disordered eating `[8][37]`. The safe lane: plain plate photos (no face), adult-account observed profiles, local-only inference (the "internal operations" COPPA carve-out) `[47]`. **This section has `[NOTE FOR PM]` depth — see §9 and Open Question 4.** Realizes UJ-1 (via design constraints, not user journeys for kids).

**Functional Requirements:**

#### FR-13: Adults-only, no under-13 accounts (v1)

The v1 app does not offer child accounts, does not collect or store data attributable to known children, and does not use biometric identification. Realizes none directly — a hard constraint on all FRs.

**Consequences (testable):**
- No signup flow can produce an under-13 profile; no face/voice recognition anywhere in the pipeline (neutral age presence only, never a biased screen `[38][47]`).
- Plain plate photos are processed with no identity linkage; local inference stays on-device/local (`[ASSUMPTION: legal validation pending — see Open Question 4]`).

#### FR-14: Managed-oversight (v2, declared now)

Parent/guardian oversight of a *teen* profile — observability of the teen's own Plate Logs without the parent's app owning the teen's calories, framed as support not surveillance. Not in v1. Realizes (v2) the "parent as coach" secondary user.

**Consequences (testable):**
- (v2 acceptance, pre-declared) Oversight surfaces are read-only-from-guardian, and the teen profile is not "under-13" (research: parental controls + privacy-law compliance for safe family apps `[9]`).

### 4.7 No-Dark-Patterns Standard

**Description:** A written, shipped standard the product's UX must never violate — no streaks-as-guilt, no "for younger users press ×" age pressure `[38]`, no fake urgency/countdowns, no telemetry trickery. This is OpenPlate's anti-competitor: it sells against the paywall-and-shame model that the MFP reviews are now curating `[30][42]`. Realizes UJ-1, UJ-4 (constraint).

**Functional Requirements:**

#### FR-15: No-pressure UX standard

The system enforces, by template and review, that no surface uses countdown pressure, fabricated urgency, streak-guilt, reward-bait, or age-lying nudges. Realizes UJ-4.

**Consequences (testable):**
- The No-Dark-Patterns Standard is a QA checklist gate in CI/review; a named reviewer owns the pass.
- Tip Jar (monetization, §7 of brief) is present but never interrupts a task flow.

## 5. Non-Goals (Explicit)

- **Not** a calorie-counting calculator with a score and a streak.
- **Not** a kids' app in v1; no under-13 accounts, no child-facing calorie content.
- **Not** a diet-plan dispenser (no prescribed meal plans), no medical device, no weight-loss prescriptions.
- **Not** a hosted cloud service in v1 — the brief explicitly parks hosted tiers `[b2]`; self-host is the shipped posture and community growth channel.
- **Not** deep gamification (levels, badges, quests) — gamification is deliberately limited to gentle consistency; `[b1]` reframes it to adult consistency/streaks-not-guilt.
- **Not** a macro playbook (precision calorimetry is Cronometer/MacroFactor's lane).
- **Not** building its own food database — OFF (read-only at launch, contribution decision in Open Question 3) + USDA are the data layer.

## 6. MVP Scope

### 6.1 In Scope

- Photo, barcode, and manual logging (FR-1..3) with the local encrypted store (FR-9).
- Balanced-Plate Coach core: Coach Notes + Coach Question flow, template-based at minimum (FR-4, FR-5).
- AI tier ladder v1: free-model quota (default) + BYOK (FR-6, FR-7); local model declared as the v2 seam (FR-8).
- Self-host install + responsive web client + Flutter iOS/Android apps (FR-11, FR-12).
- Adults-only, no under-13 accounts, no biometrics (FR-13); No-Dark-Patterns Standard as a QA gate (FR-15).
- Offline-first data, telemetry off by default, export (FR-9); sync per FR-10 minimal path.
- Tip Jar monetization with never-interrupt constraint.

### 6.2 Out of Scope for MVP

- Local-model AI rung (FR-8) — v2, seam reserved now. `[NOTE FOR PM]` — emotionally load-bearing: the "AI is yours to run, fully" promise completes only here; revisit before v2 cut.
- Managed-oversight profiles (FR-14) — v2, pending legal validation (Open Question 4). `[NOTE FOR PM]` — the family reference point; do not cut without explicit decision.
- OFF write-back / product contribution (Open Question 3) — v2 unless decided otherwise.
- Desktop clients — v2 (`[ASSUMPTION: launch = mobile + self-host web only]`).
- Depth/LiDAR portion estimation — v2 (the "open attack on portion accuracy" is the v2 wedge, per research OQ6).
- Deep gamification, social features, weight/body tracking, diet plans, non-food tracking — per brief Scope OUT `[b2]`.

## 7. Success Metrics

**Primary**
- **SM-1**: ≥3 Plate Logs/week per active user, sustained at day-90. Validates FR-1..3, FR-9. *Counter to ROI-push; the number is the "weekly habit" floor, not a strictness bar. (Compare base rates: Day-30 retention ~8%, churn 9.2%/mo `[3][4]` — target is to beat the cliff, not game the count.)*
- **SM-2**: Learning moments in logged meals — **% of resolved Plate Logs that produce an engaged Coach Note** (a Coach Question answered beyond dismiss; local-only signal per FR-5) across weekly-active users in their first 30 days. Validates FR-4, FR-5. *Keeps the brief's per-meal granularity — the "coaching is the product" test `[b2]`.*

**Secondary**
- **SM-3**: Low AI-editing friction — % of AI-estimated entries accepted with <2 corrections vs baseline. Validates FR-6, FR-7. *The DB-grounded pipeline claim `[19]`.*
- **SM-4**: No-AI core actively used — % of weekly-active users who log at least one Plate Log with AI fully off. Validates FR-4 (template coach), FR-6 (honest fallback). *Proves the ladder never degrades the core.*
- **SM-5**: Community growth — self-host installs, GitHub contributors, coaching-content library items, and No-Dark-Patterns conformance reports; plus the brief's **$0 infrastructure run-rate holds** (verified CI/CD and hosting stay free). Validates FR-11, FR-12. *Launch posture = mission/community, $0 revenue target `[b1][b2][b3][b5]`.*

**Counter-metrics (do not optimize)**
- **SM-C1 (privacy):** Do NOT optimize user count at the expense of telemetry — telemetry is off by default; growth must come from trust, not tracking. Counterbalances SM-1, SM-5.
- **SM-C2 (dark patterns):** Do NOT optimize engagement via streaks, badges, countdowns, or nags — they are forbidden by FR-15. Counterbalances SM-1, SM-2.
- **SM-C3 (income):** Do NOT optimize Tip Jar revenue — never interrupt a task flow for it. Counterbalances the whole cost story.

## 8. Open Questions

1. **Parent tool-selection data is absent** (research flags no ≤2-yr study on how parents choose nutrition apps `[15]`) — this is the highest-leverage survey to run pre/at-launch. *(Owner: product research; revisit before any paid acquisition spend.)*
2. **Family/kids segment economics are unproven** — only KidMeal AI (~$49 MRR) shows revenue; Sito/Ummy show zero evidence `[24][46]` — is launch really "first 100 families" or first 100 *adults*? (`[ASSUMPTION: adults-first]`.) 
3. **OFF write-back in v1?** Contribution flow is cheap but needs moderation thought; deferring keeps v1 lean (see §6.2).
4. **COPPA managed-oversight legal validation** — the v2 oversight feature needs an actual privacy-law review before build; the safe-lane reasoning is `[high]` confidence but not legal advice `[38][47]`. *(Owner: architect + legal; must pass before any v2 family build — phase-blocker for FR-14.)*
5. **Free-model quota exact provider** — Cloudflare Workers AI vs Gemini free tier is an architecture call; PRD deliberately leaves it open (FR-6 `[ASSUMPTION]`).
6. **Precise cross-device sync path** (FR-10 `[ASSUMPTION]`) — self-host relay vs manual export/import.
7. **"AI ≈2x retention" is a working hypothesis** to validate in-product — not a market fact (research: single-vendor Nutrola, no independent replication) `[4][20][21]`. Track as SM-adjacent, not a pitch claim `[20]`.
8. **Roberts v. MyFitnessPal class-action** is single-outlet verified — follow docket for migration-window sizing `[41]`.
9. **No Antenna / EuropeActive-Deloitte primaries recovered** — cancellation-rate and EU-market numbers stand on aggregators; re-check before launch claims `[1][2]`.
10. **Self-host demand is unproven** — no consumer willingness-to-pay or usage data exists for self-hosted nutrition tools (research OQ4); treat the self-host install channel as a hypothesis to measure at launch, not an assumed audience `[11][23]`.
11. **Photo-accuracy figures lack independent replication** — the ~85–95% food-ID and portion-error numbers trace to vendor/partial benchmarks (research OQ6); validate in-product before any public accuracy claim `[19][20]`.
12. **Lost-history migration magnitude is unquantified** — "lost my history" exit-intent is real but its post-paywall surge is single-source (research OQ8); measure switcher intent around launch `[42][43]`.

## 9. Assumptions Index

- §2.3 UJ-1 persona — "dining manager" = mom 62–82% `[15]`; OpenPlate speaks primarily to the adult who cooks.
- §4.1 FR-1 — portion estimates carry an explicit uncertainty treatment (high-range, not false-exact kcal).
- §4.3 FR-6 — exact free-model quota provider is TBD (Cloudflare Workers AI / Gemini free tier candidates); disclosed quota model is fixed.
- §4.4 FR-10 — cross-device sync is self-host-minimal at v1 (self-host relay / manual export-import), not third-party cloud sync.
- §4.5 — Flutter is the cross-platform framework for iOS/Android + responsive web for self-hosters; desktop deferred v2.
- §4.6 FR-13 — legal validation pending for the COPPA safe-lane reasoning; not legal advice (Open Question 4).
- §8 OQ2 — launch is "first 100 adults" (adults-first), family/oversight framing is v2.
- §6 MVP — launch surfaces are mobile apps + self-host web only; no desktop.