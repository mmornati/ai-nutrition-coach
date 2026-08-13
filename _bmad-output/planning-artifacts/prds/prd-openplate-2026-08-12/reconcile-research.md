# Input Reconciliation: Research → PRD

Reconciled input: `market-openplate-go-no-go-positioning-2026-08-12/research.md` (decision: Enter/skip + positioning; 50-source appendix cited inline as `[n]`) → `prd-openplate-2026-08-12/prd.md`. Checked both directions: (1) research obligations (Recommendations 1–7, Contrary Evidence, Executive Summary) → PRD features/metrics/assumptions/open-questions; (2) PRD `[n]` citations → research appendix rows actually support the cited claims.

## Direction 1 — Research obligations → PRD coverage

### Recommendations 1–7 → PRD

| Rec | PRD home | Reflected? |
|---|---|---|
| 1. GO sized small; mission/community, $0; no venture thesis | §7 SM-5 "mission/community, $0 revenue target"; §5 Non-goals; Assumptions | ✓ |
| 2. Lead with unclaimed cell — "family nutrition coach that is yours to run"; "coach, not calculator" never the primary claim | §1 Why-now names family+trust+data-local united cell `[26][27][45]` — **but** §1 opens "behaves like a coach, not a calculator" as the product identity | ⚠ PARTIAL — see GAP 1 |
| 3. Primary user = adult who cooks; kids as parent-managed "are they getting what they need" profiles; no calorie targets for under-12s | §2.3 UJ-1 (Maya, dining manager), §2.2 Non-users under-13, §4.6, Assumptions | ✓ (citation `[18]` wrong — see Fidelity #1) |
| 4. COPPA safe lane: adults-only, no under-13 onboarding, plain-plate photos, local inference = internal-operations carve-out, neutral age screening, legal validation | FR-13 + consequences, §4.6, Assumption (legal validation pending, OQ4) | ✓ |
| 5. Migration window = launch channel; low barcode/photo-friction; honest pricing copy | §4.5 launch channel, FR-9 export, FR-1/FR-2, §4.7 No-Dark-Patterns | ✓ |
| 6. "AI photo ≈2x retention" = in-product hypothesis, instrumented; not marketing fact | §8 OQ7 ("working hypothesis… not a market fact"), §4.3 | ✓ |
| 7. Monetize only optional AI, honestly (quota→BYOK→local; free core whole) | UJ-4, FR-6/FR-7, Tip Jar §4.7 | ✓ |

### Contrary Evidence → PRD

- AI-photo retention claim has no independent support → handled: OQ7, FR-6 honest fallback. ✓
- Kids segment commercially invisible → handled: OQ2, Assumptions "adults-first". ✓
- "Coach" framing adopted by incumbents → acknowledged in §1 Why-now (saturated at adult end) — though §1 still *leads* with it (GAP 1). ⚠
- Self-hosting has no demonstrated consumer demand → **implicit only**: PRD ships native mobile apps (Maya, non-self-hosters) and parks the risk rather than naming it; the risk to the mission/community growth thesis (SM-5) is not surfaced. Minor.

### Research Open Questions → PRD Open Questions

Surfaced 6/9: parent tool-selection (RQ1→OQ1 ✓), family economics (RQ2→OQ2 ✓), AI retention (RQ3→OQ7 ✓), Roberts single-outlet (RQ7→OQ8 ✓), EU primaries (RQ9→OQ9 ✓), Fud AI Premium shape (RQ5→FR-6 provider assumption, partial ✓). **Not surfaced:** RQ4 (does a self-host consumer market exist), RQ6 (independent replication of photo-estimation accuracy claims — PRD covers the *portion* uncertainty bound but not the accuracy-replication caveat), RQ8 (post-paywall "lost history" magnitude unquantified). Minor.

## Direction 2 — PRD `[n]` citation fidelity (spot-check)

Method: for every PRD `[n]`, resolve against research.md's 50-row appendix and compare to the research rows the claim actually comes from. **All mismatches below are indexing errors — the facts themselves are present in the appendix, under different row numbers, and no fabricated claim was found.** Spot-checked rows in scope: 3,4,5,6,8,9,11,13,15,16,17,18,19,24,25,26,27,30,31,32,34,37,38,39,41,42,43,45,46.

### Rows used correctly (verified)

`[3]` (SM-1 retention chasm), `[4]` (SM-1 D30/D90 + churn), `[5]` (§4.2 JMIR quit-driver), `[6]` (§4.2 UCL shame), `[8]` (§4.2/§4.6 disordered eating), `[11]`+`[13]` (§4.4 OSS privacy-norm, matches research's own usage), `[26]` (§1 telemetry contrast), `[27]` (§1/§4.5/§4.7 slogan saturation), `[30]` (§1/§4.5/§4.7 MFP paywall), `[31]` (§4.4 WTP), `[32]` (§4.4 privacy→share-willingness), `[37]` (§4.6 kids+calorie ED risk), `[38]` (§4.6/FR-13/§8 Kurbo + COPPA amendments + age-screen), `[41]` (§1/§4.5 migration window), `[43]` (§4.5 switcher stream), `[45]` (only at §1, unclaimed-cell argument), `[46]` (OQ2 Sito/Ummy).

### Rows cited at an index the row does not support (failures)

| PRD location | Cited as | Claim | Correct row(s) |
|---|---|---|---|
| §2.3 UJ-1; §3 Glossary; §9 Assumptions | `[18]` | 82% dining manager (mom) | **`[15]`** (`[18]` = recurring failure points) |
| §1; FR-1 | `[16]` `[25]` | photo recognition ~85–95% accurate | **`[19]`** (`[16]` = parents unequipped; `[25]` = MFP breach/revenue) |
| FR-1 consequences; FR-1 Out-of-Scope | `[15]` `[25]`; `[15]` | portion-error 15–25%; 5–10% with depth | **`[19]`** + research Open Q6 (unnumbered); `[15]`/`[25]` carry nothing on portion |
| §4.1 description; SM-3 | `[16]` | DB-grounded, never end-to-end photo→calories | no appendix row supports (uncited design claim) |
| §2.3 UJ-3; §4.3 | `[45]` | Fud AI BYOK: 13 providers, keys in Keychain | **`[22]`** (`[45]` = OSS-AI niche, none teach/parents) |
| §2.3 UJ-4; §4.3 | `[17]` `[25]` | free vision tiers ~250 req/day (Gemini), Cloudflare quota | **unsupported** — no appendix row covers these; `[17]` = manual logging times |
| §2.3 UJ-5; FR-9 | `[43]` | "lost my history" failure mode | **`[42]`** (`[43]` = switcher/blog cluster) |
| §2.2 Non-users (bundle `[9][37][38][39]`) | `[9]`, `[39]` | no-kids rationale / kid-safety | `[9]` = streak guilt, `[39]` = dietitian pricing → neither supports; keep `[37]` `[38]` |
| §4.4 | `[19]` | JAMA conjoint 51.5% share-willingness | **`[32]`** (`[19]` = photo logging) |
| §4.4 | `[19]` (in `[19][31][32]`) | privacy not a pricing lever | **`[34]`** replaces `[19]` (`[31]` `[32]` correct) |
| §4.6 (×2); FR-13 | `[39]` | COPPA biometrics + internal-operations carve-out | **`[38]`/`[47]`** (`[39]` = dietitian substitutes) |
| FR-14 | `[9]` | parental controls + privacy-law compliance | unsupported (`[9]` = streak guilt) |
| §1 (bundle `[27][30][41][43]`) | `[27]` + missing | MFP paywall + class actions + 150M breach | drop `[27]`; breach = **`[25]`** (uncited) |
| §8 OQ1 | `[14]` `[20]` | no ≤2-yr parent app-choice study | **`[15]`** (`[14]` = kids pricing, `[20]` = Nutrola) |
| §8 OQ2 | `[34]` (in `[34][46]`) | KidMeal AI ~$49 MRR | **`[14]`** (`[34]` = no privacy premium; `[46]` correct) |
| §8 OQ7 | `[22]` (in `[4][21][22]`) | single-vendor Nutrola | **`[20]`** (`[21]` correct = contra adherence; `[22]` = Fud AI) |
| §8 OQ7 (line "SM-adjacent") | `[24]` | not a pitch claim | **`[20]`** (`[24]` = Ummy/Sito) |
| §8 OQ8 | `[42]` | Roberts single-outlet verified | **`[41]`** (`[42]` = lost-history) |
| §8 OQ9 | `[1]` `[2]` | Antenna/EU primaries aggregator-only | research Open Q9 has no row; `[1]`/`[2]` = market size/spread |

### Fidelity verdict on the spot-check set

Roughly half of the spot-checked rows are **mis-applied in at least one PRD usage**: rows that carry correct, load-bearing facts (photo accuracy `[19]`, JAMA conjoint `[32]`, COPPA amendments/carve-out `[38]`/`[47]`, dining manager `[15]`, Fud AI keys `[22]`, lost-history `[42]`, Nutrola `[20]`) are never cited for those facts — the PRD has instead attached them to different indices. Pattern is too widespread for typos; the PRD reads as drafted against a differently-numbered appendix snapshot. Facts are all present in research.md; only the `[n]` resolution is unreliable.

## Completed gaps

1. **GAP 1 — [MEDIUM] Positioning lead contradicts the go/no-go verdict.** Research Rec 2 (research.md line 33, 121) says "coach, not calculator" is **taken** and must **never** be the primary claim; lead with the unclaimed **family + yours-to-run** cell. PRD §1 (line 17) opens the product identity with "behaves like a coach, not a calculator," the incumbents' own slogans (MFP "Nutrition Coach", Cronometer "Crono Coach" `[27]`). The unclaimed-cell framing is present in Why-now, but the vision line still leads with the occupied slogan — the one sentence research says not to write.
2. **GAP 2 — [HIGH] Citation-fidelity: systematic `[n]` mis-resolution.** 20+ PRD usages across personas, FR-1, §4.3, §4.4, §4.6, FR-13/14, §8 OQs cite appendix rows that do not support the attached claims (see table). All facts verifiable under correct rows — no fabrication — but the PRD's contract is "cited inline as `[n]` against this appendix," and roughly half the spot-checked rows are mis-applied. Fixing is mechanical re-indexing, but leaving it means downstream teams will read the wrong evidence.
3. **GAP 3 — [LOW] Three research open questions not surfaced.** Research RQ4 (does a consumer self-host market exist), RQ6 (independent replication of photo-accuracy claims), RQ8 (magnitude of post-paywall "lost history" surge) have no PRD OQ/ASSUMPTION. (Parent choice, family economics, AI retention, Roberts, EU primaries, Fud AI bundle are all correctly surfaced.)
4. **GAP 4 — [LOW] Contrary-evidence item 4 (self-host demand) left implicit.** The risk that mainstream family buyers won't install anything is mitigated by design (native mobile apps for Maya) but never named inside §8/§9 as the open risk to the Rec 1 "community/mission" sizing; the research flags it as a contrary item and open question.

## Clean items

All other recommendations/metrics/assumptions obligations are honored: GO-small/pitch posture, adult-who-cooks persona (ref), COPPA safe lane + pending legal validation, migration-window launch channel, AI-retention hypothesis treated as in-product (not a pitch claim), honest optional-AI monetization, and SM-1's target set explicitly to beat the D30/D90 cliff `[3][4]`.