// The user's AI preferences: which rung is active, where the BYOK endpoint
// is, which model, and which hosts they have agreed to send photos to.
//
// None of it is a secret (the API key lives in `ByokKeyStore`, never
// here), but it is personal: the endpoint host and the consent list say
// which third parties the user trusts. So it is persisted with the same
// care as the key — see `AiSettingsStore`.
//
// The JSON codec is tolerant: a corrupt, truncated or hand-edited blob
// never crashes start-up, it falls back to the defaults. Rungs that are not
// available in this build (`hostedQuota`, `local`) are normalised to
// `noOp` on load, so a persisted value can never select a stub.

import 'dart:convert';

import 'package:domain_core/domain_core.dart';

/// Rungs a user can actually be on in this build.
const Set<AiRungKind> kSelectableRungs = {AiRungKind.noOp, AiRungKind.byok};

class AiSettings {
  const AiSettings({
    this.rung = const AiRungConfig(kind: AiRungKind.noOp),
    this.byokEndpointUrl = '',
    this.byokModel = '',
    this.byokKeyHost = '',
    this.photoConsentHosts = const <String>{},
    this.askBeforeEveryPhoto = true,
  });

  static const AiSettings defaults = AiSettings();

  final AiRungConfig rung;

  /// The endpoint as the user typed it (validated on save and again at use).
  final String byokEndpointUrl;
  final String byokModel;

  /// The host the STORED API key was entered for (lower-case; empty when
  /// unknown). The key is only ever sent to that host: if the endpoint is
  /// edited to a different host the key is not used until it is pasted again,
  /// so editing the endpoint can never ship a key to a server it was not
  /// given to. Keyed by host only (not scheme / port / path).
  final String byokKeyHost;

  /// Lower-cased hosts the user has agreed to send photos to (N1).
  final Set<String> photoConsentHosts;

  /// "Ask before every photo upload" (privacy audit PV1). When `true` (the
  /// default, also for settings saved by older builds) every photo needs its
  /// own yes and the per-host agreement alone is not enough; when `false`
  /// the per-host agreement applies.
  final bool askBeforeEveryPhoto;

  AiSettings copyWith({
    AiRungConfig? rung,
    String? byokEndpointUrl,
    String? byokModel,
    String? byokKeyHost,
    Set<String>? photoConsentHosts,
    bool? askBeforeEveryPhoto,
  }) => AiSettings(
    rung: rung ?? this.rung,
    byokEndpointUrl: byokEndpointUrl ?? this.byokEndpointUrl,
    byokModel: byokModel ?? this.byokModel,
    byokKeyHost: byokKeyHost ?? this.byokKeyHost,
    photoConsentHosts: photoConsentHosts ?? this.photoConsentHosts,
    askBeforeEveryPhoto: askBeforeEveryPhoto ?? this.askBeforeEveryPhoto,
  );

  bool hasConsentFor(String host) =>
      photoConsentHosts.contains(host.toLowerCase());

  String toJsonString() => jsonEncode(<String, Object?>{
    'v': 1,
    'kind': rung.kind.keyToken,
    'previous': rung.previousRung?.previousKind.keyToken,
    'endpoint': byokEndpointUrl,
    'model': byokModel,
    'keyHost': byokKeyHost,
    'consents': (photoConsentHosts.toList()..sort()),
    'askEveryPhoto': askBeforeEveryPhoto,
  });

  /// Decodes a persisted blob. Anything unusable yields [defaults] (or the
  /// usable parts of it); this never throws.
  static AiSettings fromJsonString(String? raw) {
    if (raw == null || raw.isEmpty) return defaults;
    final Object? decoded;
    try {
      decoded = jsonDecode(raw);
    } on FormatException {
      return defaults;
    }
    if (decoded is! Map) return defaults;

    AiRungKind? kindOf(Object? token) {
      if (token is! String) return null;
      for (final k in AiRungKind.values) {
        if (k.keyToken == token) return k;
      }
      return null;
    }

    var kind = kindOf(decoded['kind']) ?? AiRungKind.noOp;
    if (!kSelectableRungs.contains(kind)) kind = AiRungKind.noOp;
    var previous = kindOf(decoded['previous']);
    if (previous != null && !kSelectableRungs.contains(previous)) {
      previous = AiRungKind.noOp;
    }
    final rung = kind == AiRungKind.byok
        ? AiRungConfig(
            kind: kind,
            previousRung: ByokPreviousRung(
              previousKind: previous == null || previous == AiRungKind.byok
                  ? AiRungKind.noOp
                  : previous,
            ),
          )
        : AiRungConfig(kind: kind);

    final consents = <String>{};
    final rawConsents = decoded['consents'];
    if (rawConsents is List) {
      for (final h in rawConsents.take(64)) {
        if (h is String && h.isNotEmpty && h.length <= 255) {
          consents.add(h.toLowerCase());
        }
      }
    }
    final endpoint = decoded['endpoint'];
    final model = decoded['model'];
    final keyHost = decoded['keyHost'];
    return AiSettings(
      rung: rung,
      byokEndpointUrl: endpoint is String && endpoint.length <= 2048
          ? endpoint
          : '',
      byokModel: model is String && model.length <= 200 ? model : '',
      byokKeyHost: keyHost is String && keyHost.length <= 255
          ? keyHost.toLowerCase()
          : '',
      photoConsentHosts: consents,
      // Absent / unusable means the safe default: ask every time.
      askBeforeEveryPhoto: decoded['askEveryPhoto'] is bool
          ? decoded['askEveryPhoto'] as bool
          : true,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is AiSettings &&
      other.rung == rung &&
      other.byokEndpointUrl == byokEndpointUrl &&
      other.byokModel == byokModel &&
      other.byokKeyHost == byokKeyHost &&
      other.askBeforeEveryPhoto == askBeforeEveryPhoto &&
      other.photoConsentHosts.length == photoConsentHosts.length &&
      other.photoConsentHosts.containsAll(photoConsentHosts);

  @override
  int get hashCode => Object.hash(
    rung,
    byokEndpointUrl,
    byokModel,
    byokKeyHost,
    askBeforeEveryPhoto,
    Object.hashAllUnordered(photoConsentHosts),
  );

  /// The endpoint is deliberately not printed: it can carry a private
  /// hostname. Logs get the rung and the counts only.
  @override
  String toString() =>
      'AiSettings(rung: ${rung.kind.keyToken}, '
      'endpoint: ${byokEndpointUrl.isEmpty ? 'unset' : 'set'}, '
      'consentedHosts: ${photoConsentHosts.length}, '
      'askEveryPhoto: $askBeforeEveryPhoto)';
}
