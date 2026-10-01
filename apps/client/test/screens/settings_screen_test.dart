// Settings list + navigation from the Day Board (Phase 3 / F5).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:openplate_client/screens/about_screen.dart';
import 'package:openplate_client/screens/day_board_screen.dart';
import 'package:openplate_client/screens/settings_screen.dart';
import 'package:openplate_client/screens/your_ai_screen.dart';
import 'package:openplate_client/screens/your_data_screen.dart';
import 'package:openplate_client/state/ai_rung_provider.dart';
import 'package:openplate_client/state/ai_settings_provider.dart';
import 'package:openplate_client/state/clock_provider.dart';
import 'package:openplate_client/state/coach_note_provider.dart';
import 'package:openplate_client/state/coach_provider.dart';
import 'package:openplate_client/state/record_plate_provider.dart';

import '../_fakes/fake_encrypted_store.dart';

Widget _app(Widget home, {FakeEncryptedStore? store}) => ProviderScope(
  overrides: [
    initialAiSettingsProvider.overrideWithValue(AiSettings.defaults),
    aiSettingsStoreProvider.overrideWithValue(InMemoryAiSettingsStore()),
    byokKeyStoreProvider.overrideWithValue(InMemoryByokKeyStore()),
    if (store != null) ...[
      encryptedStoreProvider.overrideWithValue(store),
      coachProvider.overrideWithValue(FakeCoach()),
      coachNoteStoreProvider.overrideWithValue(FakeCoachNoteStore()),
      clockProvider.overrideWithValue(() => DateTime(2026, 8, 15, 12)),
    ],
  ],
  child: MaterialApp(home: home),
);

void main() {
  setUp(() {
    final binding = TestWidgetsFlutterBinding.ensureInitialized();
    binding.platformDispatcher.views.first.devicePixelRatio = 1.0;
    binding.platformDispatcher.views.first.physicalSize = const Size(800, 1600);
  });
  tearDown(() {
    final binding = TestWidgetsFlutterBinding.ensureInitialized();
    binding.platformDispatcher.views.first.resetPhysicalSize();
    binding.platformDispatcher.views.first.resetDevicePixelRatio();
  });

  testWidgets('lists Your AI, Your data and About; each opens its screen', (
    tester,
  ) async {
    await tester.pumpWidget(_app(const SettingsScreen()));
    expect(find.text('Settings'), findsOneWidget);
    expect(find.text('Your AI'), findsOneWidget);
    expect(find.text('offline (no AI)'), findsOneWidget);
    expect(find.text('Your data'), findsOneWidget);
    expect(find.text('About'), findsOneWidget);

    await tester.tap(find.text('Your AI'));
    await tester.pumpAndSettle();
    expect(find.byType(YourAiScreen), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.text('Your data'));
    await tester.pumpAndSettle();
    expect(find.byType(YourDataScreen), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.text('About'));
    await tester.pumpAndSettle();
    expect(find.byType(AboutScreen), findsOneWidget);
  });

  testWidgets('the Day Board has a Settings action that opens Settings', (
    tester,
  ) async {
    final store = FakeEncryptedStore();
    addTearDown(store.close);
    await tester.pumpWidget(_app(const DayBoardScreen(), store: store));
    await tester.pumpAndSettle();

    final action = find.byTooltip('Settings');
    expect(action, findsOneWidget);
    expect(
      tester.getSize(action).shortestSide,
      greaterThanOrEqualTo(48),
      reason: 'touch target floor',
    );
    await tester.tap(action);
    await tester.pumpAndSettle();
    expect(find.byType(SettingsScreen), findsOneWidget);
  });
}
