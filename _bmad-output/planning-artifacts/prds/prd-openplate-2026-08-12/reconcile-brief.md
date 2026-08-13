# Input Reconciliation: Brief → PRD

Reconciled inputs: `brief-openplate-2026-08-11/brief.md`, `brief-openplate-2026-08-11/addendum.md` → `prd-openplate-2026-08-12/prd.md`.

Coverage pass: thesis, non-goals, §6.1/§5 glue, FR/UJ mapping, and the brief's declared v2 parkings (deep gamification, social/sharing, hosted cloud, weight/body tracking, macro prescriptions, non-food tracking) carry intact. Below are the real losses/contradictions.

## GAP 1 — [HIGH] Managed-oversight: brief v1 in-scope → PRD v2

**Brief (line 56, Scope In v1):**
> **In (v1):** photo/barcode/manual meal logging; balanced-plate coach layer with questions; free-tier AI default + BYOK + local-model path; self-host/install and cross-platform mobile; offline-first local data; parent/managed oversight mode.

**PRD (line 240–242, FR-14):**
> Parent/guardian oversight of a *teen* profile … **Not in v1.** … **(v2, declared now)**

**PRD (line 286, §6.2 Out of Scope for MVP):** "Managed-oversight profiles (FR-14) — v2, pending legal validation (Open Question 4)."

The brief placed "parent/managed oversight mode" inside the **v1** scope line; it never parked it to v2. The PRD defers it unilaterally, hanging the deferral on COPPA legal validation (OQ4). The `[NOTE FOR PM] do not cut without explicit decision` tag confirms this is a live cut, not a reconciled park. Brief's secondary-user line ("teens under oversight") reinforces that oversight was expected at launch.

## GAP 2 — [MEDIUM] SM-2 rewrites the learning-moment success metric from meal-share to a user-level binary

**Brief (line 49, Success — User):**
> a meaningful share of logged meals includes a learning moment (a "why" surfaced or a coach question answered)

**PRD (line 296, §7 SM-2):**
> % of users who, in the first 30 days, engage with ≥1 Coach Question beyond dismiss

Brief's criterion is *per-meal* prevalence of a learning moment ("a why surfaced" or a question answered). PRD operationalizes it as a 30-day *per-user* binary that (a) drops the per-meal share and (b) counts only interaction, not the "why surfaced" Coach Note itself. Same spirit, changed granularity — the "coaching is the product" test can pass on PRD SM-2 while failing the brief's meal-level bar.

## GAP 3 — [MEDIUM] "$0 infrastructure run-rate" success criterion is lost, replaced by "$0 revenue target"

**Brief (line 51, Success — Community):**
> self-host+install counts, contributors, and community-contributed coaching content growing; $0 infrastructure run-rate holds.

**PRD (line 301, §7 SM-5):**
> …Launch posture = mission/community, $0 revenue target `[b1][b3][b5]`.

Same line, reframed: the brief's guardrail is a **zero-cost infrastructure run-rate** (frugality = ethics proof-point; line 52 keeps "no revenue targets specified" separate). The PRD converts it to a "$0 revenue target," which is a different claim and quietly drops the brief's operating-cost invariant from the success criteria. The infra-cost story survives only inside §1 narrative, not as a measure.

## GAP 4 — [LOW] Local-model path: brief v1 in-scope → PRD v2 seam

**Brief (line 56, Scope In v1):** "…free-tier AI default + BYOK + local-model path…"

**PRD (line 175–177, FR-8):**
> Self-hosters can attach a local model as the AI rung. **Not in v1** — tagged here so architecture reserves the seam now.

Low severity: the brief's own `[ASSUMPTION: platform priority and v1 feature depth may change in review]` (line 58) and the addendum's "local self-hosted VLMs … need fine-tuning for portion reliability (zero-shot not SOTA)" pre-authorize a depth cut, and the PRD is internally consistent (UJ-3 resolution, §6.2, Assumptions Index). Still, the brief committed "the AI is yours to run, fully" to v1 and the PRD's own `[NOTE FOR PM] — emotionally load-bearing` (§6.2) confirms the promise completes only in v2. Worth an explicit owner decision, not a silent re-seam.