// The web adapters (`WasmEncryptedStore`, `WasmCoachNoteStore`) run through the
// same contract as the native ones, over a REAL sqlite3mc database keyed by the
// production key attach (a temp file stands in for IndexedDB; see
// `_support/file_web_backend.dart`). Only the browser adapters themselves
// (WebCrypto, localStorage, the wasm backend) are not exercised here.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';

import '_support/file_web_backend.dart';
import '_support/store_contract.dart';

Future<(WebStoreController, Directory)> _unlocked() async {
  final dir = Directory.systemTemp.createTempSync(
    'ai_nutrition_coach_wasm_contract_',
  );
  final controller = WebStoreController(
    storage: InMemoryWebStoreStorage(),
    backend: FileWebBackend(File('${dir.path}/ai_nutrition_coach.db')),
    kdf: const DartPbkdf2Kdf(),
    lock: InMemoryWebStoreLock(),
    normalizePassphrase: (s) => s,
    kdfParams: const WebKdfParams(iterations: 1000),
    minIterations: 1000,
  );
  await controller.initialize();
  final outcome = await controller.createStore('correct horse battery staple');
  expect(outcome, isA<WebUnlocked>());
  return (controller, dir);
}

void main() {
  encryptedStoreContract(
    'WasmEncryptedStore (real sqlite3mc, file backend)',
    () async {
      final (controller, dir) = await _unlocked();
      return EncryptedStoreHarness(
        WasmEncryptedStore(source: controller),
        () async {
          await controller.lock();
          dir.deleteSync(recursive: true);
        },
      );
    },
  );

  coachNoteStoreContract(
    'WasmCoachNoteStore (real sqlite3mc, file backend)',
    () async {
      final (controller, dir) = await _unlocked();
      return CoachNoteStoreHarness(
        WasmCoachNoteStore(source: controller),
        () async {
          await controller.lock();
          dir.deleteSync(recursive: true);
        },
      );
    },
  );
}
