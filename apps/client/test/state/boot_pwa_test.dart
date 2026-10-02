// The boot wiring of the PWA features (ADR-0003): the encrypted store's
// key/value table reaches the AI settings + BYOK key stores (web), durable
// storage is requested once after an unlock and never while locked, and the
// PWA seams are provided to the scope.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:openplate_client/boot.dart';
import 'package:openplate_client/state/pwa_provider.dart';

import '../_fakes/fake_encrypted_store.dart';
import '../_fakes/fake_web_store_controller.dart';

class _Probe {
  LocalKeyValueStore? settingsKv;
  LocalKeyValueStore? keyKv;
}

Future<ProviderContainer> _boot({
  required FakeWebStoreController? web,
  required LocalKeyValueStore? kv,
  required StoragePersistenceSource persistence,
  required _Probe probe,
  AppUpdateSignal? update,
  InstallPrompt? prompt,
}) async {
  final overrides = await buildAppOverrides(
    () {},
    dependencies: BootDependencies(
      createStores: () async => StoreBundle(
        encryptedStore: FakeEncryptedStore(),
        coachNoteStore: FakeCoachNoteStore(),
        webStoreController: web,
        keyValueStore: kv,
      ),
      createAiSettingsStore: (k) {
        probe.settingsKv = k;
        return InMemoryAiSettingsStore();
      },
      createByokKeyStore: (k) {
        probe.keyKv = k;
        return InMemoryByokKeyStore();
      },
      createQuotaCounter: () => InMemoryQuotaCounter(ceiling: 50),
      purgeLegacyWebStorage: false,
      createStoragePersistence: () => persistence,
      createAppUpdateSignal: () => update ?? const NoAppUpdateSignal(),
      createInstallPrompt: () => prompt ?? NoInstallPrompt(),
      readInstallContext: () => const InstallContext(
        platform: InstallPlatform.android,
        standalone: true,
      ),
    ),
  );
  final container = ProviderContainer(overrides: overrides);
  addTearDown(container.dispose);
  return container;
}

void main() {
  test('the store\'s key/value table is what the AI settings and BYOK key '
      'stores are built on', () async {
    final kv = InMemoryKeyValueStore();
    final probe = _Probe();
    await _boot(
      web: null,
      kv: kv,
      persistence: FixedStoragePersistence(StoragePersistence.unsupported),
      probe: probe,
    );
    expect(probe.settingsKv, same(kv));
    expect(probe.keyKv, same(kv));
  });

  test('right after an unlock, a not-yet-protected store asks the browser '
      'to protect it - once', () async {
    final persistence = FixedStoragePersistence(
      StoragePersistence.notProtected,
      afterRequest: StoragePersistence.protected,
    );
    await _boot(
      web: FakeWebStoreController(status: WebStoreStatus.unlocked),
      kv: InMemoryKeyValueStore(),
      persistence: persistence,
      probe: _Probe(),
    );
    await Future<void>.delayed(Duration.zero);
    expect(persistence.requests, 1);
  });

  test('already protected: no request at all', () async {
    final persistence = FixedStoragePersistence(StoragePersistence.protected);
    await _boot(
      web: FakeWebStoreController(status: WebStoreStatus.unlocked),
      kv: InMemoryKeyValueStore(),
      persistence: persistence,
      probe: _Probe(),
    );
    await Future<void>.delayed(Duration.zero);
    expect(persistence.requests, 0);
  });

  test('while locked (or not on the web) nothing is requested', () async {
    final persistence = FixedStoragePersistence(
      StoragePersistence.notProtected,
    );
    await _boot(
      web: FakeWebStoreController(), // locked
      kv: InMemoryKeyValueStore(),
      persistence: persistence,
      probe: _Probe(),
    );
    await _boot(
      web: null,
      kv: InMemoryKeyValueStore(),
      persistence: persistence,
      probe: _Probe(),
    );
    await Future<void>.delayed(Duration.zero);
    expect(persistence.requests, 0);
  });

  test(
    'a store that failed to open (no key/value table) still boots',
    () async {
      final probe = _Probe();
      final container = await _boot(
        web: null,
        kv: null,
        persistence: FixedStoragePersistence(StoragePersistence.unsupported),
        probe: probe,
      );
      expect(probe.settingsKv, isNull);
      // The export history falls back to memory instead of crashing.
      expect(
        await container.read(exportHistoryProvider).lastExportAt(),
        isNull,
      );
    },
  );

  test('the PWA seams are provided to the scope', () async {
    final update = ManualAppUpdateSignal();
    final prompt = ManualInstallPrompt();
    final container = await _boot(
      web: null,
      kv: InMemoryKeyValueStore(),
      persistence: FixedStoragePersistence(StoragePersistence.unsupported),
      probe: _Probe(),
      update: update,
      prompt: prompt,
    );
    expect(container.read(appUpdateProvider), same(update));
    expect(container.read(installPromptProvider), same(prompt));
    expect(container.read(installContextProvider).standalone, isTrue);
  });
}
