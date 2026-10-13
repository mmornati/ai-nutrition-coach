// `RecordByokChange` use-case tests (Story 3.3 / FR7 / AD-3).
//
// Pins:
//   * `enterByok` writes the key AND updates the config in one
//     commit (AD-3);
//   * `enterByok` records the previous rung so a key removal can
//     flip back exactly (FR7);
//   * `removeByok` clears the key AND flips the active rung back
//     to the recorded previous rung (FR7 — not always
//     `AiRungKind.noOp`);
//   * `removeByok` defaults to `AiRungKind.noOp` when no previous
//     rung is recorded (defensive — never leaves the user stuck
//     on a missing rung);
//   * the use-case never logs or reflects the key in any string it
//     produces (FR7 / NFR4).

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

void main() {
  group('RecordByokChange (Story 3.3 / FR7 / AD-3)', () {
    late _FakeKeyStore keyStore;
    late _FakeConfigStore configStore;
    late RecordByokChange useCase;

    setUp(() {
      keyStore = _FakeKeyStore();
      configStore = _FakeConfigStore(
        initial: const AiRungConfig(kind: AiRungKind.hostedQuota),
      );
      useCase = RecordByokChange(keyStore: keyStore, configStore: configStore);
    });

    test('enterByok writes the key AND updates the config in one '
        'commit (AD-3)', () async {
      final newConfig = await useCase.enterByok(
        apiKey: 'sk-test-1234',
        previousKind: AiRungKind.hostedQuota,
      );

      // Key was written.
      expect(keyStore.writeCount, 1);
      expect(await keyStore.read(), 'sk-test-1234');

      // Config was updated to byok + previousRung.
      expect(newConfig.kind, AiRungKind.byok);
      expect(newConfig.previousRung, isNotNull);
      expect(newConfig.previousRung!.previousKind, AiRungKind.hostedQuota);

      // Config store was also updated.
      expect(configStore.writeCount, 1);
      final stored = await configStore.read();
      expect(stored, newConfig);
    });

    test('removeByok clears the key AND flips the active rung back '
        'to the recorded previous rung (FR7 — not always noOp)', () async {
      // First enter the BYOK rung.
      await useCase.enterByok(
        apiKey: 'sk-test-1234',
        previousKind: AiRungKind.hostedQuota,
      );

      // Then remove it.
      final newConfig = await useCase.removeByok();

      // Key was cleared.
      expect(await keyStore.hasKey(), isFalse);

      // Config flipped back to hostedQuota (the recorded previous
      // rung), NOT to noOp.
      expect(newConfig.kind, AiRungKind.hostedQuota);
      expect(newConfig.previousRung, isNull);
    });

    test('removeByok defaults to noOp when no previous rung is '
        'recorded (defensive)', () async {
      // Config store starts at noOp (no previous rung recorded).
      configStore = _FakeConfigStore(
        initial: const AiRungConfig(kind: AiRungKind.noOp),
      );
      useCase = RecordByokChange(keyStore: keyStore, configStore: configStore);

      // Pretend we entered BYOK without a previous rung recorded.
      await keyStore.write('sk-test-1234');
      await configStore.write(const AiRungConfig(kind: AiRungKind.byok));

      final newConfig = await useCase.removeByok();

      // Falls back to noOp.
      expect(newConfig.kind, AiRungKind.noOp);
    });

    test('the use-case never logs or reflects the key in any string '
        'it produces (FR7 / NFR4)', () async {
      // The use-case's return values (AiRungConfig) are rung
      // metadata only — the key never appears in the config's
      // `toString` or in the use-case's own state.
      final newConfig = await useCase.enterByok(
        apiKey: 'sk-secret-must-not-leak',
        previousKind: AiRungKind.hostedQuota,
      );
      expect(newConfig.toString(), isNot(contains('sk-secret')));
      expect(newConfig.toString(), isNot(contains('secret')));
    });
  });
}

class _FakeKeyStore implements ByokKeyStorePort {
  String? _key;

  int writeCount = 0;

  @override
  Future<String?> read() async => _key;

  @override
  Future<void> write(String key) async {
    writeCount++;
    _key = key;
  }

  @override
  Future<void> clear() async {
    _key = null;
  }

  @override
  Future<bool> hasKey() async => _key != null && _key!.isNotEmpty;
}

class _FakeConfigStore implements AiRungConfigStorePort {
  _FakeConfigStore({required AiRungConfig initial}) : _config = initial;

  AiRungConfig _config;
  int writeCount = 0;

  @override
  Future<AiRungConfig> read() async => _config;

  @override
  Future<void> write(AiRungConfig config) async {
    writeCount++;
    _config = config;
  }
}
