// Build-time configuration (Story 3.3 + mobile-test affordance).
//
// `BuildConfig` is a thin pure-Dart wrapper over `String.fromEnvironment`
// / `bool.fromEnvironment` so the rest of the app reads a single,
// documented surface for `--dart-define` values. The values are
// resolved at compile time; the class is `const`-constructable so
// callers can `const BuildConfig()`.
//
// **There is deliberately NO API-key define (S1).** Every `--dart-define`
// is compiled into the bundle / APK as a plain string: anyone who can
// download the app can read it. Only NON-secret defaults (the endpoint and
// model) are build-time; the user's key is typed into Settings → Your AI at
// run time. `tools/check_no_secrets_in_build.sh` scans the build output for
// key-shaped strings and fails CI if one appears.
//
// Convention: every `AI_NUTRITION_COACH_*` env var is read by exactly one
// property here so the rest of the codebase doesn't reach for
// `String.fromEnvironment` directly.

class BuildConfig {
  const BuildConfig();

  /// The build flavour (`--dart-define=OPENPLATE_BUILD=selfhost` for the
  /// production self-host bundle, `dev` for local development builds).
  String get buildFlavor => const String.fromEnvironment('OPENPLATE_BUILD');

  /// `true` for the production self-host bundle.
  bool get isSelfHostBuild => buildFlavor == 'selfhost';

  /// `true` when built with BOTH `--dart-define=OPENPLATE_BUILD=dev` and
  /// `--dart-define=OPENPLATE_DEV_IN_MEMORY_STORE=true`: the web store is an
  /// UNENCRYPTED in-memory placeholder and the app shows a visible banner.
  /// The flag is honoured ONLY for an explicit `dev` build (W8 / L5): any
  /// other flavour (the `selfhost` release, or an unlabelled build) ignores
  /// it, so the unprotected path cannot ship by accident.
  bool get devInMemoryStore =>
      buildFlavor == 'dev' &&
      const bool.fromEnvironment('OPENPLATE_DEV_IN_MEMORY_STORE');

  /// A default OpenAI-compatible base URL (e.g.
  /// `https://openrouter.ai/api/v1`) used to pre-fill the Your AI form.
  /// Empty in default builds. Not a secret.
  String get byokEndpointUrl =>
      const String.fromEnvironment('AI_NUTRITION_COACH_BYOK_ENDPOINT_URL');

  /// The model id the endpoint should serve (e.g.
  /// `google/gemini-2.0-flash-exp:free`). Empty in default v1
  /// builds.
  String get byokModel => const String.fromEnvironment('OPENPLATE_BYOK_MODEL');

  /// True when a default endpoint AND model are baked in. They are NOT
  /// secrets, so they may pre-fill the Your AI form; they never switch the
  /// rung on by themselves (the user must still enter a key and choose it).
  bool get hasByokDefaults =>
      byokEndpointUrl.isNotEmpty && byokModel.isNotEmpty;
}
