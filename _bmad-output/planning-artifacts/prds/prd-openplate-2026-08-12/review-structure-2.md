# Structure Review (2nd pass) — OpenPlate PRD (2026-08-12)

*Scope: documentation-quality STRUCTURE lens, checklist-driven post-fix verification. Not a design critique. Reviewed file: `prd.md` (333 lines).*

## Overall verdict

The prior reviewer's defects landed: §4.8 references are gone, the FR-7 telemetry citation retargeted, the dangling "Constraint Safety Guardrail" artifact removed, UJ-5 gained its Edge case beat, and the Glossary roundtrip holds for every listed term. Remaining issues are two mechanical nits (one genuinely broken marker at line 312) and three low-severity consistency notes. Structurally clean; ship-ready after the line-312 fix.

---

## Checklist verification (items 1–7)

| # | Check | Result | Evidence (file:line) |
|---|-------|--------|----------------------|
| 1 | No §4.8 references remain | **PASS** | grep for `§4.8` in `prd.md` → 0 hits (no stray refs; feature sections terminate at §4.7) |
| 2 | FR-7 consequence cites §4.4 (not §4.6) | **PASS** | `prd.md:173` — "(telemetry is off by default §4.4)" |
| 3 | "Constraint Safety Guardrail" artifact absent | **PASS** | grep for `Guardrail|Constraint Safety` in `prd.md` → 0 hits |
| 4 | UJ-5 has an Edge case beat | **PASS** | `prd.md:74` — "Edge case: the flight Wi-Fi resets mid-sync…"; UJ-1..5 all carry one: lines 46, 53, 60, 67, 74 |
| 5 | Marker/bracket balance + ID contiguity | **PARTIAL — one defect** | `prd.md:312` unclosed `[ASSUMPTION` bracket (Finding S1); all `[NOTE FOR PM]` (53, 116, 229, 286, 287), `[high]` (314), and other `[ASSUMPTION]` tags balanced; zero odd-backtick lines; FR-1..15, UJ-1..5, SM-1..5 + SM-C1..3 contiguous and unique; no CF series exists (vacuous) |
| 6 | Glossary terms roundtrip | **PASS** | All 11 terms present in §3 (`prd.md:78–88`); two capitalized named artifacts not glossed (Findings S3/S4) |
| 7 | Markdown hygiene (§ overlines, §8/§9 lists) | **PASS** | Heading hierarchy uniform (`## N.` / `###` / `####`); §8 numbered 1–12 well-formed; §9 exactly 8 bullet entries; no tables in doc (N/A) |

---

## Findings

### S1 — [medium] Unclosed bracketed expression in Open Question 2
- **Location:** `prd.md:312`
- A marker-balance defect survived the citation pass: `` — is launch really "first 100 families" or first 100 *adults*? (`[ASSUMPTION: adults-first`.)`` — the `[` is opened and never closed with `]`. The closing backtick closes the code span, not the bracket, leaving `[ASSUMPTION: adults-first` dangling. Every other `[ASSUMPTION]` / `[NOTE FOR PM]` / `[high]` tag in the doc is closed.
- **Fix:** ``(`[ASSUMPTION: adults-first]`.)`` (or drop the literal brackets and keep the em-dash phrase plain).

### S2 — [low] Phantom subsection reference "§8.2" in Assumptions Index
- **Location:** `prd.md:332`
- §8 (Open Questions) is a flat numbered list 1–12 with no `### 8.2` subsection; the "§8.2" label resolves to nothing. It clearly means Open Question 2. Everywhere else the doc refers to these by name ("Open Question 3/4"), so this is the lone positional reference.
- **Fix:** reword to "Open Question 2 (adults-first)".

### S3 — [low] "No-Dark-Patterns Standard" is a capitalized named artifact not in §3 Glossary
- **Location:** body uses at `prd.md:152`, `221`, `224`, `250`, `259`; defined nowhere in-doc (only "documented in-repo").
- Acceptable as a shipped document rather than a product concept, but downstream story/UX extraction greps the Glossary; consider adding a one-line entry (or a §4.7 anchor) so the term doesn't read as a dangling artifact like the old Guardrail.
- **Fix (optional):** add "No-Dark-Patterns Standard — §4.7" to the Glossary.

### S4 — [low] "Tip Jar" appears capitalized in body, not glossed
- **Location:** `prd.md:260`, `282`, `307`; defined only as "monetization, §7 of brief".
- Same class as S3 — a named surface with no in-PRD definition. Low, optional.
- **Fix (optional):** one-line glossary entry deferring to the brief.

### S5 — [low] Case drift between Glossary and body for Managed-Oversight
- **Location:** glossary `prd.md:86` ("Managed-Oversight") vs FR-14 heading `prd.md:241` ("Managed-oversight"). Same concept, two casings; inconsistent capitalization is exactly what grep-based extraction trips on.
- **Fix:** normalize to a single casing (glossary caps are the canonical form).

### S6 — [low] Numeric frame variance for Dining Manager stat
- **Location:** `prd.md:41` claims "82% of US households" while Glossary (`prd.md:87`) and Assumptions Index (`prd.md:326`) carry "62–82%" — all three cite `[15]`. Inner-doc ranges disagree on the point value.
- **Fix:** align body UJ-1 to "62–82%" or note the range.

### S7 — [low] FR-6 has two inline `[ASSUMPTION]` tags but one index entry
- **Location:** inline tags `prd.md:156` (quota figures digest-level / provider an arch decision) and `prd.md:166` (provider TBD; disclosed quota model fixed) both map to the single index entry `prd.md:328`. The index surfaces the provider-TBD aspect but not the "exact quota figures are digest-level" aspect. Cosmetic — roundtrip integrity (count and coverage) otherwise holds at 8 tag-group → 8 entries.
- **Fix (optional):** split `prd.md:328` into two lines or merge the two inline tags into one.

---

## Verified clean (no action)

- **§ cross-references:** every in-doc `§N` / `§N.M` target resolves to a real heading — §3 (13), §4.4 (173), §4.6 (34, 86), §4.7 (67, 152), §6/§6.2 (313, 333), §7-of-brief (260), §9 (13, 229), §2.3/§4.1/§4.3/§4.4/§4.5/§4.6 (326–331). Only S2 (§8.2) is phantomed.
- **FR/UJ/SM contiguity:** FR-1..15, UJ-1..5, SM-1..5, SM-C1..3 — no gaps, no duplicates; all Realizes-clauses and "validates FR-x/UJ-x" claims point at existing IDs.
- **Open Question cross-refs (3, 4):** internal references to OQ3 (`prd.md:53,116,270,288,313`) and OQ4 (`prd.md:86,229,239,287,314,331`) all land on the correct numbered items; ✓ phase-blocker language (314) consistent with index entry 331.
- **Citation markers:** `[NOTE FOR PM]` ×5, `[high]` ×1, `[ASSUMPTION]`/`[ASSUMPTION:~]` tags ×9 — all closed except S1; no stray-backtick lines detected programmatically.
- **Heading hierarchy:** `#` → `## N.` (0..9) → `### N.x` → `#### FR-x`; uniform overlines throughout.
- **Tables:** none present; N/A.

## Bottom line for the author

The flagged fixes from round 1 all landed and confirmed. One mechanical defect remains — the unclosed `[ASSUMPTION` bracket at line 312 — plus three optional hardening notes (S3–S7). Fix S1 before any downstream extraction; S2 is a one-word label fix; S3–S7 are discretionary consistency polish.