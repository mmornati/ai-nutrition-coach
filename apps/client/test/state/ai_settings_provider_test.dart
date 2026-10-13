// Phase 3 / F5 — the AI settings are runtime state: a change takes effect
// without a restart, is persisted before it is published, and the photo
// path honours consent.

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:ai_nutrition_coach/state/ai_rung_provider.dart';
import 'package:ai_nutrition_coach/state/ai_settings_provider.dart';
import 'package:ai_nutrition_coach/state/photo_provider.dart' show FakeAiRung;
import 'package:ai_nutrition_coach/state/your_ai_provider.dart';

class _ExplodingStore implements AiSettingsStore {
  @override
  Future<AiSettings> read() async => AiSettings.defaults;
  @override
  Future<void> write(AiSettings settings) async =>
      throw StateError('keystore full');
  @override
  Future<void> clear() async {}
}

class _RecordingTester implements ByokConnectionTester {
  _RecordingTester(this.result);
  final ByokConnectionResult result;
  final List<String> keys = [];
  @override
  Future<ByokConnectionResult> testConnection({required String apiKey}) async {
    keys.add(apiKey);
    return result;
  }
}

ProviderContainer _container({
  AiSettings initial = AiSettings.defaults,
  AiSettingsStore? store,
  InMemoryByokKeyStore? keys,
  ByokConnectionTester? tester,
}) {
  final c = ProviderContainer(
    overrides: [
      initialAiSettingsProvider.overrideWithValue(initial),
      aiSettingsStoreProvider.overrideWithValue(
        store ?? InMemoryAiSettingsStore(initial: initial),
      ),
      byokKeyStoreProvider.overrideWithValue(keys ?? InMemoryByokKeyStore()),
      quotaCounterProvider.overrideWithValue(InMemoryQuotaCounter(ceiling: 5)),
      hostedQuotaProviderProvider.overrideWithValue(
        const CloudflareWorkersAiProvider(),
      ),
      if (tester != null)
        byokConnectionTesterFactoryProvider.overrideWithValue(
          ({required endpointUrl, required model}) => tester,
        ),
    ],
  );
  addTearDown(c.dispose);
  return c;
}

const _endpoint = 'https://api.example.com/v1';

void main() {
  group('runtime rung switching', () {
    test('saving a key flips aiRungProvider from NoopAiRung to ByokAiRung '
        'with no restart, and removing it flips back', () async {
      final c = _container();
      expect(c.read(aiRungProvider), isA<NoopAiRung>());

      final result = await c
          .read(yourAiProvider.notifier)
          .saveByok(
            endpointUrl: _endpoint,
            model: 'vision-1',
            newKey: 'sk-test-abcdef123456',
          );
      expect(result, isA<SaveByokSaved>());
      expect(c.read(aiRungConfigProvider).kind, AiRungKind.byok);
      expect(
        c.read(aiRungProvider),
        isNot(isA<NoopAiRung>()),
        reason: 'the very next read resolves the BYOK rung',
      );
      expect(c.read(photoUploadHostProvider), 'api.example.com');
      expect(c.read(aiSettingsProvider).byokModel, 'vision-1');

      await c.read(yourAiProvider.notifier).removeByok();
      expect(c.read(aiRungConfigProvider).kind, AiRungKind.noOp);
      expect(c.read(aiRungProvider), isA<NoopAiRung>());
      expect(c.read(photoUploadHostProvider), isNull);
      expect(await c.read(byokKeyStoreProvider).hasKey(), isFalse);
    });

    test('the settings survive a "restart": a fresh container hydrated from '
        'the same store sees the rung, endpoint, model and consents', () async {
      final store = InMemoryAiSettingsStore();
      final c1 = _container(store: store);
      await c1
          .read(yourAiProvider.notifier)
          .saveByok(
            endpointUrl: _endpoint,
            model: 'vision-1',
            newKey: 'sk-test-abcdef123456',
          );
      await c1
          .read(aiSettingsProvider.notifier)
          .grantPhotoConsent('API.example.com');

      final hydrated = await store.read();
      final c2 = _container(initial: hydrated, store: store);
      expect(c2.read(aiRungConfigProvider).kind, AiRungKind.byok);
      expect(c2.read(aiSettingsProvider).byokEndpointUrl, _endpoint);
      expect(
        c2.read(aiSettingsProvider).hasConsentFor('api.example.com'),
        isTrue,
      );
    });

    test('a failed write is not published (the UI never claims a setting it '
        'did not keep)', () async {
      final c = _container(store: _ExplodingStore());
      await expectLater(
        c
            .read(aiSettingsProvider.notifier)
            .setRung(const AiRungConfig(kind: AiRungKind.byok)),
        throwsStateError,
      );
      expect(c.read(aiRungConfigProvider).kind, AiRungKind.noOp);

      final r = await c
          .read(yourAiProvider.notifier)
          .saveByok(
            endpointUrl: _endpoint,
            model: 'm',
            newKey: 'sk-abc123456789',
          );
      expect(r, isA<SaveByokStorageFailed>());
      expect(c.read(aiRungConfigProvider).kind, AiRungKind.noOp);
    });
  });

  group('saveByok validation', () {
    test('endpoint problems are reported and nothing is stored', () async {
      final keys = InMemoryByokKeyStore();
      final c = _container(keys: keys);
      final n = c.read(yourAiProvider.notifier);
      expect(
        await n.saveByok(
          endpointUrl: 'http://example.com',
          model: 'm',
          newKey: 'sk-abc123456789',
        ),
        isA<SaveByokEndpointInvalid>().having(
          (r) => r.problem,
          'problem',
          ByokEndpointProblem.notHttps,
        ),
      );
      expect(await keys.hasKey(), isFalse);
      expect(c.read(aiRungConfigProvider).kind, AiRungKind.noOp);
    });

    test('missing model, whitespace in the key, and no key at all', () async {
      final c = _container();
      final n = c.read(yourAiProvider.notifier);
      expect(
        await n.saveByok(endpointUrl: _endpoint, model: ' ', newKey: 'k'),
        isA<SaveByokModelMissing>(),
      );
      expect(
        await n.saveByok(
          endpointUrl: _endpoint,
          model: 'm',
          newKey: 'sk-has space-inside',
        ),
        isA<SaveByokKeyInvalid>(),
      );
      expect(
        await n.saveByok(endpointUrl: _endpoint, model: 'm'),
        isA<SaveByokKeyMissing>(),
      );
      expect(
        c.read(aiRungConfigProvider).kind,
        AiRungKind.noOp,
        reason: 'no key, so the rung does not move',
      );
    });

    test('re-saving without a new key keeps the stored key and switches '
        'to it; the previous rung is remembered exactly', () async {
      final keys = InMemoryByokKeyStore(seed: 'sk-stored-abcdef123456');
      final c = _container(
        keys: keys,
        initial: const AiSettings(byokKeyHost: 'api.example.com'),
      );
      final n = c.read(yourAiProvider.notifier);
      await n.saveByok(endpointUrl: _endpoint, model: 'm');
      expect(c.read(aiRungConfigProvider).kind, AiRungKind.byok);
      expect(
        c.read(aiRungConfigProvider).previousRung!.previousKind,
        AiRungKind.noOp,
      );
      expect(await keys.read(), 'sk-stored-abcdef123456');
    });

    test('selectNoAi keeps the stored key', () async {
      final keys = InMemoryByokKeyStore();
      final c = _container(keys: keys);
      final n = c.read(yourAiProvider.notifier);
      await n.saveByok(
        endpointUrl: _endpoint,
        model: 'm',
        newKey: 'sk-test-abcdef123456',
      );
      await n.selectNoAi();
      expect(c.read(aiRungConfigProvider).kind, AiRungKind.noOp);
      expect(await keys.hasKey(), isTrue);
    });
  });

  group('key never displayed back', () {
    test('state carries at most the last four characters', () async {
      final c = _container();
      final n = c.read(yourAiProvider.notifier);
      await n.saveByok(
        endpointUrl: _endpoint,
        model: 'm',
        newKey: 'sk-or-v1-SECRETMATERIAL-9f3a',
      );
      final s = c.read(yourAiProvider);
      expect(s.hasKey, isTrue);
      expect(s.keyEnding, '9f3a');
      expect(s.toString(), isNot(contains('SECRET')));
      expect(s.toString(), isNot(contains('9f3a')));
      expect(c.read(aiSettingsProvider).toString(), isNot(contains('SECRET')));
    });

    test('a short key shows no ending at all', () async {
      final keys = InMemoryByokKeyStore(seed: 'short');
      final c = _container(keys: keys);
      await c.read(yourAiProvider.notifier).refreshKeyPresence();
      expect(c.read(yourAiProvider).hasKey, isTrue);
      expect(c.read(yourAiProvider).keyEnding, isNull);
    });
  });

  group('testConnection', () {
    test('uses the typed key over the stored one, persists nothing', () async {
      final keys = InMemoryByokKeyStore(seed: 'sk-stored-abcdef123456');
      final tester = _RecordingTester(const ByokConnectionOk());
      final c = _container(
        keys: keys,
        tester: tester,
        initial: const AiSettings(byokKeyHost: 'api.example.com'),
      );
      final n = c.read(yourAiProvider.notifier);

      expect(
        await n.testConnection(
          endpointUrl: _endpoint,
          model: 'm',
          typedKey: 'sk-typed-abcdef123456',
        ),
        isA<ByokConnectionOk>(),
      );
      expect(tester.keys.single, 'sk-typed-abcdef123456');
      expect(await keys.read(), 'sk-stored-abcdef123456');
      expect(c.read(aiSettingsProvider).byokEndpointUrl, '');

      await n.testConnection(endpointUrl: _endpoint, model: 'm');
      expect(tester.keys.last, 'sk-stored-abcdef123456');
    });
  });

  group('consent', () {
    test('the BYOK rung is consent-gated: no consent, no upload — even if '
        'something bypasses the screen', () async {
      final keys = InMemoryByokKeyStore();
      final c = _container(keys: keys);
      await c
          .read(yourAiProvider.notifier)
          .saveByok(
            endpointUrl: _endpoint,
            model: 'm',
            newKey: 'sk-stored-abcdef123456',
          );
      final rung = c.read(aiRungProvider);
      expect(rung, isA<ConsentGatedAiRung>());
      expect(
        await rung.recognize(Uint8List.fromList([1, 2, 3])),
        isA<RecognitionFailure>(),
      );

      await c
          .read(aiSettingsProvider.notifier)
          .grantPhotoConsent('api.example.com');
      // Re-read: consent is evaluated at call time on the SAME rung.
      expect(c.read(photoConsentGrantedProvider('api.example.com')), isTrue);

      await c
          .read(aiSettingsProvider.notifier)
          .revokePhotoConsent('api.example.com');
      expect(c.read(photoConsentGrantedProvider('api.example.com')), isFalse);
      expect(
        await c.read(aiRungProvider).recognize(Uint8List.fromList([1, 2, 3])),
        isA<RecognitionFailure>(),
      );
    });

    test('ConsentGatedAiRung evaluates consent at call time', () async {
      var allowed = false;
      final inner = FakeAiRung();
      final gated = ConsentGatedAiRung(inner: inner, hasConsent: () => allowed);
      await gated.recognize(Uint8List(1));
      expect(inner.calls, isEmpty);
      allowed = true;
      await gated.recognize(Uint8List(1));
      expect(inner.calls, hasLength(1));
    });

    test(
      'unavailable rungs persisted by an older build normalise to no-AI',
      () {
        final s = AiSettings.fromJsonString('{"v":1,"kind":"hostedQuota"}');
        final c = _container(initial: s);
        expect(c.read(aiRungConfigProvider).kind, AiRungKind.noOp);
      },
    );
  });

  group('key bound to its host (S1)', () {
    const keyA = 'sk-keyforA-abcdef123456';

    test('saving a different host without re-entering the key is refused, '
        'nothing changes, the key is not usable for the new host', () async {
      final keys = InMemoryByokKeyStore();
      final c = _container(keys: keys);
      final n = c.read(yourAiProvider.notifier);
      await n.saveByok(endpointUrl: _endpoint, model: 'm', newKey: keyA);
      expect(c.read(aiSettingsProvider).byokKeyHost, 'api.example.com');

      final r = await n.saveByok(
        endpointUrl: 'https://evil.example.net/v1',
        model: 'm2',
      );
      expect(
        r,
        isA<SaveByokKeyForOtherHost>().having(
          (x) => x.savedFor,
          'savedFor',
          'api.example.com',
        ),
      );
      final s = c.read(aiSettingsProvider);
      expect(s.byokEndpointUrl, _endpoint, reason: 'nothing was persisted');
      expect(s.byokModel, 'm');
      expect(await keys.read(), keyA, reason: 'key untouched, not cleared');
    });

    test('re-entering the key for the new host rebinds it', () async {
      final c = _container();
      final n = c.read(yourAiProvider.notifier);
      await n.saveByok(endpointUrl: _endpoint, model: 'm', newKey: keyA);
      final r = await n.saveByok(
        endpointUrl: 'https://other.example.org/v1',
        model: 'm',
        newKey: 'sk-keyforB-abcdef123456',
      );
      expect(r, isA<SaveByokSaved>());
      expect(c.read(aiSettingsProvider).byokKeyHost, 'other.example.org');
    });

    test('a key with no recorded host (older build) is not used until '
        'pasted again', () async {
      final keys = InMemoryByokKeyStore(seed: keyA);
      final c = _container(
        keys: keys,
        initial: const AiSettings(
          rung: AiRungConfig(kind: AiRungKind.byok),
          byokEndpointUrl: _endpoint,
          byokModel: 'm',
        ),
      );
      final r = await c
          .read(yourAiProvider.notifier)
          .saveByok(endpointUrl: _endpoint, model: 'm');
      expect(r, isA<SaveByokKeyForOtherHost>());
    });

    test(
      'HostBoundByokKeyStore releases the key only for the bound host',
      () async {
        final inner = InMemoryByokKeyStore(seed: keyA);
        HostBoundByokKeyStore store(String bound, String endpoint) =>
            HostBoundByokKeyStore(
              inner: inner,
              boundHost: bound,
              endpointHost: endpoint,
            );
        expect(await store('a.com', 'a.com').read(), keyA);
        expect(await store('A.com', 'a.COM').hasKey(), isTrue);
        expect(await store('a.com', 'b.com').read(), isNull);
        expect(await store('a.com', 'b.com').hasKey(), isFalse);
        expect(await store('', 'a.com').read(), isNull);
        expect(await store('a.com', '').read(), isNull);
      },
    );

    test(
      'the live rung is blind to the key once the endpoint host differs',
      () async {
        final keys = InMemoryByokKeyStore();
        final c = _container(keys: keys);
        final n = c.read(yourAiProvider.notifier);
        await n.saveByok(endpointUrl: _endpoint, model: 'm', newKey: keyA);
        await c
            .read(aiSettingsProvider.notifier)
            .grantPhotoConsent('other.example.org');
        await c
            .read(aiSettingsProvider.notifier)
            .setByokTarget(
              endpointUrl: 'https://other.example.org/v1',
              model: 'm',
            );
        final out = await c
            .read(aiRungProvider)
            .recognize(Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xD9]));
        expect(out, isA<RecognitionFailure>());
        expect(out.toString(), isNot(contains(keyA)));
      },
    );

    test('testConnection with only a saved key for another host asks for '
        're-entry and makes no request', () async {
      final tester = _RecordingTester(const ByokConnectionOk());
      final c = _container(tester: tester);
      final n = c.read(yourAiProvider.notifier);
      await n.saveByok(endpointUrl: _endpoint, model: 'm', newKey: keyA);
      final r = await n.testConnection(
        endpointUrl: 'https://other.example.org/v1',
        model: 'm',
      );
      expect(r, isA<ByokConnectionKeyForOtherHost>());
      expect(tester.keys, isEmpty);
      await n.testConnection(
        endpointUrl: 'https://other.example.org/v1',
        model: 'm',
        typedKey: 'sk-new-abcdef123456',
      );
      expect(tester.keys.single, 'sk-new-abcdef123456');
    });

    test('removing the key clears the binding', () async {
      final c = _container();
      final n = c.read(yourAiProvider.notifier);
      await n.saveByok(endpointUrl: _endpoint, model: 'm', newKey: keyA);
      await n.removeByok();
      expect(c.read(aiSettingsProvider).byokKeyHost, '');
    });
  });
}
