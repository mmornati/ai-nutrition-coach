# Shared brief for the docs/marketing site direction comps (spent mockups, not shipped)

Surface: the FIRST VIEWPORT (1440x900, desktop landscape) of the public site for AI Nutrition Coach:
a marketing landing that also opens the user documentation (features, how to use, how it is secured, self-host).
Mode: Persuade. A first-time visitor must know within seconds: what it is, why it matters, what to do.

Product truth (never invent beyond this; no testimonials, metrics, prices, press):
- Name: AI Nutrition Coach (formerly OpenPlate). Footmark: "yours to run · open source". MIT.
- Log what you ate by photo, barcode (Open Food Facts), typing, describing in words or by voice, or pasting a recipe. Saved meals, recents, copy a meal or a day.
- Each meal lands on a Day Board as one honest plate: four food groups (veg & fruit, protein, starch, dairy) present or absent; grams and nutrients (energy, protein, carbohydrate, sugars, fat, saturated fat, fibre, salt) shown plainly against EU reference intakes. Estimates marked "~".
- The coach asks one question instead of a verdict. No streaks, scores, badges, countdowns, guilt, red states.
- Trust is architecture: no account, encrypted local store opened by your passphrase, encrypted backup file, CSV/JSON export, zero telemetry, AI optional (bring your own key or the instance's AI), photos metadata-stripped and sent only after you agree. Works offline, installs as an app (PWA). English and French.
- Self-host with one command: `bin/ai-nutrition-coach up`, or the container image on ghcr.io.
- Voice: warm-but-reserved, calm kitchen friend. NO exclamation marks. Sentence case. No hype words ("revolutionary", "supercharge").
- Real sample numbers OK as labelled demo content, e.g. a lunch: "Lentil salad, ~180 g · 410 kcal · 21 g protein" and coach line "This yogurt has about 18 g of sugars, around a fifth of a day's reference intake. Was it the one you meant?"

Assets available: phone screenshots at docs/design/torchon/phone-screens.png (3 phones side by side), desktop-today.png. Reference with a relative path from the mock file (../../../../docs/design/torchon/...). App font Schibsted Grotesk is at apps/web/public/fonts/*.woff2; for other directions pick faces with a point of view via Google Fonts (avoid Inter, Fraunces, Playfair, Space Grotesk, DM Sans, IBM Plex, Outfit, Syne).

Deliver: a single self-contained HTML file at the given path, then a PNG screenshot:
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,900 --virtual-time-budget=4000 --screenshot=<abs png path> "file://<abs html path>"
Open the PNG (Read tool) and fix anything broken (overflow, missing fonts, clipped text) once; at most two render rounds. Craft bar: award-level, committed all the way to the direction's own grammar, real product copy, a top nav with Features · How it works · Security · Self-host · Docs, a visible primary action ("Run your own" or equivalent in the direction's vocabulary) and a secondary ("Read the docs" / "Watch the 90-second tour"). Must be visually distinctive at thumbnail size.
Report in under 120 words: the file paths and one line on the composition.
