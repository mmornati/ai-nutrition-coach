# PRD ↔ UX Spine Reconciliation

Input-reconciliation pass over `prd-openplate-2026-08-12/prd.md` against `DESIGN.md`, `EXPERIENCE.md` (and `.memlog.md` for direction recall). Scope: FR-1..15, feature NFRs, UJ-1..5, Non-Goals, MVP scope, SM-1..5, SM-C1..3, §4.7 No-Dark-Patterns Standard, and the qualitative voice contract.

Section key — DESIGN: Brand & Style (B&S), Colors, Typography, Layout & Spacing (L&S), Components, Do's/Don'ts (D&D), Elevation. EXPERIENCE: Foundation (F), IA, Voice & Tone (V&T), Component Patterns (CP), State Patterns (SP), Interaction Primitives (IP), Accessibility Floor (AF), Key Flows (KF-UJ1..5), Inspiration & Anti-patterns (I&A).

| # | PRD item | Covered in spine(s) (section) | Gap or Strength | Note |
|---|---|---|---|---|
| 1 | FR-1a — photo resolves ≤3 s | EXP SP "Resolving", KF-UJ1 | **Weak** | Resolving treatment (quiet shimmer, "reading…") is locked, but **no ≤3 s budget** is stated as a design target for the resolve state. PRD's testable consequence is a performance contract; UX never holds it. |
| 2 | FR-1b — uncertainty/range treatment | DES Typography (qty "~2 fists"), D&D; EXP KF-UJ1 step 3 | Strength | Honest ranges replace false-exact kcal; explicitly cited FR-1. Matches research OQ6 portion-error humility. |
| 3 | FR-1c — ambiguous fallback | EXP SP "Ambiguous food", KF-UJ1 step 2 | Strength | Closest-matches → manual qty, never fails the log. UJ-1 edge case realized. |
| 4 | FR-2 — barcode, unknown → not-found + manual add | EXP KF-UJ2 step 4; DES Components (Scan a barcode) | Strength | Unknown-barcode "not found" + manual-add path stated. OFF contribution correctly left to Open Question 3 (v2). Missing only the ≤2 s budget (shared timing gap, see #1). |
| 5 | FR-3 — manual/voice, ranked matches, qty presets | DES Components ("Type or talk"); EXP KF-UJ5 | **Weak** | Surface exists, but **no interaction spec for partial-text ranked matches or quantity presets**, and no voice flow detail. Offline/manual is the no-AI lifeline — thin here. |
| 6 | FR-4 — Coach Note generation (template vs AI, never shaming) | DES Components (Coach whisper); EXP V&T, CP, KF-UJ1 step 4 | **Weak/ambiguous** | Copy rules excellent, but **Coach Note anchor is ambiguous**: spine places the whisper "only under the open plate" (the empty dent) while PRD anchors Coach Notes to *resolved* Plate Logs. UJ-1 flow puts it on the just-logged meal. Three places disagree (DES Components, EXP CP, EXP SP/DP). Runs straight into SM-2's definition. |
| 7 | FR-5 — answer/dismiss/no reward, depth follow-up | DES D&D; EXP V&T, CP (`[sure]`/`[ask later]`) | **Weak** | Dismiss/acknowledge and no-reward are strong. But the "answering produces a **follow-up** Coach Note" consequence has no state spec — sure/ask-later cover the first move only. |
| 8 | FR-6 — quota, 3-way honest choice | EXP SP "Quota exhausted", KF-UJ4 | Strength | Three calm paths, logs regardless, no countdown, "don't show again" easter egg; disclosed quota. Full coverage of UJ-4. |
| 9 | FR-7 — BYOK encrypted key | EXP IA (Settings → Your AI), KF-UJ3 step 2 | Strength | Encrypted on-device, never uploaded, removal returns to prior rung implied. |
| 10 | FR-8 — local model v2 seam, marked NOT v1 | EXP IA surface closure, KF-UJ3 step 4 | Strength | Declared v2 in spine prose. Not badged on the actual Your AI surface, but spine-level it is explicit. |
| 11 | FR-9 — local encrypted store, offline-first, telemetry off | EXP F, IA; DES L&S, Components (status chips) | Strength | Local store, no account/mirror, telemetry off by default all in EXP F. |
| 12 | FR-9b — export (CSV/JSON portable) | EXP IA ("Your data" row) | **Weak** | Export exists only as a Settings row label — **no flow, state, or format is surfaced.** "Lost-my-history impossible" is a headline trust claim; the visible export proof is unspecified. |
| 13 | FR-10 — sync self-host minimal | EXP SP (local/pending/synced), KF-UJ5 step 4 | Strength | Queue retries silently, never duplicates/drops (UJ-5 edge). Chip lifecycle fully specified. Sync *path* correctly left as PRD assumption (architecture). |
| 14 | FR-11 — one-command self-host install | EXP KF-UJ3 step 1, F | Strength | Web client served, ≤5 min acceptance is docs/CI-owned, not a UX surface. FAIR coverage. |
| 15 | FR-12 — OSS posture | DES Footmark, Components; EXP IA (About) | Strength | *yours to run · open source* + quiet mono chips; telemetry-off echoed. |
| 16 | FR-13 — adults-only, no under-13, no biometrics | EXP I&A (single line: "no age-lying nudges (UJ-4 and FR-13)") | **Gap** | Hardest constraint, least coverage. No copy or surface enforces adults-only or no-biometric posture. **"Type or talk" voice input is never reconciled with FR-13's "no face/voice recognition anywhere"** — speech-to-text ≠ speaker ID, but the spines don't say so. Family-device exposure (PRD §2.2) unaddressed. |
| 17 | FR-14 — managed-oversight v2, NOT in v1 | — (absent from both spines) | **Gap** | Zero mention. PRD's OQ4 phase-blocker and family positioning mean v1 surfaces must *not* imply teen/parent profiles. Nothing in copy, Settings, or About marks this NOT-in-v1. |
| 18 | FR-15 — no-pressure UX standard, QA gate | DES D&D, Components (Tip Jar); EXP IP "Banned everywhere", SP (Tip Jar) | Strength | Banned list is comprehensive; Tip Jar Settings-only, never interrupts (SM-C3). QA-checklist-gate is a process item, correctly not a surface. |
| 19 | NFR — tone pass / localization key store | EXP V&T, AF #5; DES Typography | Strength | Coach copy in a key store, reviewed against §4.7; serif reserved for the coach. |
| 20 | NFR — three entry paths converge, no UX divergence | EXP CP (Capture sheet fan-out → same Plate Log + coach flow) | Strength | Fan-out to one Day Board result; no per-path divergence implied. *(Implied, not stated as a rule.)* |
| 21 | UJ-1 | EXP KF-UJ1 | Strength | Full journey incl. climax beat ("learns one thing, no guilt trip"). Caveat: whisper placement ambiguity (#6). |
| 22 | UJ-2 | EXP KF-UJ2 | Strength | Barcode micro-lesson; favorite save; unknown-barcode path. |
| 23 | UJ-3 | EXP KF-UJ3 | Strength | Self-host + BYOK climax; no-AI-is-still-a-coach edge. |
| 24 | UJ-4 | EXP KF-UJ4 | Strength | Honest 3-way choice, architectural trust climax, no-nag. |
| 25 | UJ-5 + edge (never dup/drop) | EXP KF-UJ5, SP | Strength | Offline → pending → synced; queue retry guarantee stated. |
| 26 | Non-Goal — no deep gamification | DES Components (week "no streaks · no countdowns · no guilt"); EXP IP banned | Strength | Streak/badge/countdown vocabulary banned at token and copy level. |
| 27 | Non-Goal — no calorie-shame | DES Colors (no red-as-guilt), D&D; EXP V&T | Strength | "Calm green not red" rule explicit; danger token documented-unused. |
| 28 | Non-Goal — not a kids app v1 | — (absent) | **Gap** | Same hole as FR-13. No copy prevents child-facing reading; "family nutrition coach" band positioning is never translated to an adults-only surface stance. |
| 29 | MVP — desktop deferred v2 | EXP F | Strength | Explicit. |
| 30 | MVP — OFF write-back v2, local-model v2, oversight v2 | EXP IA (FR-8 seam), OQ3/4 correctly deferred | Strength | Seams declared where they touch a surface; OFF contribution correctly not a UX surface. |
| 31 | SM-1 — ≥3 logs/wk | — | N/A | Metric, not a surface. No counter-design implied; no gap. |
| 32 | SM-2 — engaged Coach Notes (answered beyond dismiss) | EXP CP (`[sure]` = engaged signal) | **Weak** | The signal maps to `[sure]` vs `[ask later]`, but measurement depends on Coach Notes attaching to *resolved* logs — currently ambiguous (#6). The interaction supports the metric; the anchoring doesn't. |
| 33 | SM-3 — AI-editing friction (<2 corrections) | EXP CP (Expanded plate: entries + quantities) | **Weak** | Expanded plate implies editing but **no correction/edit affordance state is specified** — the thing SM-3 measures is undefined as an interaction. |
| 34 | SM-4 — no-AI core used | EXP KF-UJ4 (keep logging without AI), SP | Strength | "Ladder never degrades core" is visible in the quota flow. |
| 35 | SM-5 — community growth / $0 infra | DES Footmark, EXP IA (About) | Weak | Footmark + About carry the posture; contributor cooldown is not a UX surface concern. Acceptable. |
| 36 | SM-C1 — no telemetry optimization | EXP F | Strength | Telemetry off by default; trust-not-tracking stance in copy. |
| 37 | SM-C2 — no dark-pattern engagement | EXP IP, V&T, SP | Strength | Banned list + copy rules cover streaks/countdowns/nags. |
| 38 | SM-C3 — Tip Jar never interrupts | DES Components/Settings, tipjar token; EXP SP | Strength | Settings-only, never interrupts; token reserved. |
| 39 | Voice — coach whisper tone | EXP V&T (table), KF-UJ1 | Strength | Example pairings lock the register precisely. |
| 40 | Voice — question not verdict | EXP V&T, CP; DES D&D | Strength | "names what-is-there first, then one gentle question." |
| 41 | Voice — calm green not red | DES Colors (rule + token), EXP AF #4 | Strength | Enforced at token and state level, incl. accessibility "green means go" anti-pattern. |
| 42 | Voice — "what's missing and why" framing | DES Components (Coach whisper); EXP CP | Strength | Codified in the whisper spec. *(Subject to the anchor ambiguity in #6.)* |

**Total items checked: 42.** Covered well: 30 · Weak: 8 · Gaps: 3 (the voice/Anthing around FR-13–14–Non-Goal kids share one hole).

---

## Top gaps (by risk to PRD acceptance)

1. **FR-13 (+ Non-Goal "not a kids app" #16/#28)** — Missing in: DESIGN (Capture sheet, V&T-equivalent) and EXPERIENCE (V&T, AF); only a passing I&A mention. **Why it matters:** COPPA 2025 treats biometrics as personal information; "Type or talk" voice input sits unresolved against FR-13's "no face/voice recognition," kids on the family device is a stated exposure (§2.2), and no copy asserts adults-only. This is the PRD's hardest constraint and the spines give it the least.
2. **FR-14 (managed-oversight v2, #17)** — Missing entirely from both spines. **Why it matters:** PRD is explicit that v2 family/oversight must not silently vanish, and that v1 surfaces must not imply teen/parent profiles. With zero reconciliation, the *family nutrition coach* band positioning could leak into v1 About/Settings copy. Needs at least a "v2, not in v1 — support not surveillance" marking where family framing appears.
3. **FR-4 / SM-2 Coach Note anchor (#6, #32)** — DES Components + EXP CP say whisper lives "only under the open plate" (empty dent); PRD anchors Coach Notes to **resolved** Plate Logs; UJ-1 draws it on the just-logged meal. Three authorities disagree. **Why it matters:** SM-2 counts *engaged notes on resolved logs* — the primary retention metric cannot even be defined until this is resolved, and "balanced day offers depth" has no home without it.
4. **FR-1/FR-2 resolve timing budget (#1/#4)** — Missing in EXP SP "Resolving". Treatment (shimmer) is locked but no ≤3 s / ≤2 s target. **Why it matters:** the "30-second family JTBD" and SM-1 habit floor live on capture speed; the resolve state is where that budget is won or lost and the UX never defends it.
5. **FR-3 manual/voice detail (#5)** — Missing in EXP CP and KF-UJ5. **Why it matters:** manual entry is the offline (UJ-5) lifeline and the no-AI core's completeness proof; ranked-matches + quantity-presets is a testable FR-3 consequence with no spec.
6. **FR-9 export flow + SM-3 correction affordance (#12/#33)** — "Your data" is a label; export format/state and the expanded-plate edit interaction are undefined. **Why it matters:** the anti-"lost my history" trust claim is only *provable* through export, and SM-3 literally measures corrections the UX never specifies.