# PRD Quality Review — OpenPlate

## Overall verdict

This is a strong, launch-grade PRD with a genuinely held thesis — "coach, not calculator," family + trust + data-local/self-host — backed by dense inline research, honest trade-off naming, and explicit counter-metrics. What holds up: scope honesty (§5/§6.2), a load-bearing UJ set (§2.3), and testable consequences on nearly every FR. What's at risk: the PRD's two most load-bearing claims — "the no-AI core is complete" (UJ-3 edge case, §2.3) and "we cannot breach your data is an architecture choice, not a promise" (§1) — are left ambiguous against FR-1's photo-recognition pipeline and the default hosted free-model rung (FR-6), and a renumbering left §4.8 dead across five references. Downstream story/architecture extraction will start clean on FR numbering but will trip on the dead refs and the AI-tier/no-AI-core seam.

## Decision-readiness — strong

Decisions are stated as decisions: the AI-tier ladder with free-model-quota default and BYOK (§4.3), adults-only core with no under-13 accounts (FR-13), no paywall/cloud-account (§1), and deliberate v2 deferrals carrying "do not cut without explicit decision" notes (§6.2). Trade-offs name what was given up, e.g. "OpenPlate trades exact macros for balance and understanding (Cronometer, MacroFactor serve them well)" (§2.2) and "deferring keeps v1 lean" on OFF write-back (OQ-3). Open Questions are genuinely open — OQ-1, OQ-4, OQ-7 are unanswered debates, not rhetoric. `[NOTE FOR PM]` callouts sit at real tensions (OFF contribution FR-2, "AI is yours to run, fully" §6.2).

### Findings
- **[high]** Default-rung server processing vs. the "cannot breach" claim (§1, §4.3 FR-6) — The Vision states "the fact that we cannot breach your data is an architecture choice, not a promise," and FR-7's consequence is that "the key is never transmitted to any OpenPlate-owned server." But FR-6's free rung is a "server-side/model default free tier" — plate photos necessarily leave the device for the *default* tier. A decision-maker can't tell whether the free tier routes through an OpenPlate-operated proxy (contradicting "no cloud account" and the no-server framing) or directly to a third party (Cloudflare/Gemini) — either way the strongest trust sentence needs a carve-out for the default rung. *Fix:* add one explicit sentence to §4.3 stating what infrastructure the free-model rung touches and how the "cannot breach" claim reads for that path.

## Substance over theater — strong

No persona theater: two protagonists (Maya, Sam), both load-bearing, used across five UJs with named context. Claims are earned, not slogan — the differentiation is argued with cited evidence (JMIR n=525,824 quit drivers `[5]`; UCL ~25% shame complaints `[6]`; disordered-eating literature `[8]`, §4.2). Feature-specific NFRs are sparse but concrete (copy-store tone pass §4.2; "no UX divergence by input method" §4.1). The Vision (§1) is OpenPlate-specific — "One tap on a plate photo, a barcode, or a typed note logs a meal" — and could not be swapped into another PRD unchanged.

### Findings
- None that add information.

## Strategic coherence — adequate

The thesis (§1) is explicit and the feature set executes it: no-AI core first, AI as opt-in tutor, privacy-by-architecture, no-dark-patterns as the anti-competitor (§4.7). Success metrics validate the thesis rather than activity — SM-2 ("coaching is the product" `[b2]`), SM-4 (no-AI core actively used), and named counter-metrics SM-C1/C2/C3 that the PRD explicitly says "do not optimize." MVP scope kind is problem-solving/experience and §6.1/6.2 cohere with it. But two seams between the thesis and the build are left unmapped.

### Findings
- **[high]** "No-AI core is complete" vs. FR-1's recognition pipeline (§2.3 UJ-3 edge case, §4.1 FR-1, §7 SM-4) — UJ-3 promises "he uses no AI at all — the no-AI core is complete and the app is still a full coach"; SM-4 measures "% of weekly-active users who log at least one Plate Log with AI fully off"; but FR-1's consequence has no AI-off caveat for photo→Database Food recognition ("A single well-lit plate photo returns recognized Food Entries in ≤3 s"). Nothing in the PRD says what powers photo recognition in the no-AI core. Either FR-1 silently depends on the model/free rung (making "AI fully off" manual-only, and SM-4 a much weaker claim than it reads) or the no-AI core contains a recognition capability never specified. This bleeds into done-ness (FR-1) and SM-4 definition. *Fix:* state explicitly in §4.1/§4.3 which rungs power photo recognition and restate FR-1's first consequence with the AI-off behavior.
- **[medium]** Assimilation of MFP-refugee framing without a decision (§1, §5) — The "migration window" and "launch channel" are asserted as strategy (`[27][30][41][43]`) but no concrete go-to-market action follows from it; "Why now" is a market justification, not a build decision. This is a soft spot rather than a break — noted so architects/story teams don't invent the migration play. *Fix:* one sentence in §6 MVP Scope naming the launch mechanism the window opens (e.g., migration content, README posture), or mark it "for the post-PRD go-to-market artifact."

## Done-ness clarity — adequate

This is the strongest section overall and the one that will carry story creation: 15 FRs, essentially every one with "Consequences (testable)" written as verifiable conditions (≤3 s FR-1, ≤2 s FR-2, "no signup flow can produce an under-13 profile" FR-13, "LICENSE, CONTRIBUTING, and a published No-Dark-Patterns Standard exist at tag time" FR-12). Negatives are QA-checkable ("Coach Notes never contain a calorie-shaming verdict" FR-4). v2-bound FRs (FR-8, FR-14) carry pre-declared v2 acceptance, which is exactly right. The gaps are at the two seams above and where acceptance numbers are quoted but not operationalized.

### Findings
- **[medium]** FR-1's 85–95% recognition figure never becomes acceptance (§4.1 FR-1) — "the system recognizes foods (~85–95% food identification on typical plates `[25]`)" is research citation, but no consequence references it; the only timing/fallback bounds are given. An engineer can't tell when recognition is "done" to spec. *Fix:* add a consequence like "≥X% of a fixed v1 plate-test-set resolves to a correct Database Food match or explicit pick/miss flow," and make the AI-off behavior explicit (ties to the coherence finding).
- **[medium]** Coach Question domain is unbounded (§4.2 FR-4) — "one Coach Question about balance/composition in plain, non-judgmental language" defines a single negative (no verdict) but no shape: how many question archetypes exist, what a template consumes (resolved food groups?), what "more depth" (FR-5) returns. Story creation will face an open-ended content library. *Fix:* enumerate a v1 question archetype set (e.g., balance, portion, fiber, variety) that the template-store must cover.
- **[low]** FR-10's "self-managed sync" is under-bound (§4.4 FR-10, §6.1) — consequences are negative-only ("No third-party sync") plus an `[ASSUMPTION]` deferring the mechanism to architecture. Acceptable for a deliberately open call, but as written there is no testable positive outcome. *Fix:* when the sync path is chosen, attach a consequence; until then flag FR-10's consequence row as pending architecture decision so story teams don't over-build.

## Scope honesty — strong

§5 Non-Goals is genuinely useful (seven explicit "Not" statements, including the important "Not a kids' app in v1… no child-facing calorie content"). §6.2 Out-of-Scope carries `[NOTE FOR PM]` callouts that name *why* each deferral is emotional ("the 'AI is yours to run, fully' promise completes only here") rather than letting cuts happen silently. Deferred-vs-decision-open is kept distinct: FR-8/FR-14 are v2 by decision; OQ-5/OQ-6 are open-by-design architecture calls. Open-item density (9 OQs + 7 inline assumptions + 4 NOTE FOR PM) looks high but is mostly architecture-deferred or non-blocking research caveats (OQ-8, OQ-9), and the PRD says so.

### Findings
- **[medium]** Launch-facing open items have no owner or deadline (§8 OQ-1, OQ-4) — For a "launch-grade" PRD, OQ-1 ("this is the highest-leverage survey to run pre/at-launch") and OQ-4 (COPPA "needs an actual privacy-law review before build") are the two items with a date-implied criticality, yet neither names who carries it or by when. *Fix:* attach an owner + target date to OQ-1 and OQ-4 in §8, or demote "launch-grade" wording if neither is scheduled.

## Downstream usability — adequate

The skeleton is exemplary: Glossary (§3) anchors vocabulary, FR/UJ/SM IDs are contiguous and unique (FR-1..15, UJ-1..5, SM-1..5 + SM-C1..3), cross-references resolve by ID not "see above," and every UJ has a named protagonist carrying context inline ("Maya, 38, mom of three and the household's 'dining manager'"). Each FR's "Realizes UJ-N" ties features to journeys cleanly. But the renumbering and a dangling term cost real extraction time downstream.

### Findings
- **[high]** §4.8 no longer exists but is referenced five times — References to §4.8 appear at §2.2 ("See §4.8 and the Constraint Safety Guardrail for the rationale"), UJ-4 edge case ("no-nagging is a design requirement, §4.8"), Glossary (Managed-Oversight), §4.2 feature-NFR ("No-Dark-Patterns Standard (§4.8)"), and §4.6's header rationale. The document's feature sections run §4.1–§4.7, and the No-Dark-Patterns Standard (the evident former §4.8) is now §4.7. Every one of those resolves to nothing. *Fix:* bulk-repoint §4.8 → §4.7 (and re-check with a grep for "§4.8" after any future renumber).
- **[medium]** "Constraint Safety Guardrail" is referenced but never defined (§2.2 line "See §4.8 and the Constraint Safety Guardrail for the rationale") — no Glossary entry, no section, no definition anywhere in the document. This looks like a §4.6-era name that survived a rename. *Fix:* either define it in §3 or retarget the reference to §4.6's rationale paragraph.
- **[low]** "no-AI core" is a load-bearing, unfenced noun (§3, §7 SM-4, §4.3) — It is the object of a success metric and the rung-1 claim, but it is only defined inside the "AI Tier" glossary entry and never gets its own entry. Downstream glossary extraction will treat it as an undefined god term. *Fix:* add "No-AI Core" as a glossary term with its rung-1 definition.

## Shape fit — strong

Consumer product, multi-persona, meaningful UX → named-protagonist UJs are load-bearing, and this PRD's five UJs form one coherent narrative (Maya's week across logging/coaching/quota/offline, Sam's self-host insertion) rather than a catalogue. The FR/UJ/SM structure plus Glossary and Assumptions Index is the right form for a chain-top PRD feeding UX → architecture → stories. Not over-formalized (no single-operator-style table sprawl) and not under-formalized (kids-safety handled as design constraints on FR-13 rather than as a child UJ). The only blemish is the orphaned §4.8 references, already counted.

### Findings
- None beyond the §4.8/Guardrail items above.

## Mechanical notes

- **Broken cross-refs (§4.8):** five references to a section that no longer exists — see downstream finding (high). This is the single most important mechanical fix.
- **Assumptions Index roundtrip is nearly clean:** every inline `[ASSUMPTION]` (FR-1, FR-6, FR-10, §4.5 Flutter, FR-13 legal, §6.2, §8 OQ-2) appears in §9. One reverse gap: §9's first bullet ("§2.3 UJ-1 persona — 'dining manager' = mom 62–82% `[18]`") has no corresponding inline `[ASSUMPTION:` tag at §2.3 — the persona is asserted as research fact, then indexed as an assumption. Either add the inline tag or drop the index bullet.
- **ID continuity:** FR-1..15, UJ-1..5, SM-1..5, SM-C1..3, OQ-1..9 all contiguous and unique; §6.1/§6.2 FR references all resolve. No gaps or duplicates.
- **Glossary drift:** "Dining Manager" (capitalized in §3) vs. "dining manager" (lowercase, quoted, §2.3 UJ-1) and §9's "mom" phrasing — cosmetic. "DB-grounded" (§4.1) and "no-AI core" are used informally and are not glossary terms.
- **Typos:** FR-3, §4.1 description: "typing or voice-nulling a food name" — "voice-nulling" is almost certainly "voice-typing" (or "voice note"); the intent (voice-capture isn't in the FR's consequences) should be reconciled.
- **Required sections present:** Vision, Target User, Glossary, Features (with FRs + testable consequences), Non-Goals, MVP Scope, Success Metrics (incl. counter-metrics), Open Questions, Assumptions Index — all present, appropriate to a consumer-launch PRD.