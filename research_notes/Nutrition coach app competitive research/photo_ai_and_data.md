# AI photo-based food logging: apps, accuracy, data sources and PWA feasibility (as of Oct 2026)

Research date: 2026-10-21. Many sources are 2026 trade/review blogs. Where a figure comes from a vendor or a competing app's blog, it is flagged as such.

## 1. How the leading photo-logging apps work, and what they cost

### Takeaway
Every mainstream app follows the same loop: photo, item recognition, portion estimate, database lookup for nutrients, then the user edits before saving. Only SnapCalorie (LiDAR on iPhone Pro) and Cal AI (claimed "depth sensor") market depth-based portion sizing. Foodvisor historically used autofocus distance plus item area. Photo logging is almost always behind a paywall of roughly $30 to $150 a year. Consolidation is under way: MyFitnessPal acquired Cal AI.

### Cited Findings
- **Cal AI:** offers three logging paths: photo, barcode and text. It says the phone's depth sensor estimates volume, and a multimodal AI returns macros matched against a database of more than 1M foods. Every estimate can be edited before saving. Premium is about $9.99/month or $29.99/year, with a $59.99/year Family plan. Paywall pricing is A/B-tested and may vary by region or device. Sources conflict on whether the free tier includes about 3 scans a day or none — [eesel.ai pricing 2026](https://www.eesel.ai/en/blog/cal-ai-pricing); [RaftLabs Cal AI teardown](https://www.raftlabs.com/blog/cal-ai-product-teardown)
- **Cal AI ownership:** MyFitnessPal acquired Cal AI. Sources disagree on the date, giving either a deal closed December 2025 or a March 2026 acquisition. Cal AI still runs as a standalone app — [eesel.ai](https://www.eesel.ai/en/blog/cal-ai-pricing)
- **Cal AI accuracy claims:** the vendor's FAQ says "about 80% accurate" without defining the metric, and elsewhere it claims 90% on visible foods — [Open Health blog](https://openhealth.blog/en/blog/ai-photo-calorie-tracking); [eesel.ai](https://www.eesel.ai/en/blog/cal-ai-pricing)
- **SnapCalorie:** the AI first identifies each food and its location on the plate. On iPhone Pro models, LiDAR then measures volume ("Measure exact food volume using depth sensors"). Other phones estimate portions visually. Nutrients come from USDA data ("500k+ foods verified against USDA data"). Users can edit any prediction, and cooking oils can be added by voice note or adjusted afterwards. Premium in-app prices range from $9.99 to $149 (annual), with $19.99 listed as monthly — [SnapCalorie App Store listing](https://apps.apple.com/us/app/-/id1574239307)
- **SnapCalorie self-reported error:** about ±80 kcal on iPhone Pro and ±130 kcal on a regular iPhone for a 500 kcal dish, compared with ±265 kcal for users estimating by eye. It cites its Nutrition5k research dataset of 5,000 dishes with every ingredient weighed. It also claims about 15% mean caloric error. All of these are vendor claims — [App Store](https://apps.apple.com/us/app/-/id1574239307); [Open Health](https://openhealth.blog/en/blog/ai-photo-calorie-tracking)
- **SnapCalorie human review:** it is also described as using a team of human reviewers alongside depth sensing — [TechCrunch](https://techcrunch.com/?p=2561037)
- **Foodvisor:** uses deep learning to recognize over 1,200 food items. It estimates plate-to-phone distance from camera autofocus data, computes each item's area and extrapolates volume by food type. It struggles with sauces, oils and seasonings. These are 2019 descriptions — [TechCrunch 2019](https://techcrunch.com/2019/10/14/foodvisor-automatically-tracks-what-you-eat-using-deep-learning/); [RTInsights](https://www.rtinsights.com/foodvisor-ai-food-tracking/)
- **Foodvisor 2026:** photo logging is not in the free tier, the price is listed at $83.99/year, and logging is reviewed per item. Both points come from a review blog — [calorix.ai comparison](https://calorix.ai/compare/photo-calorie-counter-apps/)
- **Lose It! Snap It:** launched 2016. It shows a few best-guess labels, the user confirms the food, and the app then prompts for an approximate serving size. It is now Premium, and one source says free users get 3 tries — [TechCrunch 2016](https://techcrunch.com/2016/09/29/lose-it-launches-snap-it-to-let-users-count-calories-in-food-photos/); [calorix.ai](https://calorix.ai/compare/photo-calorie-counter-apps/)
- **MyFitnessPal:** Voice Log (Feb 2025 Winter Release) lets members say what they ate and get suggested matches. An "improved Meal Scan powered by an even smarter AI" arrived in the Aug 2025 Summer Release. Meal Scan, Barcode Scan and Voice Log are all Premium. Premium is $79.99/year per the 2026 Winter Release, or $19.99/month per a third party — [Eastern Progress (MFP 2025 summer release PR)](https://www.easternprogress.com/myfitnesspal-announces-its-2025-summer-release/article_0c108ad7-c8f9-5cbe-bbc6-eca09b6be312.html); [MFP 2026 Winter Release PR via AOL](https://lite.aol.com/sports/other/story/0022/20260224/9659625.htm); [Webull (2025 Winter Release)](https://www.webull.com/news/12377891991156736)
- **MyFitnessPal Voice Log engine:** described as "Powered by Claude", combining Anthropic's model with MFP's food data. This is a vendor case study — [Tribe.ai case study](https://www.tribe.ai/case-studies/myfitnesspal)
- **Lifesum:** launched a "Multimodal Tracker" in Feb 2025 that logs from photo, voice, text or barcode, with whole meals or single ingredients. It has since been renamed "AI Tracking" / "Track with AI" (iOS 23.8.0+, Android 20.5.1+) and is included with Premium — [Lifesum press release](https://lifesum.com/page/lifesum-transforms-meal-tracking-with-world-first-ai-powered-multimodal-tracker); [Lifesum help center](https://help.lifesum.com/en/article/ai-tracking-explained-15sw7rk/)
- **Yazio:** sources conflict on whether it offers AI photo logging — [calorix.ai](https://calorix.ai/compare/photo-calorie-counter-apps/); [nutrient-metrics.com](https://nutrient-metrics.com/en/guides/best-photo-recognition-nutrition-apps-2026/)

### Inferences
- The shared pattern is: recognize items, map each item to a database entry, estimate grams, then have the user confirm or edit. The LLM or vision step decides what the items are and how many grams. A curated database supplies the nutrients. This applies to SnapCalorie (USDA) and Cal AI (1M-food DB).
- Depth sensing is native-only. A Safari PWA has no LiDAR or depth API, so portion estimation must rely on visual cues and user correction. Inference: WebXR depth sensing is not available in iOS Safari, but I did not verify this in this round.
- Voice and text multimodal logging (Lifesum, MFP Voice Log) is now table stakes alongside photo.

### Gaps
- No official current flow description for Bitesnap. Its current status, including whether it was discontinued, was not found. Nothing was found on Yazio's photo feature from official sources.
- Cal AI's "depth sensor" claim comes only from a secondary pricing blog. I found no official technical description.

## 2. Accuracy evidence: apps and general vision LLMs

### Takeaway
Independent evidence shows systematic underestimation. In a preliminary 2026 NIH test, photo apps undercounted weighed meals by about 250 to 345 kcal per meal, driven mostly by missed fat. General LLMs (GPT-4o, Claude 3.5 Sonnet) show about 36% MAPE on weight and energy, and much worse on macros. Error grows with portion size because large portions are underestimated. Giving the model extra context, such as ingredients, oil or weights, sharply improves results.

### Cited Findings
- **NIH test (Nutrition 2026, ASN conference, reported July 27–28, 2026; not yet peer-reviewed):** MyFitnessPal, Lose It!, Cal AI and Appediet were run on photos of 100+ meals from an NIH metabolic kitchen, where ingredients are weighed to 0.1 g.
  - All four apps underestimated calories, by about 250 kcal at best to about 345 kcal at worst per meal. Cal AI had the largest undercount.
  - Fat was underestimated by about 30 g per meal. Two apps showed no significant carbohydrate error.
  - A follow-up on 200+ more meals found the apps were worst on low-carb, high-fat keto meals.
  - [HealthDay via Drugs.com](https://drugs.com/news/accurate-photo-based-calorie-apps-4-put-test-130774.html); [HealthDay](https://www.healthday.com/health-news/nutrition/how-accurate-are-photo-based-calorie-apps-4-are-put-to-the-test); [Epocrates](https://www.epocrates.com/online/article/ai-calorie-counting-apps-miss-a-third-of-meal-calories)
- **Fridolfsson et al., *Current Developments in Nutrition*, 9 Sep 2025:**
  - Setup: 52 standardized photos on a white plate with cutlery as the size reference. The prompt asked the model to estimate volume relative to other objects, then report weight, kcal and macros in a table.
  - MAPE for weight / energy:
    - ChatGPT-4o: 36.3% / 35.8%
    - Claude 3.5 Sonnet: 37.3% / 35.8%
    - Gemini 1.5 Pro: 65.0% / 64.2%
  - Macronutrients were worse. Protein MAPE was 61% (GPT-4o) and 110% (Gemini).
  - All models had negative bias slopes (−0.23 to −0.50), so they underestimated more as portions grew. Small portions had MAPE about 20 to 30 points lower.
  - Misidentifications caused very large errors, for example falafel read as meatballs.
  - The authors judge these models suitable for screening, not precise assessment.
  - [PMC12513282](https://pmc.ncbi.nlm.nih.gov/articles/PMC12513282/)
- **O'Hara et al., *Nutrients* 17(4):607, Feb 2025 (ChatGPT-4):** 114 photos of 38 Irish meals at 3 portion sizes.
  - Food identification: precision 93.0%, recall 84.6%.
  - Weight was underestimated in 76% of photos, with mean absolute difference 27.8%.
  - Small meals were accurate (430 g estimated vs 408 g actual), but large meals were badly underestimated (530 g vs 798 g).
  - Mean nutrient error was 26.9%, with ranking correlation ρ≈0.62. Micronutrient errors were large, for example vitamin D −100% and potassium −49.5%.
  - [PMC11858203](https://pmc.ncbi.nlm.nih.gov/articles/PMC11858203/)
- **Cinar et al., *J. Food Composition and Analysis* vol. 150, 2026 (pilot, 9 items, ChatGPT-4o):**
  - Initial errors reached 54.4% for energy and 76.5% for fat, especially with hidden oil, sauce or filling.
  - Adding content information improved all macros. Energy R² rose from 0.591 to 0.941.
  - [Uludag Univ. record](https://avesis.uludag.edu.tr/yayin/4dd659a6-bb7a-4945-a926-b7f043a9a7fd/image-based-nutritional-assessment-evaluating-the-performance-of-chatgpt-4o-on-simple-and-complex-meals)
- **ChatGPT-5 study, *Nutrients*, Nov 2025:** tested 195 dishes across 4 escalating context scenarios. I could not retrieve the results because the page was CAPTCHA-blocked — [PMC12655113](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12655113/)
- **Customized GPT-4o "DiaBot" (Taiwan):** validated against weighed records on 714 images. It reported portion estimates within ±10–15% and weaker consistency for fat and protein. Publication details were not confirmed — [UMN experts page](https://experts.umn.edu/en/publications/customized-multimodal-diabot-gpt-4o-enhances-accuracy-of-image-ba/)
- **Japanese meals, one-shot GPT-4o:** poor performance overall on 22 meals — [J Diabetes Sci Technol via CiteDrive](https://www.citedrive.com/en/discovery/using-one-shot-prompting-of-non-fine-tuned-commercial-artificial-intelligence-to-assess-nutrients-from-photographs-of-japanese-meals)
- **Vendor-adjacent "Dietary Assessment Initiative" (May 2026):** reported ±1.1% error for PlateLens and 11.2–18.0% MAPE for MyFitnessPal. It is promoted on competitor and review blogs, and its independence is unverified — [Open Health](https://openhealth.blog/en/blog/ai-photo-calorie-tracking); [platelens.app](https://platelens.app/blog/best-ai-calorie-counter-apps)
- **FoodNExTDB (arXiv 2504.06925, Apr 2025):** 9,263 expert-labelled images across 6 VLMs, including Claude. Closed models performed better, but all struggled with fine-grained recognition such as cooking style and look-alike foods — [arXiv 2504.06925](https://arxiv.org/pdf/2504.06925)

### Inferences
- A realistic expectation for a BYOK GPT-4o-class model with photo only is about 30–40% absolute error on energy for a single meal, with systematic underestimation of large portions and fats. Over many meals errors partly average out, and ranking ability is decent.
- The two biggest levers are:
  - Clarifying context: oil, sauces, cooking method and fillings.
  - User confirmation of grams, especially for large portions. Larger portions are the most underestimated, so the UI should nudge users to check grams on big plates.
- This supports the project's "calm framing" ADR. Show ranges or confidence, not false precision.

### Gaps
- I found no independent 2025–2026 peer-reviewed head-to-head on GPT-4.1, GPT-5 or Gemini 2.x weight estimation. The ChatGPT-5 Nutrients paper exists, but I could not read it.
- I found no independent validation of SnapCalorie's LiDAR claim.

## 3. Prompt and structured-output best practices for vision-LLM food recognition

### Takeaway
The literature favors a two-step design. First the LLM identifies items and estimates grams, with verification. Then each item is grounded to a nutrient database such as FNDDS, USDA or CIQUAL, which supplies the numbers. The model's own nutrient numbers should not be trusted. Asking for or accepting extra context, especially about hidden fats, materially improves accuracy.

### Cited Findings
- **Item-level verification and recovery (Purdue, arXiv 2610.11144, 8 Oct 2026):**
  - The MLLM lists foods, SAM 3 segments each one, and a second MLLM pass verifies each region.
  - A single whole-image review catches omitted foods.
  - Each item is then grounded to USDA FNDDS food codes via hybrid dense + BM25 retrieval, and a portion model assigns grams.
  - It used open-weight Gemma 4 26B and Qwen3.5-35B with no fine-tuning, on 2,448 meals (Nutrition5k + ACETADA).
  - It had the lowest mass MAE in all four settings, for example Nutrition5k Qwen: 74 g vs 114 g direct and 151 g for adapted DietAI24.
  - Energy gains over direct estimation depended on the dataset.
  - The authors caution that "visual completeness does not guarantee nutrition accuracy."
  - [arXiv 2610.11144](https://arxiv.org/html/2610.11144)
- **DietAI24 (Yan et al., 2025):** grounds meal descriptions to FNDDS through retrieval before estimating portions and nutrients. Khlaisamniang et al. (2025) separate food analysis from numerical estimation in a two-step, nutritionist-inspired approach — cited in [arXiv 2610.11144](https://arxiv.org/html/2610.11144)
- **Prompt and reference objects:** Fridolfsson's prompt used cutlery and plate as size references and asked for volume relative to them. Plate dimensions were not given, and the authors flag this as a limitation — [PMC12513282](https://pmc.ncbi.nlm.nih.gov/articles/PMC12513282/)
- **Extra context improves accuracy:** hidden oil, sauce and filling were the main error sources, and extra info raised energy R² from 0.59 to 0.94 — [Cinar et al. 2026](https://avesis.uludag.edu.tr/yayin/4dd659a6-bb7a-4945-a926-b7f043a9a7fd/image-based-nutritional-assessment-evaluating-the-performance-of-chatgpt-4o-on-simple-and-complex-meals)
- **Commercial precedent for oils:** SnapCalorie lets users add cooking oils by voice note or tap — [App Store](https://apps.apple.com/us/app/-/id1574239307)
- **Grounding the numbers:** SnapCalorie pulls final values from USDA, and Cal AI from a 1M-food DB — [App Store](https://apps.apple.com/us/app/-/id1574239307); [eesel.ai](https://www.eesel.ai/en/blog/cal-ai-pricing)
- **Food misidentification is a major error source:** examples include falafel read as meatballs and scrambled eggs read as pasta — [PMC12513282](https://pmc.ncbi.nlm.nih.gov/articles/PMC12513282/)

### Inferences
These are recommendations derived from the findings above.
- **Item schema:** have the model return JSON items, each with:
  - `name` and `name_local`
  - `search_terms` for the DB lookup
  - `grams_estimate` plus `grams_low` / `grams_high`
  - `confidence`
  - `visible_cues`, for example "glossy surface, likely oil"
  - `preparation`: raw, boiled, fried, sautéed and so on
  - `possible_hidden_ingredients`: oil, butter, sugar, dressing
  - `components[]` for mixed dishes
  - `clarifying_questions[]` with a maximum of 1–2, in multiple-choice form, for example "Was this fried or grilled?" or "Any dressing?"
- **Nutrient lookup:** look up nutrients client- or server-side from CIQUAL, USDA or OFF by matched food. Use LLM nutrient numbers only as a flagged fallback.
- **Two passes:** first enumerate, then verify or "what did I miss?". This mirrors the Purdue result on cheaper models.
- **Reference scale:** ask the user to include a fork or hand, or let them set their typical plate diameter once.
- **Guarding against large-portion underestimation:** when the model's estimate is above about 400 g, surface the range and a gram slider. Inference based on observed bias slopes.

### Gaps
- No peer-reviewed comparison of specific structured-output schemas, or of confidence-calibration prompts, for food was found.
- No study isolated the effect of the model asking a clarifying question itself, as opposed to the user volunteering info.

## 4. Open food composition databases and licences

### Takeaway
For an open-source app:
- USDA FDC is CC0 public domain.
- Open Food Facts is ODbL with share-alike, which matters if you redistribute a derived database.
- CIQUAL 2025 has 3,484 foods and is open-access French reference data.
- UK CoFID 2021 is on GOV.UK, but I could not confirm its licence.
- FNDDS supplies 22k household portion weights, the best open "typical portion" dataset found.

### Cited Findings
- **Open Food Facts licences:**
  - The database is under ODbL 1.0, individual contents under DbCL 1.0, and images under CC BY-SA 3.0.
  - Attribution and a link to OFF are required, and derivative databases must be shared alike.
  - [OFF terms of use](https://world.openfoodfacts.org/terms-of-use)
- **USDA FoodData Central licence:** public domain, CC0 1.0. Citing it as the source is requested — [FDC API guide](https://fdc.nal.usda.gov/api-guide); [data.gov](https://catalog.data.gov/dataset/fooddata-central)
- **FDC downloads:**

  | Dataset | Release | JSON size (zip / unzipped) | CSV size (zip / unzipped) |
  |---|---|---|---|
  | Foundation Foods | 04/2026 | 459K / 6.5M | 3.7M / 32M |
  | SR Legacy (final, frozen) | 04/2018 | 12.3M / 205M | — |
  | FNDDS 2021–2023 | 10/2024 | 3.7M / 64M | — |
  | Branded | 04/2026 | 195M / 3.1G | — |

  [FDC download page](https://fdc.nal.usda.gov/download-datasets/)
- **FNDDS portion weights:** the 2021–2023 release has gram weights for 22,046 portions linked to food codes. It provides a food-weights table and a portion-descriptions table for household measures — [FNDDS 2021–2023 contents](https://ars.usda.gov/ARSUserFiles/80400530/pdf/fndds/2021_2023_Contents_of_Datasets.pdf)
- **CIQUAL 2025:**
  - Updated 19 Nov 2025: 3,484 foods, 74 constituents, about 300 new foods and 113,000+ new data items.
  - Described as open-access and hosted at ciqual.anses.fr. The previous version was 2020 (3,185 foods).
  - [ANSES](https://www.anses.fr/en/content/new-enhanced-and-more-representative-version-ciqual-table)
- **CIQUAL licence:** the 2020 dataset was on data.gouv.fr, which now redirects to the recherche.data.gouv platform, and must be cited as "Anses. 2020. Ciqual…". I did not confirm explicit Etalab Licence Ouverte wording for 2025 — [data.gouv.fr Ciqual 2020](https://www.data.gouv.fr/datasets/table-de-composition-nutritionnelle-des-aliments-ciqual-2020/informations); [Zenodo record](https://zenodo.org/records/4770600)
- **UK CoFID 2021:** published by PHE on GOV.UK with a user guide. A labelling-adjusted derivative is available from the Quadram Institute — [GOV.UK CoFID](https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid); [Quadram FN-BRI](https://fnnbri.quadram.ac.uk/data/)
- **Other open sources used by open-source apps:**
  - Swiss Food Composition Database, used by Energize — [linuxphoneapps](https://linuxphoneapps.org/apps/com.flasskamp.energize/)
  - German BLS, via OpenNutriTracker's backend per a Sept 2026 blog — [brightcoding blog](https://www.blog.brightcoding.dev/2026/09/29/simonoppowaopennutritracker-open-source-calorie-tracker-with-barcode-scanning)
  - A community CIQUAL-based French DB for Waistline — [Waistline GitHub](https://github.com/davidhealey/waistline)

### Inferences
- For a French- and English-first app, the strongest stack is:
  - CIQUAL for generic French foods (bundled)
  - FDC Foundation/SR Legacy for generic foods in English (CC0, small enough to bundle a subset)
  - FNDDS portion weights for household measures
  - OFF for barcodes (query via API rather than redistributing, to keep ODbL obligations simple)
- Keeping OFF data as fetched-and-cached per user rather than shipping a derived database probably avoids share-alike obligations on the app's own data. This is not legal advice.

### Gaps
- The CoFID 2021 licence was not confirmed. It is likely the Open Government Licence, but unverified.
- The explicit CIQUAL 2025 licence text and download formats (XLSX/XML/CSV) were not confirmed.
- No information was found on the EFSA FoodEx2 portion data, the UK FSA "Food Portion Sizes" book licence, or other EU national DBs (Danish Frida, Dutch NEVO, Italian BDA).

## 5. Health and fitness integrations feasible from a PWA

### Takeaway
- **Apple HealthKit and Android Health Connect:** on-device, native-only. A PWA cannot read or write them.
- **Fitbit:** the Web API is being shut down (support ended 30 Sep 2026, with an Oct 30 switch-off reported). Its successor, the Google Health API, is a cloud REST/OAuth API but had no nutrition data type or third-party write as of May 2026.
- **Garmin:** the program is business-approval-only, reportedly paused, and has no nutrition API.
- **Strava:** OAuth works, but its terms forbid using API data in AI applications, which is a blocker for an AI coach.
- **intervals.icu:** the most open option, with a personal API key or OAuth and wellness read/write.

### Cited Findings
- **Health Connect:** the API and app are Android-only. Apps must integrate the SDK — [Android dev: availability](https://developer.android.com/health-and-fitness/guides/health-connect/plan/availability); [Health Connect FAQ](https://developer.android.com/guide/health-and-fitness/health-connect/frequently-asked-questions)
- **No web API for on-device stores:** Apple Health, Samsung Health and Health Connect are mobile-only sources with no web API. They need a native SDK — [Terra docs FAQ](https://docs.tryterra.co/faq/help-topics/data-api-sdk/mobile-sdk-setup-permissions-and-crashes/mobile-only-sources-need-sdk-not-web-or-rest); [Sahha, Feb 2026](https://www.sahha.ai/blog/healthkit-vs-health-connect/)
- **Fitbit Web API dates:** Google's Aug 2026 newsletter says legacy API support ends 30 Sep 2026, after which there are no bug fixes. Other sources report an API turn-off on 30 Oct 2026. Users must reconsent for the Google Health API — [Google Health dev newsletter](https://developers.google.com/health/newsletters); [Open Wearables](https://openwearables.io/blog/fitbit-web-api-shutdown-2026-migration-guide); [Validic](https://help.validic.com/space/VCS/5513478151/Fitbit+to+Google+Health+API+Developer+Transition+Guide)
- **Google Health API (as of May 2026):**
  - REST at `health.googleapis.com/v4/` with OAuth.
  - All scopes are Restricted and need a Google security review.
  - 31 data types including weight and activity.
  - A nutrition read scope exists, but no nutrition data type is accepted yet.
  - No third-party write scope was found.
  - [Terra blog, 18 May 2026](https://tryterra.co/blog/everything-you-need-to-know-about-google-health-new-api)
- **Garmin:** the Connect Developer Program is free to approved business developers only. Its APIs are Health, Activity, Women's Health, Training and Courses, with no nutrition API. Terra reports the program is paused — [Garmin Health API](https://developer.garmin.com/gc-developer-program/health-api/); [Garmin overview](https://developer.garmin.com/gc-developer-program/overview); [Terra on pause](https://tryterra.co/blog/garmin-connect-developer-program-pause)
- **Strava terms:**
  - Since Nov 2024, third parties may not use Strava API data in AI models, and may show a user's data only to that user.
  - The June 2026 policy reportedly adds Standard-tier subscription fees and bars use "in connection with the… operation of any AI Application". This wording comes via a secondary source.
  - [TechRadar](https://www.techradar.com/health-fitness/strava-could-soon-stop-working-with-some-of-your-third-party-apps-heres-what-you-need-to-know); [Marathon Handbook](https://marathonhandbook.com/strava-api-changes/); [Sahha, Aug 2026](https://sahha.ai/blog/health-api-ai-restrictions/)
- **intervals.icu:**
  - A personal API key (basic auth) works for a user's own data, or OAuth for multi-user apps.
  - WELLNESS:READ/WRITE scopes cover weight, resting HR and similar.
  - There is a bulk wellness upload endpoint, and athlete id "0" means the token's owner.
  - [intervals.icu forum: OAuth](https://forum.intervals.icu/t/intervals-icu-oauth-support/2759); [API cookbook](https://forum.intervals.icu/t/intervals-icu-api-integration-cookbook/80090); [Open API page](https://www.intervals.icu/features/open-api/)
- **What open-source apps do:** Waistline lists no health integrations, only import/export. Energize offers local/WebDAV encrypted backups. OpenNutriTracker stores data locally and encrypted — [Waistline](https://github.com/davidhealey/waistline); [linuxphoneapps Energize](https://linuxphoneapps.org/apps/com.flasskamp.energize/); [brightcoding OpenNutriTracker](https://www.blog.brightcoding.dev/2026/09/29/simonoppowaopennutritracker-open-source-calorie-tracker-with-barcode-scanning)

### Inferences
- **For the PWA:** use intervals.icu (BYO API key fits the BYOK self-hosted ethos) as the one realistic activity/weight integration. Add file import/export (CSV/FIT/JSON) and, optionally, Apple Shortcuts. A Shortcut can read HealthKit and POST to the self-hosted server, which is a common iOS workaround, though I did not find a source in this round.
- Avoid Strava for any data that feeds the AI coach. Treat Google Health as "watch" until nutrition and write support land.

### Gaps
- I did not confirm whether intervals.icu wellness records include calorie-intake or macro fields.
- I found no authoritative source for an Apple Shortcuts-to-webhook pattern.

## 6. Other logging modalities feasible on the web

### Takeaway
- **Text/natural-language logging with LLM parsing:** fully feasible and now standard (MFP Voice Log, Lifesum).
- **Web Speech API:** exists in iOS Safari (prefixed), but historically did not work in home-screen (standalone) PWAs. Recording audio and sending it to a Whisper-compatible endpoint is the safer path.
- **Recipe import via schema.org JSON-LD:** feasible server-side.

### Cited Findings
- **Web Speech API in Safari:** available since Safari 14.1/iOS 14.5 as `webkitSpeechRecognition` and requires a user gesture. In standalone PWAs it is detected but does nothing (Firtman, Apr 2021). WebKit said it was unavailable in SFSafariViewController and Home Screen web apps "for now", and there was no resolution as of 2023 posts — [firt.dev iOS 14.5](https://firt.dev/ios-14.5/); [WebKit bug 225298](https://bugs.webkit.org/show_bug.cgi?id=225298)
- **NL/voice logging in commercial apps:** MFP Voice Log suggests matches from spoken descriptions (Premium, Feb 2025). Lifesum logs whole meals or single ingredients from voice or text — [Webull/MFP PR](https://www.webull.com/news/12377891991156736); [Lifesum PR](https://lifesum.com/page/lifesum-transforms-meal-tracking-with-world-first-ai-powered-multimodal-tracker)
- **Recipe/nutrition in the open-source ecosystem:** Grocy has no built-in nutrition tracking. A third-party "Grocy Nutrients" add-on adds intake logging, daily targets and recipe nutrient breakdowns — [Docker Hub grocynutrients](https://hub.docker.com/r/yuriykuznetsov/grocynutrients)

### Inferences
- **Recommended voice path:** use the `MediaRecorder` + `getUserMedia` microphone recording, then call the BYOK provider's `/audio/transcriptions` (Whisper-compatible), then LLM parsing into the same item schema as photos. Fall back to the iOS keyboard dictation button in a text field, which works everywhere.
- **Recipe import:** fetch the URL server-side (CORS blocks client-side), parse `<script type="application/ld+json">` for `@type: Recipe`, `recipeIngredient` and `nutrition` (NutritionInformation), then map ingredients to the DB per serving. Source: the schema.org/Recipe spec, not fetched this round.
- **Nutrition label OCR:** a vision LLM can read a label photo directly into per-100 g fields. This is lower risk than meal photos because the numbers are printed. Inference, not sourced.

### Gaps
- I found no 2025–2026 confirmation of whether Web Speech now works in iOS standalone PWAs, nor of the `getUserMedia` status in standalone mode. Both need a device test.
- I found no Mealie or Tandoor nutrition documentation. Searches returned food pages only.

## 7. Open-source competitors

### Takeaway
None of the established open-source trackers offers AI photo logging. All rely on Open Food Facts plus a government database (USDA, CIQUAL, Swiss, BLS) with barcode scanning and local-first privacy. An AI photo/voice/text PWA with BYOK would be differentiated.

### Cited Findings
- **OpenNutriTracker:**
  - Flutter mobile app (Android/iOS), GPL-3.0, no ads or subscriptions.
  - Food data comes from OFF + USDA FDC, with German BLS per a Sept 2026 blog.
  - Features barcode scanning, a diary and custom meals, with local encrypted storage.
  - It had about 1.6k–2.1k GitHub stars, and its README says it is still under construction.
  - [AlternativeTo](https://alternativeto.net/software/opennutritracker/about); [brightcoding blog](https://www.blog.brightcoding.dev/2026/09/29/simonoppowaopennutritracker-open-source-calorie-tracker-with-barcode-scanning)
- **Waistline:** Android-only, GPLv3, on F-Droid and Play. It uses OFF + USDA, with a community CIQUAL French DB. It offers barcode scanning, a diary, a food list, weight tracking and import/export, with no meal photo logging — [GitHub](https://github.com/davidhealey/waistline)
- **Energize:** AGPL-3.0 Flutter app on Android, Linux and iOS. It tracks calories, macros and micros from OFF, USDA and the Swiss Food Composition DB. It offers barcode scanning and encrypted local/WebDAV backups. v0.13.3 dates from 2025 — [linuxphoneapps](https://linuxphoneapps.org/apps/com.flasskamp.energize/); [IzzyOnDroid](https://apt.izzysoft.de/fdroid/index/apk/com.flasskamp.energize)
- **Grocy:** self-hosted groceries and household ERP (stock, recipes, meal plans). Nutrition only via a third-party add-on — [linuxlinks](https://www.linuxlinks.com/grocy/); [Grocy Nutrients](https://hub.docker.com/r/yuriykuznetsov/grocynutrients)
- **OFF wiki:** maintains a list of nutrition-tracking apps that reuse its data — [OFF wiki: Nutrition tracking](https://wiki.openfoodfacts.org/Nutrition_tracking)

### Inferences
- The project's differentiators versus OSS peers are AI photo, voice and text logging, a self-hosted PWA (no app store), and BYOK. Versus commercial apps, it can offer honest uncertainty: show ranges rather than claiming "90% accurate".

### Gaps
- Mealie and Tandoor nutrition features were not verified. From memory, both store per-recipe nutrition and Tandoor has food "properties", but this is unsourced.
- I found no open-source project with AI photo logging in this search.
