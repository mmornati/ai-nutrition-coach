// The web store's create / unlock / lock / erase logic against REAL sqlite3mc
// encryption (Phase 2B / W1-W7). A temp file stands in for IndexedDB and an
// in-memory map for localStorage; "reloading the page" is building a new
// controller over the same file + storage. Only the three browser adapters
// (WebCrypto KDF, localStorage, the IndexedDB wasm backend) are not
// exercised here; ADR-0002 lists what that leaves to a real-browser check.

import 'dart:io';
import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';

import '_support/file_web_backend.dart';
import '_support/all_plates.dart';

const _good = 'correct horse battery staple';
const _wrong = 'wrong passphrase 12';
const _fast = WebKdfParams(iterations: 1000);

FoodEntryDraft _draft(String name) => FoodEntryDraft(
  databaseFood: DatabaseFood(
    sourceRef: 'manual:$name',
    displayName: name,
    source: SourceCatalog.manual,
  ),
  quantity: const QuantityRange(
    low: 1,
    high: 2,
    unit: 'piece',
    displayLabel: '~1–2 pieces',
  ),
);

void main() {
  late Directory dir;
  late File file;
  late InMemoryWebStoreStorage storage;
  late FileWebBackend backend;
  late DateTime now;
  late InMemoryWebStoreLock tabLock;
  final controllers = <WebStoreController>[];

  WebStoreController build({
    WebStoreStorage? overrideStorage,
    FileWebBackend? overrideBackend,
    PassphraseKdf kdf = const DartPbkdf2Kdf(),
    WebStoreLock? overrideLock,
    Duration hiddenLockAfter = kWebDefaultHiddenLockAfter,
    Duration idleTimeout = kWebDefaultIdleTimeout,
  }) {
    final c = WebStoreController(
      storage: overrideStorage ?? storage,
      backend: overrideBackend ?? backend,
      kdf: kdf,
      lock: overrideLock ?? tabLock,
      normalizePassphrase: _nfc,
      hiddenLockAfter: hiddenLockAfter,
      idleTimeout: idleTimeout,
      kdfParams: _fast,
      minIterations: 1000,
      clock: () => now,
    );
    controllers.add(c);
    return c;
  }

  WebStoreMeta metaOf() =>
      (readWebStoreMeta(storage, minIterations: 1000) as WebStoreMetaPresent)
          .meta;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('ai_nutrition_coach_web_store_');
    file = File('${dir.path}/ai_nutrition_coach.db');
    storage = InMemoryWebStoreStorage();
    backend = FileWebBackend(file);
    now = DateTime.utc(2026, 10, 1, 12);
    tabLock = InMemoryWebStoreLock();
  });

  tearDown(() async {
    for (final c in controllers) {
      await c.lock();
    }
    controllers.clear();
    if (dir.existsSync()) dir.deleteSync(recursive: true);
  });

  Future<WebStoreController> created() async {
    final c = build();
    await c.initialize();
    expect(await c.createStore(_good), isA<WebUnlocked>());
    return c;
  }

  Future<WebStoreController> reloaded() async {
    final c = build();
    await c.initialize();
    return c;
  }

  group('first run', () {
    test('no header -> needsPassphraseCreation, nothing opened', () async {
      final c = build();
      expect(c.status, WebStoreStatus.checking);
      await c.initialize();
      expect(c.status, WebStoreStatus.needsPassphraseCreation);
      expect(c.database, isNull);
      expect(c.sessionKey.isOpen, isFalse);
      expect(backend.openCalls, 0);
    });

    test('a weak passphrase is rejected without touching storage', () async {
      final c = await reloaded();
      final short = await c.createStore('short');
      expect(
        (short as WebPassphraseRejected).issue,
        WebPassphraseIssue.tooShort,
      );
      final repetitive = await c.createStore('aaaaaaaaaaaaaaaa');
      expect(
        (repetitive as WebPassphraseRejected).issue,
        WebPassphraseIssue.tooRepetitive,
      );
      expect(storage.values, isEmpty);
      expect(backend.openCalls, 0);
      expect(c.status, WebStoreStatus.needsPassphraseCreation);
    });

    test('validateNewPassphrase floor', () {
      expect(validateNewPassphrase('123456789'), WebPassphraseIssue.tooShort);
      expect(
        validateNewPassphrase('abababababab'),
        WebPassphraseIssue.tooRepetitive,
      );
      expect(validateNewPassphrase('abcdefghij'), isNull);
      // Counted in characters, not UTF-16 units.
      expect(validateNewPassphrase('🍎🍐🍊🍋🍌🍉🍇🍓🫐🍒'), isNull);
    });

    test('creating persists a random per-store salt + KDF params + version, '
        'only after the keyed database opened', () async {
      final c = await created();
      expect(c.status, WebStoreStatus.unlocked);
      expect(c.sessionKey.isOpen, isTrue);
      final meta = metaOf();
      expect(meta.salt, hasLength(kWebStoreSaltBytes));
      expect(meta.kdf, _fast);
      expect(meta.version, kWebStoreFormatVersion);
    });

    test(
      'two stores get different salts and therefore different keys',
      () async {
        final a = await created();
        final saltA = metaOf().salt;
        final keyA = Uint8List.fromList(a.sessionKey.derivedKey!);
        await a.eraseStore();

        final b = await reloaded();
        expect(await b.createStore(_good), isA<WebUnlocked>());
        expect(metaOf().salt, isNot(saltA));
        expect(b.sessionKey.derivedKey, isNot(keyA));
      },
    );

    test(
      'a failed creation leaves no header (next run starts clean)',
      () async {
        backend.failOpen = true;
        final c = await reloaded();
        expect(await c.createStore(_good), isA<WebStoreUnavailable>());
        expect(storage.values, isEmpty);
        expect(c.status, WebStoreStatus.needsPassphraseCreation);
        expect(c.sessionKey.isOpen, isFalse);
      },
    );

    test('data present but header missing -> needsReset, never a silent '
        'wipe', () async {
      final first = await created();
      await first.lock();
      storage.values.clear();
      File('${file.path}.header').deleteSync(); // both header copies gone
      final c = await reloaded();
      expect(c.status, WebStoreStatus.needsReset);
      expect(file.existsSync(), isTrue);
      expect(await c.createStore(_good), isA<WebStoreUnavailable>());
      expect(file.existsSync(), isTrue);
    });

    test('a header lost from localStorage is recovered from the IndexedDB '
        'copy and the store still unlocks', () async {
      final first = await created();
      await WasmEncryptedStore(
        source: first,
      ).recordPlate(entries: [_draft('Kept')]);
      await first.lock();
      storage.values.remove(kWebStoreMetaKey);
      final c = await reloaded();
      expect(c.status, WebStoreStatus.locked);
      expect(storage.values.containsKey(kWebStoreMetaKey), isTrue);
      expect(await c.unlock(_good), isA<WebUnlocked>());
      final plates = await WasmEncryptedStore(source: c).watchAll().first;
      expect(plates.single.entries.single.databaseFood.displayName, 'Kept');
    });

    test('a failed creation cleans up what it left behind', () async {
      backend.failOpen = true;
      final c = await reloaded();
      await c.createStore(_good);
      expect(backend.eraseCalls, 1);
      expect(tabLock.isHeld, isFalse);
    });
  });

  group('encryption and persistence', () {
    test('the file on disk is not a plaintext SQLite database', () async {
      final c = await created();
      final store = WasmEncryptedStore(source: c);
      await store.recordPlate(entries: [_draft('Apple')]);
      await c.lock();
      final bytes = file.readAsBytesSync();
      expect(
        String.fromCharCodes(bytes.sublist(0, 16)),
        isNot('SQLite format 3\u0000'),
      );
      final all = String.fromCharCodes(bytes);
      expect(all, isNot(contains('Apple')));
      expect(all, isNot(contains(_good)));
    });

    test('data persists across a simulated reload and the right passphrase '
        'opens it', () async {
      final c1 = await created();
      final r = await WasmEncryptedStore(
        source: c1,
      ).recordPlate(entries: [_draft('Apple')]);
      expect(r, isA<RecordPlateSuccess>());
      await c1.lock();

      // "Reload": a brand-new controller + stores over the same storage.
      final c2 = await reloaded();
      expect(c2.status, WebStoreStatus.locked);
      expect(c2.database, isNull);
      expect(await c2.unlock(_good), isA<WebUnlocked>());
      final plates = await WasmEncryptedStore(source: c2).watchAll().first;
      expect(plates, hasLength(1));
      expect(plates.single.entries.single.databaseFood.displayName, 'Apple');
    });

    test(
      'coach notes live in the same encrypted database and persist',
      () async {
        final c1 = await created();
        final notes1 = WasmCoachNoteStore(source: c1);
        final plate =
            await WasmEncryptedStore(
                  source: c1,
                ).recordPlate(entries: [_draft('Pear')])
                as RecordPlateSuccess;
        final note = CoachNote(
          id: 0,
          plateLogId: plate.plateLog.id,
          anchor: CoachAnchor.postResolve,
          questionKey: 'post.resolve.vegLight',
          text: 'A handful of greens would round this out.',
          generatedAt: DateTime.utc(2026, 10, 1),
        );
        expect(await notes1.append(note), isA<CoachNoteAppended>());
        await c1.lock();

        // Locked: typed failure, empty read.
        final locked = await notes1.append(note);
        expect(
          (locked as CoachNoteAppendFailure).cause.encryptedStoreError,
          isA<WebSessionKeyFailure>(),
        );
        expect(await notes1.forPlate(plate.plateLog.id), isEmpty);

        final c2 = await reloaded();
        await c2.unlock(_good);
        final reread = await WasmCoachNoteStore(
          source: c2,
        ).forPlate(plate.plateLog.id);
        expect(reread.single.text, 'A handful of greens would round this out.');
      },
    );
  });

  group('wrong passphrase', () {
    test('can never open the store, retains no key, writes nothing', () async {
      final c1 = await created();
      await WasmEncryptedStore(source: c1).recordPlate(entries: [_draft('A')]);
      await c1.lock();
      final before = file.readAsBytesSync();

      final c2 = await reloaded();
      final outcome = await c2.unlock(_wrong);
      expect(outcome, isA<WebWrongPassphrase>());
      expect(c2.status, WebStoreStatus.locked);
      expect(c2.database, isNull);
      expect(c2.sessionKey.isOpen, isFalse);
      expect(c2.sessionKey.derivedKey, isNull);
      expect(file.readAsBytesSync(), before);

      // The store is still fully readable with the right one.
      expect(await c2.unlock(_good), isA<WebUnlocked>());
    });

    test('an empty passphrase is just a wrong passphrase', () async {
      final c1 = await created();
      await c1.lock();
      final c2 = await reloaded();
      expect(await c2.unlock(''), isA<WebWrongPassphrase>());
      expect(c2.sessionKey.isOpen, isFalse);
    });

    test('a returning user cannot "create" over an existing store', () async {
      final c1 = await created();
      await c1.lock();
      final c2 = await reloaded();
      expect(await c2.createStore(_good), isA<WebStoreUnavailable>());
      expect(c2.status, WebStoreStatus.locked);
    });
  });

  group('lock', () {
    test(
      'zeroes the key buffer, closes the database, flips status first',
      () async {
        final c = await created();
        final key = c.sessionKey.derivedKey!;
        expect(key.any((b) => b != 0), isTrue);
        final store = WasmEncryptedStore(source: c);
        final statuses = <WebStoreStatus>[];
        c.addListener(() => statuses.add(c.status));

        await c.lock();

        expect(key.every((b) => b == 0), isTrue, reason: 'buffer zeroed');
        expect(c.sessionKey.isOpen, isFalse);
        expect(c.database, isNull);
        expect(c.status, WebStoreStatus.locked);
        expect(statuses, [WebStoreStatus.locked]);
        final r = await store.recordPlate(entries: [_draft('x')]);
        expect(
          (r as StoreFailure).encryptedStoreError,
          isA<WebSessionKeyFailure>(),
        );
        expect(await store.watchAll().toList(), isEmpty);
        // Idempotent.
        await c.lock();
        expect(statuses, [WebStoreStatus.locked]);
      },
    );

    test(
      'a failed attempt zeroes the candidate key and passphrase bytes',
      () async {
        final c1 = await created();
        await c1.lock();
        final spy = _SpyKdf();
        final c2 = build(kdf: spy);
        await c2.initialize();
        await c2.unlock(_wrong);
        expect(spy.keys, hasLength(1));
        expect(spy.keys.single.every((b) => b == 0), isTrue);
        expect(spy.passphrases.single.every((b) => b == 0), isTrue);
      },
    );

    test('WebSessionKey is observable and its toString is redacted', () async {
      final c = await created();
      var notifications = 0;
      c.sessionKey.addListener(() => notifications++);
      expect(c.sessionKey.toString(), 'WebSessionKey(isOpen: true)');
      await c.lock();
      expect(notifications, 1);
      expect(c.sessionKey.toString(), 'WebSessionKey(isOpen: false)');
    });

    test(
      'unlock/lock notify the controller (what the gate listens to)',
      () async {
        final c1 = await created();
        await c1.lock();
        final c = await reloaded();
        final seen = <WebStoreStatus>[];
        c.addListener(() => seen.add(c.status));
        await c.unlock(_good);
        await c.lock();
        expect(seen, [WebStoreStatus.unlocked, WebStoreStatus.locked]);
      },
    );
  });

  group('auto-lock', () {
    test('idle timeout locks; touch() pushes the deadline out', () async {
      final c = build(idleTimeout: const Duration(milliseconds: 250));
      await c.initialize();
      await c.createStore(_good);
      await Future<void>.delayed(const Duration(milliseconds: 150));
      now = now.add(const Duration(seconds: 5));
      c.touch();
      await Future<void>.delayed(const Duration(milliseconds: 150));
      expect(c.isUnlocked, isTrue, reason: 'touch re-armed the timer');
      await Future<void>.delayed(const Duration(milliseconds: 300));
      expect(c.status, WebStoreStatus.locked);
      expect(c.sessionKey.isOpen, isFalse);
    });

    test(
      'hidden longer than the limit locks on return; shorter does not',
      () async {
        final c = await created();
        c.onHidden();
        now = now.add(const Duration(minutes: 1));
        c.onVisible();
        expect(c.isUnlocked, isTrue);

        c.onHidden();
        now = now.add(kWebDefaultHiddenLockAfter);
        c.onVisible();
        await Future<void>.delayed(Duration.zero);
        expect(c.status, WebStoreStatus.locked);
      },
    );

    test('idle deadline passed while timers were throttled -> lock on '
        'visible', () async {
      final c = await created();
      now = now.add(kWebDefaultIdleTimeout + const Duration(seconds: 1));
      c.onVisible();
      await Future<void>.delayed(Duration.zero);
      expect(c.status, WebStoreStatus.locked);
    });

    test('idle minutes are clamped to the offered choices', () async {
      final c = await created();
      c.setIdleTimeout(const Duration(minutes: 17));
      expect(c.idleTimeout, const Duration(minutes: 15));
      c.setIdleTimeout(const Duration(minutes: 500));
      expect(c.idleTimeout, const Duration(minutes: 60));
      storage.write(kWebLockIdleMinutesKey, '1');
      final c2 = await reloaded();
      expect(c2.idleTimeout, const Duration(minutes: 5));
    });

    test(
      'a hidden page locks by TIMER, without ever becoming visible',
      () async {
        final c = build(hiddenLockAfter: const Duration(milliseconds: 80));
        await c.initialize();
        await c.createStore(_good);
        c.onHidden();
        expect(c.isUnlocked, isTrue);
        await Future<void>.delayed(const Duration(milliseconds: 200));
        expect(c.status, WebStoreStatus.locked);
        expect(c.sessionKey.isOpen, isFalse);
      },
    );

    test('becoming visible in time cancels the hidden timer', () async {
      final c = build(hiddenLockAfter: const Duration(milliseconds: 80));
      await c.initialize();
      await c.createStore(_good);
      c.onHidden();
      c.onVisible();
      await Future<void>.delayed(const Duration(milliseconds: 200));
      expect(c.isUnlocked, isTrue);
    });

    test('the idle setting persists and is reloaded', () async {
      final c = await created();
      expect(c.idleTimeout, kWebDefaultIdleTimeout);
      c.setIdleTimeout(const Duration(minutes: 30));
      final c2 = await reloaded();
      expect(c2.idleTimeout, const Duration(minutes: 30));
    });
  });

  group('throttling (UX friction only)', () {
    test('delay schedule', () {
      expect(webUnlockDelayFor(1), Duration.zero);
      expect(webUnlockDelayFor(2), Duration.zero);
      expect(webUnlockDelayFor(3), const Duration(seconds: 1));
      expect(webUnlockDelayFor(4), const Duration(seconds: 2));
      expect(webUnlockDelayFor(5), const Duration(seconds: 4));
      expect(webUnlockDelayFor(50), const Duration(seconds: 30));
    });

    test('repeated failures block attempts until the delay passes; success '
        'resets', () async {
      final c1 = await created();
      await c1.lock();
      final c = await reloaded();
      for (var i = 0; i < 2; i++) {
        expect(await c.unlock(_wrong), isA<WebWrongPassphrase>());
      }
      final third = await c.unlock(_wrong);
      expect(
        (third as WebWrongPassphrase).retryAfter,
        const Duration(seconds: 1),
      );
      final opensBefore = backend.openCalls;
      expect(await c.unlock(_good), isA<WebThrottled>());
      expect(backend.openCalls, opensBefore, reason: 'no attempt was made');

      now = now.add(const Duration(seconds: 2));
      expect(await c.unlock(_good), isA<WebUnlocked>());
      await c.lock();
      expect(await c.unlock(_wrong), isA<WebWrongPassphrase>());
      final again = await c.unlock(_wrong) as WebWrongPassphrase;
      expect(
        again.retryAfter,
        Duration.zero,
        reason: 'counter was reset by the successful unlock',
      );
    });
  });

  group('erase and start over', () {
    test('eraseStore deletes the database and the header; next start is a '
        'first run', () async {
      final c = await created();
      await WasmEncryptedStore(source: c).recordPlate(entries: [_draft('A')]);
      final statuses = <WebStoreStatus>[];
      c.addListener(() => statuses.add(c.status));
      await c.eraseStore();
      expect(statuses, [WebStoreStatus.erasing]);
      expect(file.existsSync(), isFalse);
      expect(storage.values.containsKey(kWebStoreMetaKey), isFalse);
      expect(c.sessionKey.isOpen, isFalse);

      final fresh = await reloaded();
      expect(fresh.status, WebStoreStatus.needsPassphraseCreation);
      expect(await fresh.createStore('a new passphrase 1'), isA<WebUnlocked>());
      final plates = await WasmEncryptedStore(source: fresh).watchAll().first;
      expect(plates, isEmpty);
    });

    test('works from the locked state (forgotten passphrase)', () async {
      final c1 = await created();
      await c1.lock();
      final c = await reloaded();
      expect(c.status, WebStoreStatus.locked);
      await c.eraseStore();
      expect(file.existsSync(), isFalse);
      await c.initialize();
      expect(c.status, WebStoreStatus.needsPassphraseCreation);
    });

    test(
      'a failed erase keeps the header, rethrows and re-derives status',
      () async {
        final c = await created();
        backend.failErase = true;
        await expectLater(c.eraseStore(), throwsStateError);
        expect(storage.values.containsKey(kWebStoreMetaKey), isTrue);
        expect(c.status, WebStoreStatus.locked);
      },
    );
  });

  group('untrustworthy storage', () {
    test('corrupt header -> needsReset', () async {
      storage.write(kWebStoreMetaKey, '{"v":1');
      final c = await reloaded();
      expect(c.status, WebStoreStatus.needsReset);
    });

    test(
      'storage that refuses reads is NOT mistaken for a first run',
      () async {
        final c = build(overrideStorage: ThrowingStorage());
        await c.initialize();
        expect(c.status, WebStoreStatus.needsReset);
      },
    );

    test('header present but database gone -> data missing, needsReset, no '
        'empty store is minted', () async {
      final c1 = await created();
      await c1.lock();
      file.deleteSync();
      final c = await reloaded();
      expect(await c.unlock(_good), isA<WebStoreDataMissing>());
      expect(c.status, WebStoreStatus.needsReset);
      expect(c.sessionKey.isOpen, isFalse);
    });

    test('a header below the iteration floor is refused', () async {
      final c1 = await created();
      await c1.lock();
      // Default floor (600k): the 1000-iteration header above is downgraded.
      final strict = WebStoreController(
        storage: storage,
        backend: backend,
        kdf: const DartPbkdf2Kdf(),
        lock: tabLock,
        normalizePassphrase: _nfc,
      );
      controllers.add(strict);
      await strict.initialize();
      expect(strict.status, WebStoreStatus.needsReset);
    });
  });

  group('two tabs (Web Lock)', () {
    test('a second tab cannot open or create while the first holds the '
        'lock, and a create never wipes the first tab\'s store', () async {
      // Tab B starts while no store exists yet.
      final tabB = await reloaded();
      expect(tabB.status, WebStoreStatus.needsPassphraseCreation);
      // Tab A creates and keeps the store open.
      final tabA = build();
      await tabA.initialize();
      expect(await tabA.createStore(_good), isA<WebUnlocked>());
      await WasmEncryptedStore(
        source: tabA,
      ).recordPlate(entries: [_draft('InTabA')]);
      final before = file.readAsBytesSync();

      expect(
        await tabB.createStore('tab b passphrase 1'),
        isA<WebStoreInUseElsewhere>(),
      );
      expect(file.readAsBytesSync(), before);
      expect(backend.eraseCalls, 0);

      // Tab A locks; B's stale create now finds the real header and refuses,
      // moving B to the unlock screen.
      await tabA.lock();
      expect(
        await tabB.createStore('tab b passphrase 1'),
        isA<WebStoreUnavailable>(),
      );
      expect(tabB.status, WebStoreStatus.locked);
      expect(file.readAsBytesSync(), before);

      // And A's data is intact for B with the right passphrase.
      expect(await tabB.unlock(_good), isA<WebUnlocked>());
      final plates = await WasmEncryptedStore(source: tabB).watchAll().first;
      expect(plates.single.entries.single.databaseFood.displayName, 'InTabA');
    });

    test('unlock in a second tab is refused while the first is open, then '
        'works after it locks (retry)', () async {
      final tabA = await created();
      final tabB = await reloaded();
      expect(await tabB.unlock(_good), isA<WebStoreInUseElsewhere>());
      expect(tabB.status, WebStoreStatus.locked);
      expect(tabB.sessionKey.isOpen, isFalse);
      await tabA.lock();
      expect(await tabB.unlock(_good), isA<WebUnlocked>());
      // And now A is the one that is locked out.
      await tabB.lock();
      expect(await tabA.unlock(_good), isA<WebUnlocked>());
    });

    test('erase is refused while another tab holds the store', () async {
      final tabA = await created();
      final tabB = await reloaded();
      await expectLater(tabB.eraseStore(), throwsStateError);
      expect(file.existsSync(), isTrue);
      expect(tabA.isUnlocked, isTrue);
    });

    test('a failed unlock releases the lock', () async {
      final c1 = await created();
      await c1.lock();
      final c = await reloaded();
      await c.unlock(_wrong);
      expect(tabLock.isHeld, isFalse);
    });
  });

  group('passphrase normalisation (NFC, UTF-8)', () {
    test('composed and decomposed forms open the same store', () async {
      final c1 = build();
      await c1.initialize();
      expect(await c1.createStore('caf\u00e9 au lait 123'), isA<WebUnlocked>());
      await c1.lock();
      final c2 = await reloaded();
      expect(await c2.unlock('cafe\u0301 au lait 123'), isA<WebUnlocked>());
    });
  });

  group('journal does not leak plaintext (L10)', () {
    test('a write transaction held open leaves no plaintext marker in the '
        '-journal file', () async {
      const marker = 'PlaintextMarkerQQ';
      final c = await created();
      final store = WasmEncryptedStore(source: c);
      await store.recordPlate(entries: [_draft(marker)]);
      final db = c.database!;
      var sawJournal = false;
      await db.transaction(() async {
        // Modify an existing page so SQLite journals its original content.
        await store.recordPlate(entries: [_draft('Other')]);
        final journal = File('${file.path}-journal');
        if (journal.existsSync()) {
          sawJournal = true;
          expect(
            String.fromCharCodes(journal.readAsBytesSync()),
            isNot(contains(marker)),
          );
        }
      });
      // Document the observation instead of silently passing: on this
      // backend the journal may be in memory only (then nothing is on disk).
      // ignore: avoid_print
      print('journal file observed on disk during txn: $sawJournal');
      expect(
        String.fromCharCodes(file.readAsBytesSync()),
        isNot(contains(marker)),
      );
    });
  });

  test('controller toString carries no secrets', () async {
    final c = await created();
    expect(c.toString(), 'WebStoreController(unlocked)');
  });
}

class _SpyKdf implements PassphraseKdf {
  final List<Uint8List> keys = [];
  final List<Uint8List> passphrases = [];

  @override
  Future<Uint8List> derive({
    required Uint8List passphrase,
    required Uint8List salt,
    required WebKdfParams params,
  }) async {
    passphrases.add(passphrase);
    final key = await const DartPbkdf2Kdf().derive(
      passphrase: passphrase,
      salt: salt,
      params: params,
    );
    keys.add(key);
    return key;
  }
}

/// Test normaliser: composes e + U+0301 (the only sequence the tests use).
String _nfc(String value) => value.replaceAll('e\u0301', '\u00e9');
