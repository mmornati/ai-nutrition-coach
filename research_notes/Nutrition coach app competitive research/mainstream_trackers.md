# Mainstream calorie/nutrition trackers: feature comparison (as of Oct 2026)

Source-quality note: many 2026 "reviews" found in search are SEO blogs run by competing AI calorie apps (nutrola.app, nutriscan.app, amyfoodjournal.com, bentobunny.app, calorie-trackers.com). They disagree on prices. Wherever possible the claims below cite primary sources (vendor sites/help centres, press, peer-reviewed studies). Claims backed only by competitor blogs are labelled "(competitor blog)". Prices vary by region and change often; treat all prices as indicative.

## Logging methods and portion entry (per app)

### Takeaway
By 2026 all seven apps offer search and barcode scanning, and all except possibly FatSecret's free tier offer AI photo or natural-language logging, almost always behind the paywall. MacroFactor has the most complete logging toolkit: AI Snap/Describe, label scanner, recipe import from URL, copy days, quick-add, speech-to-text, and metric/imperial units. AI photo results are presented as editable ingredient lists with amounts, not as final answers.

### Cited Findings
- **MyFitnessPal (MFP):** Free tier covers nutrition, weight and exercise tracking. "Barcode & Meal Scan", "Voice Log", "Macro tracking with custom goals", "Net Carbs Mode", "Intermittent fasting", "Food insights & comparison" and ad-free logging are listed as Premium-only on the official premium page (EU pricing) — [MFP Premium page](https://www.myfitnesspal.com/premium)
- MFP 2026 Winter Release (Feb 2026): Premium unlocks Meal Scan, Barcode Scan and Voice Log, and iOS gets a "Photo Upload" option to snap a meal now and log it later — [GlobeNewswire press release, 24 Feb 2026](https://www.globenewswire.com/news-release/2026/02/24/3243668/0/en/myfitnesspal-debuts-its-2026-winter-release.html) (page returned 403 to fetch; content taken from the search snippet)
- MFP Meal Scan suggests matching database foods, and the user edits them before logging. Voice Log turns a spoken meal into editable food results — [amyfoodjournal review 2026](https://www.amyfoodjournal.com/blog/myfitnesspal-review) (competitor blog)
- **Lose It!:** "Snap It" (photo) and "Say It" (voice) are Premium. One source says free users get 3 trial uses of each — [nutriscan Lose It pricing](https://nutriscan.app/blog/posts/lose-it-pricing-2026-free-vs-premium-2b4e921555) (competitor blog); [Sunrise Digest Lose It review 2026](https://thesunrisedigest.com/eat/lose-it-review-2026/). loseit.com blocks crawlers, so no primary confirmation.
- **Yazio:** AI Food Tracking means photographing a meal, after which the app detects ingredients and gives initial portion and nutrition estimates the user can edit. Yazio's own help says it is a "rough estimate". The feature was free for all users at launch and is now Pro-only — [Yazio Help: AI Calorie Tracking](https://help.yazio.com/hc/en-us/articles/39137901903889-What-is-the-AI-Calorie-Tracking-Feature-and-how-does-it-work). Yazio also offers barcode and manual tracking — [yazio.com calorie counter](https://www.yazio.com/en/calorie-counter). A help article covers logging restaurant and canteen food — [Yazio Help](https://help.yazio.com/hc/en-us/articles/208846625-How-can-I-record-food-from-restaurants-or-canteens)
- **FatSecret:** Logging options include search, barcode and a Premium-only "Smart Food Scan" ("Smarter Lebensmittelscanner"), which logs all components of a plate from one photo — [FatSecret help (DE)](https://www.fatsecret.com/de/fatsecret-app-hilfe/erste-schritte/optionen-zum-hinzufügen-von-lebensmitteln); [FatSecret help (FR)](https://www.fatsecret.com/fr/fatsecret-aide-appli/commencer/options-dajout-daliments). FatSecret also sells image recognition and NLP as a B2B API — [FatSecret Platform](https://platform.fatsecret.com/features/image-recognition-and-nlp). A "Smart Assistant" for voice and text logging is said to be Premium — [nutriscan FatSecret](https://nutriscan.app/blog/posts/fatsecret-premium-worth-it-2026-paid-perks-vs-free-plan-325b0c6774) (competitor blog)
- **Lifesum:** "AI tracking" (formerly "Multimodal Tracking") lets users snap a photo, speak, type or scan. It is a Premium feature, and diary meals can be re-tracked with "Track with AI". Traditional search tracking remains available — [Lifesum Help: AI vs Traditional](https://help.lifesum.com/en/article/what-is-the-difference-between-ai-tracking-and-the-traditional-tracking-5l8fj8/); [Lifesum Help: Traditional Food Tracking](https://help.lifesum.com/en/article/traditional-food-tracking-4nzcd7/)
- **Cronometer:** Photo Logging is a Gold (paid) feature. It pulls nutrition data from NCCDB and CFCD (Canadian Nutrient File) — [Cronometer blog: Photo Logging](https://cronometer.com/blog/photo-logging/); [Cronometer Gold](https://cronometer.com/gold/)
- **MacroFactor:** The official feature list covers AI photo logging or meal description, barcode scanner, nutrition-label scanner, verified-database search, recipe import from URL, custom foods and recipes, quick-add calories/macros, copy-paste of foods, meals or whole days, "smart history", speech-to-text logging, and metric and imperial units — [macrofactor.com/macrofactor](https://macrofactor.com/macrofactor/)
- MacroFactor AI (May 2026): two modes. "Snap" is a quick photo. "Describe" accepts one or more photos plus text with extra instructions. The AI splits meals into editable ingredients with amounts. If a barcode is not found, the app falls back to the label scanner — [MacroFactor May 2026 update](https://macrofactor.com/mm-may-2026/); [AI food logging comes to MacroFactor](https://macrofactor.com/ai-food-logging/); [Tracking on vacation](https://macrofactor.com/tracking-vacation/)

### Inferences
- The baseline is now search, barcode, AI photo and AI text/voice, all with an editable result. The free/paid line usually falls at barcode (MFP only) or at AI (everyone).
- Showing AI estimates as editable ingredient-plus-grams rows is the common UX pattern. It matches the open-source app's need for grams entry.
- MacroFactor's "barcode miss leads to label OCR" fallback, and its Open Food Facts submission partnership, are directly relevant to an OFF-based app.

### Gaps
- No primary source confirmed recipe-URL import, saved meals or meal templates for MFP, Lose It!, Yazio, FatSecret or Lifesum. Most have "meals"/"recipes" features, but I did not verify them in this pass.
- I did not find documentation of how each app enters portions (grams vs servings vs household measures). MacroFactor states metric and imperial units. For the rest this is general knowledge, not cited.

## Food database: source, size, accuracy

### Takeaway
There are two families. Crowdsourced databases (MFP, Lose It!, FatSecret, largely Yazio and Lifesum) are large but noisy. Curated databases (Cronometer: NCCDB/USDA/CNF, lab-analysed; MacroFactor: "verified" with 1.36M+ entries) are smaller but more reliable. Peer-reviewed studies find good agreement for energy and macros but weak agreement for sodium, cholesterol and micronutrients in crowdsourced apps.

### Cited Findings
- MacroFactor: "verified food search" with over 1.36 million entries, barcode coverage in US/CA/UK/AU/IE/NZ/JP/FR/ES (DE improving), and user submissions via an Open Food Facts partnership — [macrofactor.com/macrofactor](https://macrofactor.com/macrofactor/)
- Cronometer: free tier advertises "nutrition data from lab-analyzed sources" — [Cronometer free features](https://cronometer.com/blog/free-features/). Photo logging uses NCCDB and CFCD — [Cronometer photo logging](https://cronometer.com/blog/photo-logging/). One review cites 800k+ manually verified foods from USDA, NCCDB and others, with no user-submitted data in the core DB — [Cronometer review roundup](https://repreturn.com/cronometer-review/) (secondary)
- 2018 *Public Health Nutrition* study: 24-h recalls entered into MFP, Fitbit, Lose It!, MyPlate and Lifesum were compared with NDSR (research-grade). Energy/macro correlations ranged r=0.73–0.96, and apps tended to underestimate relative to NDSR. Foods were entered by researchers, not consumers — [Cambridge, Public Health Nutrition 2018](https://www.cambridge.org/core/journals/public-health-nutrition/article/assessment-of-the-accuracy-of-nutrient-calculations-of-five-popular-nutrition-tracking-applications/456D6CB0961D86CBEA2E868C52DF7ABF)
- 2019 JMIR mHealth study (vs UK dietitian software Dietplan6): Lose It! was least comparable. FatSecret and Lose It! underestimated protein and sodium, and MFP and Samsung Health micronutrients were less reliable — [JMIR mHealth uHealth Feb 2019 (DOAJ)](https://doaj.org/article/e71f33ad55574fca8999bf4152317fb5)
- 2020/21 JMIR validation of MFP vs Belgian Nubel DB: energy r=0.96 after cleaning, but cholesterol ρ=0.51 and sodium ρ=0.53 (weak) — [PMC7641788](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7641788/)
- MFP users with eating disorders report "distrust of MyFitnessPal's accuracy" (qualitative forum study, McCaig et al. 2019) — [Western Sydney University repository](https://researchers.westernsydney.edu.au/en/publications/engagement-with-myfitnesspal-in-eating-disorders-qualitative-insi/)

### Inferences
- For a French/EU-first app, CIQUAL (generic foods) plus Open Food Facts (branded) mirrors the "curated generic plus barcode-branded" model that Cronometer and MacroFactor use. Sodium/salt and micronutrients are where crowdsourced data is weakest, so show provenance.

### Gaps
- No official 2026 database-size figures found for MFP, Lose It!, Yazio, FatSecret or Lifesum. No academic study of Cronometer or MacroFactor accuracy was found.

## Nutrients tracked

### Takeaway
Cronometer leads by a wide margin (roughly 82–95 nutrients depending on tier and date). MacroFactor offers full micronutrients with custom targets and "top contributors". Yazio Pro and MFP give extended nutrients (fibre, sugar, salt, fatty acids, some vitamins/minerals). Lifesum's ratings use protein, unsaturated fat, fibre, saturated fat, salt and sugar.

### Cited Findings
- Cronometer: the free tier tracks up to 84 nutrients and compounds and Gold up to 95 (Gold signup page). A Feb 2026 update says "up to 92 nutrients and compounds". The free-features blog says 82 micronutrients. These figures conflict — [Cronometer Gold signup](https://cronometer.com/gold/signup/); [Cronometer updates](https://cronometer.com/blog/cronometer-updates-whats-new-improved/); [Cronometer free features](https://cronometer.com/blog/free-features/)
- MacroFactor: full vitamin/mineral tracking with custom targets, "top contributors" for any macro or micro, and nutrient-timing insights — [macrofactor.com/macrofactor](https://macrofactor.com/macrofactor/)
- Yazio Pro: "detailed nutritional information" including fatty acids, fibre, sugar, salt, vitamins and minerals. Free covers calories and macros — [Yazio Help: Pro](https://help.yazio.com/hc/en-us/articles/208847005-How-does-Yazio-Pro-support-my-goals); [Yazio factsheet Dec 2025](https://filecontent.yazio.com/press/factsheet-yazio-en.pdf)
- MFP: custom macro goals and Net Carbs mode are Premium — [MFP Premium](https://www.myfitnesspal.com/premium)
- Lifesum food rating weighs protein, unsaturated fat and fibre against saturated fat, salt and sugar per 100 kcal. Water tracking is listed as a feature — [Lifesum rating explainer](https://lifesum.com/nutrition-explained/how-to-use-the-lifesum-food-meal-and-day-rating-to-achieve-healthy-habits); [bestcalorieapps Lifesum](https://bestcalorieapps.com/en/reviews/lifesum/) (secondary)

### Inferences
- The minimum credible set for a "calm" app is energy, protein, carbs, fat, saturated fat, sugars, fibre and salt (the EU label "big 7" plus fibre), all available from OFF and CIQUAL. Micronutrients are a differentiator only Cronometer and MacroFactor do well.

### Gaps
- Alcohol and water tracking per app were not verified from primary sources.

## Goals and targets

### Takeaway
MacroFactor is the reference for adaptive targets. It estimates expenditure from logged intake and weight trend, adjusts weekly, and is "adherence neutral". It offers Coached, Collaborative and Manual modes, different macros on different days, and fasting-day support. The other apps mostly use static formula-based targets with premium macro customisation.

### Cited Findings
- MacroFactor: expenditure is computed from weight trend and energy intake, and weekly coaching adjustments follow it. The algorithm "holds" when tracking pauses and updates once weight is logged again — [AI food logging / MacroFactor posts](https://macrofactor.com/10-macrofactor-features/); [macrofactor.com/macrofactor](https://macrofactor.com/macrofactor/)
- MacroFactor: bulk/cut/maintain goals, preferred rate of change, goal ETA, low-carb/keto/carb-focused/balanced programs, per-day macros, fasting days, and an optional "expenditure modifier" that adds step data — [macrofactor.com/macrofactor](https://macrofactor.com/macrofactor/); [macrofactor.com](https://macrofactor.com/)
- MFP: macro tracking with custom goals is Premium-only — [MFP Premium](https://www.myfitnesspal.com/premium)

### Inferences
- An adaptive TDEE estimate from intake plus weight trend can run locally with no server, which suits a privacy-first PWA.

### Gaps
- No primary source found stating which BMR formula (e.g. Mifflin-St Jeor) MFP, Lose It!, Yazio, FatSecret, Lifesum or Cronometer uses. Not verified in this pass.

## Insights and coaching

### Takeaway
Scoring is common: Lifesum food/meal/day ratings and the weekly Life Score, and Yazio's "smart food rating". So are fasting timers (Yazio, MFP Premium, Lifesum) and meal plans/recipes (MFP Premium+, Lifesum, Yazio, FatSecret). MacroFactor's coaching is numeric weekly check-ins rather than food judgement.

### Cited Findings
- Lifesum Life Score is a weekly summary of what went well and how to improve. Food, meal and day ratings exist. Meal plans run 7–21 days with shopping lists (e.g. Keto Burn, Sugar Detox) — [Lifesum help: what's new](https://help.lifesum.com/en/article/what-is-new-these-are-the-latest-additions-to-our-app-1vy6mk1/); [Lifesum rating explainer](https://lifesum.com/nutrition-explained/how-to-use-the-lifesum-food-meal-and-day-rating-to-achieve-healthy-habits); [Lifesum how it works](https://lifesum.com/how-it-works)
- Yazio Pro groups features into smart tracking (AI tracking, future meal planning, smart food rating, detailed nutrients), activity, fasting and insights — [Yazio Help: Pro](https://help.yazio.com/hc/en-us/articles/208847005-How-does-Yazio-Pro-support-my-goals). Fasting: free has a basic timer, Pro adds more protocols (sources disagree on which) — [calorie-trackers Yazio](https://calorie-trackers.com/reviews/yazio/) (secondary)
- MFP Premium includes intermittent fasting and "food insights & comparison". Premium+ ($99.99/yr US) adds the Meal Planner — [MFP Premium](https://www.myfitnesspal.com/premium); [MFP blog: Premium+ tiers](https://blog.myfitnesspal.com/myfitnesspal-membership-pricing-tiers/)
- MacroFactor: weekly adjustments are "adherence neutral". It has no client coaching portal — [macrofactor.com/macrofactor](https://macrofactor.com/macrofactor/)
- FatSecret Premium is said to include a meal planner, dietitian meal plans, a water tracker and a Learning Center — [nutriscan FatSecret](https://nutriscan.app/blog/posts/fatsecret-premium-worth-it-2026-paid-perks-vs-free-plan-325b0c6774) (competitor blog)

### Inferences
- Food grades (Lifesum, Yazio) conflict with a "calm framing / no moral labels" product rule. MacroFactor's neutral, trend-based check-in is the closest model to calm coaching.

### Gaps
- Not verified: whether MFP's 2026 release includes a conversational AI assistant. A blog mentions "Monika voice calls" in MFP, but this is unverified.

## Integrations

### Takeaway
Integration data was only partly verified. MacroFactor supports Apple Health and Google Fit (with 30-day import) but has no smartwatch or tracker integration. Yazio Pro and Lose It! Premium are said to gate wearable sync.

### Cited Findings
- MacroFactor: Apple Health and Google Fit with 30-day historical import, widgets, no smartwatch/tracker integration, no desktop app — [macrofactor.com/macrofactor](https://macrofactor.com/macrofactor/)
- Lose It! smartwatch sync is Premium — [nutriscan Lose It](https://nutriscan.app/blog/posts/lose-it-pricing-2026-free-vs-premium-2b4e921555) (competitor blog). Yazio wearable sync is Pro — [nutriscan Yazio](https://nutriscan.app/blog/posts/yazio-pricing-2026-free-vs-pro-what-pro-unlocks-33b26f8fc7) (competitor blog)

### Gaps
- MFP, Cronometer, FatSecret and Lifesum integration lists (Garmin, Fitbit, Strava, Health Connect) and exercise-calorie handling were not verified in this pass. A PWA cannot access HealthKit or Health Connect directly in any case.

## AI-driven features (2025–2026)

### Takeaway
Every app now has camera-based meal recognition, and most also have voice or natural-language logging, almost always in the paid tier. Vendors themselves warn the estimates are rough and must be edited.

### Cited Findings
- MFP: Meal Scan, Voice Log, and Photo Upload on iOS (2026) — [GlobeNewswire Feb 2026](https://www.globenewswire.com/news-release/2026/02/24/3243668/0/en/myfitnesspal-debuts-its-2026-winter-release.html); [MFP Premium](https://www.myfitnesspal.com/premium)
- Lose It!: Snap It and Say It — see above
- Yazio: AI photo tracking, now Pro-only, and described by Yazio as a "rough estimate" — [Yazio Help](https://help.yazio.com/hc/en-us/articles/39137901903889-What-is-the-AI-Calorie-Tracking-Feature-and-how-does-it-work)
- Lifesum: AI tracking by photo, voice, text or scan (Premium) — [Lifesum Help](https://help.lifesum.com/en/article/what-is-the-difference-between-ai-tracking-and-the-traditional-tracking-5l8fj8/)
- FatSecret: Smart Food Scan (Premium) — [FatSecret help DE](https://www.fatsecret.com/de/fatsecret-app-hilfe/erste-schritte/optionen-zum-hinzufügen-von-lebensmitteln)
- Cronometer: Photo Logging (Gold) — [Cronometer blog](https://cronometer.com/blog/photo-logging/)
- MacroFactor: AI Snap/Describe with multi-photo plus text (May 2026), AI-assisted label scanning — [MacroFactor May 2026](https://macrofactor.com/mm-may-2026/)

### Inferences
- AI logging is now table stakes and a paywall lever. BYO-key AI in a free, self-hosted app is a real differentiator on price.

### Gaps
- No independent 2026 accuracy benchmark of these AI photo features was found.

## Monetization

### Takeaway
Typical annual prices run from about $40 to $100. MFP is the most expensive and the only app that paywalls barcode scanning. MacroFactor has no free tier but also no ads. Cronometer has the most generous free tier for nutrient data.

### Cited Findings
- MFP: Premium €49.99/yr or €9.99/mo (EU, official page) — [MFP Premium](https://www.myfitnesspal.com/premium). US: Premium $79.99/yr ($19.99/mo) and Premium+ $99.99/yr — [MFP blog: tiers](https://blog.myfitnesspal.com/myfitnesspal-membership-pricing-tiers/); [recurdash](https://recurdash.com/subscription-pricing/myfitnesspal)
- MFP put barcode scanning behind Premium, effective 1 Oct 2022 (earlier for accounts created from 1 Sep 2022). The move drew strong backlash — [Digital Trends](https://digitaltrends.com/phones/myfitnesspal-barcode-scanning-not-free-premium-subscription); [Droid Life, Aug 2022](https://www.droid-life.com/2022/08/24/myfitnesspal-puts-barcode-scanner-behind-premium-paywall/); [Pocket-lint](https://www.pocket-lint.com/apps/news/162386-wow-myfitnesspal-put-its-popular-barcode-scanner-feature-behind-a-paywall)
- MacroFactor: $11.99/mo, $47.99 per 6 months or $71.99/yr. 7-day trial, no free version, never serves ads, data never sold and exportable — [macrofactor.com/macrofactor](https://macrofactor.com/macrofactor/)
- Cronometer Gold: the Gold page lists $10.99 (monthly). Third-party annual figures range from about $36 to $55 — [Cronometer Gold](https://cronometer.com/gold/); [Cronometer subscription types](https://support.cronometer.com/hc/en-us/articles/360028026971-Subscription-Types)
- Lose It!: Premium is reportedly $79.99/yr for new subscribers in 2026 (previously $39.99), with a $299.99 lifetime option — [nutriscan](https://nutriscan.app/blog/posts/lose-it-pricing-2026-free-vs-premium-2b4e921555) (competitor blog; unverified)
- Yazio Pro: roughly $40–48/yr, sold as 3- or 12-month subscriptions — [Yazio factsheet](https://filecontent.yazio.com/press/factsheet-yazio-en.pdf); prices from [calorie-trackers](https://calorie-trackers.com/reviews/yazio/) (secondary)
- Lifesum Premium: roughly $45–50/yr (sources conflict) — [bestcalorieapps](https://bestcalorieapps.com/en/reviews/lifesum/) (secondary)
- FatSecret Premium: the App Store lists $6.99/mo or $38.99/yr (undated). A 2026 blog claims $59.99/yr in the US — [App Store](https://apple.co/3DHFT1U); [nutriscan](https://nutriscan.app/blog/posts/fatsecret-premium-pricing-2026-monthly-yearly-eb76d29acc) (competitor blog)

### Gaps
- Official 2026 US prices for Lose It!, Yazio, Lifesum and FatSecret are unconfirmed.

## Documented complaints: accuracy, ads, paywalls, guilt, privacy

### Takeaway
The main documented harms are MFP's 2018 breach of about 150M accounts, the 2022 barcode paywall backlash, crowdsourced accuracy problems (especially sodium and micros), and an eating-disorder association: 73% of MFP users with an ED felt the app contributed to it.

### Cited Findings
- MFP breach: about 150M accounts. Usernames, emails and hashed passwords were exposed in Feb 2018 and disclosed in March 2018. Payment data was not affected — [MacRumors, 29 Mar 2018](https://macrumors.com/2018/03/29/myfitnesspal-data-breach); [9to5Mac](https://9to5mac.com/2018/03/29/my-fitness-pal-data-breach/)
- Levinson et al. 2017 (*Eating Behaviors*, n=105 with ED diagnoses): about 75% used MFP, 73% of those felt it contributed to their ED, and this perception correlated with symptoms. The study is cross-sectional — [PubMed 28843591](https://pubmed.ncbi.nlm.nih.gov/28843591/); [PMC5700836](https://pmc.ncbi.nlm.nih.gov/articles/PMC5700836/)
- Paywall backlash: [Pocket-lint](https://www.pocket-lint.com/apps/news/162386-wow-myfitnesspal-put-its-popular-barcode-scanner-feature-behind-a-paywall); [Slashdot/The Verge](https://news.slashdot.org/story/22/08/25/1955238/myfitnesspal-paywalls-barcode-scanner-that-made-counting-calories-easy)
- Accuracy: see database studies above. Reviewers also say Yazio's image recognition cannot reliably identify all ingredients and portions — [calorie-trackers Yazio](https://calorie-trackers.com/reviews/yazio/)

### Gaps
- I did not systematically collect Reddit or app-store complaints. Lifesum "why is it so bad now" content comes only from a competitor blog and was excluded.
