---
title: 'market research: OpenPlate go/no-go + positioning'
type: 'market'
topic: 'OpenPlate go/no-go + positioning'
decision: 'Enter or skip the family-nutrition market; position OpenPlate (open+coach+family wedge)'
source: ''
status: complete
preset: 'standard'
validation: 'normal'
created: '2026-08-12'
updated: '2026-08-12'
claims:
  verified: 13
  unverified: 0
---

# market research: OpenPlate go/no-go + positioning

**Decision this research serves:** Enter or skip the family-nutrition market; position OpenPlate (open+coach+family wedge)

## Executive Summary

**Go — but size it as a mission/community product, not a venture-scale market bet.** The evidence clears OpenPlate's go/no-go gate on *fit* and *differentiation*; it does not clear it on *segment economics*, which remain unproven.

Three findings drive the answer:

1. **The claimed position is real — and the slogan is taken.** "Coach, not calculator" is saturated at the adult end (≥12 players, including MyFitnessPal's "Nutrition Coach" and Cronometer's "Crono Coach") [27]. The genuinely unclaimed cell is **family + trust + data-local/self-host** — every family entrant is cloud/closed-source, and every self-hosted OSS tracker lacks the coach/family angle [13][28]. The privacy-first story alone is already the norm in the OSS niche; privacy is a differentiator *only in combination* with family coaching [11][13].
2. **The pain is real and independently evidenced — not just marketed.** Peer-reviewed and regulatory sources (JMIR scoping review: median 70% abandonment within 100 days, n=525,824; UCL/Loughborough: ~1/4 of user complaints are shame/demotivation from rigid calorie targets [6]; EAT cohort and a 38-study systematic review linking food-app use to disordered-eating symptomology [8]; FTC's $1.5M Kurbo settlement with algorithmic disgorgement [38]) independently validate the "coach, not calculator" direction and the no-dark-patterns stance [5][9].
3. **A live migration window exists.** MyFitnessPal's 2026-05-01 paywall (photo upload, recipe import, per-meal macros moved to Premium; a 48-hr 1★ wave followed, magnitude unverified) [30], two N.D. Cal. class actions (Roberts' deceptive-"free" suit, Shah's cookie suit that survived dismissal) [41], a recurring "I lost my history" complaint pattern [42], and a replacement-blog cluster have opened a timed switcher stream [43].

**Biggest caveat:** the family/kids sub-segment is economically invisible — no TAM exists, the only verifiable kid-adjacent revenue is ~$49 MRR (KidMeal AI, hobby scale), and general health-app willingness-to-pay base rates are low (~9%) [14][31]. The category's dominant competitor is not another app — it's "do nothing"/quitting: ~65% of users abandon their first calorie app within 90 days (vendor-reported, directional), retention falls to ~8% by Day 30 and ~4% by Day 90 [3][4]. OpenPlate wins or loses on *retention through reduced friction and trust*, by the evidence in this report — not on capturing a sized market.

Positioning verdict in one line: **don't lead with "coach, not calculator" (taken); lead with the unclaimed cell — "the family nutrition coach that is yours to run," aimed at the adult who cooks (82% of households have one default "dining manager," mom-led) [15].**

---

## Dimensions

### 1. Market size & direction — direction real, magnitude unresolved

All four 2026 sizing reports agree that diet & nutrition apps grow at double-digit rates (~12–20% CAGR), but absolute 2026 value spans a **6x spread** — $2.9B to $16.9B [1]. Europe fitness-app figures conflict similarly ($3.0B @ 13.4% vs $3.3B @ 26.5%) [1]. Direction and double-digit persistence to ~2030–36 are high-confidence; any absolute number chosen for a pitch must name its methodology, and the spread should be disclosed rather than averaged [2].

### 2. Reachable segment & behavior — the retention cliff is the load-bearing constraint

- Adoption is broad but shallow: 71% of US adults use health apps / 64% use devices (Reach3, n=1,043); 63.4% used an mHealth app in the past year (NIH NCCIH) — but historical daily-use (~19%, Gallup 2019) and retention norms (Day-30 ~8%, good ≈12%, Day-90 ~4%) show an install-vs-active chasm [3][4].
- Food-logging specifically: ~65% abandon the first calorie app within 90 days; median lifetime usage 11–14 days [4] (vendor-reported single chain; treat as directional). The 2026 quit voices: loss of motivation (38%) and free alternatives (25%); subscription-fatigue cancellations at record levels (47% of consumers cancelled ≥1 subscription in 2026; 52% of US households cancelled one in the past 90 days) [4].
- **The parent decision-maker is knowable:** fresh 2026 data (n=2,000 US parents with school-aged kids) — 82% of households have **one default "dining manager" (mom)**, moms run 71% of weekly meal decisions vs dads 58%, and the meal-management emotional load is stress 30% / overwhelm 25% / burnout 21% (moms 23% vs dads 14%) [15]. Parents already believe eating habits are lifelong but mostly feel unequipped — 34% confident shaping them; 48% can't tell which foods are healthy (historical, but stable context) [16].
- **Absence confirmed:** no ≤2-yr study exists on how parents *choose* nutrition/food-tracking apps; family food apps score well on functionality and poorly on engagement (JMIR screening of 2,881 apps) [15].

### 3. Pains & quit-drivers — friction, shame, and missing knowledge

- **Friction is the dominant, physical quit driver:** manual logging runs 5–10 min per meal, 20–30 min/day (~3h/week) [17]. The documented failure sequence: unlogged weekends, missing restaurant entries, "close-enough" database picks drifting 200–500 kcal/day, snack-heavy days, the week-6 motivation cliff, travel resets [18].
- **Shame is the emotional quit driver:** UCL/Loughborough (~60k posts on 5 apps): ~1/4 of negative posts are shame/disappointment/demotivation; apps set targets from weight goals, not public-health benchmarks (including −700 kcal/day); streak/notification guilt causes avoidance [6][9].
- **Missing knowledge/content is an abandonment driver** (JMIR scoping review driver #4, incl. lack of professional advice) — dieters dislike high-input, numbers-first apps and want motivational support [7] — but there is causal evidence for coaching: empirical EatWellUK RCT (n=187) showed web-delivered automated personalized nutrition advice improved diet quality vs population guidelines [5][35][36].
- **AI-photo logging is proven fast, not proven sticky:** independently verified — photo logging is ~2–25s/dish vs ~12–22s manual, 86% vs 68% accuracy (n=42); usability SUS 77 vs 52.9 [19]. But the "AI ≈ 2x retention" claim is **single-vendor (Nutrola) and NOT independently supported** [20]; directly on-point adherence studies are negative or neutral (identical photo-vs-paper adherence in T2DM; mothers' photo-record adherence collapsing to 11% vs 74% over 6 months) [19]. Treat retention-multiplier as a working hypothesis to instrument in-product.

### 4. Competitive landscape — the only occupied slot is the slogan itself

- **"Do nothing"/quitting is the biggest competitor** (~65% abandon the first calorie app within 90 days, ~70% stop within 100 days) [4][5]. Professional coaching substitutes are priced far above apps — dietitian consults $100–250 (follow-ups $75–175), online coaching $99–200/mo [39] — stretching the value gap OpenPlate's free coach fills.
- **The adult "coach" arrow is fully occupied, including by incumbents** — MFP (in-app "Nutrition Coach"), Cronometer ("Crono Coach"), plus Goodbite, Alma, Hobbes.health, NutriTracker.io, Noom, equ, MyPlateCoach, Carbon, MacroFactor [27].
- **The family + trust + data-local/self-host cell is unclaimed.** Every family entrant found is closed-source/cloud/subscription (FamilyPlate AI, Calorique Family Kitchen, Famēlia, Swoodie, TinyFuel, MealSync, Famnom, Yomi) [13], and the kids-first entrants are closed freemium too (Ummy, Sito, KidMeal AI) [24][46]. Every self-hosted OSS tracker (Food You, OpenNutriTracker, Waistline, NutriTrace, Dietry, PANTS, Nutritheous, NutriNutri [23]; SparkyFitness is the closest family+privacy analog [12]) lacks the coaching/educational layer [45]. Nobody retrieves the *combination*.
- **The kids-first wedge is live and already speaks OpenPlate's language** ("no streaks, no guilt", "nutrient floors, not calorie ceilings") — but at hobby scale with near-zero traction: Ummy has 0 ratings (~8 downloads); Sito has 8–10 ratings [24][46].
- **BYOK/self-host is validated as a real pattern** by Fud AI (13 LLM providers incl. local Ollama, keys encrypted in Keychain, "free, open source, privacy first") — yet even Fud AI added paid "Premium Gemini" tiers ($6.99/wk, $199.99/yr), and its site copy ("fully free, no subscription") directly contradicts its App Store IAPs [22]. That contradiction is the framing-honesty trap OpenPlate must avoid.

### 5. Named-player teardowns (compressed)

| Player | Model | Wedge position | Traction | Closest-overlap score* |
|---|---|---|---|---|
| **Fud AI** | OSS MIT, BYOK 13 providers | free/privacy-first adult tracker; Premium Gemini added | 317★, ~1k+ iOS dl, solo dev | 7/10 |
| **ai-calorie-tracker** | OSS GPLv3 PWA BYOK | no-account, browser-local | 21★ | 6/10 |
| **Ummy** | Freemium, closed | anti-shame kids (2–13), "no streaks"; D2C shake brand | 0 ratings, ~8 dl | 6/10 |
| **Sito** | $59.99/yr closed iOS | "Cal AI for kids", nutrient floors | 8–10 ratings, all 4–5★ | 5/10 |
| **Food You** | GPL-3.0+, F-Droid | privacy-baseline tracker, vitamins/minerals | 562★, v3.4.9 2026-06-30 | 5/10 |
| **OpenNutriTracker** | GPL-3.0 Flutter | OFF/USDA, local, no ads/accounts | 10K+ dl, 4.1–4.2★ | 4/10 |
| **Nutritheous** | MIT self-host | photo-AI BYOK, true self-host (Docker/GCS) | 8★, 7 commits | closest pure overlap |
| **NutriNutri** | GPLv3 Flutter | BYOK OpenRouter, photo/text AI | 16★ | 2nd genuine overlap |
| **MFP / Cal AI** | Closed, subscription | 18+/13+ age gates; Cal AI = "fast, don't think" | $310M rev 2025, 30M+ MAU | 2/10 |

\* overlap 0–10 with OpenPlate's wedge (open + self-hostable + family-safe + educational coaching + privacy/no-dark-patterns).

**Load-bearing teardown notes:** Cal AI's acquisition ARR resolved to **$30M+** (TechCrunch primary 2026-03-02; $40M is Dealroom, $50M ARR-Club — secondhand) — and MFP's CEO (Mike Fisher, in the acquisition interview) concedes that Cal AI serves "fast, don't-make-me-think" users, leaving deep teaching/coaching unclaimed [44]. Between Fud AI, Nutritheous, and NutriNutri, the OSS-AI niche is full of BYOK adult calorie tools; **none teach, none target parents**. No player in the teardown has a mature product in the family-coach cell [45]. MFP's scale — ~$310M revenue 2025, 220M registered, a 2018 breach of >150M accounts — sets the stakes of the migration window [25][40], while its telemetry breadth (up to eight third-party trackers in 2025 reporting) is the framing contrast to OpenPlate's data-local promise [26]. The category's OSS user voice skews to feature wishlists and "not a medical application" disclaimers [29]. And the wedge voice is already in the review stream: *"MyFitnessPal is great at counting, but not coaching."* [50]

### 6. Regulatory & family-safety — a moat available, and a trap to be designed around

- **COPPA is now both stronger and more specific** (2025 amendments, finalized Federal Register 2025-04-22; full compliance date 2026-04-22, already passed): "personal information" now includes biometric identifiers (facial templates/voiceprints); separate verifiable parental consent is required for third-party disclosures (targeted advertising, AI training); the "support for internal operations" carve-out means **local inference = internal, third-party API AI = disclosure** [38].
- **Kurbo precedent is the cautionary tale**: FTC $1.5M settlement, data deletion, and the first algorithmic disgorgement; the complaint alleged the age-screen "signaled" kids could register by stating ≥13 (per regulatory analyses) [38]. FTC's 2026-02-25 policy statement offers an age-verification "verify, don't profile" lane (collecting a child's data *solely* to verify age, without parental consent) [48].
- **Design-legal safe lane for OpenPlate:** plain plate photos without face/voice recognition are *not per se* biometric; meal logging on a **parent's account** with kids as observed profiles avoids the under-13 account matrix; adults-only self-hosted core sidesteps most exposure. **But self-hosting ≠ immunity** — exposure follows direction/audience, not server location. Any open under-13 onboarding re-enters the full compliance matrix [47].
- **Double-edged finding:** the same evidence (FTC/COPPA, NEDA, EAT cohort) makes family-safety a genuine trust opening *and* kids-food-tracking a reputational/compliance minefield — pediatric guidance counsels avoiding calorie language for young children (an explicit under-12 cutoff appears only in RDN-aligned marketing, low confidence; the disordered-eating association itself is well-evidenced) [8][37]; child profiles in OpenPlate must track "are they getting what they need," not calories.

### 7. GTM & pricing — economics support the low-cost, annual-plan reality

- **Sub-market mechanics favor OpenPlate's shape:** Health & Fitness is the only category where annual plans dominate (60.6% of H&F subscription revenue) and has the highest trial-to-paid (35.0%); category median prices $12.99/mo / $38.42/yr; EU prices are 29–39% higher [14]. Kids' apps already price around $50–60/yr [14].
- **Base rates are brutal:** 57.7% of new subscription apps never cross $1,000 lifetime; 8-in-10 never reach $10K, and only 7.9% ever cross $100K (Lifestyle worst at 97.9%) [49]; willingness-to-pay base rate ~9% (HK, n≈3,000; a comparable segment's median WTP ~US$6.5) [31].
- **Privacy is a trust/retention asset, not a pricing lever:** no monetary "privacy premium" survives scrutiny (the "3x" claim is vendor marketing, excluded [34]); what is proven is that privacy protections raise willingness to *share* (JAMA conjoint: protections = 51.5% of decision weight) [32] and that consumers distrust tech companies with health data (7% vs 64% for a doctor; entity-sharing fell 3.4→2.7 per person 2020–2023) [33]. Trust buys retention and distribution, not price — consistent with OpenPlate's free/$0 economics ("the economics are the ethics").
- **Acquisition reality for an open product:** H&F CPI $3–6 (iOS) / $1.5–3 (Android); fully-loaded CAC 2–3x CPI [10]. The free/OSS model flips this: distribution is the MFP switcher stream (a live review-to-review migration window) plus the self-host/community channel, not paid CPI [43].

---

## Cross-Dimension Insights

1. **The retention cliff is the market's real constraint — and the wedge answers it.** Sizing (dim 1), behavior (dim 2), and pains (dim 3) all converge: the industry's problem isn't demand; it's that ~65% quit within 90 days and ~25% of complaints are shame. OpenPlate's "no-stigma coaching + one-tap logging" is aimed at the two proven quit-drivers simultaneously — friction and shame — which is the strongest structural argument for the product.
2. **Capturing the migration window and dodging the slogan are the same GTM decision.** The MFP switcher stream exists *because* incumbents paywalled photo logging; the co-opted slogan means OpenPlate's copy must point at the *family + yours-to-run* cell instead [41].
3. **COPPA turns the "kids" decision into an architecture decision.** The childhood-tracking evidence (disordered-eating risk, Kurbo) plus the fresh regulatory regime means child profiles are only viable under a parent account, in "are they getting what they need" form — which happens to match both the research and the marketing (Ummy/Sito) already claiming "nutrient floors, not calorie ceilings" [37].
4. **AI belongs in the product, but its retention claim belongs in the roadmap, not the pitch.** Speed and usability are independently proven; the 2x-retention multiplier is not. Lead with the track-first/coach-second value and instrument the retention hypothesis after launch [19].
5. **The package — BYOK + self-host + $0 — converts a compliance hazard into an architectural proof.** Local/no-keys/no-cloud is the COPPA internal-operations lane made the default; third-party API AI (BYOK paths) carries the separate-consent burden only if OpenPlate markets child-facing profiles [47].

## Contrary Evidence

*(red team = off in this run; normal validation only. The strongest counter-findings gathered during the loop are reported here.)*

- **The AI-photo claim sticks out of the pitch:** independent adherence studies of photo logging are negative or neutral — identical adherence to paper (T2DM), 11% photo-record adherence vs 74% survey prompts over 6 months, no adolescent engagement lift [21]. A retention strategy that leans on "AI photo = 2x" has no independent support.
- **The kids segment may be a dead end commercially:** all traction evidence is hobby-scale; no independent data shows parent willingness-to-pay for family nutrition tools [14].
- **"Coach" framing adopted by incumbents:** MFP and Cronometer now brand themselves as coaches; if coaching is the *only* claim, OpenPlate is one OSS voice among very well-funded ones. Only the family + self-host combination is defensible [27].
- **Self-hosting has no demonstrated consumer demand** independent of the privacy-curious niche; the mainstream family buyer may not install anything [13].

## Recommendations

Each is bound to the decision and to the downstream artifact that consumes it.

1. **GO, sized small.** Enter with a mission/community lens and a $0 run-rate; do not build a revenue/VC-size thesis on this segment's economics. *(Confidence: high on fit/differentiation; low on segment size.)*
2. **Position for the unclaimed cell, not the occupied slogan:** "the family nutrition coach that is yours to run." "Coach, not calculator" remains a useful sanity-check internal phrase — never the primary claim. Feeds: *brief.md* (Introduction/Solution, vision line). *(High.)*
3. **Primary user = the adult who cooks** (the 82%-household dining manager), with kids as parent-managed profiles in "are they getting what they need" mode — never calorie-targets for under-12s. Feeds: *brief.md* (Who This Serves) → *PRD* personas. *(High.)*
4. **Design to the COPPA safe lane:** adults-only accounts; no under-13 onboarding; plain-plate photos (no face/voice); local inference by default so AI stays in the "internal operations" carve-out; document the neutral age-screening requirement before any mixed-audience feature. Feeds: *architecture* constraints; get a legal validation of the under-13 stance. *(High.)*
5. **Make the migration window the launch channel:** MFP switcher content (the "Loyalty Tax" review stream) + self-host community inbound; keep barcode/photo-friction low; publish honest, contradiction-free pricing/AI wording (learn from Fud AI's "free" vs IAP gap). Feeds: *GTM plan*. *(Medium-high.)*
6. **Treat "AI photo ≈ 2x retention" as an in-product hypothesis**, not a marketing fact; instrument it from day one. One-tap speed is the launch retention lever with real evidence behind it. Feeds: *success metrics* + *product backlog*. *(High on speed; unverified on multiplier.)*
7. **Monetize only the optional AI, honestly** (free-model quota → BYOK → local; an opt-in paid AI bundle is defensible *if* the free core stays whole), since trust raises willingness to share, not to pay. Feeds: *brief.md* pricing/assumption + *PRD*. *(Medium.)*

## Open Questions

1. **How do parents choose a nutrition-tracking app?** No ≤2-yr study exists; a small primary survey of the dining-manager segment would be the single highest-leverage next artifact.
2. **What is the actual size/economic ceiling of family-nutrition tracking?** No TAM, no WTP-for-family evidence; the first-100-users engine is the natural instrument.
3. **Does AI-photo logging improve retention at all?** Needs in-product experiment design post-launch.
4. **Does any consumer market exist for self-hosting?** Only the privacy-curious niche is evidenced; mainstream demand unproven.
5. **What exactly does Fud AI's Premium bundle (`recurring vs one-time`) comprise?** Answering this confirms the honest AI-monetization shape OpenPlate could copy or improve.
6. **Independent verification of AI photo-estimation accuracy claims** — PlateLens-style vendor benchmarks (DAI/Foodvision) have no independent replication; only general portion-error bounds (15–25%, ~5–10% with depth) are solid.
7. **Roberts v. MyFitnessPal is single-outlet** (Consumer Tech Wire side report) despite the underlying filing being a fact; it needs a second source before it becomes load-bearing.
8. **"Lost history" surge after the 2026-05-01 paywall is unquantified** — only anecdotal review text exists.
9. **EU primaries unrecovered:** Antenna cancellation data and EuropeActive/Deloitte 2026 report remain aggregator-reported here.

## Source Appendix

Retrieval details (titles, URLs) for every source below are recorded in the run's digest files (`digests/*.md`); this table is the decision-facing index. URLs are given only where a stable identifier exists; publisher/date/accessed resolve each inline reference. Confidence is per-claim as described in the memlog.

| # | Claim/finding it supports | Publisher | Pub date | Accessed | Confidence |
|---|---|---|---|---|---|
| 1 | Diet&nutrition app market size (direction high, magnitude disputed) | TBRC; GVR; MDF; 2 other 2026 reports | 2026 | 2026-08-12 | Low–med |
| 2 | 6x size spread must be disclosed, not averaged | TBRC vs peers | 2026 | 2026-08-12 | Medium |
| 3 | 71% US adults use health apps; 63.4% used an mHealth app past year; 19%-daily-use chasm | Reach3 (via Fierce Healthcare); NIH NCCIH; Gallup | 2026-05-19; 2019 | 2026-08-12 | Low–med |
| 4 | Retention norms: Day-1 24% / D30 8% / D90 4%; churn 9.2%/mo; 52% cancellations; 65%/90d food-logging abandon (vendor-sourced, directional) | Appalize; RetentionCheck; TechRT; Antenna (via SubMend); Nutrola/NutrientMetrics (vendor chain) | 2026 | 2026-08-12 | Low–med |
| 5 | Median 70% app abandonment ≤100 days; quit driver #4 = missing knowledge | JMIR scoping review (n=525,824, 2014–2022) | 2023–24 | 2026-08-12 | High |
| 6 | ~1/4 complaints = shame/demotivation; targets ≠ public-health benchmarks | UCL–Loughborough, British J Health Psych | 2025-10-21 | 2026-08-12 | High |
| 7 | Dieters dislike high-input apps, want motivation | PubMed 28286739 | 2017 | 2026-08-12 | Medium |
| 8 | App use ↔ disordered-eating symptomology | PubMed 39671845 (38-study review); EAT cohort, J Eating Disorders | 2024 | 2026-08-12 | Med–high |
| 9 | Weight-based targets, streak guilt cause avoidance | UCL–Loughborough, British J Health Psych (as 6) | 2025-10-21 | 2026-08-12 | Medium |
| 10 | H&F CPI $3–6 iOS / $1.5–3 Android; CAC 2–3x CPI | Adapty; Artisan | 2026 | 2026-08-12 | Medium |
| 11 | OSS trackers all single-maintainer, no usage data published | GitHub/repo facts (NutriTrace, Waistline, OpenNutriTracker, Dietry, PANTS) | 2026-08 | 2026-08-12 | High |
| 12 | SparkyFitness = closest family+privacy self-host OSS analog | CodeWithCJ repo | 2026 | 2026-08-12 | Medium |
| 13 | Family entrants all closed-source/cloud; self-host niche lacks coach/family | First-party sites (FamilyPlate AI, Calorique, Famēlia, Swoodie, TinyFuel, MealSync, Famnom, Yomi) | 2026-08 | 2026-08-12 | Medium |
| 14 | Kids apps price $50–60/yr; segment economically invisible (KidMeal AI ~$49 MRR); H&F annual-dominance; base rates | RevenueCat (KidMeal AI); Adapty SIS 2026; App Store listings | 2026 | 2026-08-12 | High (data), tiny sample |
| 15 | 82% one dining manager (mom); moms 71% meal decisions; stress 30%/overwhelm 25%/burnout 21%; no ≤2yr app-choice study | Talker Research for EveryPlate (n=2,000); JMIR 2018 (2,881 apps) | 2026-08-10 (Talker) | 2026-08-12 | Medium |
| 16 | Parents feel unequipped to shape habits (34% confident; 48% unclear on healthy foods) | Mott Poll (n=1,767); Gerber 2022; Ipsos UK 2023 | 2017–2023 (historic) | 2026-08-12 | Medium (historical) |
| 17 | Manual logging 5–10 min/meal, 20–30 min/day | moveno citing Konig 2021 | 2021 | 2026-08-12 | Medium |
| 18 | 7 recurring failure points (weekend, restaurants, DB drift, week-6 cliff…) | caloriescam | 2026-03-06 | 2026-08-12 | Medium |
| 19 | Photo logging faster/more accurate/usable; 83% forget to photograph | JMIR mHealth 2025-08-14 (n=42); Keenoa JMIR 2022; JMIR 2024-04-15 | 2022–2025 | 2026-08-12 | High |
| 20 | "AI photo ≈ 2x retention" NOT independently supported (single-vendor Nutrola) | Independent JMIR/PMC adherence studies | 2014–2025 | 2026-08-12 | Unverified multiplier |
| 21 | Contra: photo vs paper identical adherence (T2DM); 11% vs 74% mothers' photo adherence; no adolescent engagement lift | PMC (2014); Public Health Nutrition; JMIR Formative 2024-12-02 | 2014–2024 | 2026-08-12 | High (single sources) |
| 22 | Fud AI: 13 providers, encrypted keys, "free/privacy-first" + paid Premium Gemini $6.99/wk–$199.99/yr contradiction | App Store; GitHub repo | 2026-08 | 2026-08-12 | High |
| 23 | Nutritheous (MIT self-host, Docker/GCS) & NutriNutri = genuine OSS-AI overlaps, no coach/family | GitHub repos | 2026 | 2026-08-12 | Medium |
| 24 | Ummy/Sito language "no streaks, nutrient floors"; traction near-zero (Ummy 0 ratings; Sito 8–10) | First-party sites; AppBrain/App Store | 2026-08 | 2026-08-12 | Medium |
| 25 | MFP 2018 breach >150M; 220M registered; $310M rev 2025 | Bitdefender; Business of Apps | 2018; 2026 | 2026-08-12 | Medium |
| 26 | Incumbent telemetry breadth (Lose It! 25 SDKs; 15 perms; tracker counts) | Privacy scans; WaPo 2025; Incogni; Surfshark/TechRadar | 2023–2025 | 2026-08-12 | Medium |
| 27 | "Coach not calculator" saturated at adult end (≥12 players + MFP/Cronometer) | Goodbite, Alma, Hobbes, NutriTracker.io, Noom, equ, MyPlateCoach, Carbon, MacroFactor, MFP support, Cronometer store | 2025–26 | 2026-08-12 | Medium |
| 28 | family + trust + self-host cell unclaimed | Cross-player scan (13, 22, 23, 24 combined) | 2026-08 | 2026-08-12 | Medium (absence of evidence) |
| 29 | Generic OSS health-app user voice: wishlists & disclaimers | OpenNutriTracker Store reviews; Food You repo | 2026-08 | 2026-08-12 | Medium |
| 30 | MFP paywall 2026-05-01: photo/recipe/portions → Premium; 48-hr 1★ wave (magnitude unverified) | MFP itself; Sensor Tower (via consumertechwire) | 2026-05-01 | 2026-08-12 | High (event); Unverified (magnitude) |
| 31 | WTP base rate ~9%; median ~US$6.5 | Hong Kong study, Digital Health (SAGE) | 2024-04-01 | 2026-08-12 | High (sample) |
| 32 | Privacy protections = 51.5% of share-willingness decision | JAMA Network Open conjoint (n=3,539) | 2023-03-01 | 2026-08-12 | High |
| 33 | 7% trust tech companies with health data | Rock Health 2023 (n=8,000+) | 2023 | 2026-08-12 | Med–high |
| 34 | No monetary privacy premium evidenced ("3x" claim excluded as vendor marketing) | StealthCloud.ai (excluded); contrast 32/33 | 2026 | 2026-08-12 | N/A (−) |
| 35 | EatWellUK RCT: automated personalized advice improves diet quality | JMIR 2022-04-25 (n=187) | 2022-04-25 | 2026-08-12 | High |
| 36 | Coaching/teaching is efficacy-supported, not just marketing | EatWellUK (35); UCL wellbeing framing | 2022–2025 | 2026-08-12 | High |
| 37 | Kids + calorie apps = disordered-eating risk (High); an explicit avoid-for-under-12 cutoff appears only in RDN-aligned marketing (Low) | NEDA 2019; Banner Health 2025; PubMed 39671845; EAT | 2019–2025 | 2026-08-12 | Med–high (ED-risk high; <12 cutoff low) |
| 38 | Kurbo $1.5M settlement + algorithmic disgorgement; COPPA 2025 amendments (biometrics; consent; carve-outs); age-screen "signaled"-claim reported via regulatory analyses | FTC/DOJ; Federal Register 2025-04-22; Lexology/WSGR/FoxBusiness analyses | 2025–26 | 2026-08-12 | High |
| 39 | Dietitian substitutes: $100–250 consult; $99–200/mo coaching | US pricing landscape | 2026 | 2026-08-12 | Medium |
| 40 | MFP acquisition/consolidation signal; 220M registered | Business of Apps; TechCrunch | 2015–2026 | 2026-08-12 | Medium |
| 41 | MFP migration window dated: paywall + class actions | MFP; Bloomberg/PACER/Justia; TopClassActions | 2026-01-27 → 2026-05-07 | 2026-08-12 | High (court order; Roberts single-outlet) |
| 42 | "I lost my history" recurring complaint pattern | Community threads; App Store reviews | 2023–25 | 2026-08-12 | Medium |
| 43 | MFP switcher stream + replacement-blog cluster | reviewsextractor "Loyalty Tax"; appshunter; replacement blogs | 2026-08 | 2026-08-12 | Medium |
| 44 | Cal AI ARR resolved to $30M+ (TechCrunch primary); CEO concedes speed-not-teaching | TechCrunch (Julie Bort, 2026-03-02); Dealroom/ARR-Club (secondhand) | 2026-03-02 | 2026-08-12 | High |
| 45 | OSS-AI niche = BYOK adult tools, none teach, none target parents | GitHub teardowns (Fud AI, Nutritheous, NutriNutri) | 2026-08 | 2026-08-12 | Medium |
| 46 | Kids-first wedge live at hobby scale | Ummy/Sito App Store data | 2026-08 | 2026-08-12 | Medium |
| 47 | COPPA compliance-in-force dates; biometrics; internal-operations carve-out = local-AI lane; self-host ≠ immunity | Federal Register; regulatory analyses (2 law firms) | 2025–26 | 2026-08-12 | High |
| 48 | FTC age-verification policy statement (verify, don't profile) | FTC Policy Statement 2026-02-25 (via law-firm summary) | 2026-02-25 | 2026-08-12 | Medium |
| 49 | AYCI base-rate discipline: only 7.9% of apps cross $100K lifetime | Adapty SIS 2026 | 2026 | 2026-08-12 | High |
| 50 | Wedge voice quotes ("great at counting, not coaching"; "lost 7+ years of history"; "ads every time I log a meal") | App Store; hootfitness; r/loseit | 2023–2026-08-12 | 2026-08-12 | Medium |

## Staleness Map

Freshness windows applied per market/competitive pack: **size ≤18mo, pricing/features ≤3mo, behavior ≤2yr, GTM ≤12mo, regulatory ≤3mo for in-force rule text, trajectory ≤6mo, sentiment ≤12mo.**

Computed re-check schedule (claims by class, earliest first):

| Class | Earliest-dimension claim | Refresh by |
|---|---|---|
| pricing/features | MFP Premium tiers [30], Fud AI Premium [22], kids apps $50–60/yr [14] | 2026-11-12 (≤3mo from pub) |
| regulatory | COPPA/FTC policy-claims [47] | 2026-11-12 (rule text ages fast) |
| trajectory | Cal AI/MFP deal postures [44], Ummy/Sito traction [46] | 2027-02-12 |
| gtm | MFP switcher/migration claims [41] | 2027-08-12 |
| size | Market-size spread [1] | 2028-02-12 |
| behavior | Dining-manager [15], retention norms [4], quit-drivers [5] | 2028-08-12 |
| sentiment | Wedge voice quotes [50] | 2027-08-12 |

**Earliest whole-map refresh: 2026-11-12** (pricing/features + regulatory classes together). The most fragile claims are priced/tiered offers and store-visible traction numbers — anything public-facing quoting prices or ratings should be re-verified before launch material.