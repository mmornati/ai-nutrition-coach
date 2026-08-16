// The `LocalOnlySyncAdapter` — the v1 default transport
// (Story 4.3 / AD-6 / FR-10 / OQ-1).
//
// The transport is a build-time choice behind the `SyncAdapter`
// port. v1 ships this no-op adapter: it satisfies the OQ-1 seam
// without opening a socket. A future self-host relay (v1.1) drops
// in behind the same port without touching the queue, the chip
// surface, or the use-case.
//
// The adapter's contract: take a `SyncOp`, mark it `Drained` so
// the queue moves the row to `synced`. The queue then flips the
// chip surface from `pending` to `synced` via its `watchState`
// stream — a calm flip, never a spinner (UX-DR6 / AD-6).
//
// FR-12: no telemetry, no network call. The adapter's `drain`
// returns synchronously without touching the runtime.

import 'package:domain_core/domain_core.dart';

class LocalOnlySyncAdapter implements SyncAdapter {
  const LocalOnlySyncAdapter();

  @override
  Future<DrainResult> drain(SyncOp op) async {
    // No transport. The queue handles the durability; this adapter
    // only marks the op `Drained` so the chip flips. A real relay
    // (v1.1) returns `DrainFailedRetryable` on a network blip and
    // `Drained` on the durable ack.
    return const Drained();
  }
}
