// Who AI Nutrition Coach is on the wire. Open Food Facts asks every client to send
// a descriptive User-Agent (app name, version, a way to reach the
// maintainers). No personal email: the project URL is the contact.
//
// The project URL is a BUILD-TIME setting (privacy audit PV11):
//
//   --dart-define=AI_NUTRITION_COACH_PROJECT_URL=https://example.org/ai-nutrition-coach
//
// The default is the project's repository. Override it for a fork or a
// self-hosted deployment. `tools/check_release_posture.dart` refuses a
// release build (`AI_NUTRITION_COACH_BUILD=selfhost|release`) whose URL is
// empty or unresolvable (`.invalid`), so a placeholder cannot ship
// (docs/release-checklist.md).

/// The app version sent in the User-Agent. Keep in step with
/// `apps/client/pubspec.yaml`.
const String kAiNutritionCoachVersion = '0.1.0';

/// The default project URL: the project repository (see above).
const String kDefaultAiNutritionCoachProjectUrl =
    'https://github.com/mmornati/ai-nutrition-coach';

/// The project page, from `--dart-define=AI_NUTRITION_COACH_PROJECT_URL`.
const String kAiNutritionCoachProjectUrl = String.fromEnvironment(
  'AI_NUTRITION_COACH_PROJECT_URL',
  defaultValue: kDefaultAiNutritionCoachProjectUrl,
);

/// `AiNutritionCoach/0.1.0 (+https://github.com/mmornati/ai-nutrition-coach)` unless the URL is overridden.
const String kAiNutritionCoachUserAgent =
    'AiNutritionCoach/$kAiNutritionCoachVersion (+$kAiNutritionCoachProjectUrl)';
