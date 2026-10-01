// Build-time configuration (Story 3.3 + mobile-test affordance).
//
// `BuildConfig` is a thin pure-Dart wrapper over `String.fromEnvironment`
// / `bool.fromEnvironment` so the rest of the app reads a single,
// documented surface for `--dart-define` values. The values are
// resolved at compile time; the class is `const`-constructable so
// callers can `const BuildConfig()`.
//
// **Do not commit API keys to source.** `--dart-define` values live
// in the build cache and the running process; they are not in the
// repo. The CI workflows do not pass any BYOK secrets.
//
// Convention: every `AI_NUTRITION_COACH_*` env var is read by exactly one
// property here so the rest of the codebase doesn't reach for
// `String.fromEnvironment` directly.

class BuildConfig {
  const BuildConfig();

  /// The OpenAI-compatible chat completions endpoint URL (e.g.
  /// `https://openrouter.ai/api/v1`). Empty in default v1 builds
  /// — the BYOK rung refuses to call when this is empty.
  String get byokEndpointUrl =>
      const String.fromEnvironment('AI_NUTRITION_COACH_BYOK_ENDPOINT_URL');

  /// The model id the endpoint should serve (e.g.
  /// `google/gemini-2.0-flash-exp:free`). Empty in default v1
  /// builds.
  String get byokModel => const String.fromEnvironment('OPENPLATE_BYOK_MODEL');

  /// The user-supplied API key. Empty in default v1 builds; the
  /// BYOK rung reads from the secure-storage key store at runtime
  /// and falls back to this value when the store is empty.
  ///
  /// **Never committed.** Pass at run time:
  /// `--dart-define=AI_NUTRITION_COACH_BYOK_API_KEY=<key>`.
  String get byokApiKey =>
      const String.fromEnvironment('AI_NUTRITION_COACH_BYOK_API_KEY');

  /// True when all three BYOK values are present and non-empty so
  /// the production `main.dart` can seed the secure-storage key
  /// store + flip the rung to `AiRungKind.byok`.
  bool get hasByokDefaults =>
      byokEndpointUrl.isNotEmpty &&
      byokModel.isNotEmpty &&
      byokApiKey.isNotEmpty;
}
