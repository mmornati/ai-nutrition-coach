// `lastLogProvider` unit tests (Story 1.6 / UX-DR7).
//
// The provider is a thin `StateProvider<DateTime?>` — same shape as
// `selectedDateProvider` — and the tests pin the three contracts the
// Day Board relies on:
//
//   * initial state is `null` (no log yet);
//   * assigning a timestamp emits the new value to every listener;
//   * clearing the state back to `null` returns to the "no log" state.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:openplate_client/state/last_log_provider.dart';

void main() {
  group('lastLogProvider', () {
    test('initial value is null (no log yet)', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      expect(container.read(lastLogProvider), isNull);
    });

    test('assigning a timestamp emits the new value to listeners', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final observed = <DateTime?>[];
      final sub = container.listen<DateTime?>(
        lastLogProvider,
        (_, next) => observed.add(next),
        fireImmediately: true,
      );
      addTearDown(sub.close);

      expect(observed, [null]);

      final noon = DateTime(2026, 8, 15, 12, 0);
      container.read(lastLogProvider.notifier).state = noon;
      expect(observed.last, noon);
      expect(container.read(lastLogProvider), noon);

      final later = DateTime(2026, 8, 15, 12, 30);
      container.read(lastLogProvider.notifier).state = later;
      expect(observed.last, later);
    });

    test('clearing the state back to null returns to the "no log" state',
        () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      // Seed a value first.
      container.read(lastLogProvider.notifier).state =
          DateTime(2026, 8, 15);
      expect(container.read(lastLogProvider), isNotNull);

      // Clear it.
      container.read(lastLogProvider.notifier).state = null;
      expect(container.read(lastLogProvider), isNull);
    });
  });
}
