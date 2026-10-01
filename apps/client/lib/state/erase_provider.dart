// "Erase all local data" provider graph (Phase 2A / D7 / D8).
//
// `localDataEraserProvider` is overridden in `main.dart` with an eraser
// that holds the bundle's `closeDatabase`, so the database handle is
// released before its files are deleted. The default builds an eraser
// with no handle to close — enough for widget tests and for the
// lost-key state where no database was ever opened.
//
// `storeStartupFailureProvider` carries `StoreBundle.startupFailure`
// so the gate can show the calm "history can't be opened" surface for
// `KeyLostFailure` (D7).

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

final Provider<LocalDataEraser> localDataEraserProvider =
    Provider<LocalDataEraser>((ref) => LocalDataEraserImpl());

final Provider<EraseLocalData> eraseLocalDataProvider =
    Provider<EraseLocalData>(
      (ref) => EraseLocalData(ref.watch(localDataEraserProvider)),
    );

/// Why the store failed to open at startup, or `null` when it opened.
final Provider<StoreFailure?> storeStartupFailureProvider =
    Provider<StoreFailure?>((ref) => null);

/// Rebuilds the whole app from a first-run state (re-runs `createStores`).
/// Called after a successful erase; the default is a no-op so widget
/// tests need not provide it.
final Provider<void Function()> appRestartProvider = Provider<void Function()>(
  (ref) => () {},
);
