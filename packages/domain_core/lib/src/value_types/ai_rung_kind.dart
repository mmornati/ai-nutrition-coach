// The four rungs behind the `AiRung` port (Story 3.1 / AD-5 / FR6 / FR7 / FR8).
//
// Exactly one `AiRung` implementation is active at any time, chosen by
// `AiRungConfig` (a build-time value resolved once at app start). The
// core and the UI never branch on which rung is active — only on
// whether the port call returned a typed `RecognitionResult`.
//
// The v1 default is `AiRungKind.noOp` (Story 1.8's `NoopAiRung`); the
// `hostedQuota` and `byok` slots are filled in by Stories 3.2 / 3.3
// behind the same port. `AiRungKind.local` is a declared v2 seam —
// the `LocalAiRung` adapter throws `UnsupportedError` on `recognize`
// so the type system and provider wiring are honest about the seam
// (FR8) without crashing the core or the UI.
//
// The enum lives in the core so the config, the provider graph, and
// the rung adapters all agree on the same identifiers (AD-1 / AD-5).
// No Flutter / drift / dio / mobile_scanner / flutter_secure_storage
// imports — the AD-1 grep test pins the rule.

/// The four rungs behind the `AiRung` port. Declaration order matches
/// the order the Your AI surface ships them in (Settings → Your AI
/// story 3.3); `noOp` is first because it is the v1 default.
enum AiRungKind {
  /// The complete no-AI core (`NoopAiRung`). Always returns an empty
  /// `RecognizedPlate` so the photo path exercises the closest-
  /// matches + manual fallback (NFR5 / Story 1.8).
  noOp,

  /// The free-tier hosted quota rung (Story 3.2 / FR6). Calls the
  /// configured free provider within a per-day quota; on exhaustion
  /// returns `QuotaExhausted(resetAt: ...)` so the UI can surface
  /// the calm 3-way choice.
  hostedQuota,

  /// The bring-your-own-key rung (Story 3.3 / FR7). Reads the
  /// user's OpenAI-compatible key from on-device encrypted storage
  /// and sends it to the configured endpoint on the user's behalf.
  byok,

  /// The local-model rung (FR8). Declared v2 seam — the v1 adapter
  /// throws `UnsupportedError` on `recognize`; the seam exists in
  /// the type system and provider wiring without crashing the core.
  local;

  /// The kebab-cased token used in the Your AI surface label (Story
  /// 3.3) and in the `AiRungConfig.kind` field. The label is the
  /// single source of truth for the rung name — the UI never hard-
  /// codes rung names.
  String get label {
    switch (this) {
      case AiRungKind.noOp:
        return 'offline (no AI)';
      case AiRungKind.hostedQuota:
        return 'free model';
      case AiRungKind.byok:
        return 'your key';
      case AiRungKind.local:
        return 'local model';
    }
  }

  /// The short token used in logs and provider keys. Never includes
  /// user-supplied material (BYOK key, quota counter, etc.) — the
  /// rung token is the only thing the log path carries.
  String get keyToken {
    switch (this) {
      case AiRungKind.noOp:
        return 'noOp';
      case AiRungKind.hostedQuota:
        return 'hostedQuota';
      case AiRungKind.byok:
        return 'byok';
      case AiRungKind.local:
        return 'local';
    }
  }
}
