// Shared fakes and fixtures for the domain tests. In-memory only: no I/O.
import {
  coachFound,
  coachInteractionRecorded,
  databaseFood,
  ENQUEUED,
  MARKED,
  NO_COACH_QUESTION,
  PLATE_DELETED,
  plateLog,
  recordPlateSuccess,
  storeFailure,
  type Coach,
  type CoachAnchor,
  type CoachInteractionLog,
  type CoachInteractionResult,
  type CoachNote,
  type CoachNoteAppendResult,
  type CoachNoteStore,
  type CoachQuestion,
  type CoachQuestionResult,
  type CompositionPattern,
  type DeletePlateResult,
  type EncryptedStore,
  type EnqueueResult,
  type FoodEntryDraft,
  type FoodGroup,
  type MarkResult,
  type PlateLog,
  type QuantityRange,
  type ReadPlatesResult,
  type RecordPlateResult,
  type SyncOp,
  type SyncQueue,
  type Unsubscribe,
} from '../src/index';

export const utc = (y: number, month = 1, d = 1, h = 0, mi = 0): number =>
  Date.UTC(y, month - 1, d, h, mi);

export const DAY_MS = 86_400_000;

export const q = (low = 1, high = 1, unit = 'serving'): QuantityRange => ({
  low,
  high,
  unit,
  displayLabel: `~${low}-${high} ${unit}`,
});

export function plateWith(
  id: number,
  entries: readonly { readonly group: FoodGroup; readonly name: string }[],
  loggedAtUtc: number = utc(2026, 8, 16, 12),
): PlateLog {
  return plateLog({
    id,
    loggedAtUtc,
    entries: entries.map((e, i) => ({
      id: i + 1,
      plateLogId: id,
      databaseFood: databaseFood({
        sourceRef: `manual:${e.name}`,
        displayName: e.name,
        source: 'manual',
        foodGroup: e.group,
      }),
      quantity: q(),
    })),
  });
}

export function draft(
  group: FoodGroup = 'protein',
  quantity: QuantityRange = q(1, 2, 'piece'),
): FoodEntryDraft {
  return {
    databaseFood: databaseFood({
      sourceRef: 'manual:egg',
      displayName: 'Egg',
      source: 'manual',
      foodGroup: group,
    }),
    quantity,
  };
}

const ANCHOR_TOKEN: Record<CoachAnchor, string> = {
  postResolve: 'post.resolve',
  openPlate: 'openPlate',
  depthFollowUp: 'depth.followUp',
};

export const question = (
  anchor: CoachAnchor,
  pattern: CompositionPattern,
  text = 'A handful of greens would round this plate out.',
): CoachQuestion => ({ key: `${ANCHOR_TOKEN[anchor]}.${pattern}`, text, anchor, pattern });

export function note(partial: Partial<CoachNote> = {}): CoachNote {
  return {
    id: 7,
    plateLogId: 7,
    anchor: 'postResolve',
    questionKey: 'post.resolve.vegLight',
    text: 'A handful of greens would round this plate out.',
    generatedAt: utc(2026, 8, 16),
    ...partial,
  };
}

/** A coach that records its calls and replays queued answers per anchor (default: none). */
export class FakeCoach implements Coach {
  readonly calls: { anchor: CoachAnchor; pattern: CompositionPattern }[] = [];
  private next: CoachQuestionResult = NO_COACH_QUESTION;
  private depthNext: CoachQuestionResult = NO_COACH_QUESTION;
  throwOnNextCall = false;
  throwOnDepthCall = false;

  emit(result: CoachQuestionResult): this {
    this.next = result;
    return this;
  }
  emitDepth(result: CoachQuestionResult): this {
    this.depthNext = result;
    return this;
  }

  questionFor(request: { anchor: CoachAnchor; pattern: CompositionPattern }): CoachQuestionResult {
    this.calls.push({ anchor: request.anchor, pattern: request.pattern });
    if (request.anchor === 'depthFollowUp') {
      if (this.throwOnDepthCall) {
        this.throwOnDepthCall = false;
        throw new Error('simulated coach port failure for depth');
      }
      const r = this.depthNext;
      this.depthNext = NO_COACH_QUESTION;
      return r;
    }
    if (this.throwOnNextCall) {
      this.throwOnNextCall = false;
      throw new Error('simulated coach port failure');
    }
    const r = this.next;
    this.next = NO_COACH_QUESTION;
    return r;
  }
}

export const found = (qn: CoachQuestion): CoachQuestionResult => coachFound(qn);

/** A coach that always answers the same question. */
export const constantCoach = (qn: CoachQuestion): Coach => ({ questionFor: () => coachFound(qn) });

/** In-memory coach-note store with forced-failure and throwing modes. */
export class FakeCoachNoteStore implements CoachNoteStore {
  readonly appended: CoachNote[] = [];
  readonly interactions: CoachInteractionLog[] = [];
  readonly dismissed = new Set<string>();
  readonly byPlate = new Map<number, CoachNote[]>();
  readonly deletedPlates: number[] = [];
  mode: 'ok' | 'fail' | 'throw' = 'ok';
  private nextAppendFailure = false;
  private nextInteractionFailure = false;
  private nextNoteId = 100;
  private nextInteractionId = 1;

  forceAppendFailure(): this {
    this.nextAppendFailure = true;
    return this;
  }
  forceInteractionFailure(): this {
    this.nextInteractionFailure = true;
    return this;
  }
  seed(n: CoachNote): this {
    this.byPlate.set(n.plateLogId, [...(this.byPlate.get(n.plateLogId) ?? []), n]);
    return this;
  }

  append(n: CoachNote): Promise<CoachNoteAppendResult> {
    if (this.mode === 'throw') return Promise.reject(new Error('boom'));
    if (this.mode === 'fail' || this.nextAppendFailure) {
      this.nextAppendFailure = false;
      return Promise.resolve({ kind: 'coachNoteAppendFailure', cause: storeFailure('secureKey') });
    }
    const assigned = { ...n, id: this.nextNoteId++ };
    this.appended.push(assigned);
    this.seed(assigned);
    return Promise.resolve({ kind: 'coachNoteAppended', note: assigned });
  }
  forPlate(id: number): Promise<readonly CoachNote[]> {
    if (this.mode === 'throw') return Promise.reject(new Error('boom'));
    return Promise.resolve(this.byPlate.get(id) ?? []);
  }
  watchForPlate(): Unsubscribe {
    return () => undefined;
  }
  recordDismissal(key: string): Promise<CoachInteractionResult> {
    this.dismissed.add(key);
    return Promise.resolve(coachInteractionRecorded(1));
  }
  watchDismissals(): Unsubscribe {
    return () => undefined;
  }
  recordInteraction(log: CoachInteractionLog): Promise<CoachInteractionResult> {
    this.interactions.push(log);
    if (this.nextInteractionFailure) {
      this.nextInteractionFailure = false;
      return Promise.resolve({
        kind: 'coachInteractionFailed',
        cause: storeFailure('secureKey'),
      });
    }
    return Promise.resolve(coachInteractionRecorded(this.nextInteractionId++));
  }
  deleteForPlate(id: number): Promise<DeletePlateResult> {
    this.deletedPlates.push(id);
    return Promise.resolve(PLATE_DELETED);
  }
}

/** A store whose recordPlate echoes the drafts back as plate 5, or returns a fixed result. */
export class FakeStore implements EncryptedStore {
  calls = 0;
  lastEntries: readonly FoodEntryDraft[] | undefined;
  lastLoggedAtUtc: number | undefined;
  /** What `readRange` returns, and the last range asked for. */
  dayPlates: readonly PlateLog[] = [];
  readMode: 'ok' | 'fail' | 'throw' = 'ok';
  lastRange: { from?: number | undefined; to?: number | undefined } | undefined;
  constructor(private readonly fixed?: RecordPlateResult) {}

  recordPlate(input: {
    entries: readonly FoodEntryDraft[];
    loggedAtUtc?: number | undefined;
  }): Promise<RecordPlateResult> {
    this.calls++;
    this.lastEntries = input.entries;
    this.lastLoggedAtUtc = input.loggedAtUtc;
    if (this.fixed !== undefined) return Promise.resolve(this.fixed);
    return Promise.resolve(
      recordPlateSuccess(
        plateLog({
          id: 5,
          loggedAtUtc: utc(2026, 8, 16, 12),
          entries: input.entries.map((e, i) => ({
            id: i + 1,
            plateLogId: 5,
            databaseFood: e.databaseFood,
            quantity: e.quantity,
          })),
        }),
      ),
    );
  }
  watchRange(): Unsubscribe {
    return () => undefined;
  }
  readRange(range?: {
    from?: number | undefined;
    to?: number | undefined;
  }): Promise<ReadPlatesResult> {
    this.lastRange = range;
    if (this.readMode === 'throw') return Promise.reject(new Error('read exploded'));
    if (this.readMode === 'fail') {
      return Promise.resolve({ kind: 'platesReadFailed', failure: storeFailure('storeOperation') });
    }
    return Promise.resolve({ kind: 'platesRead', plates: this.dayPlates });
  }
  deletePlate(): Promise<DeletePlateResult> {
    return Promise.resolve(PLATE_DELETED);
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

/** A sync queue that stores enqueued ops; can throw or fail on enqueue. */
export class FakeQueue implements SyncQueue {
  readonly ops: SyncOp[] = [];
  readonly synced: string[] = [];
  readonly failed: string[] = [];
  pendingReads = 0;
  constructor(
    private readonly opts: {
      throws?: boolean;
      fails?: boolean;
      pending?: readonly SyncOp[];
      markResult?: MarkResult | 'throw';
    } = {},
  ) {}

  enqueue(op: SyncOp): Promise<EnqueueResult> {
    if (this.opts.throws) return Promise.reject(new Error('queue exploded'));
    if (this.opts.fails) return Promise.resolve({ kind: 'enqueueFailed', reason: 'disk' });
    this.ops.push(op);
    return Promise.resolve(ENQUEUED);
  }
  pending(): Promise<readonly SyncOp[]> {
    this.pendingReads++;
    return Promise.resolve(this.opts.pending ?? this.ops);
  }
  watchState(): Unsubscribe {
    return () => undefined;
  }
  watchPerPlate(): Unsubscribe {
    return () => undefined;
  }
  markSynced(opId: string): Promise<MarkResult> {
    this.synced.push(opId);
    return this.markOutcome();
  }
  markFailed(opId: string): Promise<MarkResult> {
    this.failed.push(opId);
    return this.markOutcome();
  }
  private markOutcome(): Promise<MarkResult> {
    const outcome = this.opts.markResult ?? MARKED;
    return outcome === 'throw'
      ? Promise.reject(new Error('mark exploded'))
      : Promise.resolve(outcome);
  }
}
