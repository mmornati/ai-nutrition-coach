# Prose Review — OpenPlate PRD (2026-08-12)

**Lens:** prose only (grammar, agreement, voice, modifiers, tense, clarity, diction, readability).
**Scope note:** prose and formatting only; all numbers, dates, IDs, `[ASSUMPTION]` tags, `[NOTE FOR PM]` callouts, FR/UJ/SM IDs, and `[n]` markers were preserved verbatim in every suggested fix.

## Verdict

The prose is largely strong: consistent register, confident voice, reliable subject-verb agreement, and disciplined tense control throughout the FR/Consequences blocks. Passive voice is used sparingly and appropriately (e.g., "typing or voice-nulling," FR-7 consequences). No high-severity or meaning-altering problems found. Findings below are low/medium polish items — mostly diction and small grammatical slips — plus one likely typo worth confirming.

---

## Findings

### F1 — Likely typo: "voice-nulling"
- **Location:** `prd.md:119` (FR-3, §4.1)
- **Original:** `A user can log a Plate Log by typing or voice-nulling a food name;`
- **Suggested fix:** `...by typing or dictating a food name;` (or "voice-to-text"). "Voice-nulling" has no established meaning and would mislead implementers of FR-3; likely intended as voice input/dictation. Confirm intent before fixing.
- **Severity:** medium

### F2 — Diction imprecision: "breach your data"
- **Location:** `prd.md:19` (§1 Vision)
- **Original:** `...the fact that we cannot breach your data is an architecture choice, not a promise.`
- **Suggested fix:** `...the fact that your data cannot be reached by us is an architecture choice, not a promise.` ("Breach" applies to a system, not to data; as written it can be misread as a weak guarantee in a section that is precisely arguing the opposite.)
- **Severity:** low

### F3 — Preposition/parallelism: "tap on… a barcode"
- **Location:** `prd.md:17` (§1 Vision)
- **Original:** `One tap on a plate photo, a barcode, or a typed note logs a meal;`
- **Suggested fix:** `One tap on a plate photo, on a barcode, or on a typed note logs a meal;` (keep parallelism; "a tap on a barcode" reads as if the tap lands on a physical barcode.)
- **Severity:** low

### F4 — Fragmented dash-clause with missing subject
- **Location:** `prd.md:58` (UJ-3 Climax)
- **Original:** `...a self-hosted AI nutrition coach that reports to no one — isn't available from any closed competitor.`
- **Suggested fix:** `...a self-hosted AI nutrition coach that reports to no one — something no closed competitor offers.` (The clause after the em dash drops its subject, leaving "isn't available" to attach to the coach's predicate frame.)
- **Severity:** low

### F5 — Wrong negation pair: "never … nor"
- **Location:** `prd.md:172` (FR-7 consequences)
- **Original:** `The key is never transmitted to any OpenPlate-owned server nor included in analytics/telemetry`
- **Suggested fix:** `The key is never transmitted to any OpenPlate-owned server or included in analytics/telemetry` (double-negative pairing "never … nor" is non-standard for an exclusive "or".)
- **Severity:** low

### F6 — Missing article
- **Location:** `prd.md:184` (§4.4 Description)
- **Original:** `The trust mechanic is architecture, not promise:`
- **Suggested fix:** `The trust mechanic is architecture, not a promise:` (matches the parallel phrasing in §1, line 19, which uses "not a promise".)
- **Severity:** low

### F7 — Dangling end of "regardless"
- **Location:** `prd.md:64` (UJ-4 Path)
- **Original:** `the app logs her photo to the no-AI core regardless → a quiet, plain-language notice offers three paths…`
- **Suggested fix:** `the app logs her photo to the no-AI core regardless of quota` (the bare "regardless" floats; its object is implied from the prior entry-state bullet.)
- **Severity:** low

### F8 — Modifier word-order ambiguity
- **Location:** `prd.md:21` (§1 "Why now")
- **Original:** `…photo recognition is now ~85–95% accurate and the gap is teachable portion estimation`
- **Suggested fix:** `…and the remaining gap — portion estimation — is teachable` (as written, "teachable portion estimation" can be read as the whole gap object rather than the gap being the thing that is teachable.)
- **Severity:** low

### F9 — Segmentation + trailing preposition
- **Location:** `prd.md:21` (§1 Vision, final sentence)
- **Original:** `OpenPlate's economics are its ethics: frugal, owned, and kind is the standard to be recognized by.`
- **Suggested fix:** `OpenPlate's economics are its ethics: frugal, owned, and kind is the standard to be recognized by it.` — or safer: `…: frugal, owned, and kind are the standards it wants to be recognized by.` (The all-adjective compound takes a singular "is" defensibly, but the sentence trails into a dangling "by"; the plural rework reads cleanly. Judgment call — original is not wrong.)
- **Severity:** low

### F10 — Ambiguous preposition "on a table"
- **Location:** `prd.md:30` (§2.1 Contextual)
- **Original:** `on a table with no signal;`
- **Suggested fix:** `at a table with no signal;` (the parallel contexts are person-situations — "cooking dinner," "standing in a kitchen" — so "on a table" is ambiguous: the phone on the table, or the family at the table.)
- **Severity:** low

### F11 — Missing contrast comma
- **Location:** `prd.md:242` (FR-14 Description)
- **Original:** `…observability of the teen's own Plate Logs without the parent's app owning the teen's calories, framed as support not surveillance.`
- **Suggested fix:** `…framed as support, not surveillance.` (parallel contrast needs the comma; without it, "support not surveillance" reads as one muddled noun phrase.)
- **Severity:** low

### F12 — Tense inconsistency in UJ entry-state blocks
- **Location:** `prd.md:63` (UJ-4 Entry state; cf. lines 42, 49, 56, 70)
- **Original:** `she's used her free-model quota (e.g. 250 AI estimates/day)`
- **Suggested fix:** `she has used up her free-model quota (e.g. 250 AI estimates/day)` — or align with the neighboring blocks by using present-tense framing (`she is at her free-model quota`). UJ-1/2/3/5 use present/static entry states; UJ-4 alone drops into present-perfect.
- **Severity:** low

### F13 — Stray backtick (rendering)
- **Location:** `prd.md:104` (FR-1 consequences, `[ASSUMPTION]` block)
- **Original:** `…the research says portion is the 15–25% error bottleneck ``[15][25]``])`
- **Suggested fix:** `…bottleneck `[15][25]`])` (single closing backtick; the doubled backtick will render mid-inline-code and can confuse tooling that parses `[ASSUMPTION]`/citation markers.)
- **Severity:** low

---

## Not flagged (checked and fine)

- Passive voice: rare and purposeful (mostly template-action statements in FR consequences).
- Subject-verb agreement: sound throughout; the compound-subject "is" in F9 is defensible.
- Tense control across FR blocks: consistent.
- All FR/UJ/SM/`[n]`/tag markers verified intact; substance untouched.