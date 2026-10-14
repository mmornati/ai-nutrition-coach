// Stores handed out when the encrypted database could not be opened: the UI gets typed, calm
// failures instead of an uncaught async error, the failure is the REAL one, and nothing is ever
// written anywhere.

import {
  coachInteractionFailed,
  plateDeleteFailed,
  type CoachInteractionResult,
  type CoachNote,
  type CoachNoteAppendResult,
  type CoachNoteStore,
  type DeletePlateResult,
  type EncryptedStore,
  type ReadPlatesResult,
  type RecordPlateResult,
  type StoreFailure,
  type StoreObserver,
  type Unsubscribe,
} from '@anc/core';

export class FailedEncryptedStore implements EncryptedStore {
  constructor(private readonly failure: StoreFailure) {}

  recordPlate(): Promise<RecordPlateResult> {
    return Promise.resolve(this.failure);
  }

  watchRange(_range: unknown, observer: StoreObserver<readonly never[]>): Unsubscribe {
    let active = true;
    queueMicrotask(() => {
      if (active) observer.error(this.failure);
    });
    return () => {
      active = false;
    };
  }

  readRange(): Promise<ReadPlatesResult> {
    return Promise.resolve({ kind: 'platesReadFailed', failure: this.failure });
  }

  deletePlate(): Promise<DeletePlateResult> {
    return Promise.resolve(plateDeleteFailed(this.failure));
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

export class FailedCoachNoteStore implements CoachNoteStore {
  constructor(private readonly failure: StoreFailure) {}

  append(note: CoachNote): Promise<CoachNoteAppendResult> {
    void note;
    return Promise.resolve({ kind: 'coachNoteAppendFailure', cause: this.failure });
  }

  forPlate(): Promise<readonly CoachNote[]> {
    return Promise.resolve([]);
  }

  watchForPlate(_plateLogId: number, observer: StoreObserver<readonly CoachNote[]>): Unsubscribe {
    return emitOnce(observer, []);
  }

  recordDismissal(): Promise<CoachInteractionResult> {
    return Promise.resolve(coachInteractionFailed(this.failure));
  }

  watchDismissals(observer: StoreObserver<ReadonlySet<string>>): Unsubscribe {
    return emitOnce(observer, new Set<string>());
  }

  recordInteraction(): Promise<CoachInteractionResult> {
    return Promise.resolve(coachInteractionFailed(this.failure));
  }

  deleteForPlate(): Promise<DeletePlateResult> {
    return Promise.resolve(plateDeleteFailed(this.failure));
  }
}

function emitOnce<T>(observer: StoreObserver<T>, value: T): Unsubscribe {
  let active = true;
  queueMicrotask(() => {
    if (active) observer.next(value);
  });
  return () => {
    active = false;
  };
}
