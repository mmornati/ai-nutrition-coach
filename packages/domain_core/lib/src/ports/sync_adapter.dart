// The `SyncAdapter` port — the transport seam (Story 4.3 / AD-6 /
// FR-10 / OQ-1).
//
// The transport is a build-time choice behind this port. v1 ships
// the no-op `LocalOnlySyncAdapter` — it satisfies the OQ-1 seam
// without opening a socket. A future self-host relay (v1.1)
// drops in behind the same port without touching the queue, the
// chip surface, or the use-case.
//
// The adapter's job is narrow: take a `SyncOp`, attempt to drain
// it over the transport, return a typed `DrainResult`. The adapter
// never persists state — the queue owns durability. The adapter
// never opens a third-party hostname — the only allowed endpoint
// is the user's self-host relay (configured at build time).

import '../entities/sync_op.dart';
import '../results/sync_failure.dart';

abstract interface class SyncAdapter {
  /// Attempt to drain the op durably. Returns `Drained` on success,
  /// `DrainFailedRetryable` on a retryable failure (network blip,
  /// 5xx), or `DrainFailedPermanent` on a permanent failure
  /// (schema mismatch, etc.).
  Future<DrainResult> drain(SyncOp op);
}
