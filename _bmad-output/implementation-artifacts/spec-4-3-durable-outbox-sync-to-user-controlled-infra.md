---
title: 'Story 4.3 — Durable outbox sync to user-controlled infrastructure'
type: 'feature'
created: '2026-08-16'
status: 'review'
review_loop_iteration: 0
baseline_commit: '0a47a15'
context:
  - _bmad-output/implementation-artifacts/epic-4-context.md
  - _bmad-output/specs/spec-openplate/conventions.md
  - _bmad-output/specs/spec-openplate/stack.md
  - _bmad-output/planning-artifacts/architecture/architecture-openplate-2026-08-13/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/spec-1-2-record-plate-local-encrypted-store.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** FR-10 promises a self-hosting user that \"my plate logs sync only to infrastructure I control, without ever dropping or duplicating a log.\" The PRD's OQ-1 leaves the concrete transport path (self-host relay vs manual export/import) as a build-time architecture decision — but the v1 surface must still implement the **durable outbox** and the **status chip lifecycle** (`· local` / `· pending` / `· synced`) so a log flips to `synced` only after durable remote acknowledgment (AD-6 / UX-DR6). Without this seam, the chip is decoration; with this seam, the transport adapter slots in behind the same port shape (OQ-1) without changing the core.

**Approach:** Add a pure-Dart `SyncQueue` port in `packages/domain_core` (a durable outbox) and a `SyncAdapter` port (a transport that drains the queue). The `RecordPlate` use-case (Story 1.2) gains an `enqueue` step after the in-store commit — never before, never in the same transaction (AD-3: the local commit lands first; the enqueue is a second write, separate). The status chip widget (carry-over) reads the queue state and flips `local` → `pending` → `synced` reactively from the queue stream. The transport is a build-time choice behind `SyncAdapter` (OQ-1). v1 ships the port + the durable outbox + the chip lifecycle + a no-op `LocalOnlySyncAdapter` (logs are written to the local outbox; the transport marks them synced when the local store confirms the round-trip — no third party, no OpenPlate-owned server).

## Boundaries & Constraints

**Always:**
- AD-1: `SyncQueue`, `SyncAdapter`, `SyncOp`, `SyncQueueState`, and the `EnqueueResult` / `DrainResult` typed variants live in `packages/domain_core` — no Flutter / drift / dio / sqlite3 imports.
- AD-3: writes are local-first. The local commit lands first; the enqueue is a separate write against the same drift store. The store's `RecordPlateSuccess` is the trigger for the enqueue. The UI never reflects a log before the local commit.
- AD-6: a log flips to `synced` only after durable remote acknowledgment. Connectivity loss retries silently on reconnection. No drops, no duplicates (the durable outbox keys on the local autoincrement id + the queue's UUID + the transport's idempotency token).
- FR-10 / AD-6: no third-party sync. The transport is user-controlled infrastructure only — never an OpenPlate-owned server. v1 ships a `LocalOnlySyncAdapter` that satisfies the seam (it marks logs synced when the local outbox round-trip is durable) so the chip lifecycle + the no-third-party invariant land together.
- UX-DR6: status chips derive from queue state, not from a UI counter. The flip is a CSS-only opacity transition — never a spinner.
- AD-7: chip copy + the sync-status lines live in the localization key store. No string interpolation in widgets; named NDP reviewer signs off.
- FR-12: no telemetry on the sync path. No \"X plates pending\" network call. The queue is local-first; the transport is a build-time choice.
- FR-13: no biometric identification in the sync path. The transport never ties a plate to a fingerprint.

**Ask First:**
- Whether the queue row stores the plate snapshot in full or references the plate id — the spec ships the reference model (the queue holds the plate id + the queued timestamp + the transport envelope; the plate is read from the store at drain time). This keeps the queue small + idempotent.
- Whether the v1 transport is the no-op `LocalOnlySyncAdapter` or a real relay — the spec ships the no-op adapter; the relay is a v1.1 follow-up (OQ-1).

**Never:**
- No third-party sync provider (no Dropbox / no iCloud / no Google Drive / no OpenPlate-owned server). The transport is user-controlled.
- No \"sync now\" button that opens a network connection without the user being on a self-hosted config. The chip flips from queue state; there is no manual sync affordance in v1.
- No spinner, no countdown, no celebration on the chip flip.
- No telemetry on the queue or the transport.
- No new network dep in `domain_core`; the adapter lives in `integrations`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_LOCAL_COMMIT_THEN_ENQUEUE | `RecordPlate` succeeds | The plate row lands in the store; the queue enqueue is a separate write; the chip flips `· local` → `· pending`; the no-op transport marks it `· synced` (the local outbox round-trip is durable) | N/A |
| HAPPY_PATH_WATCH_QUEUE | UI subscribes to `watchSyncQueueState()` | The stream emits the current queue state; a log's chip state derives from the queue row | typed |
| CONNECTIVITY_LOSS | The user is offline | The queue grows; chips stay `· pending`; the transport retries silently on reconnection (no-op adapter marks `synced` immediately because it never opens a socket) | N/A |
| DUPLICATE_ENQUEUE | A retry causes a second enqueue for the same plate | The queue keys on `(plateId, opId)`; the second enqueue is a no-op (`EnqueueResult.AlreadyEnqueued`); the chip stays `· pending` until the first drains | typed |
| TRANSPORT_FAILURE | The transport returns `DrainResult.Failed(retryable: true)` | The row stays `· pending`; the adapter retries with backoff (no user-visible countdown) | typed |
| THIRD_PARTY_GUARD | The transport | Never resolves a third-party hostname; never opens a socket to a non-user-controlled endpoint; the only allowed endpoint is the user's self-host relay (configured at build time) | grep test |
| EMPTY_HISTORY_NO_OPS | The queue is empty | `watchSyncQueueState()` emits `SyncQueueState.empty`; the chip surface renders nothing | N/A |
| RELAY_UNCONFIGURED | No self-host relay is configured (v1 default) | The no-op transport drains the queue; no network call is opened; chips flip `· pending` → `· synced` on the local outbox | N/A |
| OQ1_ADAPTER_SLOT | A future v1.1 build wires a real relay | The `SyncAdapter` is replaced; the `SyncQueue` port and the chip lifecycle are unchanged | compile-time |
| AD6_HONEST_CHIP | A log is `· local` until the durable local commit; `· pending` until the transport acknowledges | The chip never flips to `· synced` before the durable local commit + the transport ack | unit test |
| AD3_INVARIANT | The queue write is a separate transaction from the plate write | If the queue write fails, the plate is still durable in the store; the chip stays `· local`; a future enqueue retry picks it up | typed |

</frozen-after-approval>

## Code Map

- `packages/domain_core/lib/src/ports/sync_queue.dart` -- new; `abstract interface class SyncQueue { Future<EnqueueResult> enqueue(SyncOp op); Stream<SyncQueueState> watch(); Future<void> markSynced(String opId); Future<void> markFailed(String opId, {required String reason}); }`
- `packages/domain_core/lib/src/ports/sync_adapter.dart` -- new; `abstract interface class SyncAdapter { Future<DrainResult> drain(SyncOp op); }` (the OQ-1 seam)
- `packages/domain_core/lib/src/entities/sync_op.dart` -- new; `SyncOp({required String opId, required int plateId, required DateTime enqueuedAtUtc, required SyncOpKind kind, Map<String, Object?> payload})`
- `packages/domain_core/lib/src/value_types/sync_op_kind.dart` -- new; `enum SyncOpKind { plateLogCreated, plateLogUpdated, plateLogDeleted }`
- `packages/domain_core/lib/src/entities/sync_queue_state.dart` -- new; `SyncQueueState({required int pending, required int synced, required int failed})` -- the chip derives from this
- `packages/domain_core/lib/src/results/sync_failure.dart` -- new; `sealed class EnqueueResult = Enqueued | AlreadyEnqueued | EnqueueFailed; sealed class DrainResult = Drained | DrainFailedRetryable | DrainFailedPermanent`
- `packages/domain_core/lib/src/use_cases/record_sync_op.dart` -- new; pure-Dart use-case that the `RecordPlate` use-case invokes after a successful local commit. Enforces the AD-3 invariant (local-first, enqueue-second).
- `packages/integrations/lib/src/sync/drift_sync_queue.dart` -- new; `DriftSyncQueue` -- the durable outbox, persists to the same drift store the plate-log writes use.
- `packages/integrations/lib/src/sync/local_only_sync_adapter.dart` -- new; `LocalOnlySyncAdapter` -- v1 default; satisfies the OQ-1 seam; the only transport in v1; no third-party endpoint; no network call.
- `packages/integrations/lib/src/sync/sync_queue_table.dart` -- new; the drift table for the queue (id, opId, plateId, enqueuedAtUtc, kind, payload, status).
- `packages/integrations/lib/src/sync/sync_queue_table.g.dart` -- generated; the drift schema's compiled output.
- `packages/integrations/lib/src/store/app_database.dart` -- extend; add the sync_queue table.
- `packages/integrations/lib/src/store/app_database.g.dart` -- regenerated.
- `packages/integrations/lib/integrations.dart` -- barrel update.
- `packages/integrations/test/drift_sync_queue_test.dart` -- new; pins enqueue + watch + markSynced + the duplicate-enqueue no-op.
- `packages/integrations/test/local_only_sync_adapter_test.dart` -- new; pins the no-op drain + the no-network-call guarantee.
- `packages/integrations/test/record_sync_op_test.dart` -- new; pins the AD-3 invariant — the local commit lands first, the enqueue is a second write, the chip surface never reflects a log before the local commit.
- `apps/client/lib/state/sync_queue_provider.dart` -- new; `syncQueueProvider` + `syncAdapterProvider` + `syncQueueStateProvider` (a `StreamProvider<SyncQueueState>` that the chip subscribes to).
- `apps/client/lib/state/record_plate_provider.dart` -- extend; after a successful `RecordPlate` commit, invoke `RecordSyncOp` to enqueue the op.
- `apps/client/lib/widgets/status_chip.dart` -- extend; the chip reads from `syncQueueStateProvider`; flips `local` / `pending` / `synced` from queue state.
- `apps/client/test/state/sync_queue_provider_test.dart` -- new; pins the provider graph wiring.
- `packages/domain_core/test/domain_core_test.dart` -- AD-1 grep test remains green; the new `sync_*` files in `domain_core` introduce no forbidden imports.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/domain_core/lib/src/ports/sync_queue.dart` -- `SyncQueue` port.
- [ ] `packages/domain_core/lib/src/ports/sync_adapter.dart` -- `SyncAdapter` port (OQ-1 seam).
- [ ] `packages/domain_core/lib/src/entities/sync_op.dart` -- `SyncOp` entity.
- [ ] `packages/domain_core/lib/src/value_types/sync_op_kind.dart` -- `SyncOpKind` enum.
- [ ] `packages/domain_core/lib/src/entities/sync_queue_state.dart` -- `SyncQueueState` entity.
- [ ] `packages/domain_core/lib/src/results/sync_failure.dart` -- sealed `EnqueueResult` + sealed `DrainResult`.
- [ ] `packages/domain_core/lib/src/use_cases/record_sync_op.dart` -- `RecordSyncOp` use-case (AD-3 invariant).
- [ ] `packages/domain_core/lib/domain_core.dart` -- barrel export for the new symbols.
- [ ] `packages/integrations/lib/src/sync/sync_queue_table.dart` -- drift table.
- [ ] `packages/integrations/lib/src/sync/sync_queue_table.g.dart` -- generated.
- [ ] `packages/integrations/lib/src/store/app_database.dart` -- extend with the queue table.
- [ ] `packages/integrations/lib/src/store/app_database.g.dart` -- regenerate.
- [ ] `packages/integrations/lib/src/sync/drift_sync_queue.dart` -- `DriftSyncQueue`.
- [ ] `packages/integrations/lib/src/sync/local_only_sync_adapter.dart` -- `LocalOnlySyncAdapter`.
- [ ] `packages/integrations/lib/integrations.dart` -- barrel update.
- [ ] `packages/integrations/test/drift_sync_queue_test.dart` -- enqueue + watch + markSynced + duplicate no-op.
- [ ] `packages/integrations/test/local_only_sync_adapter_test.dart` -- no-op drain + no-network guarantee.
- [ ] `packages/integrations/test/record_sync_op_test.dart` -- AD-3 invariant.
- [ ] `apps/client/lib/state/sync_queue_provider.dart` -- provider graph wiring.
- [ ] `apps/client/lib/state/record_plate_provider.dart` -- extend to invoke `RecordSyncOp`.
- [ ] `apps/client/lib/widgets/status_chip.dart` -- extend to read from `syncQueueStateProvider`.
- [ ] `apps/client/test/state/sync_queue_provider_test.dart` -- provider graph wiring.
- [ ] `packages/domain_core/test/domain_core_test.dart` -- AD-1 grep test remains green.

**Acceptance Criteria:**
- Given the durable outbox, when a `RecordPlate` commit lands, then the local store receives the row first; the queue is a separate write; the chip flips `· local` → `· pending`; the no-op transport marks it `· synced` (AD-3 / AD-6 / FR-10).
- Given the queue watch stream, when the UI subscribes, then the chip surface derives from queue state — never a UI counter; the flip is a CSS-only opacity transition; no spinner, no countdown (UX-DR6 / AD-6).
- Given the no-third-party invariant, when the transport runs, then no third-party hostname is resolved and no socket is opened; the only transport in v1 is the no-op `LocalOnlySyncAdapter` (FR-10 / AD-6).
- Given the duplicate-enqueue edge case, when a retry causes a second enqueue for the same plate, then the queue keys on `(plateId, opId)`; the second enqueue is a no-op; no duplicate is written (FR-10 / NFR5).
- Given the connectivity-loss edge case, when the user is offline, then the queue grows; chips stay `· pending`; on reconnection the no-op adapter marks them `· synced` (no network call, no user-visible delay) (FR-10 / NFR5).
- Given the AD-3 invariant, when the queue write fails, then the plate is still durable in the store; the chip stays `· local`; a future retry picks it up (AD-3 / FR-10).
- Given the AD-1 grep test, when the test runs, then `packages/domain_core/lib/` is free of Flutter/SQLite/HTTP imports; the new `sync_*` files introduce no forbidden imports.

## Spec Change Log

## Verification

**Commands (Docker):**
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd packages/domain_core && dart test"` -- expected: AD-1 invariant holds.
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd packages/integrations && dart test"` -- expected: `drift_sync_queue_test` + `local_only_sync_adapter_test` + `record_sync_op_test` pass.
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "cd apps/client && flutter test test/state/sync_queue_provider_test.dart"` -- expected: provider graph wiring.
- `docker run --rm -v "$PWD":/work -w /work ghcr.io/cirruslabs/flutter:stable sh -c "flutter analyze"` -- expected: no new analyzer issues.

**Manual checks:**
- Confirm the chip flips `local` → `pending` → `synced` on a fresh `RecordPlate` commit.
- Confirm the queue table persists across app restarts (the chip recovers its state).
- Confirm the no-op transport opens zero sockets (grep test for `dio` / `http` / `WebSocket` in `local_only_sync_adapter.dart`).
- Confirm the `RecordSyncOp` use-case refuses to enqueue if the local commit did not land.

## Suggested Review Order

**Domain core (AD-6)**
- `SyncQueue` + `SyncAdapter` ports + the `SyncOp` / `SyncOpKind` / `SyncQueueState` entities.
  [`sync_queue.dart`](../../packages/domain_core/lib/src/ports/sync_queue.dart)
  [`sync_adapter.dart`](../../packages/domain_core/lib/src/ports/sync_adapter.dart)
  [`sync_op.dart`](../../packages/domain_core/lib/src/entities/sync_op.dart)
  [`sync_op_kind.dart`](../../packages/domain_core/lib/src/value_types/sync_op_kind.dart)
  [`sync_queue_state.dart`](../../packages/domain_core/lib/src/entities/sync_queue_state.dart)

**Use-case + typed results (AD-3)**
- `RecordSyncOp` use-case + the `EnqueueResult` / `DrainResult` sealed hierarchies.
  [`record_sync_op.dart`](../../packages/domain_core/lib/src/use_cases/record_sync_op.dart)
  [`sync_failure.dart`](../../packages/domain_core/lib/src/results/sync_failure.dart)

**Adapter (durable outbox)**
- `DriftSyncQueue` + `LocalOnlySyncAdapter` + the drift table.
  [`drift_sync_queue.dart`](../../packages/integrations/lib/src/sync/drift_sync_queue.dart)
  [`local_only_sync_adapter.dart`](../../packages/integrations/lib/src/sync/local_only_sync_adapter.dart)
  [`sync_queue_table.dart`](../../packages/integrations/lib/src/sync/sync_queue_table.dart)

**UI + provider graph**
- The `SyncQueue` provider + the chip wiring.
  [`sync_queue_provider.dart`](../../apps/client/lib/state/sync_queue_provider.dart)
  [`status_chip.dart`](../../apps/client/lib/widgets/status_chip.dart)

---

## Dev Agent Record

### Implementation Plan

To be filled by the dev agent.

### Completion Notes

To be filled by the dev agent.

### Debug Log

To be filled by the dev agent.

### File List

To be filled by the dev agent.

### Change Log

To be filled by the dev agent.

---

## Senior Developer Review (AI)

(To be populated by the review subagent on completion.)

### Review Date

### Review Outcome

### Layer Results

### Action Items
