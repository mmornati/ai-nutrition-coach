import { describe, expect, it } from 'vitest';
import {
  coachInteractionFailed,
  coachInteractionRecorded,
  coachNoteDismissalKey,
  COACH_ANCHORS,
  COACH_INTERACTIONS,
  createRecordCoachInteraction,
  NO_COACH_QUESTION,
  openPlateDismissalKey,
  persistedInteractionName,
  localTime,
  storeFailure,
  type CoachInteraction,
  type CoachInteractionLog,
} from '../src/index';
import { FakeCoach, FakeCoachNoteStore, found, note, question, utc } from './helpers';

const depthQuestion = found(question('depthFollowUp', 'vegLight'));

describe('CoachInteraction + CoachInteractionLog value types (FR9)', () => {
  it('CoachInteraction ships the exact v1 four-member set', () => {
    expect(COACH_INTERACTIONS).toEqual(['sure', 'askLater', 'dismiss', 'depthAnswer']);
  });

  it('persisted name matches the literal', () => {
    expect(COACH_INTERACTIONS.map(persistedInteractionName)).toEqual([
      'sure',
      'askLater',
      'dismiss',
      'depthAnswer',
    ]);
  });

  it('CoachInteractionLog carries noteId + kind + at', () => {
    const log: CoachInteractionLog = { noteId: 7, kind: 'sure', at: utc(2026, 8, 16, 12) };
    expect(log).toEqual({ noteId: 7, kind: 'sure', at: utc(2026, 8, 16, 12) });
  });

  it('CoachInteractionLog equality is structural', () => {
    const mk = (noteId: number): CoachInteractionLog => ({
      noteId,
      kind: 'sure',
      at: utc(2026, 8, 16),
    });
    expect(mk(7)).toEqual(mk(7));
    expect(mk(7)).not.toEqual(mk(8));
  });

  it('spreading swaps fields immutably', () => {
    const base: CoachInteractionLog = { noteId: 1, kind: 'askLater', at: utc(2026, 8, 16) };
    const updated = { ...base, kind: 'depthAnswer' as const };
    expect(updated).toEqual({ noteId: 1, kind: 'depthAnswer', at: base.at });
    expect(base.kind).toBe('askLater');
  });
});

describe('CoachInteractionResult hierarchy', () => {
  it('recorded carries the assigned id', () => {
    expect(coachInteractionRecorded(42)).toEqual({
      kind: 'coachInteractionRecorded',
      interactionId: 42,
    });
  });

  it('failed carries a StoreFailure cause', () => {
    const cause = storeFailure('secureKey');
    expect(coachInteractionFailed(cause)).toEqual({ kind: 'coachInteractionFailed', cause });
  });
});

describe('CoachAnchor set (Story 2.3)', () => {
  it('ships three anchors in declaration order', () => {
    expect(COACH_ANCHORS).toEqual(['postResolve', 'openPlate', 'depthFollowUp']);
  });
});

function setup(clock = () => utc(2026, 8, 16, 12)) {
  const coach = new FakeCoach();
  const store = new FakeCoachNoteStore();
  const useCase = createRecordCoachInteraction({ coach, store, clock });
  return { coach, store, useCase };
}

describe('RecordCoachInteraction dispatch (FR5 / AD-3 / AD-5)', () => {
  it('[sure] writes the interaction AND appends exactly one bounded depth follow-up', async () => {
    const { coach, store, useCase } = setup();
    coach.emitDepth(depthQuestion);

    const result = await useCase.record({ note: note(), kind: 'sure' });

    expect(result.kind).toBe('sure');
    expect(store.interactions).toEqual([{ noteId: 7, kind: 'sure', at: utc(2026, 8, 16, 12) }]);
    expect(result.followedUpNote?.anchor).toBe('depthFollowUp');
    expect(result.followedUpNote?.questionKey).toBe('depth.followUp.vegLight');
    expect(coach.calls).toEqual([{ anchor: 'depthFollowUp', pattern: 'vegLight' }]);
  });

  it('second [sure] tap is idempotent — no extra notes (DEPTH_FOLLOWUP_ALREADY_VIEWED)', async () => {
    const { coach, store, useCase } = setup();
    store.seed(note({ id: 99, anchor: 'depthFollowUp', questionKey: 'depth.followUp.vegLight' }));

    const result = await useCase.record({ note: note(), kind: 'sure' });

    expect(result.kind).toBe('sure');
    expect(result.followedUpNote).toBeNull();
    expect(store.interactions).toHaveLength(1);
    expect(coach.calls).toEqual([]);
  });

  it('[sure] twice in a row appends only one follow-up', async () => {
    const { coach, store, useCase } = setup();
    coach.emitDepth(depthQuestion);
    const first = await useCase.record({ note: note(), kind: 'sure' });
    coach.emitDepth(depthQuestion);
    const second = await useCase.record({ note: note(), kind: 'sure' });
    expect(first.followedUpNote).not.toBeNull();
    expect(second.followedUpNote).toBeNull();
    expect(store.appended).toHaveLength(1);
  });

  it.each(['askLater', 'dismiss', 'depthAnswer'] as const)(
    '[%s] writes the interaction only, never asks the coach',
    async (kind) => {
      const { coach, store, useCase } = setup();
      const result = await useCase.record({ note: note(), kind });
      expect(result.kind).toBe(kind);
      expect(result.followedUpNote).toBeNull();
      expect(store.interactions).toHaveLength(1);
      expect(store.interactions[0]?.kind).toBe(kind);
      expect(coach.calls).toEqual([]);
    },
  );

  it('coach returning noCoachQuestion for depthFollowUp collapses to no follow-up (calm degrade)', async () => {
    const { coach, store, useCase } = setup();
    coach.emitDepth(NO_COACH_QUESTION);
    const result = await useCase.record({ note: note(), kind: 'sure' });
    expect(result.followedUpNote).toBeNull();
    expect(store.interactions).toHaveLength(1);
  });

  it('coach throwing for depthFollowUp collapses to no follow-up (DEPTH_PORT_UNAVAILABLE)', async () => {
    const { coach, store, useCase } = setup();
    coach.throwOnDepthCall = true;
    const result = await useCase.record({ note: note(), kind: 'sure' });
    expect(result.followedUpNote).toBeNull();
    expect(store.interactions).toHaveLength(1);
  });

  it('recordInteraction store failure collapses to a typed failed outcome (STORE_WRITE_FAILURE)', async () => {
    const { store, useCase } = setup();
    store.forceInteractionFailure();
    const result = await useCase.record({ note: note(), kind: 'askLater' });
    expect(result.recordInteractionOutcome.kind).toBe('coachInteractionFailed');
    expect(result.kind).toBe('askLater');
  });

  it('a THROWING store becomes a typed failed outcome, never a throw', async () => {
    const { store, useCase } = setup();
    store.recordInteraction = () => Promise.reject(new Error('db'));
    store.recordDismissal = () => Promise.reject(new Error('db'));
    const result = await useCase.record({ note: note(), kind: 'dismiss' });
    expect(result.recordInteractionOutcome).toEqual(
      coachInteractionFailed(storeFailure('storeOperation')),
    );
    expect(await useCase.dismissOpenPlateHint('openPlate:2026-08-16:lunch')).toEqual(
      coachInteractionFailed(storeFailure('storeOperation')),
    );
  });

  it('a THROWING store.forPlate / store.append collapses to no follow-up, never a throw', async () => {
    const forPlateThrows = setup();
    forPlateThrows.coach.emitDepth(depthQuestion);
    forPlateThrows.store.forPlate = () => Promise.reject(new Error('db'));
    const a = await forPlateThrows.useCase.record({ note: note(), kind: 'sure' });
    expect(a.followedUpNote).toBeNull();
    expect(a.recordInteractionOutcome.kind).toBe('coachInteractionRecorded');

    const appendThrows = setup();
    appendThrows.coach.emitDepth(depthQuestion);
    appendThrows.store.append = () => Promise.reject(new Error('db'));
    const b = await appendThrows.useCase.record({ note: note(), kind: 'sure' });
    expect(b.followedUpNote).toBeNull();
    expect(b.recordInteractionOutcome.kind).toBe('coachInteractionRecorded');
  });

  it('append failure on the depth-follow-up path collapses to no note', async () => {
    const { coach, store, useCase } = setup();
    coach.emitDepth(depthQuestion);
    store.forceAppendFailure();
    const result = await useCase.record({ note: note(), kind: 'sure' });
    expect(result.followedUpNote).toBeNull();
    expect(store.interactions).toHaveLength(1);
  });

  it('a note whose anchor is openPlate cannot spawn a depth follow-up (defensive)', async () => {
    const { coach, store, useCase } = setup();
    const openPlateNote = note({ anchor: 'openPlate', questionKey: 'openPlate.vegLight' });
    const result = await useCase.record({ note: openPlateNote, kind: 'sure' });
    expect(result.followedUpNote).toBeNull();
    expect(store.interactions).toHaveLength(1);
    expect(coach.calls).toEqual([]);
  });

  it('a note whose questionKey cannot be parsed to a pattern collapses to no follow-up (defensive)', async () => {
    const { coach, store, useCase } = setup();
    const result = await useCase.record({
      note: note({ questionKey: 'post.resolve.???', text: 'x' }),
      kind: 'sure',
    });
    expect(result.followedUpNote).toBeNull();
    expect(store.interactions).toHaveLength(1);
    expect(coach.calls).toEqual([]);
  });

  it('the follow-up pattern is read from the note key, not guessed', async () => {
    const { coach, useCase } = setup();
    coach.emitDepth(found(question('depthFollowUp', 'proteinHeavy')));
    await useCase.record({
      note: note({ questionKey: 'post.resolve.proteinHeavy' }),
      kind: 'sure',
    });
    expect(coach.calls[0]?.pattern).toBe('proteinHeavy');
  });
});

describe('Open-plate dismissal path (FR5 / UX-DR5 / F6)', () => {
  it('dismissOpenPlateHint writes ONLY a dismissal marker — no synthetic note, no interaction row', async () => {
    const { coach, store, useCase } = setup();
    const key = openPlateDismissalKey({ day: localTime(2026, 8, 16), slotName: 'lunch' });

    const result = await useCase.dismissOpenPlateHint(key);

    expect(key).toBe('openPlate:2026-08-16:lunch');
    expect(result.kind).toBe('coachInteractionRecorded');
    expect([...store.dismissed]).toEqual([key]);
    expect(store.appended).toEqual([]);
    expect(store.interactions).toEqual([]);
    expect(coach.calls).toEqual([]);
  });

  it('the day key is zero-padded and local', () => {
    expect(openPlateDismissalKey({ day: localTime(2026, 1, 5, 23, 59), slotName: 'late' })).toBe(
      'openPlate:2026-01-05:late',
    );
    expect(coachNoteDismissalKey(12)).toBe('note:12');
  });
});

describe('Durable dismissal of a whisper (F6)', () => {
  it.each(['askLater', 'dismiss'] as const)(
    '%s persists the note dismissal marker',
    async (kind) => {
      const { store, useCase } = setup();
      await useCase.record({ note: note({ plateLogId: 1, text: 'q' }), kind });
      expect([...store.dismissed]).toEqual([coachNoteDismissalKey(7)]);
      expect(store.interactions).toHaveLength(1);
    },
  );

  it.each(['sure', 'depthAnswer'] as const)(
    '%s does NOT dismiss the whisper',
    async (kind: CoachInteraction) => {
      const { store, useCase } = setup();
      await useCase.record({ note: note({ plateLogId: 1, text: 'q' }), kind });
      expect(store.dismissed.size).toBe(0);
    },
  );
});
