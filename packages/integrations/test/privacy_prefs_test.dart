// The two one-time privacy answers (PV1, PV7) in the encrypted kv.

import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

class _LockedKv implements LocalKeyValueStore {
  @override
  Future<String?> read(String key) async => null;
  @override
  Future<void> write(String key, String value) =>
      throw const KeyValueStoreLocked();
  @override
  Future<void> delete(String key) => throw const KeyValueStoreLocked();
}

class _ThrowingKv implements LocalKeyValueStore {
  @override
  Future<String?> read(String key) => throw StateError('unreadable');
  @override
  Future<void> write(String key, String value) async {}
  @override
  Future<void> delete(String key) async {}
}

void main() {
  test(
    'defaults: nothing acknowledged, Open Food Facts not asked yet',
    () async {
      final prefs = PrivacyPrefs(InMemoryKeyValueStore());
      expect(await prefs.aboutAcknowledged(), isFalse);
      expect(await prefs.offLookupChoice(), OffLookupChoice.unasked);
    },
  );

  test('the About notice is acknowledged once, with a UTC timestamp', () async {
    final kv = InMemoryKeyValueStore();
    final prefs = PrivacyPrefs(kv, now: () => DateTime.utc(2026, 10, 12, 8));
    await prefs.acknowledgeAbout();
    expect(await prefs.aboutAcknowledged(), isTrue);
    expect(
      await kv.read(KvKeys.privacyAboutAckAtUtc),
      '2026-10-12T08:00:00.000Z',
    );
    // A new instance over the same store (an app restart) still knows.
    expect(await PrivacyPrefs(kv).aboutAcknowledged(), isTrue);
  });

  test('the Open Food Facts answer round-trips and can be reset', () async {
    final kv = InMemoryKeyValueStore();
    final prefs = PrivacyPrefs(kv);
    await prefs.setOffLookupChoice(OffLookupChoice.offlineOnly);
    expect(await prefs.offLookupChoice(), OffLookupChoice.offlineOnly);
    await prefs.setOffLookupChoice(OffLookupChoice.allowed);
    expect(await prefs.offLookupChoice(), OffLookupChoice.allowed);
    await prefs.setOffLookupChoice(OffLookupChoice.unasked);
    expect(await prefs.offLookupChoice(), OffLookupChoice.unasked);
  });

  test('an unknown stored token is "not asked", never consent', () async {
    final kv = InMemoryKeyValueStore();
    await kv.write(KvKeys.privacyOffLookup, 'yes please');
    expect(await PrivacyPrefs(kv).offLookupChoice(), OffLookupChoice.unasked);
  });

  test(
    'locked or unreadable store: reads are the defaults, writes throw',
    () async {
      final locked = PrivacyPrefs(_LockedKv());
      expect(await locked.aboutAcknowledged(), isFalse);
      expect(await locked.offLookupChoice(), OffLookupChoice.unasked);
      expect(locked.acknowledgeAbout, throwsA(isA<KeyValueStoreLocked>()));
      expect(
        () => locked.setOffLookupChoice(OffLookupChoice.allowed),
        throwsA(isA<KeyValueStoreLocked>()),
      );

      final broken = PrivacyPrefs(_ThrowingKv());
      expect(await broken.aboutAcknowledged(), isFalse);
      expect(await broken.offLookupChoice(), OffLookupChoice.unasked);
    },
  );
}
