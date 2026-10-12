// `selectedDateProvider` unit tests (Story 1.4 / UX-DR8).
//
// The provider is a thin `StateProvider<DateTime?>`; the test pins the
// three contracts the Day Board relies on:
//
//   * initial state is `null` (today fallback);
//   * assigning a date emits the new value to every listener;
//   * clearing the state back to `null` returns to the today fallback.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/state/selected_date_provider.dart';

void main() {
  group('selectedDateProvider', () {
    test('initial value is null (today fallback)', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      expect(container.read(selectedDateProvider), isNull);
    });

    test('assigning a date re-emits the new value to listeners', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final observed = <DateTime?>[];
      final sub = container.listen<DateTime?>(
        selectedDateProvider,
        (_, next) => observed.add(next),
        fireImmediately: true,
      );
      addTearDown(sub.close);

      expect(observed, [null]);

      final tuesday = DateTime(2026, 8, 11);
      container.read(selectedDateProvider.notifier).state = tuesday;
      expect(observed.last, tuesday);
      expect(container.read(selectedDateProvider), tuesday);

      final wednesday = DateTime(2026, 8, 12);
      container.read(selectedDateProvider.notifier).state = wednesday;
      expect(observed.last, wednesday);
    });

    test('clearing the state back to null returns to the today fallback',
        () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      // Seed a value first.
      container.read(selectedDateProvider.notifier).state =
          DateTime(2026, 8, 10);
      expect(container.read(selectedDateProvider), isNotNull);

      // Clear it.
      container.read(selectedDateProvider.notifier).state = null;
      expect(container.read(selectedDateProvider), isNull);
    });
  });
}
