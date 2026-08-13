---
title: Product Brief: OpenPlate
status: final
created: 2026-08-11
updated: 2026-08-11
---

# Product Brief: OpenPlate

## Executive Summary

OpenPlate is an open-source, self-hostable nutrition app that behaves like a **coach, not a calculator**. It records what a family eats — photo, barcode, or a tap — then teaches *what* they're eating, *when* one choice beats another, and *why*. Its thesis: **not all calories are equal**, and a number alone never changed anyone's eating; understanding does.

OpenPlate targets **adults** — parents who want to eat better and raise kids who understand food — built simple enough that *"even a kid can use it,"* and safe enough that it never uses guilt, never collects data, and never pressures. Privacy isn't a feature layered on; it falls out of the architecture: **self-host, no account needed, no dark patterns.**

**AI is an optional tutor, never a requirement.** The core logging-and-coaching loop is a complete product with no key at all. When people want photo understanding, they choose: a free-tier model quota first, their own OpenAI-compatible API key (BYOK), or a local model on their own hardware. The *economics are the ethics*: the frugal choices that keep OpenPlate running at zero cost are exactly the choices that make it trustworthy.

## The Problem

People who want to eat better face trackers that are closed, costly, and quietly shaming — or that treat meals as math problems. The category leaders collect data and exclude minors by age-gate (MyFitnessPal is 18+, Cal AI is 13+); MFP's 2025 acquisition of Cal AI signals a consolidation wave with commercial paywalls and dark patterns. Pediatric guidance warns against calorie-restriction language with young children — yet that is the default idiom of every mainstream tracker.

Open-source alternatives (Food You, OpenNutriTracker, Waistline, wger) are real but leave the durable gap open: **photo recognition remains the closed-source advantage, and none of them teach**. None pair AI photo logging with family-safe design or coach behavior. A parent seeking help is left choosing between a data-eating calculator or a feature-poor ledger.

## The Solution

OpenPlate is the family's food coach in their pocket:

- **One-tap logging** — snap a photo, scan a barcode (Open Food Facts / USDA FoodData Central), or log by hand. The core loop works fully offline and with no AI at all.
- **The coach layer** — meals land on a **balanced-plate visual**, not an intimidating total. The "coach" line asks, never condemns: *"Nice color today — what's one vegetable you'd add tomorrow?"* It explains the *why* behind choices, so logging genuinely improves the way a family eats.
- **AI when you want it** — free-tier model quota first (e.g. Gemini free tier, Cloudflare Workers AI vision), then **BYOK** to any OpenAI-compatible endpoint, or a local model (PaliGemma/Qwen-VL class). Photo-identification accuracy is a solved commodity (~85–95%); portion size stays user-correctable, paired with a verified nutrition database rather than end-to-end "photo→calories" guessing.
- **Kid-smart by design** — no calorie-shaming language, no streaks-as-guilt, parent-managed; the same "even a kid can use it" simplicity that makes it trustworthy makes it pediatrician-friendly.
- **Yours to run** — self-hostable, installable, no account required, local-first data. [ASSUMPTION: self-hosting experience assumed — install target is technically comfortable families; see open questions]

## What Makes This Different

- **The family + AI + coach combination is white space.** FOSS trackers exist; BYOK photo apps exist (Fud AI, ai-calorie-tracker); kids apps exist (Ummy, KidMeal AI). None combine open-source ownership, photo AI, and an educational coach in one product.
- **Trust by architecture, not by promise.** Closed apps *claim* privacy; OpenPlate *can't* collect data when there's no account and no server. Frugality is the ethical design.
- **"Coach, not calculator" is a real market position** — and it happens to align with pediatric guidance and no-dark-pattern regulation trends.
- **Honest limits:** raw vision-portion accuracy is not our moat — the category's 15–25% portion error is everyone's problem. We win on *ownership, teaching, and family-safety*, not on photo metrics. [ASSUMPTION: no private model or dataset advantage claimed]

## Who This Serves

**Primary: the adult who cooks.** Thoughtful parents (late 20s–50s) who prepare family meals, want to understand their own eating, and would prefer their kids grow up food-literate rather than weight-obsessed. Success for them: meals logged with understanding, choices that improved, and a tool that never scolds.

**Secondary: teens under oversight** and tech-curious adults who value self-hosted, privacy-first software. [ASSUMPTION: target market detail — see open questions]

## Success Criteria

- **User:** ≥3 meals logged/week per active user; a meaningful share of logged meals includes a learning moment (a "why" surfaced or a coach question answered); low "edited the AI's guess" friction — estimation feels trustworthy.
- **Product truth:** the no-AI core is actively used by enough users to prove coaching is the product, not AI.
- **Community:** self-host+install counts, contributors, and community-contributed coaching content growing; $0 infrastructure run-rate holds.
- **Trust:** no data-breach class of incidents possible by design; a "no dark patterns" standard documented and met. [ASSUMPTION: no revenue targets specified]

## Scope

**In (v1):** photo/barcode/manual meal logging; balanced-plate coach layer with questions; free-tier AI default + BYOK + local-model path; self-host/install and cross-platform mobile; offline-first local data; parent/managed oversight mode.

**Out (v1):** deep gamification (streaks, quests) — the consistency layer is a later iteration; social/sharing features; hosted cloud offering; weight/body tracking; macro-prescriptions or diet plans; non-food tracking. [ASSUMPTION: platform priority and v1 feature depth may change in review]

## Vision

In two to three years OpenPlate is the **trusted default for family nutrition** — the open ecosystem where a community-maintained coaching-content library makes every family's choices clearer, where the photo-AI blind spot (portion size) has been attacked in the open with depth sensors and self-hosted fine-tuned models, and where "frugal, owned, and kind" becomes a recognizable standard in food software — the anti-dark-pattern reference point for an industry consolidating the opposite way.