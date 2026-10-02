// Accessibility guideline suite - one entry per screen in `lib/screens/`
// (enforced by `tools/check_accessibility_floor.dart`). Each screen is
// pumped under the production theme in light and dark and must meet the
// Android + iOS tap-target, labelled-tap-target and text-contrast
// guidelines.

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:openplate_client/screens/about_screen.dart';
import 'package:openplate_client/screens/capture_barcode_screen.dart';
import 'package:openplate_client/screens/capture_photo_screen.dart';
import 'package:openplate_client/screens/create_passphrase_screen.dart';
import 'package:openplate_client/screens/day_board_screen.dart';
import 'package:openplate_client/screens/install_screen.dart';
import 'package:openplate_client/screens/key_lost_screen.dart';
import 'package:openplate_client/screens/lock_screen.dart';
import 'package:openplate_client/screens/manual_entry_screen.dart';
import 'package:openplate_client/screens/settings_screen.dart';
import 'package:openplate_client/screens/your_ai_screen.dart';
import 'package:openplate_client/screens/your_data_screen.dart';
import 'package:openplate_client/state/ai_rung_provider.dart';
import 'package:openplate_client/state/ai_settings_provider.dart';
import 'package:openplate_client/state/clock_provider.dart';
import 'package:openplate_client/state/coach_note_provider.dart';
import 'package:openplate_client/state/coach_provider.dart';
import 'package:openplate_client/state/erase_provider.dart';
import 'package:openplate_client/state/manual_entry_provider.dart';
import 'package:openplate_client/state/photo_provider.dart';
import 'package:openplate_client/state/pwa_provider.dart';
import 'package:openplate_client/state/record_plate_provider.dart';
import 'package:openplate_client/state/scanner_provider.dart';
import 'package:openplate_client/state/web_store_controller_provider.dart';
import 'package:openplate_client/l10n/l10n.dart';
import 'package:openplate_client/widgets/coach_depth_panel.dart';
import 'package:openplate_client/widgets/recognized_match_sheet.dart';
import 'package:openplate_client/widgets/update_banner.dart';

import '../_fakes/fake_encrypted_store.dart';
import '../_fakes/fake_web_store_controller.dart';
import 'a11y_helpers.dart';

class _Catalog implements FoodCatalog {
  const _Catalog();
  @override
  Future<CatalogResult> search(String query, {int limit = 10}) async =>
      const RankedMatches(<FoodMatch>[_appleMatch]);
  @override
  Future<DatabaseFood?> lookupBySourceRef(String sourceRef) async => null;
  @override
  Future<CatalogResult> lookupByBarcode(String code) async =>
      NotFoundFailure(code);
}

/// Answers every open-plate question (a `FakeCoach` answer is consumed once,
/// and the Day Board's loading placeholders would eat it).
class _AlwaysCoach implements Coach {
  const _AlwaysCoach();
  @override
  CoachQuestionResult questionFor({
    required CoachAnchor anchor,
    required CompositionPattern pattern,
  }) => CoachFound(
    CoachQuestion(
      key: 'openPlate.balanced',
      text: 'A calm, varied plate — anything you want to add?',
      anchor: anchor,
      pattern: pattern,
    ),
  );
}

class _Eraser implements LocalDataEraser {
  @override
  Future<EraseLocalDataResult> eraseAll() async =>
      const EraseLocalDataSuccess();
}

const _apple = DatabaseFood(
  sourceRef: 'seed:apple',
  displayName: 'Apple',
  source: SourceCatalog.off,
  foodGroup: FoodGroup.vegFruit,
);
const _appleMatch = FoodMatch(
  food: _apple,
  confidence: 0.95,
  presets: <QuantityRange>[
    QuantityRange(low: 1, high: 1, unit: 'piece', displayLabel: '~1 piece'),
  ],
);

List<Override> _commonOverrides({
  FakeEncryptedStore? store,
  Coach? coach,
  CoachNoteStore? notes,
}) => [
  initialAiSettingsProvider.overrideWithValue(AiSettings.defaults),
  aiSettingsStoreProvider.overrideWithValue(InMemoryAiSettingsStore()),
  byokKeyStoreProvider.overrideWithValue(InMemoryByokKeyStore()),
  encryptedStoreProvider.overrideWithValue(store ?? FakeEncryptedStore()),
  coachProvider.overrideWithValue(coach ?? FakeCoach()),
  coachNoteStoreProvider.overrideWithValue(notes ?? FakeCoachNoteStore()),
  foodCatalogProvider.overrideWithValue(const _Catalog()),
  clockProvider.overrideWithValue(() => DateTime(2026, 8, 15, 12)),
  localDataEraserProvider.overrideWithValue(_Eraser()),
];

Widget _scoped(
  Widget home,
  Brightness brightness, {
  List<Override> extra = const [],
  FakeEncryptedStore? store,
  Coach? coach,
  CoachNoteStore? notes,
}) => ProviderScope(
  overrides: [
    ..._commonOverrides(store: store, coach: coach, notes: notes),
    ...extra,
  ],
  child: themedApp(home, brightness: brightness),
);

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

PlateLog _plate() => PlateLog(
  id: 1,
  loggedAtUtc: DateTime(2026, 8, 15, 8).toUtc(),
  entries: [
    FoodEntry(
      id: 1,
      plateLogId: 1,
      databaseFood: _apple,
      quantity: const QuantityRange(
        low: 1,
        high: 1,
        unit: 'piece',
        displayLabel: '~1 piece',
      ),
    ),
  ],
);

void main() {
  // The app installs the delegates; prove nothing here relies on the fallback.
  setUpAll(() => debugAllowMissingL10n = false);
  tearDownAll(() => debugAllowMissingL10n = true);

  group('Day Board', () {
    a11yTest('empty day', (tester, pump, b) async {
      await pump((br) => _scoped(const DayBoardScreen(), br));
      await _settle(tester);
      await expectMeetsAllGuidelines(tester, 'DayBoardScreen (empty)');
    });

    a11yTest('day with a plate', (tester, pump, b) async {
      final store = FakeEncryptedStore(initial: [_plate()]);
      addTearDown(store.close);
      await pump((br) => _scoped(const DayBoardScreen(), br, store: store));
      await _settle(tester);
      await expectMeetsAllGuidelines(tester, 'DayBoardScreen (plate)');
    });
  });

  group('Coach surfaces', () {
    a11yTest('open-plate hint + whisper on the Day Board', (
      tester,
      pump,
      b,
    ) async {
      final store = FakeEncryptedStore(initial: [_plate()]);
      addTearDown(store.close);
      final notes = FakeCoachNoteStore()
        ..seed(
          1,
          CoachNote(
            id: 0,
            plateLogId: 1,
            anchor: CoachAnchor.postResolve,
            questionKey: 'post.resolve.vegLight',
            text: 'A handful of greens would round this plate out.',
            generatedAt: DateTime.utc(2026, 8, 15, 8),
          ),
        );
      const coach = _AlwaysCoach();
      await pump(
        (br) => _scoped(
          const DayBoardScreen(),
          br,
          store: store,
          coach: coach,
          notes: notes,
        ),
      );
      await _settle(tester);
      // Both coach surfaces are really on screen, so they are measured.
      expect(find.text('sure'), findsOneWidget, reason: 'whisper');
      expect(
        find.text('A handful of greens would round this plate out.'),
        findsOneWidget,
        reason: 'note text',
      );
      expect(
        find.text('A calm, varied plate — anything you want to add?'),
        findsWidgets,
      );
      await expectMeetsAllGuidelines(tester, 'DayBoard coach surfaces');
    });

    a11yTest('depth panel', (tester, pump, b) async {
      await pump(
        (br) => themedApp(
          const Scaffold(
            body: Center(
              child: CoachDepthPanel(
                question: 'What would you change about this plate?',
              ),
            ),
          ),
          brightness: br,
        ),
      );
      await _settle(tester);
      await expectMeetsAllGuidelines(tester, 'CoachDepthPanel');
    });
  });

  group('Capture barcode', () {
    a11yTest('scanning', (tester, pump, b) async {
      await pump(
        (br) => _scoped(
          const CaptureBarcodeScreen(),
          br,
          extra: [
            barcodeScannerProvider.overrideWithValue(FakeBarcodeScanner()),
            cameraPermissionProvider.overrideWithValue(FakeCameraPermission()),
            barcodeDetectorAvailableProvider.overrideWithValue(true),
          ],
        ),
      );
      await _settle(tester);
      await expectMeetsAllGuidelines(tester, 'CaptureBarcodeScreen (scan)');
    });

    a11yTest('camera denied', (tester, pump, b) async {
      await pump(
        (br) => _scoped(
          const CaptureBarcodeScreen(),
          br,
          extra: [
            barcodeScannerProvider.overrideWithValue(FakeBarcodeScanner()),
            cameraPermissionProvider.overrideWithValue(
              FakeCameraPermission(CameraPermissionStatus.denied),
            ),
            barcodeDetectorAvailableProvider.overrideWithValue(true),
          ],
        ),
      );
      await _settle(tester);
      await expectMeetsAllGuidelines(tester, 'CaptureBarcodeScreen (denied)');
    });
  });

  group('Capture photo', () {
    a11yTest('camera denied / cancelled', (tester, pump, b) async {
      final capture = FakePhotoCapture()..emitCancel();
      await pump(
        (br) => _scoped(
          const CapturePhotoScreen(),
          br,
          extra: [
            photoCaptureProvider.overrideWithValue(capture),
            aiRungProvider.overrideWithValue(FakeAiRung()),
          ],
        ),
      );
      await _settle(tester);
      await expectMeetsAllGuidelines(tester, 'CapturePhotoScreen (denied)');
    });

    a11yTest('recognized sheet after a capture', (tester, pump, b) async {
      final capture = FakePhotoCapture()..emitSuccess(Uint8List.fromList([1]));
      await pump(
        (br) => _scoped(
          const CapturePhotoScreen(),
          br,
          extra: [
            photoCaptureProvider.overrideWithValue(capture),
            aiRungProvider.overrideWithValue(FakeAiRung()),
          ],
        ),
      );
      await _settle(tester);
      await expectMeetsAllGuidelines(tester, 'CapturePhotoScreen (result)');
    });
  });

  group('Manual entry', () {
    a11yTest('empty form', (tester, pump, b) async {
      await pump((br) => _scoped(const ManualEntryScreen(), br));
      await _settle(tester);
      await expectMeetsAllGuidelines(tester, 'ManualEntryScreen');
    });

    a11yTest('with matches', (tester, pump, b) async {
      await pump((br) => _scoped(const ManualEntryScreen(), br));
      await tester.enterText(find.byType(TextField).first, 'apple');
      await _settle(tester);
      await expectMeetsAllGuidelines(tester, 'ManualEntryScreen (matches)');
    });
  });

  group('Recognized sheet', () {
    a11yTest('no match, closest matches + manual add', (tester, pump, b) async {
      await pump(
        (br) => _scoped(
          Builder(
            builder: (ctx) => Center(
              child: ElevatedButton(
                onPressed: () => showRecognizedMatchSheet(
                  ctx,
                  result: const RecognizedPlate(foods: <RecognizedFood>[]),
                  closestMatches: const [_appleMatch],
                ),
                child: const Text('open'),
              ),
            ),
          ),
          br,
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await expectMeetsAllGuidelines(tester, 'RecognizedMatchSheet');
    });
  });

  group('Your data', () {
    a11yTest('locked web store', (tester, pump, b) async {
      await pump(
        (br) => _scoped(
          const YourDataScreen(),
          br,
          extra: [
            webStoreControllerProvider.overrideWithValue(
              FakeWebStoreController(),
            ),
          ],
        ),
      );
      await _settle(tester);
      await expectMeetsAllGuidelines(tester, 'YourDataScreen (web locked)');
    });

    a11yTest('unlocked web store', (tester, pump, b) async {
      await pump(
        (br) => _scoped(
          const YourDataScreen(),
          br,
          extra: [
            webStoreControllerProvider.overrideWithValue(
              FakeWebStoreController(status: WebStoreStatus.unlocked),
            ),
          ],
        ),
      );
      await _settle(tester);
      await expectMeetsAllGuidelines(tester, 'YourDataScreen (unlocked)');
    });

    a11yTest('mobile', (tester, pump, b) async {
      await pump((br) => _scoped(const YourDataScreen(), br));
      await _settle(tester);
      await expectMeetsAllGuidelines(tester, 'YourDataScreen (mobile)');
    });

    // The PWA additions: the storage line and the quiet, dismissible export
    // suggestion are on screen and measured.
    a11yTest('web: storage line + export suggestion', (tester, pump, b) async {
      await pump(
        (br) => _scoped(
          const YourDataScreen(),
          br,
          store: FakeEncryptedStore(initial: [_plate()]),
          extra: [
            webStoreControllerProvider.overrideWithValue(
              FakeWebStoreController(status: WebStoreStatus.unlocked),
            ),
            storagePersistenceProvider.overrideWithValue(
              FixedStoragePersistence(StoragePersistence.notProtected),
            ),
          ],
        ),
      );
      await _settle(tester);
      expect(find.textContaining('export regularly'), findsOneWidget);
      expect(find.text('Not now'), findsOneWidget);
      await expectMeetsAllGuidelines(tester, 'YourDataScreen (pwa lines)');
    });
  });

  group('Install on your phone', () {
    a11yTest('instructions', (tester, pump, b) async {
      await pump((br) => _scoped(const InstallScreen(), br));
      await _settle(tester);
      await expectMeetsAllGuidelines(tester, 'InstallScreen');
    });

    a11yTest('with the browser install button', (tester, pump, b) async {
      final prompt = ManualInstallPrompt()..offer();
      await pump(
        (br) => _scoped(
          const InstallScreen(),
          br,
          extra: [installPromptProvider.overrideWithValue(prompt)],
        ),
      );
      await _settle(tester);
      expect(find.text('Install'), findsOneWidget);
      await expectMeetsAllGuidelines(tester, 'InstallScreen (prompt)');
    });

    a11yTest('already installed', (tester, pump, b) async {
      await pump(
        (br) => _scoped(
          const InstallScreen(),
          br,
          extra: [
            installContextProvider.overrideWithValue(
              const InstallContext(
                platform: InstallPlatform.ios,
                standalone: true,
              ),
            ),
          ],
        ),
      );
      await _settle(tester);
      await expectMeetsAllGuidelines(tester, 'InstallScreen (installed)');
    });
  });

  group('Update banner', () {
    a11yTest('a new version is ready', (tester, pump, b) async {
      final signal = ManualAppUpdateSignal()..markReady();
      await pump(
        (br) => _scoped(
          const UpdateBanner(child: Scaffold(body: Text('app'))),
          br,
          extra: [appUpdateProvider.overrideWithValue(signal)],
        ),
      );
      await _settle(tester);
      expect(find.text('Reload'), findsOneWidget);
      await expectMeetsAllGuidelines(tester, 'UpdateBanner');
    });
  });

  group('Your AI', () {
    a11yTest('rung list', (tester, pump, b) async {
      await pump(
        (br) => _scoped(
          const YourAiScreen(),
          br,
          extra: [
            quotaCounterProvider.overrideWithValue(
              InMemoryQuotaCounter(ceiling: 5),
            ),
            hostedQuotaProviderProvider.overrideWithValue(
              const CloudflareWorkersAiProvider(),
            ),
          ],
        ),
      );
      await _settle(tester);
      await expectMeetsAllGuidelines(tester, 'YourAiScreen');
    });

    a11yTest('own-key form', (tester, pump, b) async {
      await pump(
        (br) => _scoped(
          const YourAiScreen(),
          br,
          extra: [
            quotaCounterProvider.overrideWithValue(
              InMemoryQuotaCounter(ceiling: 5),
            ),
            hostedQuotaProviderProvider.overrideWithValue(
              const CloudflareWorkersAiProvider(),
            ),
          ],
        ),
      );
      await _settle(tester);
      await tester.tap(find.text('My own key'));
      await _settle(tester);
      await expectMeetsAllGuidelines(tester, 'YourAiScreen (own key)');
    });
  });

  a11yTest('Settings', (tester, pump, b) async {
    await pump((br) => _scoped(const SettingsScreen(), br));
    await _settle(tester);
    await expectMeetsAllGuidelines(tester, 'SettingsScreen');
  });

  a11yTest('About', (tester, pump, b) async {
    await pump((br) => _scoped(const AboutScreen(), br));
    await _settle(tester);
    await expectMeetsAllGuidelines(tester, 'AboutScreen');
  });

  a11yTest('Lock', (tester, pump, b) async {
    await pump(
      (br) => _scoped(
        const LockScreen(),
        br,
        extra: [
          webStoreControllerProvider.overrideWithValue(
            FakeWebStoreController(),
          ),
        ],
      ),
    );
    await _settle(tester);
    await expectMeetsAllGuidelines(tester, 'LockScreen');
  });

  a11yTest('Create passphrase', (tester, pump, b) async {
    await pump(
      (br) => _scoped(
        const CreatePassphraseScreen(),
        br,
        extra: [
          webStoreControllerProvider.overrideWithValue(
            FakeWebStoreController(),
          ),
        ],
      ),
    );
    await _settle(tester);
    await expectMeetsAllGuidelines(tester, 'CreatePassphraseScreen');
  });

  a11yTest('Key lost', (tester, pump, b) async {
    await pump((br) => _scoped(const KeyLostScreen(), br));
    await _settle(tester);
    await expectMeetsAllGuidelines(tester, 'KeyLostScreen');
  });
}
