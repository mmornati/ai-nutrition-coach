// The sync queue entity (Story 4.3 / AD-6 / FR-10).
//
// A `SyncOp` is the unit the durable outbox enqueues and the
// `SyncAdapter` drains. The op carries the minimal envelope: an
// `opId` for idempotent enqueue, the back-ref to the plate log the
// op is about, the enqueue timestamp, the kind, and the
// JSON-serialized payload the transport reads.
//
// The payload is intentionally JSON-encoded as a string — drift's
// text columns handle the storage, and the transport never sees
// Dart types directly. The op is reconstructed at drain time by the
// adapter that knows the kind.
//
// The op is a value type: equality by `(opId, plateLogId, kind)`
// (the unique triple). `enqueuedAtUtc` is the moment the local
// commit landed in the queue; the durable remote ack is recorded by
// `markSynced` and is not part of the op.

class SyncOp {
  const SyncOp({
    required this.opId,
    required this.plateLogId,
    required this.enqueuedAtUtc,
    required this.kind,
    this.payload = const <String, Object?>{},
  });

  /// Stable id for idempotent enqueue. Generated once at commit
  /// time (Story 4.3 uses a UUID-shaped hex string) and reused by
  /// every retry.
  final String opId;

  /// Back-ref to the plate log this op is about. Validated at the
  /// use-case layer; no DB-level FK constraint.
  final int plateLogId;

  /// UTC moment the local commit landed in the queue. Stored as
  /// UTC ISO-8601 in the drift schema (Story 4.3 carries the
  /// convention over from Stories 1.2 / 2.3).
  final DateTime enqueuedAtUtc;

  /// The op kind. Drives drain-time behaviour (the adapter reads
  /// `kind` to decide what to send).
  final SyncOpKind kind;

  /// JSON-serialized transport payload. Empty for ops that need no
  /// payload (e.g. `plateLogDeleted` carries only the plate id).
  final Map<String, Object?> payload;

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! SyncOp) return false;
    return other.opId == opId &&
        other.plateLogId == plateLogId &&
        other.kind == kind;
  }

  @override
  int get hashCode => Object.hash(opId, plateLogId, kind);

  @override
  String toString() =>
      'SyncOp(opId: $opId, plateLogId: $plateLogId, '
      'enqueuedAtUtc: $enqueuedAtUtc, kind: $kind)';
}

/// The op kind. Drives drain-time behaviour. The string values
/// match `SyncOpKind.name` (Story 4.3 carries the existing table
/// convention: enum.name lives in the drift text column).
enum SyncOpKind {
  /// A new plate log was committed locally and is awaiting remote
  /// acknowledgment. v1 drain: the no-op `LocalOnlySyncAdapter`
  /// marks it `synced` immediately; a real relay (OQ-1) POSTs the
  /// plate envelope.
  plateLogCreated,

  /// A plate log was updated locally (Story 4.3 v1-minimal — the
  /// outbox carries the op; the relay decides what to do at drain
  /// time). Reserved for a future Story that wires plate edits.
  plateLogUpdated,

  /// A plate log was deleted locally. The relay decides what to do
  /// at drain time; v1 carries the op but no UI surface deletes
  /// plates yet.
  plateLogDeleted,
}
