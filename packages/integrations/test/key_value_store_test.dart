// The encrypted key/value table (schema v5) and what is built on it: the web
// AI settings, the web BYOK key and the last-export date (ADR-0003).

import 'dart:io';

import 'package:domain_core/domain_core.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:integrations/src/store/app_database.dart';

import '_support/file_web_backend.dart';

void main() {
  late AppDatabase db;
  late DatabaseKeyValueStore kv;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    kv = DatabaseKeyValueStore.of(db);
  });
  tearDown(() => db.close());

  group('DatabaseKeyValueStore', () {
    test('reads null, writes, overwrites and deletes', () async {
      expect(await kv.read('a.b'), isNull);
      await kv.write('a.b', '1');
      expect(await kv.read('a.b'), '1');
      await kv.write('a.b', '2');
      expect(await kv.read('a.b'), '2');
      await kv.delete('a.b');
      expect(await kv.read('a.b'), isNull);
      await kv.delete('a.b'); // absent: no-op
    });

    test(
      'while locked (no database) reads are null and writes throw',
      () async {
        final locked = DatabaseKeyValueStore(() => null);
        expect(await locked.read('x'), isNull);
        expect(
          () => locked.write('x', 'y'),
          throwsA(isA<KeyValueStoreLocked>()),
        );
        expect(() => locked.delete('x'), throwsA(isA<KeyValueStoreLocked>()));
      },
    );

    test('follows the CURRENT database of the resolver', () async {
      AppDatabase? current = db;
      final view = DatabaseKeyValueStore(() => current);
      await view.write('k', 'v');
      expect(await view.read('k'), 'v');
      current = null; // locked
      expect(await view.read('k'), isNull);
      current = db; // unlocked again
      expect(await view.read('k'), 'v');
    });

    test('toString never prints values', () async {
      await kv.write('ai.byokKey', 'sk-secret-value-123');
      expect(kv.toString(), isNot(contains('sk-secret')));
    });
  });

  group('web AI settings in the encrypted store', () {
    test('round-trip, defaults when absent, clear', () async {
      final store = KvAiSettingsStore(kv);
      expect(await store.read(), AiSettings.defaults);
      final settings = AiSettings.defaults.copyWith(
        rung: const AiRungConfig(
          kind: AiRungKind.byok,
          previousRung: ByokPreviousRung(previousKind: AiRungKind.noOp),
        ),
        byokEndpointUrl: 'https://api.example.com/v1',
        byokModel: 'm',
        byokKeyHost: 'api.example.com',
        photoConsentHosts: {'api.example.com'},
      );
      await store.write(settings);
      expect(
        (await KvAiSettingsStore(kv).read()).toJsonString(),
        settings.toJsonString(),
      );
      await store.clear();
      expect(await store.read(), AiSettings.defaults);
    });

    test('a locked store reads as the no-AI default, never throws', () async {
      final store = KvAiSettingsStore(DatabaseKeyValueStore(() => null));
      expect(await store.read(), AiSettings.defaults);
    });
  });

  group('web BYOK key in the encrypted store', () {
    test('write / read / hasKey / clear; toString is redacted', () async {
      final keys = KvByokKeyStore(kv);
      expect(await keys.hasKey(), isFalse);
      await keys.write('sk-test-abcdef123456');
      expect(await keys.read(), 'sk-test-abcdef123456');
      expect(await keys.hasKey(), isTrue);
      expect(keys.toString(), isNot(contains('sk-test')));
      await keys.clear();
      expect(await keys.read(), isNull);
    });

    test(
      'locked: reads as no key; a write fails instead of pretending',
      () async {
        final keys = KvByokKeyStore(DatabaseKeyValueStore(() => null));
        expect(await keys.read(), isNull);
        expect(await keys.hasKey(), isFalse);
        expect(() => keys.write('sk-x'), throwsA(isA<KeyValueStoreLocked>()));
      },
    );

    test('the host binding still applies on top of it', () async {
      final inner = KvByokKeyStore(kv);
      await inner.write('sk-test-abcdef123456');
      HostBoundByokKeyStore bound(String saved, String endpoint) =>
          HostBoundByokKeyStore(
            inner: inner,
            boundHost: saved,
            endpointHost: endpoint,
          );
      expect(await bound('a.example', 'a.example').read(), isNotNull);
      expect(await bound('a.example', 'evil.example').read(), isNull);
    });
  });

  group('ExportHistory', () {
    test(
      'null until recorded, then the UTC instant; dismissal is separate',
      () async {
        final history = ExportHistory(kv);
        expect(await history.lastExportAt(), isNull);
        final at = DateTime.utc(2026, 10, 2, 8, 30);
        await history.record(at);
        expect(await history.lastExportAt(), at);
        expect(await history.reminderDismissedAt(), isNull);
        await history.recordReminderDismissed(at);
        expect(await history.reminderDismissedAt(), at);
      },
    );

    test('garbage reads as never; a locked store never throws', () async {
      await kv.write(KvKeys.exportLastAtUtc, 'not a date');
      expect(await ExportHistory(kv).lastExportAt(), isNull);
      final locked = ExportHistory(DatabaseKeyValueStore(() => null));
      expect(await locked.lastExportAt(), isNull);
      await locked.record(DateTime.now()); // best effort: no throw
    });
  });

  group(
    'through the real web store lifecycle (sqlite3mc, key from a passphrase)',
    () {
      late Directory dir;
      late FileWebBackend backend;
      late InMemoryWebStoreStorage storage;

      WebStoreController build() => WebStoreController(
        storage: storage,
        backend: backend,
        kdf: const DartPbkdf2Kdf(),
        lock: InMemoryWebStoreLock(),
        normalizePassphrase: (s) => s,
        kdfParams: const WebKdfParams(iterations: 1000),
        minIterations: 1000,
      );

      setUp(() {
        dir = Directory.systemTemp.createTempSync('ai_nutrition_coach_kv_web_');
        backend = FileWebBackend(File('${dir.path}/ai_nutrition_coach.db'));
        storage = InMemoryWebStoreStorage();
      });
      tearDown(() {
        if (dir.existsSync()) dir.deleteSync(recursive: true);
      });

      test(
        'the BYOK key and settings survive lock + reload, and die with the store',
        () async {
          var controller = build();
          await controller.initialize();
          expect(
            await controller.createStore('correct horse battery staple'),
            isA<WebUnlocked>(),
          );
          var view = DatabaseKeyValueStore(() => controller.database);
          await KvByokKeyStore(view).write('sk-persisted-abcdef123456');
          await KvAiSettingsStore(view).write(
            AiSettings.defaults.copyWith(
              rung: const AiRungConfig(kind: AiRungKind.byok),
              byokEndpointUrl: 'https://api.example.com/v1',
              byokModel: 'm',
              byokKeyHost: 'api.example.com',
            ),
          );

          // Locked: nothing readable, and no key left in the controller's reach.
          await controller.lock();
          expect(await KvByokKeyStore(view).read(), isNull);

          // "Reload the page": a new controller over the same storage.
          controller = build();
          await controller.initialize();
          expect(controller.status, WebStoreStatus.locked);
          view = DatabaseKeyValueStore(() => controller.database);
          expect(await KvByokKeyStore(view).read(), isNull); // still locked
          expect(
            await controller.unlock('wrong passphrase 12'),
            isA<WebWrongPassphrase>(),
          );
          expect(await KvByokKeyStore(view).read(), isNull);
          expect(
            await controller.unlock('correct horse battery staple'),
            isA<WebUnlocked>(),
          );
          expect(
            await KvByokKeyStore(view).read(),
            'sk-persisted-abcdef123456',
          );
          expect(
            (await KvAiSettingsStore(view).read()).rung.kind,
            AiRungKind.byok,
          );

          // The key is not in the plaintext file bytes (the whole file is encrypted).
          await controller.lock();
          final bytes = File(
            '${dir.path}/ai_nutrition_coach.db',
          ).readAsBytesSync();
          expect(String.fromCharCodes(bytes), isNot(contains('sk-persisted')));

          // Erase takes it with it.
          controller = build();
          await controller.initialize();
          await controller.eraseStore();
          expect(await backend.exists(), isFalse);
        },
      );
    },
  );
}
