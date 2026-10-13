// The `LocalOnlySyncAdapter` — the v1 default transport
// (Story 4.3 / AD-6 / FR-10 / OQ-1).
//
// The transport is a build-time choice behind the `SyncAdapter` port. v1
// ships this adapter because there IS no transport: it opens no socket and
// sends nothing. It therefore never reports `Drained` (that would tell the
// queue — and through it the UI — that data reached a remote when it never
// left the device; security review F4). `hasTransport` is `false` and
// `drain` answers `DrainSkippedNoTransport`, which leaves the op `pending`.
// A future self-host relay (v1.1) drops in behind the same port without
// touching the queue, the chip surface, or the use-case.
//
// FR-12: no telemetry, no network call.

import 'package:domain_core/domain_core.dart';

class LocalOnlySyncAdapter implements SyncAdapter {
  const LocalOnlySyncAdapter();

  @override
  bool get hasTransport => false;

  @override
  Future<DrainResult> drain(SyncOp op) async => const DrainSkippedNoTransport();
}
