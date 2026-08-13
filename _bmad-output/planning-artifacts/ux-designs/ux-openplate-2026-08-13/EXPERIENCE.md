---
title: OpenPlate — EXPERIENCE
status: final
created: 2026-08-13
updated: 2026-08-13
sources:
  - {planning_artifacts}/prds/prd-openplate-2026-08-12/prd.md
---

# OpenPlate — EXPERIENCE

> Experience spine for OpenPlate, the open-source family nutrition coach — *yours to run*. Paired with `DESIGN.md` (visual contract, referenced by token as `{path.to.token}`). Every surface closure maps to a PRD requirement (FR-N / UJ-N / SM-N). Distills the decision record in `.memlog.md`; wins over the working mocks on conflict.

## Foundation

- **Form-factor:** Flutter iOS + Android native apps plus a responsive web client served for self-hosters (PRD §4.5; FR-11 one-command install, FR-12 OSS posture). Desktop deferred to v2 (PRD §6.2).
- **Local-first / offline-first:** all Plate Logs and Coach Note history live in an encrypted local store, no account, no server mirror, telemetry off by default (FR-9). Full feature set works with network revoked (UJ-5); sync stays on user-controlled infrastructure only (FR-10).
- **UI system: none.** OpenPlate is a bespoke calm style; `DESIGN.md` is the visual contract, this spine is the behavior. There is no third-party component library to inherit — the calm surface is drawn directly from the locked D × F mocks.
- **Dark mode ships in v1** as a first-class skin (warm ink canvas + sage glow, `{colors.canvas-dark}`), per the decision record. Both skins are scoped tokens in `DESIGN.md.colors`.
- **v1 is adults-only, by design.** No child, family, or under-13 account is offered, no child-facing calorie language exists in any copy, and no biometric identification (face/voice-print) is in the pipeline (FR-13). Managed-oversight of a teen profile is **explicitly NOT in v1** — declared v2 pending legal validation (FR-14, PRD OQ4); v1 copy must not promise profiles ("your family" stays an abstract, never a feature). Voice input is speech-to-text transcription of food names only (FR-3, FR-13).

## Information Architecture

| Surface | Reached from | Purpose | PRD closure |
|---|---|---|---|
| **Day Board** (home) | App open (cold) | Today's plates as a vertical stack: breakfast / lunch / dinner + open dent, coach whisper, week strip, capture fab | FR-1, FR-4, FR-9, UJ-1, UJ-5 |
| **Capture sheet** | Floating `+` fab | Fan-out: Snapshot (dominant) / Scan barcode / Type or talk; quick-repeat re-shoot | FR-1, FR-2, FR-3, UJ-1, UJ-2, UJ-5 |
| **Expanded plate** | Tap plate row | Entries, quantities, coach thread for that meal | FR-4, FR-5, UJ-1 |
| **Week strip** (on Day Board) | Bottom of Day Board | 7-day mini-plates, tap-a-day to change the visible day | UJ-1 rhythm; no week-report screen in v1 |
| **Settings** | Quiet entry from day header | One calm list: Your AI / Your data / Tip Jar / About, each opening a sub-screen on tap | FR-6, FR-7, FR-9, FR-12, UJ-3, UJ-4 |

- Week coach summary deferred to v1.5 — the week is a tap-a-day strip, not a report screen (decision record).
- Surface closure: every PRD need has a surface. Logging → capture sheet + Day Board; coaching → coach whisper on plates; AI tiers → Settings → Your AI (FR-6 quota, FR-7 BYOK, FR-8 local-model seam declared v2); data/export → Settings → Your data (FR-9); self-host identity → About + footmark (FR-11, FR-12); no-pressure guarantees → everywhere (FR-15).
- No modal stacks deeper than one level; the capture sheet closes back to the Day Board after a log.

→ Composition reference: `direction-df-calm-selfhost.html` (Day Board, capture sheet, sync whisper) and `color-themes-1.html` (Sage & Cream light + dark). Key-screen mocks: `mockups/key-day-board.html` (two-whisper model, UJ-1/5), `mockups/key-capture.html` (fan-out + never-failing resolve, UJ-1/2/5), `mockups/key-expanded-plate.html` (edit + follow-up, UJ-1/SM-3), `mockups/key-settings-ai.html` (honest 3-way AI, UJ-3/4). Spine wins on conflict.

## Voice and Tone

**Contract:** a warm-but-reserved calm kitchen friend. The coach *asks, not tells*; it *names what is there first*, then offers one gentle question. It never issues a verdict, a score, a guilt trip, or a restriction (FR-4, FR-5). Short, complete sentences. No exclamation marks, no celebratory language, no streak vocabulary. Coach copy lives in a localization/key store, reviewed against the No-Dark-Patterns Standard (FR-4 NFR, FR-15), never hardcoded ad-hoc.

| Do | Don't |
|---|---|
| "Greens would round this plate out — want a 10-second suggestion?" | "You're missing your greens. Log them now!" |
| "A soft start, remembered." | "Nice streak! 🎉" |
| "Simple, and enough." | "Great job hitting your macro goal!" |
| "An open, quiet place. Nothing to fix — only to add, if you like." | "No entries yet — start tracking today!" |
| "A single snapshot is plenty." | "Snap 3 photos for the best results!" |
| "The plate is settling — nothing leaves home." | "Syncing… your data is safe with us." |
| "And that's the day — settled, not scored." | "Day complete! 100% balanced!" |
| "This week: 4 balanced days." | "4-day streak! Don't break it!" |
| "yours to run · open source" | "Made by a team that loves you." |
| "This record is yours — export it any time." | "Your data is safely stored with us." |
| Counts and gentle questions. | Streaks, countdowns, rewards, urgency, guilt. |

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules & states |
|---|---|---|
| **Plate row** | Day Board | Tap expands in place (entries + quantity + per-meal coach thread). Collapsed shows meal name + arc + qty + chip. States: collapsed / expanded / resolving. |
| **Balance arc** | Per plate | 4 segments, Veg&Fruit / Protein / Starch / Dairy. Filled = present on the plate; arcnote "3 of 4". Screen reader announces food groups (accessibility floor), not just a count. |
| **Coach whisper** | Two anchors, both plate-level (never a day-level header) | **(1) Post-resolve whisper** on the just-logged plate — the SM-2 learning moment ("Nice balance — two colors of veg, lean protein. Want the fiber breakdown?"), per FR-4 / UJ-1 climax. **(2) Open-plate hint** on the next/empty plate — "what's missing and why" as a question ("Greens would round this plate out…"), per UJ-4 / the Day Board concept. Both are serif-italic sentences with `[sure]` / `[ask later]`; `[ask later]` defers quietly — no nag, no re-queue pressure. Only the post-resolve whisper counts toward SM-2 (an engaged Coach Note). |
| **Status chips** | Each logged plate + day header | `· local` (default) → `· pending` (queued) → `· synced` (sage-tint). Calm flip `· syncing → · synced`, never a spinner. |
| **Capture sheet** | `+` fab tap | Fan-out: **Snapshot** (dominant, photo-first) / **Scan a barcode** / **Type or talk**. After a log, the sheet returns to the Day Board with a quick-repeat re-shoot affordance for multi-meal capture. **Voice input is speech-to-text transcription of food names only — never voice-print, never biometric (FR-13).** |
| **Week strip** | Day Board bottom | 7 mini-dots; calm `{colors.accent-sage}` fill only on balanced days (no red days). Tap a day to make it the visible Day Board. No week-report screen. |
| **Capture button** | Day Board | Single floating `+`, one thumb reach; the full day stays visible above it — no scroll-to-button guardrail. |
| **Settings rows** | Settings | One calm list; each row (Your AI / Your data / Tip Jar / About) opens a sub-screen on tap. Tip Jar never interrupts a task flow (FR-15). **Your data** sub-screen carries the export action (CSV/JSON portable format, PRD FR-9 consequence) and sync status — "lost my history" is impossible by construction. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Empty day | Day Board | All plates open as quiet dents — "An open, quiet place." No empty-state accusation, no "start now" pressure. |
| Partial day | Day Board | Some plates logged, some open dents. Post-resolve whisper on each just-logged plate; open-plate hint under the next open dent. |
| Balanced day | Day Board | Arcs full, week dot fills calm sage. Coach may offer depth ("want the fiber breakdown?") — never a congratulation. |
| Resolving (photo/barcode) | Plate row | **Quiet inline shimmer**, not a spinner (decision record). "reading…" arcnote; "Snapshot accepted — the plate is settling." Program budget: photo recognition ≤3s, barcode ≤2s (FR-1, FR-2 consequences) — the shimmer must settle within budget on a midrange device. |
| Ambiguous food | Expanded plate / capture result | Closest matches offered, then manual quantity — never fails the log (FR-1 consequence, UJ-1 edge case). |
| Quota exhausted (3-way) | Day Board + Settings → Your AI | Photo still logs to the no-AI core regardless (FR-6, UJ-4). Quiet plain-language notice: **keep logging without AI / bring your own key / wait for the quota to reset.** No countdown, no pressure. "Don't show again" easter egg per UJ-4 edge case. |
| Follow-up depth (FR-5 answered) | Expanded plate | `sure` on a post-resolve whisper produces one follow-up Coach Note of deeper balance/composition detail ("want the fiber breakdown?" → "oomph on vitamins — here's where you're covered"). It is a single bounded response, not a conversational loop (v1 taxonomy limit, PRD §4.2). Dismissing records no score, no streak, no penalty (FR-5 consequence). |
| Offline / pending / synced | Status chips | Local writes continue; sync retries silently on reconnection, never duplicates or drops a Plate Log (FR-10, UJ-5 edge case). |
| Dark mode | All | Warm ink canvas + sage glow (`{colors.canvas-dark}` family); follows device theming, respects reduce-motion. |
| Tip Jar | Settings only | Present, `{colors.tipjar}`-tinted, never interrupts a flow (FR-15, SM-C3). |

## Interaction Primitives

- **Tap-to-expand** — plate rows expand and collapse in place; no navigation for the common "what did I eat" glance. The expanded plate is the **edit surface**: correct a food or quantity from the resolved entries — one tap to edit a row (the SM-3 correction affordance); corrections are the signal that measures AI-editing friction (PRD SM-3).
- **Ranked matches + quantity presets (manual/voice)** — partial text or a voice-transcribed name returns ranked Database Food matches with quantity presets (FR-3): pick a match, pick a quantity (e.g. "~1 fist"), done — the no-AI/offline lifeline stays complete without AI (UJ-5).
- **Capture fan-out** — the `+` fab opens the capture sheet; Snapshot is dominant, barcode and type-or-talk are subtiles.
- **Quick-repeat re-shoot** — after a log, the sheet offers to immediately capture the next meal in the same sitting (multi-meal), then closes back to the Day Board.
- **Tap-a-day week** — the week strip is navigation, not a report; tapping a dot loads that day's Day Board.
- **No-countdown quota choice** — quota exhaustion presents three calm paths with zero pressure (UJ-4).
- **Banned everywhere:** streaks, countdowns, badges, celebratory pop-ups, push-notification re-engagement, card sprawl, red-guilt states, spinners for resolve (FR-15; DESIGN.md Do's/Don'ts).

## Accessibility Floor

Behavioral floor (visual contrast lives in `DESIGN.md`). Locked at exactly this floor, no extras (decision record):

1. **Touch targets ≥ 48px** (48dp Android / 48pt iOS-equivalent) — fab, buttons, chips, tap-a-day dots, settings rows.
2. **Keyboard + screen-reader parity** — every interactive element labeled with role + state; the **balance arc announces as food groups** (e.g., "vegetables and fruit present, protein present, starch present, dairy missing") rather than a raw count; status chips announce transitions (`· synced` on flip).
3. **Reduced motion** — collapses to a fade; the `· syncing → · synced` flip skips to the final state under reduce-motion.
4. **Color never the sole signal** — arc segments always paired with text labels; balanced-day dots have an accessible name; no red/green-only meaning anywhere (FR-15, "green means go, red means stop" anti-pattern).
5. **Localization key store** — all coach strings live in a key store for translation (FR-4 NFR).
6. **Dynamic type honored** — legible without truncation at the largest setting (DESIGN.md typography tokens).

## Key Flows

Journey names mirror the PRD verbatim (PRD §2.3). Climax beats per journey.

### UJ-1 — "Maya photographs dinner and gets a question, not a verdict"
Surface: Day Board → capture sheet → expanded plate → coach whisper.
1. Maya taps the `+` fab (bottom, one thumb away) → capture sheet fans out, Snapshot dominant.
2. She snaps the plate; the row resolves with a **quiet inline shimmer** → recognized food entries (closest-matches fallback, manual qty if ambiguous — never fails).
3. The plate row lands on the Day Board with its arc and honest quantity ("~2 fists").
4. **Climax:** the post-resolve whisper appears on the just-logged plate — serif italic, a question ("Nice balance — two colors of veg, lean protein. Want the fiber breakdown?"), `[sure]` / `[ask later]`. She learns one concrete thing, without a calorie guilt trip (FR-4, FR-5; this whisper is the SM-2 learning moment). Separately, the next open plate carries its own "what's missing and why" hint ("Greens would round this plate out…").
5. Resolution: answer or dismiss; the entry is saved locally, sync-capable; she moves on to serving dinner.

### UJ-2 — "Maya scans a barcode on the bread loaf at the store"
Surface: capture sheet → Scan a barcode → expanded plate.
1. Maya taps Scan a barcode; the barcode resolves to a Database Food ≤2s (FR-2).
2. The entry shows **balance markers, not just a calorie panel** — the arc updates.
3. **Climax:** one decision (which bread) becomes a micro-lesson rather than a chore.
4. Resolution: product saved as a favorite for fast future logging. Unknown barcode → graceful "not found" + manual-add path (FR-2 consequence).

### UJ-3 — "Sam self-hosts OpenPlate and brings his own key"
Surface: Settings → Your AI → About + footmark.
1. Sam runs the one-command install (FR-11); the responsive web client is served; the footmark whispers *yours to run · open source*.
2. He pastes his OpenAI-compatible key in Settings → Your AI; stored encrypted on-device, never uploaded (FR-7).
3. **Climax:** a self-hosted AI nutrition coach that reports to no one — the AI tier lights up through *his* key; telemetry off by default (FR-12).
4. Resolution: no AI at all is still a full coach via the no-AI core and balanced-plate layer (UJ-3 edge case); local-model rung declared v2 (FR-8).

### UJ-4 — "Maya hits her free AI quota and decides honestly"
Surface: capture sheet → Day Board; Settings → Your AI.
1. Maya's photo logs to the no-AI core **regardless** (FR-6).
2. A quiet plain-language notice presents the three paths: keep logging without AI (still full coach) / bring your own key / wait for the quota to reset — **no countdown, no pressure**.
3. **Climax:** she understands the economics are real and the choice is hers — the trust is architectural, not marketing. No-Dark-Patterns Standard honored (FR-15).
4. Resolution: she keeps logging; data stays local whatever she chooses (FR-9); a "don't show again" easter egg prevents nagging (UJ-4 edge case).

### UJ-5 — "Maya flies with the app offline"
Surface: Day Board → capture sheet (Type or talk) → status chips.
1. In airplane mode, Maya logs a snack from memory via manual entry (FR-3); saved to the encrypted local store (FR-9).
2. The chip reads `· pending`.
3. **Climax:** on landing, sync is offered silently; the chip flips `· syncing → · synced` with a calm flip, never a spinner — she never experiences "lost my history" (FR-10, UJ-5 resolution; anti-MFP).
4. Failure edge: flight Wi-Fi resets mid-sync — the queue retries silently on reconnection, never duplicates or drops a Plate Log (UJ-5 edge case).

## Inspiration & Anti-patterns

From the competitor visual digest (`imports/competitor-visual-digest.md`), with sources:

- **Lifted — Calm-green nutrient states, no scoreboard (Ummy):** "nutrients already on track turn a calm green"; OpenPlate's arcs and week dots are coaching states, never verdicts.
- **Lifted — Week-as-unit-of-truth (Ummy / Sito):** 7-day averages, not single-day verdicts; OpenPlate's week strip reads "This week: 4 balanced days", calm green on balanced days only.
- **Lifted — Conversational, friendly-expert framing (Solid Starts):** OpenPlate coaches with one serif-italic question — warm but more reserved, never a chat bubble chorus.
- **Lifted — Production value WITH accuracy humility (Cal AI look-feel vs its false-precision/veiled-pricing fall):** OpenPlate is clean and calm but prints honest ranges ("~2 fists"), never fake-exact kcal or fake decimals (FR-1, UJ-4).
- **Lifted — Device/user-owned theming as a trust signal (Fud AI, Food You, OpenNutriTracker):** OpenPlate's self-host + BYOK + local-store ownership are the F-whispers — `· local` chips, `yours to run · open source` footmark, key stored on-device (FR-7).
- **Rejected — MFP card-sprawl "Today" modernization:** gigantic space-consuming cards buried the primary action (rating collapse 3.67→1.82). OpenPlate keeps one still, hairlined day.
- **Rejected — Cal AI's glossy false confidence and hidden economics:** removed from the App Store over deceptive billing; OpenPlate discloses quotas in-app and in docs (FR-6).
- **Rejected — Streaks, countdowns, streak-shaming loss frames (Duolingo-style, MFP-era):** forbidden by the No-Dark-Patterns Standard (PRD §4.7, **FR-15**) — no countdown pressure, no fabricated urgency, no reward-bait, no age-lying nudges (UJ-4 and FR-13).
- **FR-13 is the line, not a feature.** The adults-only posture is a hard constraint on every surface: no child profile flow, no under-13-calorie language, no biometrics (photo stays plate-only; voice stays transcription-only). The Kurbo/COPPA lesson (PRD §4.6) is that family-safety framing that collects kids' data is a compliance trap — OpenPlate v1 simply has no kids' data to collect (FR-13, PRD OQ4).
- **UJ-4 quota honesty is a product feature, not a growth lever:** the free quota is disclosed, the three-way choice is calm, and the no-AI core is never degraded — measured by SM-4 (no-AI core actively used), guarded by SM-C2 (do not optimize engagement via streaks/badges/countdowns) and SM-C3 (do not optimize Tip Jar revenue).
