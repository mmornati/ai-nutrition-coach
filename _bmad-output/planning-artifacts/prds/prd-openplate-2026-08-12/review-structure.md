# Structure Review — OpenPlate PRD (2026-08-12)

**Lens:** structure only (headings, ordering, parallelism, Essential Spine, Adapt-In, FR nesting, UJ completeness, mechanical continuity). No prose, facts, numbers, `[ASSUMPTION]` tags, or `[n]` citations were altered.

**Reviewed source:** `prd.md` (329 lines), sections §0–§9. No `addendum.md` present.

---

## Overall verdict

Structurally this is a well-formed, launch-grade PRD: the Essential Spine (Vision → Target User with 5 named-protagonist UJs → Features with globally numbered FR-1..15 → Success Metrics with counter-metrics) is fully present and cross-linked in both directions, FR/UJ/SM IDs are contiguous and unique, and the Assumptions Index roundtrips cleanly against the 7 inline `[ASSUMPTION]` tags. The one load-bearing defect is mechanical continuity: the document references a non-existent §4.8 four times, plus one mis-targeted §4.6 and one dangling artifact name — exactly the kind of broken cross-reference that will mis-deliver to UX/architecture/story extraction. Secondary: one UJ breaks the shared 6-beat template, and minor Glossary case drift. None of the findings touch substance; all are safe, mechanical fixes.

---

## 1. Heading hierarchy & consistency

- **Strong overall.** H1 → H2 (§0–§9) → H3 (x.y) → H4 (FR-n) is a clean, monotonic 4-level tree; no level skips (feature blocks jump §4.x → FR-n via the bold "Functional Requirements:" lead-in, not a heading, so H3→H4 is a single-level descent). FR headers are uniform (`#### FR-n: Title`, sentence case) across all 15.

### Findings
- **[low]** Parenthetical version tags in FR titles are not normalized: FR-10 uses "(v1 scope)", FR-13 bare "(v1)", FR-8/FR-14 "(v2, declared now)". *Fix:* pick one convention (e.g. "(v2, declared now)" / "(v1, shipped)") and apply to all FR titles.

---

## 2. Section ordering logic

- **Coherent.** 0 Purpose → 1 Vision → 2 Target User → 3 Glossary → 4 Features → 5 Non-Goals → 6 MVP Scope → 7 Success Metrics → 8 Open Questions → 9 Assumptions Index. Glossary sits before Features (the first heavy-use section); Non-Goals/Sing Scope follow Features logically; Open Questions and Assumptions Index as tail matter is standard for a doc that feeds downstream workflows. §2.3 (UJs) correctly precedes §4 (Features) so FR blocks can cite UJ-n without forward references.

### Findings
- None.

---

## 3. Parallelism (lists/sections that should be parallel)

### Findings
- **[medium]** **UJ template broken on UJ-5.** UJ-1..UJ-4 each carry six beats — **Persona + context / Entry state / Path / Climax / Resolution / Edge case** (lines 40–67). UJ-5 (lines 68–73) carries only five; the **Edge case** beat is missing. For a chain-top doc where story writers extract journey structure, the template must be uniform or the omission must be explicit. *Fix:* add an Edge case beat to UJ-5 (e.g. the local-store failure/sync-race case) or state "Edge case: none — offline-first makes the failure mode structurally impossible."
- **[low]** **Feature-specific NFRs** appear on only §4.1 and §4.2 (lines 125–126, 150–151); §4.3–§4.7 have none. Acceptable if "only where they add information," but flag as a deliberate choice so it reads as intentional, not dropped. *Fix:* either add one-line feature NFRs where product-specific bounds exist (§4.4 export/openness, §4.5 telemetry-default) or add a one-line note that none of the later blocks carry feature-specific NFRs.
- **[low]** Feature blocks are otherwise strongly parallel: every §4.x block opens with **Description:**, closes with **Realizes UJ-n.**, and each FR carries a testable **Consequences** block. Credit.

---

## 4. Essential Spine

- **Present and load-bearing, not dropped.** Vision → (thesis + sequencing + why-now) → Target User (JTBD, Non-Users, 5 UJs) → Features (FR-1..15) → MVP Scope → Success Metrics (SM-1..5 + SM-C counters). Spine is wired in both directions: §0 promises "every in-scope capability is a globally numbered FR that realizes specific user journeys (UJ-n)", and every §4.x description and every FR carries a "Realizes UJ-n" annotation; SM entries carry "Validates FR-n" annotations with stated counter-metrics (SM-C1..C3) that explicitly counterbalance specific SMs. No spine element was dropped without a stated reason.

### Findings
- None.

---

## 5. Adapt-In sections earning their place

- **All earned.** §2.2 Non-Users (v1), §5 Non-Goals (Explicit), §6.2 Out of Scope for MVP, §8 Open Questions (9 real open questions with `[ASSUMPTION]`/`[NOTE FOR PM]` pointers), and the SM-C counter-metric block all do real framing work and are cross-referenced back from §4/§6. No furniture found.

### Findings
- **[low]** §4.6 line 228 carries the meta-note "**This section has `[NOTE FOR PM]` depth — see §9 and Open Question 4.**" but contains no literal `[NOTE FOR PM]` markers; the actual markers for FR-8/FR-14 live in §6.2 (lines 285–286). The note's cross-reference to §9 resolves (index entry at line 327), but the phrasing promises in-section markers that aren't there. *Fix:* either move the promise into §6.2 where the markers live, or drop the sentence.

---

## 6. FR nesting & numbering

- **Strong.** All 15 FRs are nested under the correct §4.x feature (4.1: FR-1..3, 4.2: FR-4..5, 4.3: FR-6..8, 4.4: FR-9..10, 4.5: FR-11..12, 4.6: FR-13..14, 4.7: FR-15), globally numbered and contiguous (FR-1 → FR-15), no gaps or duplicates confirmed by grep. FR-8 and FR-14 are honestly tagged "Not in v1" with pre-declared v2 acceptance criteria while reserved as seams; FR-13 is honest that it "Realizes none directly." All FR↔UJ and FR↔SM cross-references resolve.

### Findings
- None.

---

## 7. UJ completeness & non-overlap

- **Strong.** Five journeys (UJ-1..5) with named protagonists (Maya ×4, Sam ×1) — no floating UJs. Coverage: photo, barcode, self-host/BYOK, quota decision, offline/sync. No UJ overlaps another; each UJ is realized by ≥1 FR (UJ-1→FR-1,4,5,9,15; UJ-2→FR-2; UJ-3→FR-7,8,11,12; UJ-4→FR-5,6,15; UJ-5→FR-3,9,10). The v2 managed-oversight secondary user is corralled into FR-14 as non-UJ for v1, which is a defensible shape call.

### Findings
- See §3 medium finding (UJ-5 missing Edge case beat).

---

## 8. Mechanical continuity

### Findings
- **[high]** **§4.8 does not exist — four cross-references are broken.** Features terminate at §4.7. Four in-text references point to a phantom section:
  - line 34 (§2.2 Under-13): "See §4.8 and the Constraint Safety Guardrail for the rationale"
  - line 67 (UJ-4 Edge case): "no-nagging is a design requirement, §4.8"
  - line 85 (Glossary, Managed-Oversight): "(see §4.8, Open Question 4)"
  - line 151 (§4.2 Feature-specific NFRs): "reviewed against the No-Dark-Patterns Standard (§4.8)"
  
  For a doc whose stated job is to hand un-ambiguous pointers to build/UX/architecture teams, four dangling section refs is a real defect. *Fix (retarget to existing sections — do not renumber):* line 34 → §4.6 (Kid-Smart Design); line 67 → §4.7 (No-Dark-Patterns Standard); line 85 → §4.6 (FR-14 lives there); line 151 → §4.7.
- **[medium]** **Mis-targeted §4.6 in FR-7.** Line 172 (FR-7 consequence): "telemetry is off by default §4.6". §4.6 is Kid-Smart Design; the telemetry-off-default statements actually live in §4.4 (description, line 184) and §4.5 (FR-12, line 224). *Fix:* point to §4.4 or §4.5.
- **[medium]** **Dangling named artifact: "the Constraint Safety Guardrail."** Referenced exactly once (line 34) and never defined in-text or in the Glossary; no other surface uses the name. If it is the §4.6/§4.7 guardrail material, the reference is a stale name from an older draft. *Fix:* either add it to the Glossary and wire the §4.6/4.7 sections to the term, or delete the phrase and rely on the §4.6/§4.7 cross-reference.
- **[low]** **Glossary case drift.** Glossary headwords are Title-Case while body usage is not consistently identical: "Managed-Oversight" (Glossary, line 85) vs "Managed-oversight" (FR-14 header, line 240, and §6.2 line 286); "Balanced-Plate" (Glossary, line 81) vs "balanced-plate layer" (line 60); "Dining Manager" (Glossary, line 86) vs "dining manager" (lines 41, 322); glossary "rung"/"tier" vs §4.3 "tier ladder." Drift is cosmetic today but a downstream extraction hazard for story/architecture generation. *Fix:* canonicalize case to the Glossary headwords wherever the term is used as the domain noun.
- **[low]** **FR-1 inline `[ASSUMPTION]` has a markdown backtick glitch** (line 104): the citation inside the tag is wrapped so it reads `` ...bottleneck `[15][25]``]) `` — an unbalanced backtick pair around `[15][25]` inside the assumption. *Fix:* normalize to a single backtick citation, e.g. `` [ASSUMPTION: … error bottleneck `[15][25]`] ``.
- **[info]** **52-week figure quirk, facts unchanged.** UJ-1 persona (line 41) states "82%"; Glossary (line 86) and Assumptions Index (line 322) state "62–82%". This is a numeric consistency observation only — numbers are preserved as-is per this pass; the author should reconcile whether the single figure is "82%" or the band "62–82%".

### Verified clean (no action)
- **IDs:** FR-1..15 contiguous and unique; UJ-1..5 contiguous and unique; SM-1..5 + SM-C1..3 contiguous and unique.
- **Assumptions Index roundtrip:** 7 inline `[ASSUMPTION: …]` tags (lines 104, 165, 202, 206, 238, 288, 311) ↔ 7 index entries (lines 322–329); every inline tag is indexed, every index entry has an inline source (with §8.2 ↔ Open Question 2 matching on list position).
- **Open Questions:** all 9 numbered questions are genuinely open and reachable from §6.2 / §2.3 / §4.6 references (OQ-2, 3, 4, 5, 6 resolve).
- **Other section refs** (§3, §6, §6.2, §7-of-brief, §9) resolve.
- Glossary anchors vocabulary as promised in §0; UJ/FE and FR/SM cross-refs all resolve.

---

## Bottom line for the author

Fix the four §4.8 references first (one find-and-retarget pass), then the §4.6→§4.4/4.5 retarget and the dangling Guardrail name. Those three items close the only real structural defects. The UJ-5 Edge case beat and the Glossary case canon are cheap hardening for downstream extraction. Everything else holds.