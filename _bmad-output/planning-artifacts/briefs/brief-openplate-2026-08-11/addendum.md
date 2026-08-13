# OpenPlate Brief Addendum

Parked depth from the brainstorm (2026-08-11), research digest (docs/notes.md), and freshened web research. Belongs downstream (PRD, architecture, solution design), not in the lean brief.

## Brainstorm decisions & theses (source: brainstorm-product-check memlog)

- **BYOK spectrum** — the AI stack is a user-choice spectrum: *no AI → free-model quota → user's own OpenAI-compatible key → local model (Ollama/llama.cpp, PaliGemma/Qwen-VL class)*. The no-AI core is a finished product; AI is a bolt-on tutor.
- **Economics are the ethics** — self-install, BYOK, no ads, $0 growth = no data collection = kid-safe by architecture, not by feature.
- **Coach, not calculator / "Coaching, not counting"** — tagline-quality principle; meals are lessons, not scores.
- **It IS a tracker too** — track first, coach second is a sequence: the number is the hook, the understanding is the change.
- **Users:** adults/parents primary; "even a kid can use it" is a *design principle*, not the target; teens under oversight.
- **Growth loop:** first 100 users are the feedback engine — app feedback and coaching-content feedback shape the product; the community IS the product.

## Anchors from freshened web research (2026)

- **BYOK nutrition apps exist & are growing:** Fud AI (iOS, MIT, no account, BYOK, 13 providers incl. Ollama local), tahaygun/ai-calorie-tracker (2025, PWA, no account) — closest existing analogs; none pair with family-coach positioning.
- **Photo-recognition is the durable closed-source advantage** (Self-Hosted Nutrition, 2026) — the gap OpenPlate targets.
- **Food identification ~85–95% top-1 accuracy** — portion size is the 15–25% error bottleneck.
- **Independent audits (Nutrient Metrics) are far more reliable** than vendor self-benchmarks (PlateLens claims ±1.2%).
- **Database-grounded pipelines** (map food → USDA/OFF) beat end-to-end photo→calories.
- **Zero-cost vision paths:** Gemini free tier (2.5 Flash ~250 requests/day); **Cloudflare Workers AI ~10k neurons/day incl. hosted vision**; OpenRouter `:free` roster (~14–28 models, volatile); Groq free but text-only. Free-tier quotas churn — architect for swap-ability.
- **Local self-hosted VLMs:** PaliGemma 2 (3B/10B/28B), Qwen2-VL, Pixtral 12B runnable; need fine-tuning for portion reliability (zero-shot not SOTA).
- **Kids market:** Ummy ("no streaks, no guilt", ages 2–13), KidMeal AI, Sito; RDN-reviewed guidance 2026: avoid calorie language/restriction for kids under 12, parent-managed.
- **Consolidation & trust gap:** MyFitnessPal acquired Cal AI (closed Dec 2025, announced Mar 2026); MFP 18+, Cal AI 13+ age-gates; MFP has 2018 breach history — a family-trust opening.
- **Data:** Open Food Facts ~4M products (ODbL), barcode APIs; USDA FoodData Central hosts the new FNA Child Nutrition Database (Apr 2026).
- **Regulation tailwind:** EU AI Act high-risk obligations (Aug 2026), Commission age-verification Recommendation (Apr 2026) — no-dark-pattern, privacy-first positioning aligns with compliance trends.

## Options considered / parked

- Food You/OpenNutriTracker analysis (docs/notes.md): neither has AI photo or gamification; cross-platform gap.
- Gamification (levels/badges/quests) — deferred to consistency-layer for adults; NOT kid-quests in v1.
- Hosted convenience tier — explicitly out; keeping no-server architecture is the trust proof-point.