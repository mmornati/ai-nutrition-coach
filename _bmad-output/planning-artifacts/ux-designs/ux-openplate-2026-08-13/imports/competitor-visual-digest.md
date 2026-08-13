# Competitor Visual Design Digest — OpenPlate

Web research, Aug 13, 2026. Text-described visual language only (no screenshots).
Full source-by-source detail in the subagent run; this is the working copy kept for Finalize.

## Per-app design characterizations (source-backed)
| App | Personality take | Visual language (as described) | Source confidence |
|---|---|---|---|
| Fud AI | Calorie ring for the data-you-own crowd — a plainspoken utility, not a seducer | User-customisable "Theme Colors · Matching Icons"; home = "calorie ring and macro progress"; dense, engineering-led; 15 languages | High (site + App Store + GitHub) |
| Ummy | A calm, forgiving co-parent — patterns not scoreboards, floors not ceilings | Emoji-as-dataviz nutrient icons (🌿 Fiber · 🥛 Calcium · ☀️ Vit D · 💪 Protein); "Nutrients already on track turn a calm green"; 7-day averages vs age targets; "No streak to break, no nagging" | High (ummyapp.com + Play) |
| Sito | Efficient worry-killing dashboard — calories side-note, 15 nutrients the point | "Daily nutrition dashboard with calories, protein, carbs, fat, fiber goals"; "nutrient floors not calorie ceilings" | Med-high UX; palette unverified |
| Solid Starts | Trusted expert-guided reference library | Card/tab-heavy explorer; "Conversational Onboarding… chat bubbles and expert avatars"; celebratory pop-up on first log | High structure; palette unverified |
| Yomi | Chatty AI concierge | Conversational-first, tiny (7.2 MB); no visual description in text | Med-high framing; visuals unverified |
| KidMeal AI | Per-child personalisation as trust pitch | "Score breakdown" screen; analysis flow; "No ads. No brand deals." | Medium structure; visuals unverified |
| Food You | Material You quiet one — phone wallpaper decides theme | "Dynamic theming… adapts to your device"; modular home cards | High |
| OpenNutriTracker | Minimalist, citable, refreshingly absent — the anti-MFP | Material 3 + custom theming; home calorie ring; trends tab (ships streaks — tension) | High |
| MyFitnessPal | Cautionary tale in card density | Apr 2026 "Today" screen = "gigantic, space-consuming cards"; rating 3.67→1.82 Feb–May 2026 | High |
| Cal AI | Glossy teen — beautiful, confident, pricing-veiled | Clean, food-photography-forward, animations, dark mode; "doesn't feel like a spreadsheet"; removed from App Store over deceptive billing | High look-feel |

## Inspiration shortlist (candidate directions for OpenPlate)
1. Calm-green nutrient states, emoji-native, no scoreboard (Ummy).
2. Week-as-unit-of-truth: 7-day averages not single-day verdicts (Ummy/Sito).
3. Conversational "consultation" onboarding with friendly expert framing (Solid Starts).
4. Photography-forward glossy-clean production value BUT accuracy humility — reject fake-decimal confidence (Cal AI vs Macaron warning).
5. User/device-owned theming as trust signal + OSS differentiation (Fud AI, Food You, OpenNutriTracker).

## Anti-patterns checklist (design-relevant)
- No guilt streaks / streak-shaming (loss-framed "streak about to die" notifications).
- No countdown/scarcity pressure; pricing visible before commitment (Cal AI removed over hidden billing).
- Colour for coaching states, not red-flag guilt (AP Jul 2026: "Green means go, red means stop").
- Reward competence feedback, not intake-maxing.
- Avoid card-dense "modernisation" that buries the primary action (MFP Today screen).
- No product pitches inside personal data ("no brand deals" stance = differentiation).

## Bonus
- OSS hobbyists actively copy polished UIs (r/fossdroid "Simple and beautiful Calorie tracker" copying Yazio) — pleasant-looking OSS is a real whitespace.
- Open Food Facts redesigned mobile app = "more fun, personalised" community-brand counterexample.