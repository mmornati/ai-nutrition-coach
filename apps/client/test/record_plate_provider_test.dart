// The app's RecordPlate wiring: no sync ops are enqueued while there is no
// transport (nothing would ever drain them), and are once there is one.

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:openplate_client/state/coach_note_provider.dart';
import 'package:openplate_client/state/coach_provider.dart';
import 'package:openplate_client/state/record_plate_provider.dart';
import 'package:openplate_client/state/sync_queue_provider.dart';

import '_fakes/fake_encrypted_store.dart';

class _Transport implements SyncAdapter {
  @override
  bool get hasTransport => true;

  @override
  Future<DrainResult> drain(SyncOp op) async => const Drained();
}

const _draft = FoodEntryDraft(
  databaseFood: DatabaseFood(
    sourceRef: 'manual:egg',
    displayName: 'Egg',
    source: SourceCatalog.manual,
  ),
  quantity: QuantityRange(low: 1, high: 1, unit: 'piece', displayLabel: '~1'),
);

Future<int> _pendingAfterLog({required bool transport}) async {
  final store = FakeEncryptedStore();
  final container = ProviderContainer(
    overrides: [
      encryptedStoreProvider.overrideWithValue(store),
      coachProvider.overrideWithValue(FakeCoach()),
      coachNoteStoreProvider.overrideWithValue(FakeCoachNoteStore()),
      if (transport) syncAdapterProvider.overrideWithValue(_Transport()),
    ],
  );
  addTearDown(container.dispose);
  addTearDown(store.close);
  final result = await container.read(recordPlateProvider)(
    entries: const [_draft],
    store: store,
  );
  expect(result, isA<RecordPlateSuccess>());
  return (await container.read(syncQueueProvider).pending()).length;
}

void main() {
  test('no transport: nothing is enqueued', () async {
    expect(await _pendingAfterLog(transport: false), 0);
  });

  test('with a transport: the op is enqueued', () async {
    expect(await _pendingAfterLog(transport: true), 1);
  });
}
