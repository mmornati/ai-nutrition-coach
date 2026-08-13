# OpenPlate UX Spine — Rubric Review + UX-Quality Audit

**Artifact reviewed:** `DESIGN.md` + `EXPERIENCE.md` (2026-08-13)
**Authority / ground truth:** `prd-openplate-2026-08-12/prd.md` (FR-1..15, UJ-1..5, SM-1..5, SM-C1..3, Non-Goals, §4.7), `.memlog.md` (decisions), `reconcile-prd.md` (applied fixes)
**Method:** structure+prose rubric lens (bmad-review equivalent) fused with a UX-quality audit (states, a11y, dark-patterns, traceability). Token references resolution-checked; contrast ratios computed (WCAG relative-luminance math) rather than eyeballed.
**Reviewers:** rubric pass + UX-quality pass (single-pass, parallel lenses, triaged).
**Date:** 2026-08-13

---

## Verdict

**PROVISIONAL PASS — 2 high/1 medium conditions to clear before downstream (architecture/epics/build) consumes the spines.**

| Dimension | Grade | Headline |
|---|---|---|
| 1. Shape / structure | **PASS** | Canonical orders correct; frontmatter token-laden; all referenced `{tokens}` resolve. Minor token-hygiene nits. |
| 2. Consistency with decisions | **PASS-WITH-CONDITION** | 12/12 memlog decisions present — *except one stale line in EXPERIENCE State Patterns that re-introduces the exact ambiguity the two-whisper fix was meant to kill.* |
| 3. PRD traceability | **PASS** | All FR consequences have surfaces; UJ-1..5 present with labeled climaxes; SM/C-1..3 reflected. Two residual minors (FR-5 depth follow-up state; FR-7 removal-to-rung). |
| 4. No-Dark-Patterns (FR-15) | **PASS** | No countdown/streak/scarcity/reward-bait/age-lying anywhere; Tip Jar Settings-only, never interrupts; quota honesty present. |
| 5. Accessibility | **CONDITION** | Behavioral floor is complete and good, but the contrast half DESIGN.md was contracted to own is unowned and, as tokenized, fails AA on real text pairs. |
| 6. Prose | **PASS** | Tense/register consistent, calm voice sustained thread-to-thread. Light polish only. |

Severity tally: **0 critical · 2 high · 3 medium · 6 low.** Strategic review (12 verified PRD-claim links, 17 FR closures, 12 decisions, 8 reconcile-fix verifications) found **no PRD obligation left without a surface** — the ledger is clean, the conditions are quality-contract gaps, not requirement breaches.

---

## 1. Shape / Structure

### DESIGN.md — canonical order
Order (Brand & Style → Colors → Typography → Layout & Spacing → Elevation → Shapes → Components → Dos/Don'ts) is followed exactly (`DESIGN.md:140,148,172,196,204,208,221,237`). Token frontmatter (`colors` / `typography` / `rounded` / `spacing` / `components`) present and `design.md`-style. Heading nit: canonical "Elevation" is written "Elevation & Depth" — cosmetic.

**Token resolution (verified, all resolve):**
- `{spacing.8/.7/.6/.unit}` ✓ (frontmatter `spacing`)
- `{colors.canvas|surface|ink|muted|accent-sage|sage-deep|sage-tint|on-track-green|amber-warm|hairline|mono-chip-ink|tipjar|danger|canvas-dark|...}` ✓ (frontmatter `colors`)
- `{typography.kicker|day-title|meal|label|qty|grace|coach|chip|arcnote|week-lead|foot}` ✓ (frontmatter `typography`)
- `{rounded.sm|md|lg|sheet-top|pill|full}` ✓ (frontmatter `rounded`)
- EXPERIENCE references `{colors.canvas-dark}` (:19), `{colors.accent-sage}` (:67), `{colors.tipjar}` (:83) — all resolve ✓

**EXPERIENCE.md — canonical spine**
Follows Foundation → IA → Voice → Components → States → Interaction Primitives → A11y → Key Flows → Inspiration/Anti-patterns exactly (`EXPERIENCE.md:14,22,38,56,71,85,95,106,146`). Cross-references use FR/UJ/SM numbers + `{path.to.token}` ✓.

**Minor token-hygiene findings (low):**
- `components.button-primary` is defined in DESIGN frontmatter (`:105`) but never consumed in the body; the "Sure" pill and "Ask later" button are described in prose, not as component tokens. Builder has two token authorities (frontmatter block vs Components section) that never meet 1:1.
- DESIGN Colors notes the dark-safe `sage-tint` "no hex specified" as `[ASSUMPTION]` (`:160`) — acceptable (explicit), but a builder needs the alpha recipe to land it.
- EXPERIENCE frontmatter uses a `{planning_artifacts}` macro for the PRD path while DESIGN body uses a literal path — two path conventions in the same set (low).
- `[sure]`/`[ask later]` (EXPERIENCE) vs `Sure`/`Ask later` (DESIGN `:227`) — inconsistent marker style for the same control (low).

---

## 2. Consistency with Locked Decisions (`.memlog.md`)

| Decision (memlog) | In spines? | Evidence |
|---|---|---|
| D × F hybrid (calm room + self-host whispers) | ✓ | `DESIGN.md:142` Brand & Style |
| Sage & Cream register, light + dark | ✓ | `DESIGN.md:150,152-169` |
| Dark mode in v1 (warm ink + sage glow) | ✓ | `DESIGN.md:146`, `EXPERIENCE.md:19,82` |
| **Two-whisper model** (post-resolve + open-plate; no day-level header) | ⚠️ | `DESIGN.md:227`, `EXPERIENCE.md:64,115` correct — **but `EXPERIENCE.md:76` (State Patterns, "Partial day") still says "Coach whisper appears only under the open plate," contradicting the locked post-resolve anchor and SM-2's definition.** |
| Tap-to-expand plate rows | ✓ | `DESIGN.md:224`, `EXPERIENCE.md:87` |
| Per-meal 4-segment arc (veg/protein/starch/dairy) | ✓ | `DESIGN.md:225`, `EXPERIENCE.md:63` |
| Capture sheet defaults (closes to Day Board; quick-repeat re-shoot) | ✓ | `EXPERIENCE.md:34,66,90`, `DESIGN.md:231` |
| Week = tap-a-day strip; no report screen; summary → v1.5 | ✓ | `DESIGN.md:229`, `EXPERIENCE.md:32,67` |
| One calm Settings list (Your AI / Your data / Tip Jar / About) | ✓ | `DESIGN.md:233`, `EXPERIENCE.md:69` |
| Voice warm-but-reserved, asks-not-tells | ✓ | `EXPERIENCE.md:40` + Do/Don't table |
| A11y floor (48px, SR parity + arc-as-groups, reduce-motion, color-not-sole, key store) | ✓ | `EXPERIENCE.md:99-104`; note `#6 dynamic type` is an addition beyond the memlog's enumerated list — benign, but confirm it was part of the locked "exactly this floor" |
| Status chips `·local/·pending/·synced`; shimmer, no spinner; ambiguous→closest-matches; full-day-always-visible | ✓ | `DESIGN.md:224-229`, `EXPERIENCE.md:65,78,80,93` |

**Reconcile-fix verification (memlog `:18-19` claims these landed — confirmed):**

| Applied fix | Landed? | Evidence |
|---|---|---|
| Two-whisper model | ⚠️ 95% | DESIGN `:227`, EXPERIENCE CP `:64` + KF-UJ1 step 4 ✓; **stale cp in SP `:76`** |
| Voice = transcription, not biometric (FR-13) | ✓ | `EXPERIENCE.md:20,66` |
| Adults-only / no-profiles-in-v1 explicit (FR-13/FR-14) | ✓ | `EXPERIENCE.md:20` (was a full absence — now explicit) |
| Resolve-time budgets ≤3s / ≤2s | ✓ | `EXPERIENCE.md:78` |
| Ranked matches + qty presets for manual/voice (FR-3) | ✓ | `EXPERIENCE.md:88`, `EXPERIENCE.md:140` |
| Expanded-plate edit = SM-3 correction affordance | ✓ | `EXPERIENCE.md:87` |
| Your-data export flow (CSV/JSON) + voice line | ✓ | `EXPERIENCE.md:69` |
| Anti-pattern FR-13 line | ✓ | `EXPERIENCE.md:158` |

F3 (below): `reconcile-prd.md` **itself was not updated** — its "Top gaps" section still reports the pre-fix state, contradicting the current spines.

---

## 3. PRD Traceability

Every FR-1..15 has a user-facing surface; no Non-Goal leaks into v1 chrome.

| FR | Surface / flow | Status |
|---|---|---|
| FR-1 photo ≤3s, uncertainty, ambiguity | Snapshot → Day Board; SP Resolving (`:78`) carries ≤3s; qty "~2 fists"; closest-matches→manual | Strength |
| FR-2 barcode ≤2s; not-found + manual-add | Scan-a-barcode subtile; UJ-2 (`:118-124`); ≤2s in `:78` | Strength |
| FR-3 manual/voice ranked matches + qty presets | Type-or-talk; IP ranked-matches+presets (`:88`); UJ-5 step 1 | Strength (post-fix; was thin) |
| FR-4 Coach Note, no verdict | Two whispers; V&T table; UJ-1 climax | Strength *(F1 contaminates the SM-2 count in partial-day states)* |
| FR-5 answer/dismiss/depth | `[sure]`/`[ask later]`; no reward | Mostly — **F4: "answering produces a follow-up Coach Note" has no state spec** |
| FR-6 quota 3-way, disclosed | SP Quota exhausted (`:80`); UJ-4 | Strength |
| FR-7 BYOK encrypted | Settings → Your AI; UJ-3 step 2 | Strength — *(F6: removal→previous rung implied, not stated)* |
| FR-8 local-model v2 seam | IA closure note; UJ-3 step 4 | Strength |
| FR-9 local store + export CSV/JSON | Foundation; Your data (`:69`) | Strength (post-fix) |
| FR-10 sync retry, never dup/drop | Chips; UJ-5 edge | Strength |
| FR-11 one-command install; web client | Foundation; UJ-3 step 1 | Strength |
| FR-12 OSS posture | Footmark; About | Strength |
| FR-13 adults-only, no biometrics | Foundation `:20`; CP `:66`; I&A `:158` | Strength (post-fix from zero) |
| FR-14 oversight v2 NOT v1 | Foundation `:20` "explicitly NOT in v1"; copy guard | Strength (post-fix from zero) |
| FR-15 no-pressure standard | V&T banned column; IP banned list `:93`; Tip Jar state | Strength |

**UJ-1..5:** all five journeys present in Key Flows **with explicit `Climax:` beats** (`EXPERIENCE.md:110,118,125,132,139`) ✓. UJ-2's climax is thinner than the rest (a re-statement of the pitch rather than a beat) — low; every other journey beats to a concrete payoff.

**Metrics / counter-metrics:**
- SM-1: metric-only (no surface); correctly left un-surfaced — no counter-design implied. OK.
- SM-2: now unambiguously anchored → **post-resolve whisper only**, `[sure]` = engaged (`:64`) — the anchor ambiguity that block SM-2 is resolved *except* the stale SP line (F1).
- SM-3: correction affordance = expanded-plate row edit (`:87`) ✓.
- SM-4: no-AI core in quota flow + UJ-4 ✓.
- SM-5: footmark + About ✓ (contributor path correctly non-surface).
- SM-C1 telemetry-off (`:17`); SM-C2 banned list (`:93`); SM-C3 Tip Jar Settings-only (`DESIGN.md:233`, `EXPERIENCE.md:83`) — all present ✓.

---

## 4. No-Dark-Patterns Compliance (FR-15)

PASS. Verified per prohibited class:
- **Countdowns / fabricated urgency:** none. Quota state explicitly "no countdown, no pressure" (`:80,135`).
- **Streaks / streak-guilt:** banned at token level ("no streaks · no countdowns · no guilt", DESIGN `:229`), copy level (Voice table row "4 balanced days" ≠ "streak!", `:51`), and behavior level (`:93`).
- **Reward-bait:** no rewards; "no gamified reward or penalty" honored; `[sure]` is a learning signal, not a prize.
- **Scarcity:** none. Only Tip Jar exists, and it is `{colors.tipjar}`-tinted **Settings-only, never interrupts a flow** (`:165,233` / `:83`) — the FR-15 monetization clause verbatim.
- **Age-lying nudges:** no age gate anywhere; I&A calls out "no age-lying nudges" (`:157`); FR-13 line makes no-data-on-kids the posture (`:158`).
- **Quota honesty:** disclosed free quota + 3-way calm choice + data stays local (`:80,135-137`) ✓.
- Mild-benign check: the quick-repeat re-shoot affordance is an in-context efficiency for multi-meal capture, not an engagement loop — acceptable.

---

## 5. Accessibility

Behavioral floor (`EXPERIENCE.md:99-104`): **complete and genuinely behavioral** — 48px targets (incl. week dots, chips, settings rows), SR+keyboard parity with the arc announcing food groups (not a count), reduce-motion collapsing to fade (incl. the sync flip skipping to terminal state), color-never-sole (labels + names), localization key store, dynamic type. This half is excellent.

**CONDITION — the contrast half is unowned and, as tokenized, fails AA.** EXPERIENCE defers visual contrast to DESIGN (`EXPERIENCE.md:97`), but DESIGN.md declares **no WCAG target and no conformance statement anywhere** — the one deferral contract in the set has no receiver. Computed ratios (WCAG math) for text pairs as specced:

| Pair | Role | Ratio | AA normal (4.5:1) |
|---|---|---|---|
| `muted` #8B8577 on `canvas` #F6F3ED | plate labels (13px), week-lead body (15px), secondary text | **3.32** | ✗ FAIL |
| `mono-chip-ink` #857F70 on `surface` | status chips (9.5px) | **3.89** | ✗ FAIL |
| `mono-chip-ink` on `sage-tint` | `· synced` chip | **3.34** | ✗ FAIL |
| `mono-chip-ink-dark` #8E8778 on `surface-dark` | dark chips | **4.06** | ✗ FAIL (borderline) |
| `amber-warm` #C1885C on `canvas` / `surface` | "Ask later" text | **2.73 / 2.95** | ✗ FAIL even AA-large (3:1) |
| `on-track-green` #5E7F63 on `canvas` | "4 balanced days" count | **4.04** | ✗ borderline FAIL |
| `ink` / `ink-dark` on canvas | primary text | 12.9 / 13.5 | ✓ PASS |
| `muted-dark` #9D9688 on `canvas-dark` | dark secondary | 5.59 | ✓ PASS |
| `surface` on `sage-deep` (pill) | Sure pill label | 5.83 | ✓ PASS |

F2 (below) is the work item: either darken the light-mode `muted`, `mono-chip-ink`, `amber-warm`, and `on-track-green` tokens to ≥4.5:1, or explicitly declare the affected elements large-text/auxiliary/decorative and exempt them in a DESIGN.md contrast clause — and confirm the `on-track-green` vs `accent-sage` duplication (F5) while there.

Reduce-motion + dark-mode are both honored and cross-referenced (`:82`) — no finding.

---

## 6. Prose — light pass

- **Tense/register:** consistent present tense, declarative, calm — sustains the product voice through both files, including the copy tables. No register breaks worth blocking.
- **Clarity:** high overall. Best sections: Accessibility Floor, Voice & Tone table, Do/Don'ts.
- **Polish (low):** EXP Foundation `:20` is a very long run-on (adults-only paragraph packs framing + constraint + copy-guard + FR refs into one sentence) — split for builders. DESIGN `:198` and CP `:64` are long parenthetical-laden lines; acceptable for a spec, tighter elsewhere. UJ-2 climax low-register note (see §3). Optional: the week strip's permanent self-referential whisper "no streaks · no countdowns · no guilt" is charming but meta (product about itself) — keep or soften at taste.

---

## Severity-ranked findings

**🔴 F1 — HIGH — EXPERIENCE State Patterns contradicts the locked two-whisper decision.**
`EXPERIENCE.md:76` — "Partial day … Coach whisper appears only under the open plate." With the post-resolve whisper locked on the *just-logged* plate (`:64`, DESIGN `:227`, UJ-1 step 4), a partial-day flow (snack logged, dinner not yet) should carry **both** whispers. As written, a builder following State Patterns will omit the post-resolve whisper in the most common longitudinal case — deleting the SM-2 learning moment, the product's primary retention metric. This is the exact anchor ambiguity reconcile-prd flagged (#6) re-introduced post-fix.
*Fix:* change SP "Partial day" to e.g. "both plate-level whispers are live — post-resolve on the just-logged plate, open-plate hint on the next empty dent; never a day-level header whisper."

**🟠 F2 — HIGH — Accessibility: DESIGN.md owns contrast (per EXPERIENCE `:97`) but states no AA target and as-specced tokens fail it.**
No contrast/conformance clause exists; 5 light-mode text pairs compute < 4.5:1 (table in §5). "Color is never the sole signal" is honored, but low-luminance text is a separate axis the floor doesn't cover and DESIGN doesn't either.
*Fix:* add a contrast clause + darken failing tokens, or declare exemptions. One-line change plus token edits; do before build so the palette is locked.

**🟡 F3 — MEDIUM — `reconcile-prd.md` is stale vs. the spines.**
Its "Total covered: 30 · Weak: 8 · Gaps: 3" and all six "Top gaps" (`reconcile-prd.md:56-63`) report the pre-fix state. Every top gap (FR-13, FR-14, two-whisper anchor, ≤3s/≤2s budgets, FR-3 ranked-matches, export/SM-3) is now resolved in the spines. A downstream reader (architecture, epics) would waste a cycle re-litigating or re-applying dead fixes.
*Fix:* re-run or annotate `reconcile-prd.md` as pre-fix, or update its totals/gaps.

**🟡 F4 — MEDIUM — FR-5's "answering produces a follow-up Coach Note" has no state or interaction spec.**
`[sure]`/`[ask later]` cover the first move (`:64`); the follow-up (fiber-breakdown content the user opted into) is never given a surface/state — how it lands, whether it threads in the expanded plate, how it dismisses. PRD consequence FR-5 is testable; the spine only covers half the interaction.
*Fix:* one State/Component row for the "depth follow-up" whisper.

**🟡 F5 — MEDIUM (token ambiguity) — two green tokens carry the same "balanced" meaning.**
Week mini-dots fill `{colors.accent-sage}` (DESIGN `:229`) while the week lead's balanced-day count renders `{colors.on-track-green}` (DESIGN `:161`) — against the "one muted sage accent / no more than one accent" rule (`:170`). A builder can't tell "balanced" is one color or two.
*Fix:* collapse to one balanced-state green (prefer `accent-sage`, delete or demote `on-track-green`), or state explicitly that `on-track-green` is the text-role of the same state hue.

**🔵 F6 — LOW — FR-7 "removing the key returns to the previous rung" not stated.**
Implied by "until removed," but a testable PRD consequence deserves one clause in UJ-3 / Your AI row.

**🔵 F7 — LOW — token/frontmatter hygiene.** Unconsumed `components.button-primary`; `sage-tint-dark` hex open (assumed, acceptable); `{planning_artifacts}` vs literal path inconsistency; `[sure]` vs `Sure`/`Ask later` style mismatch; Elevation heading rename. Non-blocking.

**🔵 F8 — LOW — prose polish.** Run-on in EXP Foundation `:20`; UJ-2 climax thin; optional meta-whisper taste call; long spec lines in DESIGN `:198` / EXP CP `:64`. Cosmetic.

---

## Appendix A — Token resolution audit
All `{…}` references in both files resolve to a defined frontmatter token. The only undefined-by-assertion case is `sage-tint` dark (explicitly tagged `[ASSUMPTION]`, acceptable). `danger` is defined and deliberately unused — correct handling, no finding.

## Appendix B — Contrast method
Ratios computed with WCAG 2.x relative-luminance formula (sRGB linearization, 0.2126/0.7152/0.0722). Thresholds used: AA normal 4.5:1, AA large/bold 3.0:1. Full pair table in §5.