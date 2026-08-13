# Prose Review (Round 2) — OpenPlate PRD (2026-08-12)

**Lens:** prose/editorial polish only. No product, scope, citation, or structure judgment.
**Scope note:** all facts, numbers, dates, `[n]` markers, `[ASSUMPTION]` tags, `[NOTE FOR PM]` callouts, and FR/UJ/SM/SM-C IDs preserved verbatim in every suggested fix. Prior round's items (review-prose.md F1–F13) verified resolved or otherwise not re-reported.

## Priority checks (recently edited content)

- **UJ-5 edge case (l.74)** — "the flight Wi-Fi resets mid-sync — the sync queue keeps the entry locally, retries silently on reconnection, and never duplicates or drops a Plate Log." Parallel verb list (keeps / retries / never duplicates-or-drops) all governed by "the sync queue"; the "never … or" negation is correctly formed; em-dash appositive matches house style. **Clean.**
- **OQ10 (l.320), OQ12 (l.322)** — clean; subject-verb agreement and tense sound.
- **OQ1/OQ4 ownership annotations (l.311, l.314)** — see F3, F4.
- **§6.2 Depth/LiDAR bullet (l.290)** — "the "open attack on portion accuracy" is the v2 wedge" is grammatically sound; punctuation and nesting of the parenthetical are correct. **Clean.**

## Findings

### F1 — [ASSUMPTION] tag missing its closing bracket
- **Location:** `prd.md:312` (OQ2 parenthetical)
- **Original:** `is launch really "first 100 families" or first 100 *adults*? (`[ASSUMPTION: adults-first`.)`
- **Problem:** the inline-code span `` `[ASSUMPTION: adults-first` `` is properly pair-delimited, but the tag content is missing its closing square bracket — it reads `[ASSUMPTION: adults-first` where every other tag in the doc is `[ASSUMPTION: …]`. A machine parse of `[ASSUMPTION]` tags (as §9 index/tooling does) will see an unterminated tag. The Assumptions Index entry at l.332 relies on this tag.
- **Suggested fix:** `(`[ASSUMPTION: adults-first]`.)` (restore only the missing `]`; content untouched).
- **Severity:** medium (malformed structured marker, not a grammar issue).

### F2 — Numeric-range scope ambiguity
- **Location:** `prd.md:321` (OQ11)
- **Original:** `the ~85–95% food-ID and portion-error numbers trace to vendor/partial benchmarks`
- **Problem:** the `~85–95%` range reads as if it modifies both "food-ID" *and* "portion-error" numbers, but the portion-error figure elsewhere in the doc is a different range (l.104: ~15–25%; l.108: ~5–10%). Ambiguity on which number the range attaches to.
- **Suggested fix:** `the ~85–95% food-ID figure and the portion-error numbers …` (or "the food-ID and portion-error numbers (…)").
- **Severity:** low (ambiguity, no error).

### F3 — Elliptical "must pass" in OQ4 owner annotation
- **Location:** `prd.md:314` (OQ4 trailing parenthetical)
- **Original:** `*(Owner: architect + legal; must pass before any v2 family build — phase-blocker for FR-14.)*`
- **Problem:** "must pass" has no subject; it is implied to be the privacy-law review named earlier in the item, but the clause can momentarily be misread as an imperative addressed to the owner ("you must pass…"). Compare OQ1's annotation, which uses a clean imperative ("revisit…").
- **Suggested fix:** `*(Owner: architect + legal; the review must pass before any v2 family build — phase-blocker for FR-14.)*`
- **Severity:** low.

### F4 — Mildly redundant "paid acquisition spend"
- **Location:** `prd.md:311` (OQ1 trailing parenthetical)
- **Original:** `*(Owner: product research; revisit before any paid acquisition spend.)*`
- **Problem:** "acquisition spend" already denotes paid acquisition; "paid acquisition spend" is a slight redundancy.
- **Suggested fix:** `…before any paid acquisition.` (or "…before any ad spend.").
- **Severity:** low (nit).

## Checked and fine (no finding)

- Backtick and asterisk parity even on every line (scripted scan) — other residual malformed-emphasis patterns ruled out; prior F13 on l.104 is resolved (single, closed backtick).
- Duplicated-word scan (PCRE2): no `the the`, `and and`, doubled-word matches.
- UJ-5 edge case, OQ10, OQ12, §6.2 Depth/LiDAR bullet: clean (see above).
- Subject-verb agreement, tense control, and quote balance across §4/§5/§6/§7 unaffected.
- All FR/UJ/SM/`[n]`/tag markers verified intact; no substance touched.