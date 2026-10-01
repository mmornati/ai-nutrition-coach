// The one `FlutterSecureStorage` configuration every OpenPlate secret
// uses (Phase 2A / D5).
//
// iOS / macOS: `KeychainAccessibility.first_unlock_this_device`.
//   * `first_unlock` (not `unlocked`) so a background launch after the
//     first unlock after boot can still read the key;
//   * `_this_device` (the `...ThisDeviceOnly` family) so the item is
//     NOT carried in iCloud Keychain or an iTunes/Finder backup. A
//     restored backup therefore has a database file but no key, which
//     the key source reports as `DbKeyLost` (D7) instead of the app
//     trusting a key it should never have had.
//
// Android: the plugin default (Keystore-wrapped AES-GCM). Android backup
// is disabled at the manifest level (`allowBackup=false` +
// `dataExtractionRules`, D6) so the encrypted preferences are never
// restored onto a device whose Keystore cannot unwrap them.
//
// Every secret-bearing class (`SecureKeySourceImpl`,
// `SecureStorageByokKeyStore`, `SecureStorageQuotaCounter`, the eraser)
// defaults to this instance so the posture cannot drift between them.

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const FlutterSecureStorage openPlateSecureStorage = FlutterSecureStorage(
  iOptions: IOSOptions(
    accessibility: KeychainAccessibility.first_unlock_this_device,
  ),
  mOptions: MacOsOptions(
    accessibility: KeychainAccessibility.first_unlock_this_device,
  ),
);

/// Every secure-storage alias OpenPlate writes. The eraser (D8) deletes
/// each by name AND clears the whole namespace as a backstop, so a
/// forgotten alias cannot survive "Erase all local data".
abstract final class SecureStorageAliases {
  /// 32-byte database key (`SecureKeySourceImpl`).
  static const String dbKey = 'openplate_db_key_v1';

  /// User / build-time BYOK API key (`SecureStorageByokKeyStore`).
  static const String byokKey = 'openplate_byok_key_v1';

  /// Hosted-quota daily counter (`SecureStorageQuotaCounter`).
  static const String quotaHostedQuota = 'openplate_quota_hostedQuota_v1';

  /// AI settings JSON (`SecureStorageAiSettingsStore`): active rung,
  /// BYOK endpoint + model, per-host photo consents. Not secret, but
  /// personal; wiped by the eraser. Mobile / desktop only (web keeps it
  /// in memory).
  static const String rungConfig = 'openplate_ai_rung_config_v1';

  static const List<String> all = <String>[
    dbKey,
    byokKey,
    quotaHostedQuota,
    rungConfig,
  ];
}

// ---------------------------------------------------------------------------
// Legacy-accessibility migration (Phase 2A review, finding 1).
//
// `flutter_secure_storage_darwin` puts `kSecAttrAccessible` in its read AND
// delete queries, so an item written by an older build with the plugin's
// default accessibility (`unlocked`) is INVISIBLE to a store configured
// with `first_unlock_this_device`. Without the helpers below, an upgrade
// would turn a healthy install into `DbKeyLost`, silently drop the BYOK
// key and quota counter, and leave the eraser unable to delete the old
// items. Every secret reader/eraser goes through these helpers; on Android,
// Linux, Windows and web the extra legacy lookups are harmless no-ops.
// ---------------------------------------------------------------------------

/// Read [key]; if absent under the current options, look under the plugin's
/// legacy default accessibility, and if found MOVE it: write with the
/// current options, then delete the legacy item. The legacy item is only
/// deleted after the new write succeeded, so a failure never loses it.
Future<String?> secureReadMigrating(
  FlutterSecureStorage storage,
  String key,
) async {
  final current = await storage.read(key: key);
  if (current != null) return current;
  final legacy = await storage.read(
    key: key,
    iOptions: IOSOptions.defaultOptions,
    mOptions: MacOsOptions.defaultOptions,
  );
  if (legacy == null) return null;
  await storage.write(key: key, value: legacy);
  await storage.delete(
    key: key,
    iOptions: IOSOptions.defaultOptions,
    mOptions: MacOsOptions.defaultOptions,
  );
  return legacy;
}

/// Delete [key] under both the current and the legacy accessibility.
Future<void> secureDeleteEverywhere(
  FlutterSecureStorage storage,
  String key,
) async {
  await storage.delete(key: key);
  await storage.delete(
    key: key,
    iOptions: IOSOptions.defaultOptions,
    mOptions: MacOsOptions.defaultOptions,
  );
}

/// Clear the whole namespace under both the current and the legacy
/// accessibility.
Future<void> secureDeleteAllEverywhere(FlutterSecureStorage storage) async {
  await storage.deleteAll();
  await storage.deleteAll(
    iOptions: IOSOptions.defaultOptions,
    mOptions: MacOsOptions.defaultOptions,
  );
}

/// Web only, best effort, idempotent: delete the secure-storage aliases an
/// older build may have left in this browser's `localStorage` (the BYOK key,
/// the AI settings, the quota counter — on web `flutter_secure_storage` is
/// `localStorage`). Current builds never write them on web (memory only), so
/// anything found is a leftover. A no-op off web; failures are swallowed.
///
/// If a key was ever compiled into a build or sat in `localStorage`, treat
/// it as exposed and ROTATE it at the provider (see `docs/ai-tiers.md`).
Future<void> purgeLegacyWebSecureStorage({
  FlutterSecureStorage? storage,
}) async {
  if (!kIsWeb && storage == null) return;
  final s = storage ?? openPlateSecureStorage;
  for (final alias in const [
    SecureStorageAliases.byokKey,
    SecureStorageAliases.rungConfig,
    SecureStorageAliases.quotaHostedQuota,
  ]) {
    try {
      await secureDeleteEverywhere(s, alias);
    } on Object {
      // Best effort.
    }
  }
}
