// Shared contract suites for the store ports (security review 2.9 / Phase 7).
//
// The suites below are run against the REAL adapters (native sqlite3mc in the
// VM) AND against every fake / in-memory implementation the tests and the
// dev web build use, so a fake can never drift away from the behaviour the
// production adapter has: persisted `food_group`, millisecond timestamps,
// half-open `[from, to)` bounds, newest-first ordering, typed (never thrown)
// results.
//
// Imports only `domain_core` + `flutter_test` so both `packages/integrations`
// and `apps/client` tests can run it. `apps/client` reaches this file by a
// relative path (`../../../../packages/integrations/test/_support/...`): the
// two are members of one pub workspace, but a package's `test/` directory is
// not importable as `package:integrations/...`, and duplicating the suite would
// let the copies drift. Both packages depend on the same `domain_core` and
// `flutter_test`, so the file compiles identically in either.

import 'dart:async';

import 'package:domain_core/domain_core.dart';
import 'package:flutter_test/flutter_test.dart';

/// One store under test plus its teardown.
class EncryptedStoreHarness {
  EncryptedStoreHarness(this.store, [this.dispose]);
  final EncryptedStore store;
  final Future<void> Function()? dispose;
}

class CoachNoteStoreHarness {
  CoachNoteStoreHarness(this.store, [this.dispose]);
  final CoachNoteStore store;
  final Future<void> Function()? dispose;
}

FoodEntryDraft _draft(
  String name, {
  FoodGroup group = FoodGroup.other,
  SourceCatalog source = SourceCatalog.manual,
  num low = 1,
  num high = 2,
  String unit = 'piece',
  String label = '~1-2 pieces',
}) => FoodEntryDraft(
  databaseFood: DatabaseFood(
    sourceRef: 'manual:${name.toLowerCase()}',
    displayName: name,
    source: source,
    foodGroup: group,
  ),
  quantity: QuantityRange(
    low: low,
    high: high,
    unit: unit,
    displayLabel: label,
  ),
);

Future<PlateLog> _record(
  EncryptedStore s,
  List<FoodEntryDraft> entries,
  DateTime at,
) async {
  final r = await s.recordPlate(entries: entries, loggedAtUtc: at);
  return switch (r) {
    RecordPlateSuccess(:final plateLog) => plateLog,
    _ => throw StateError('recordPlate failed: $r'),
  };
}

Future<List<PlateLog>> _read(EncryptedStore s, {DateTime? from, DateTime? to}) {
  return s.readRange(from: from, to: to).then((r) {
    return switch (r) {
      PlatesRead(:final plates) => plates,
      PlatesReadFailed(:final failure) => throw StateError('$failure'),
    };
  });
}

/// Runs the `EncryptedStore` contract against [create]. Call inside `main()`.
void encryptedStoreContract(
  String name,
  Future<EncryptedStoreHarness> Function() create,
) {
  group('EncryptedStore contract: $name', () {
    late EncryptedStoreHarness h;
    late EncryptedStore store;

    setUp(() async {
      h = await create();
      store = h.store;
    });
    tearDown(() async {
      await h.dispose?.call();
    });

    final t0 = DateTime.utc(2026, 8, 16, 12);

    test(
      'assigns positive, distinct ids; entries point at their plate',
      () async {
        final a = await _record(store, [_draft('Apple'), _draft('Pear')], t0);
        final b = await _record(store, [
          _draft('Plum'),
        ], t0.add(const Duration(minutes: 1)));
        expect(a.id, isPositive);
        expect(b.id, isNot(a.id));
        expect(a.entries, hasLength(2));
        expect(a.entries.every((e) => e.plateLogId == a.id), isTrue);
        expect(a.entries.map((e) => e.id).toSet(), hasLength(2));
        expect(a.entries.every((e) => e.id > 0), isTrue);
      },
    );

    test(
      'round-trips every field, including food_group and fractions',
      () async {
        final committed = await _record(store, [
          _draft(
            'Salmon',
            group: FoodGroup.protein,
            source: SourceCatalog.manual,
            low: 0.5,
            high: 1.5,
            unit: 'fillet',
            label: '~half to 1.5 fillets',
          ),
          _draft('Spinach', group: FoodGroup.vegFruit, low: 2, high: 2),
        ], t0);
        for (final plates in [committed, ...await _read(store)]) {
          final e = plates.entries;
          expect(e, hasLength(2), reason: 'insertion order, both entries');
          expect(e[0].databaseFood.displayName, 'Salmon');
          expect(e[0].databaseFood.sourceRef, 'manual:salmon');
          expect(e[0].databaseFood.source, SourceCatalog.manual);
          expect(e[0].databaseFood.foodGroup, FoodGroup.protein);
          expect(e[0].quantity.low, 0.5);
          expect(e[0].quantity.high, 1.5);
          expect(e[0].quantity.unit, 'fillet');
          expect(e[0].quantity.displayLabel, '~half to 1.5 fillets');
          expect(e[1].databaseFood.foodGroup, FoodGroup.vegFruit);
          expect(e[1].quantity.low, 2);
          expect(e[1].quantity.high, 2);
        }
      },
    );

    test('timestamps are UTC with millisecond precision', () async {
      final micro = DateTime.utc(2026, 8, 16, 12, 0, 0, 123, 456);
      final committed = await _record(store, [_draft('Apple')], micro);
      expect(committed.loggedAtUtc.isUtc, isTrue);
      expect(committed.loggedAtUtc, DateTime.utc(2026, 8, 16, 12, 0, 0, 123));
      final read = (await _read(store)).single;
      expect(read.loggedAtUtc.isUtc, isTrue);
      expect(read.loggedAtUtc, committed.loggedAtUtc);
    });

    test('a local-zone instant is stored as the same UTC instant', () async {
      final local = DateTime(2026, 8, 16, 23, 30);
      final committed = await _record(store, [_draft('Apple')], local);
      expect(committed.loggedAtUtc.isUtc, isTrue);
      expect(committed.loggedAtUtc.isAtSameMomentAs(local), isTrue);
    });

    test('readRange is half-open [from, to) and newest first', () async {
      final early = await _record(store, [_draft('Early')], t0);
      final mid = await _record(store, [
        _draft('Mid'),
      ], t0.add(const Duration(hours: 1)));
      final late = await _record(store, [
        _draft('Late'),
      ], t0.add(const Duration(hours: 2)));
      final from = early.loggedAtUtc;
      final to = late.loggedAtUtc;

      final ranged = await _read(store, from: from, to: to);
      expect(
        ranged.map((p) => p.id),
        [mid.id, early.id],
        reason: 'from is inclusive, to is exclusive, newest first',
      );

      final all = await _read(store);
      expect(all.map((p) => p.id), [late.id, mid.id, early.id]);

      expect(
        (await _read(store, from: mid.loggedAtUtc)).map((p) => p.id),
        [late.id, mid.id],
        reason: 'open upper bound',
      );
      expect(
        (await _read(store, to: mid.loggedAtUtc)).map((p) => p.id),
        [early.id],
        reason: 'open lower bound',
      );
      expect(
        await _read(store, from: to, to: from),
        isEmpty,
        reason: 'inverted range is empty, not an error',
      );
    });

    test(
      'readRange over an empty store is an empty list, not a failure',
      () async {
        expect(await _read(store), isEmpty);
      },
    );

    test(
      'watchRange emits the current snapshot, then one per change, range-bound',
      () async {
        final inRange = DateTime.utc(2026, 8, 16, 10);
        final from = DateTime.utc(2026, 8, 16);
        final to = DateTime.utc(2026, 8, 17);
        await _record(store, [
          _draft('Before'),
        ], DateTime.utc(2026, 8, 15, 23, 59));
        await _record(store, [_draft('Seed')], inRange);

        final snapshots = <List<PlateLog>>[];
        final sub = store.watchRange(from: from, to: to).listen(snapshots.add);
        addTearDown(sub.cancel);

        await _until(() => snapshots.isNotEmpty);
        expect(
          snapshots.first.map((p) => p.entries.single.databaseFood.displayName),
          ['Seed'],
          reason: 'first emission is the current state, bounded to the range',
        );

        final added = await _record(store, [
          _draft('Added'),
        ], DateTime.utc(2026, 8, 16, 11));
        await _until(() => snapshots.last.any((p) => p.id == added.id));
        expect(
          snapshots.last.map((p) => p.id).first,
          added.id,
          reason: 'newest first',
        );
        expect(
          snapshots.last.any(
            (p) => p.entries.single.databaseFood.displayName == 'Before',
          ),
          isFalse,
        );
        expect(
          snapshots.last.any(
            (p) => p.entries.single.databaseFood.displayName == 'Added',
          ),
          isTrue,
        );
        expect(
          await _read(store, from: from, to: to),
          snapshots.last,
          reason: 'the watch and the one-shot read agree',
        );
      },
    );

    test('deletePlate removes that plate and its entries only', () async {
      final a = await _record(store, [_draft('Apple'), _draft('Pear')], t0);
      final b = await _record(store, [
        _draft('Plum'),
      ], t0.add(const Duration(minutes: 1)));
      expect(await store.deletePlate(a.id), isA<PlateDeleted>());
      final left = await _read(store);
      expect(left.map((p) => p.id), [b.id]);
      expect(left.single.entries.single.databaseFood.displayName, 'Plum');
    });

    test('deletePlate is idempotent and an unknown id succeeds', () async {
      final a = await _record(store, [_draft('Apple')], t0);
      expect(await store.deletePlate(a.id), isA<PlateDeleted>());
      expect(await store.deletePlate(a.id), isA<PlateDeleted>());
      expect(await store.deletePlate(987654), isA<PlateDeleted>());
      expect(await _read(store), isEmpty);
    });

    test('deletePlate re-emits a snapshot without the plate', () async {
      final a = await _record(store, [_draft('Apple')], t0);
      final b = await _record(store, [
        _draft('Plum'),
      ], t0.add(const Duration(minutes: 1)));
      final seen = <List<PlateLog>>[];
      final sub = store
          .watchRange(from: t0, to: t0.add(const Duration(hours: 1)))
          .listen(seen.add);
      addTearDown(sub.cancel);
      await _until(() => seen.isNotEmpty);
      expect(seen.last.map((p) => p.id), [b.id, a.id]);
      await store.deletePlate(a.id);
      await _until(() => seen.last.length == 1);
      expect(seen.last.single.id, b.id);
    });

    test('close is idempotent', () async {
      await store.close();
      await store.close();
    });
  });
}

/// Runs the `CoachNoteStore` contract against [create].
void coachNoteStoreContract(
  String name,
  Future<CoachNoteStoreHarness> Function() create,
) {
  group('CoachNoteStore contract: $name', () {
    late CoachNoteStoreHarness h;
    late CoachNoteStore store;

    setUp(() async {
      h = await create();
      store = h.store;
    });
    tearDown(() async {
      await h.dispose?.call();
    });

    CoachNote note(int plate, String key, {CoachAnchor? anchor}) => CoachNote(
      id: 0,
      plateLogId: plate,
      anchor: anchor ?? CoachAnchor.postResolve,
      questionKey: key,
      text: 'text for $key',
      generatedAt: DateTime.utc(2026, 8, 16, 12, 0, 0, 5),
    );

    test(
      'append assigns increasing positive ids and round-trips fields',
      () async {
        final a = await store.append(
          note(7, 'k1', anchor: CoachAnchor.openPlate),
        );
        final b = await store.append(note(7, 'k2'));
        expect(a, isA<CoachNoteAppended>());
        final na = (a as CoachNoteAppended).note;
        final nb = (b as CoachNoteAppended).note;
        expect(na.id, isPositive);
        expect(nb.id, greaterThan(na.id));
        final read = await store.forPlate(7);
        expect(read.map((n) => n.id), [
          na.id,
          nb.id,
        ], reason: 'insertion order');
        expect(read.first.anchor, CoachAnchor.openPlate);
        expect(read.first.questionKey, 'k1');
        expect(read.first.text, 'text for k1');
        expect(read.first.plateLogId, 7);
        expect(read.first.generatedAt, DateTime.utc(2026, 8, 16, 12, 0, 0, 5));
        expect(read.first.generatedAt.isUtc, isTrue);
      },
    );

    test(
      'forPlate is empty for an unknown plate and isolates plates',
      () async {
        await store.append(note(1, 'a'));
        await store.append(note(2, 'b'));
        expect(await store.forPlate(404), isEmpty);
        expect((await store.forPlate(1)).single.questionKey, 'a');
        expect((await store.forPlate(2)).single.questionKey, 'b');
      },
    );

    test('watchForPlate emits current notes then the appended one', () async {
      final seen = <List<CoachNote>>[];
      final sub = store.watchForPlate(3).listen(seen.add);
      addTearDown(sub.cancel);
      await _until(() => seen.isNotEmpty);
      expect(seen.first, isEmpty);
      await store.append(note(3, 'late'));
      await _until(() => seen.last.isNotEmpty);
      expect(seen.last.single.questionKey, 'late');
    });

    test('recordDismissal is idempotent and watched', () async {
      final seen = <Set<String>>[];
      final sub = store.watchDismissals().listen(seen.add);
      addTearDown(sub.cancel);
      await _until(() => seen.isNotEmpty);
      expect(seen.first, isEmpty);
      expect(await store.recordDismissal('k'), isA<CoachInteractionRecorded>());
      expect(await store.recordDismissal('k'), isA<CoachInteractionRecorded>());
      await _until(() => seen.last.contains('k'));
      expect(seen.last, {'k'});
    });

    test(
      'deleteForPlate removes that plate\'s notes and note dismissals only',
      () async {
        final a = (await store.append(note(5, 'a')) as CoachNoteAppended).note;
        final b = (await store.append(note(6, 'b')) as CoachNoteAppended).note;
        await store.recordInteraction(
          CoachInteractionLog(
            noteId: a.id,
            kind: CoachInteraction.dismiss,
            at: DateTime.utc(2026, 8, 16),
          ),
        );
        await store.recordDismissal(coachNoteDismissalKey(a.id));
        await store.recordDismissal(coachNoteDismissalKey(b.id));
        await store.recordDismissal('unrelated-key');

        expect(await store.deleteForPlate(5), isA<PlateDeleted>());

        expect(await store.forPlate(5), isEmpty);
        expect((await store.forPlate(6)).single.id, b.id);
        final seen = <Set<String>>[];
        final sub = store.watchDismissals().listen(seen.add);
        addTearDown(sub.cancel);
        await _until(() => seen.isNotEmpty);
        expect(seen.last, {coachNoteDismissalKey(b.id), 'unrelated-key'});
      },
    );

    test(
      'deleteForPlate is idempotent and an unknown plate succeeds',
      () async {
        await store.append(note(5, 'a'));
        expect(await store.deleteForPlate(5), isA<PlateDeleted>());
        expect(await store.deleteForPlate(5), isA<PlateDeleted>());
        expect(await store.deleteForPlate(404), isA<PlateDeleted>());
      },
    );

    test('recordInteraction returns a typed Recorded result', () async {
      final appended =
          (await store.append(note(1, 'a')) as CoachNoteAppended).note;
      final r = await store.recordInteraction(
        CoachInteractionLog(
          noteId: appended.id,
          kind: CoachInteraction.sure,
          at: DateTime.utc(2026, 8, 16),
        ),
      );
      expect(r, isA<CoachInteractionRecorded>());
    });
  });
}

Future<void> _until(bool Function() cond) async {
  final deadline = DateTime.now().add(const Duration(seconds: 5));
  while (!cond()) {
    if (DateTime.now().isAfter(deadline)) {
      throw TimeoutException('condition not met');
    }
    await Future<void>.delayed(const Duration(milliseconds: 5));
  }
}
