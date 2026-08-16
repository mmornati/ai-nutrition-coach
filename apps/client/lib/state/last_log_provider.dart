// Timestamp of the most recent successful `RecordPlate` commit.
//
// `null` until the user logs their first plate. Once a plate commits,
// the calling screen writes `DateTime.now()` into this provider. The
// Day Board reads it to gate the quiet `+ log another plate` link
// above the plate stack (UX-DR7 / UX-DR10 / Story 1.6).
//
// The provider is read-only tracking on the consumer side — Riverpod
// never mutates domain state, only mirrors the write that already
// happened through `recordPlateProvider`. The convergent write path
// stays single-source (AD-3): every mutation still flows through
// `RecordPlate`, this provider just remembers when the last one
// happened.
//
// Riverpod 3.x puts `StateProvider` in the `legacy.dart` export; the
// shape is fine here — the timestamp is a tiny ephemeral UI hint, not
// domain state, and rewriting it as a `NotifierProvider` for v1 would
// add ceremony without buying anything. Epic 2's coach-note flow will
// lean on `NotifierProvider` for actual domain state.

import 'package:flutter_riverpod/legacy.dart';

/// Wall-clock timestamp of the most recent successful `RecordPlate`
/// commit. `null` until the user logs their first plate. Consumers
/// (e.g. the Day Board's quick-repeat affordance) read this and
/// decide whether the link is currently within its visibility window.
final lastLogProvider = StateProvider<DateTime?>((_) => null);
