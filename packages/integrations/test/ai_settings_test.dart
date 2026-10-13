// `AiSettings` codec + the stores, the key ending hint, and the mutex.

import 'dart:async';

import 'package:domain_core/domain_core.dart';
import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

import '_support/memory_secure_storage.dart';

void main() {
  group('AiSettings JSON', () {
    test('round-trips rung, previous rung, endpoint, model, consents', () {
      const s = AiSettings(
        rung: AiRungConfig(
          kind: AiRungKind.byok,
          previousRung: ByokPreviousRung(previousKind: AiRungKind.noOp),
        ),
        byokEndpointUrl: 'https://api.example.com/v1',
        byokModel: 'vision-1',
        byokKeyHost: 'api.example.com',
        photoConsentHosts: {'api.example.com', 'b.example.org'},
      );
      expect(AiSettings.fromJsonString(s.toJsonString()), s);
      expect(
        AiSettings.fromJsonString(s.toJsonString()).byokKeyHost,
        'api.example.com',
      );
    });

    test('corrupt / hostile blobs fall back to defaults, never throw', () {
      for (final raw in <String?>[
        null,
        '',
        'not json',
        '[]',
        '42',
        '{"kind": 7}',
        '{"kind": "byok", "consents": "x", "endpoint": 5, "model": []}',
      ]) {
        final s = AiSettings.fromJsonString(raw);
        expect(s.byokEndpointUrl, '');
        expect(s.photoConsentHosts, isEmpty);
        expect(s.rung.kind, anyOf(AiRungKind.noOp, AiRungKind.byok));
      }
      expect(AiSettings.fromJsonString('not json'), AiSettings.defaults);
    });

    test('rungs that are not available in this build normalise to noOp', () {
      for (final kind in ['hostedQuota', 'local', 'bogus']) {
        final s = AiSettings.fromJsonString('{"v":1,"kind":"$kind"}');
        expect(s.rung.kind, AiRungKind.noOp, reason: kind);
      }
      final s = AiSettings.fromJsonString(
        '{"v":1,"kind":"byok","previous":"hostedQuota"}',
      );
      expect(s.rung.previousRung!.previousKind, AiRungKind.noOp);
    });

    test('consent hosts are lower-cased and bounded', () {
      final s = AiSettings.fromJsonString(
        '{"consents": ["API.Example.COM", "", 5, ${[for (var i = 0; i < 100; i++) '"h$i"'].join(',')}]}',
      );
      expect(s.hasConsentFor('api.example.com'), isTrue);
      expect(s.photoConsentHosts.length, lessThanOrEqualTo(64));
    });

    test('ask-before-every-photo defaults to ON and round-trips (PV1)', () {
      expect(AiSettings.defaults.askBeforeEveryPhoto, isTrue);
      // A blob saved by an older build has no such key: the safe default.
      expect(
        AiSettings.fromJsonString('{"v":1,"kind":"noOp"}').askBeforeEveryPhoto,
        isTrue,
      );
      // A hand-edited, non-boolean value is not a way to switch it off.
      expect(
        AiSettings.fromJsonString('{"askEveryPhoto":"no"}').askBeforeEveryPhoto,
        isTrue,
      );
      final off = AiSettings.defaults.copyWith(askBeforeEveryPhoto: false);
      expect(
        AiSettings.fromJsonString(off.toJsonString()).askBeforeEveryPhoto,
        isFalse,
      );
      expect(off, isNot(AiSettings.defaults));
      expect(off.toString(), contains('askEveryPhoto: false'));
    });

    test('toString does not print the endpoint', () {
      const s = AiSettings(byokEndpointUrl: 'https://private.example.com/x');
      expect(s.toString(), isNot(contains('private')));
    });
  });

  group('SecureStorageAiSettingsStore', () {
    test('write / read / clear via the rungConfig alias', () async {
      final storage = MemorySecureStorage();
      final store = SecureStorageAiSettingsStore(storage: storage);
      expect(await store.read(), AiSettings.defaults);
      const s = AiSettings(
        byokEndpointUrl: 'https://x.example.com',
        byokModel: 'm',
        photoConsentHosts: {'x.example.com'},
      );
      await store.write(s);
      expect(storage.items.keys, contains(SecureStorageAliases.rungConfig));
      expect(await store.read(), s);
      await store.clear();
      expect(await store.read(), AiSettings.defaults);
    });

    test(
      'an unreadable keystore reads as defaults (app still starts)',
      () async {
        final storage = MemorySecureStorage()..failReads = true;
        expect(
          await SecureStorageAiSettingsStore(storage: storage).read(),
          AiSettings.defaults,
        );
      },
    );

    test('the settings alias is among those the eraser wipes', () {
      expect(
        SecureStorageAliases.all,
        contains(SecureStorageAliases.rungConfig),
      );
    });
  });

  group('purgeLegacyWebSecureStorage', () {
    test('deletes the byok / settings / quota aliases and nothing else; '
        'swallows failures', () async {
      final storage = MemorySecureStorage();
      storage.items[SecureStorageAliases.byokKey] = 'sk-leftover';
      storage.items[SecureStorageAliases.rungConfig] = '{}';
      storage.items[SecureStorageAliases.quotaHostedQuota] = '{}';
      storage.items['unrelated'] = 'keep';
      await purgeLegacyWebSecureStorage(storage: storage);
      expect(storage.items.keys, ['unrelated']);
    });
  });

  group('byokKeyEndingHint', () {
    test('only the last four, only for keys of 12+ characters', () {
      expect(byokKeyEndingHint('sk-or-v1-abcdefgh1234'), '1234');
      expect(byokKeyEndingHint('123456789012'), '9012');
      expect(byokKeyEndingHint('short'), isNull);
      expect(byokKeyEndingHint('12345678901'), isNull);
      expect(byokKeyEndingHint(null), isNull);
      expect(byokKeyEndingHint(''), isNull);
    });
  });

  group('AsyncMutex', () {
    test('runs actions strictly one after another, in order', () async {
      final mutex = AsyncMutex();
      final log = <String>[];
      Future<void> task(String name, int ms) => mutex.synchronized(() async {
        log.add('start $name');
        await Future<void>.delayed(Duration(milliseconds: ms));
        log.add('end $name');
      });
      await Future.wait([task('a', 20), task('b', 1), task('c', 1)]);
      expect(log, ['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
    });

    test('a failing action does not block the queue and rethrows', () async {
      final mutex = AsyncMutex();
      final bad = mutex.synchronized<void>(() async => throw StateError('x'));
      final good = mutex.synchronized(() async => 7);
      await expectLater(bad, throwsStateError);
      expect(await good, 7);
    });
  });
}
