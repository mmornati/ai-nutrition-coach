// The lost-key surface (Phase 2A / D7 / D8) and its gate wiring.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/screens/key_lost_screen.dart';
import 'package:ai_nutrition_coach/state/erase_provider.dart';
import 'package:ai_nutrition_coach/widgets/unlock_gate.dart';

class _Eraser implements LocalDataEraser {
  int calls = 0;
  @override
  Future<EraseLocalDataResult> eraseAll() async {
    calls++;
    return const EraseLocalDataSuccess();
  }
}

void main() {
  testWidgets('offers one confirmed erase and nothing else', (tester) async {
    final eraser = _Eraser();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [localDataEraserProvider.overrideWithValue(eraser)],
        child: const MaterialApp(home: KeyLostScreen()),
      ),
    );
    expect(find.text("Your history can't be opened"), findsOneWidget);
    await tester.tap(find.text('Erase local data and start over'));
    await tester.pumpAndSettle();
    expect(eraser.calls, 0, reason: 'must confirm first');
    await tester.tap(find.text('Erase'));
    await tester.pumpAndSettle();
    expect(eraser.calls, 1);
    expect(find.textContaining('All local data was erased'), findsOneWidget);
  });

  testWidgets('the gate shows it for KeyLostFailure on mobile', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          storeStartupFailureProvider.overrideWithValue(
            const StoreFailure(encryptedStoreError: KeyLostFailure()),
          ),
        ],
        child: const MaterialApp(home: UnlockGate()),
      ),
    );
    expect(find.byType(KeyLostScreen), findsOneWidget);
  });

  testWidgets('the gate also shows it (other copy) for any other failure', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          storeStartupFailureProvider.overrideWithValue(
            const StoreFailure(encryptedStoreError: SecureKeyFailure()),
          ),
        ],
        child: const MaterialApp(home: UnlockGate()),
      ),
    );
    expect(find.byType(KeyLostScreen), findsOneWidget);
    expect(find.text("Your history can't be opened right now"), findsOneWidget);
  });

  testWidgets('a successful erase restarts the app', (tester) async {
    var restarts = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          localDataEraserProvider.overrideWithValue(_Eraser()),
          appRestartProvider.overrideWithValue(() => restarts++),
        ],
        child: const MaterialApp(home: KeyLostScreen()),
      ),
    );
    await tester.tap(find.text('Erase local data and start over'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Erase'));
    await tester.pumpAndSettle();
    expect(restarts, 1);
  });
}
