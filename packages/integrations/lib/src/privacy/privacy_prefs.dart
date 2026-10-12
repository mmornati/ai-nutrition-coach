// The user's answers to the two one-time privacy notices (privacy audit
// PV1, PV7), stored in the ENCRYPTED key/value table (`kv_table`) on every
// platform: web (after the passphrase unlock) and mobile alike. They are not
// secrets, but they say how the person uses the app, so they live behind the
// same key as the plates and go with "Erase all local data".
//
//   * "About this app" (adults only, AI photos are opt-in): shown once
//     before the first Day Board, dismissed once.
//   * "Barcodes are looked up on Open Food Facts": shown the first time a
//     barcode is about to leave the device; the answer is `allowed` or
//     `offlineOnly` (never look up online).
//
// While the store is locked / unreadable a read answers the default (not
// acknowledged, not asked) and a write throws `KeyValueStoreLocked`; callers
// treat a failed write as "ask again next time", never as consent.

import '../store/key_value_store.dart';

/// What the person chose when told about Open Food Facts barcode lookups.
enum OffLookupChoice {
  /// Not asked yet. Nothing is sent until they answer.
  unasked,

  /// OK: barcodes may be looked up online.
  allowed,

  /// "Don't look up online": the offline catalog only.
  offlineOnly,
}

class PrivacyPrefs {
  PrivacyPrefs(this._kv, {DateTime Function()? now})
    : _now = now ?? DateTime.now;

  final LocalKeyValueStore _kv;
  final DateTime Function() _now;

  /// Has the one-time "About this app" notice been dismissed? Unreadable
  /// counts as not yet (the notice is shown again, never skipped).
  Future<bool> aboutAcknowledged() async {
    try {
      final raw = await _kv.read(KvKeys.privacyAboutAckAtUtc);
      return raw != null && raw.isNotEmpty;
    } on Object {
      return false;
    }
  }

  Future<void> acknowledgeAbout() =>
      _kv.write(KvKeys.privacyAboutAckAtUtc, _now().toUtc().toIso8601String());

  /// The stored Open Food Facts answer; [OffLookupChoice.unasked] when absent,
  /// unreadable or not one of the two known tokens.
  Future<OffLookupChoice> offLookupChoice() async {
    try {
      return switch (await _kv.read(KvKeys.privacyOffLookup)) {
        'allowed' => OffLookupChoice.allowed,
        'offlineOnly' => OffLookupChoice.offlineOnly,
        _ => OffLookupChoice.unasked,
      };
    } on Object {
      return OffLookupChoice.unasked;
    }
  }

  /// Persist the answer. `unasked` removes it (used by the privacy page to
  /// let the person change their mind).
  Future<void> setOffLookupChoice(OffLookupChoice choice) => switch (choice) {
    OffLookupChoice.unasked => _kv.delete(KvKeys.privacyOffLookup),
    OffLookupChoice.allowed => _kv.write(KvKeys.privacyOffLookup, 'allowed'),
    OffLookupChoice.offlineOnly => _kv.write(
      KvKeys.privacyOffLookup,
      'offlineOnly',
    ),
  };

  @override
  String toString() => 'PrivacyPrefs()';
}
