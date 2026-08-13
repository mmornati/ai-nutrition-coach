Excellent idea, Marco! I've done thorough research across all four dimensions of your project. Here's a comprehensive landscape analysis to help you shape your app.1. Existing Open-Source / Free Calorie TrackersTwo genuinely open-source projects already exist, but neither ticks all your boxes:ProjectPlatformOpen SourcePhoto AIBarcode ScanGamifiedFood YouAndroid only (F-Droid)✅ Yes❌✅❌OpenNutriTrackerAndroid + iOS (Flutter)✅ Yes❌✅❌
Key findings from research:


Food You (F-Droid, actively maintained — last build June 30, 2026) is an Android-only calorie tracker. It supports barcode scanning via Open Food Facts, but has no AI photo estimation, no gamification, and isn't cross-platform. (F-Droid)


OpenNutriTracker (GitHub, Flutter-based) is cross-platform Android+iOS, stores data locally with AES-256 encryption, requires no account, and supports barcode scanning. However, it lacks AI photo estimation and gamification. (GitHub)


On the commercial side, apps like PlateLens, Cal AI, and SnapCalorie offer AI photo-based calorie estimation but are closed-source and paid. Cronometer offers deep nutrient tracking with a verified USDA-backed database but no photo AI or gamification in its free tier.Gap in the marketinfoNo existing open-source app combines AI photo calorie estimation, barcode lookup, AND gamification. Your project would fill a genuine white space — especially the kid-safe gamified angle.
2. Free / Public APIs for Nutrition Data
Here are the best free APIs you can build on:
Open Food Facts (Primary recommendation)

What: Collaborative, open-data database of ~4 million barcoded food products from 150+ countries
API: REST/JSON, no API key needed
Barcode lookup: https://world.openfoodfacts.org/api/v0/product/{barcode}.json
Rate limit: ~100 requests/minute per IP
License: Open Database License (ODbL) — free for any use with attribution
Covers: Product name, nutrition facts, Nutri-Score, ingredients, allergens, images
Perfect for: Barcode scanning of commercial products by name or EAN
Source: Open Food Facts API docs

USDA FoodData Central (Secondary / US-focused)

What: US government's comprehensive nutrition database (Foundation Foods, Branded Foods, SR Legacy)
API: REST/JSON, requires a free API key from data.gov
Covers: Detailed nutrient data for generic foods (great for homemade dishes, produce, etc.)
License: Public domain (US government work)
Source: FoodData Central API Guide

Combination Strategy
Use Open Food Facts for barcode-scanned commercial products and USDA FoodData Central for generic/unbranded foods and recipe ingredients. This mirrors the approach used by PlateLens (the top-rated AI tracker of 2026).

3. AI Photo-Based Calorie Estimation
Research shows two viable paths for an open-source project:
Option A: Multimodal LLM API (Simplest to start)
A recent paper published on Zenodo demonstrates a working system using Google Gemini's multimodal API to accept food images and return real-time calorie and nutritional analysis. This approach:

Requires no model training
Handles mixed/homemade meals well
Can identify dish components and estimate portions
But depends on a third-party API (Gemini has a free tier)

Option B: Self-hosted Open-Source Model (Fully independent)

Fine-tune a vision backbone (Inception-v3, ResNet-50, or YOLOv8) on food datasets (Food-101, iFood-200, USDA-linked image collections)
The GitHub project FoodCalorieEstimation provides a Flask-based API that accepts a base64-encoded image and returns JSON with estimated calories, macronutrients, and confidence scores in under a second
Newer HuggingFace-hosted models (early 2026) combine CLIP visual embeddings with monocular depth networks to improve portion-size inference
Overall accuracy: ~12–15% MAPE (mean absolute percentage error) on mixed meals, ~90% classification accuracy on common dishes
Portion estimation remains the biggest error source (15–25% error) — so always let users correct the estimate
Recommendation: Hybrid approachinfoStart with Option A (multimodal LLM API) for a fast MVP, then migrate to Option B (self-hosted model) as the project matures. Either way, ALWAYS pair AI estimates with a verified nutrition database (Open Food Facts + USDA) and let users review/edit every result — this is what separates the best AI trackers from unreliable ones.
4. Gamification for Kid-Safe Nutrition Education
Research into gamified nutrition apps for children reveals these proven design patterns:
Core Game Mechanics

Level-based progression — unlock new nutrition knowledge as you log meals consistently
Badge & sticker rewards — earn recognitions for balanced meal choices, variety, etc.
Quests mapped to real-world choices — "Log 3 different vegetables today" type missions
Avatar customization — cosmetic only, never affects difficulty (this is key for equity)
Instant feedback — visual cues, sounds, and encouraging messages when logging a meal

Kid-Safety Design Principles (from research including Proton's own guidelines)

No dark patterns: Avoid confirmshaming (e.g., "Are you sure you want to skip your healthy meal?"), forced continuity, or hidden in-app purchases
No data collection from minors: Store everything locally, no account needed for kids, GDPR-compliant with explicit parental consent screens
No social pressure: Limit sharing to anonymous, parent-mediated modes only
Cosmetic-only monetization: If you ever add purchases, they must never affect gameplay or nutrition content
Age-appropriate UI: Large touch targets, voice-over support, high-contrast modes, minimal text for pre-readers
Educational content embedded in gameplay: Don't layer rewards on top — integrate nutrition learning into the game loop itself (e.g., correctly identifying food groups earns points)

Concept: "NutriQuest" (example framing)
Imagine an app where kids embark on a daily adventure:

They photograph their meal → the AI identifies ingredients and assigns "nutrition XP"
Balanced meals unlock new levels, characters, or quests
Daily quests teach food literacy ("Can you spot which food has the most fiber?")
A parent dashboard (read-only, no data leaves the device) tracks progress


Summary Architecture ProposalOpen-source gapYes▲No OSS app combines AI+game+kidsFree APIs available2▲Open Food Facts + USDAAI photo accuracy~85%–With user correction ~94%Kid-safe patternsProven▲Research-backed design principlesSuggested Tech Stack

Frontend: Flutter (cross-platform, mobile-first, used by OpenNutriTracker)
Barcode scanning: Phone camera + Open Food Facts API (no cost)
Photo AI: Start with Gemini API free tier → migrate to self-hosted CLIP + depth model
Nutrition data: Open Food Facts (barcodes) + USDA FoodData Central (generic foods)
Local storage: SQLite/AES-256 encrypted (privacy-first, no account required)
Gamification engine: Local-only progression, badges, quests
License: MIT or Apache 2.0 (most permissive, encourages contribution)


Your project fills a genuine gap. No existing open-source app combines AI photo estimation, barcode lookup, and kid-safe gamification. The free APIs are readily available, the AI approaches are proven, and the gamification patterns are well-researched. The main engineering challenge will be the portion-size estimation accuracy — but pairing AI with user-correctable database lookups (as PlateLens does) is the winning strategy.
Would you like me to dig deeper into any specific area — perhaps a comparison of Flutter vs React Native for this use case, or a more detailed technical architecture for the AI pipeline?
