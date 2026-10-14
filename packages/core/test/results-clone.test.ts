import { describe, expect, it } from 'vitest';
import {
  ALREADY_ENQUEUED,
  catalogFailure,
  coachFound,
  coachInteractionFailed,
  coachInteractionRecorded,
  DRAIN_SKIPPED_NO_TRANSPORT,
  DRAINED,
  drainFailedPermanent,
  drainFailedRetryable,
  ENQUEUED,
  enqueueFailed,
  ERASE_SUCCESS,
  eraseLocalDataFailure,
  exportReady,
  MARKED,
  markFailed,
  NO_COACH_QUESTION,
  NO_MATCH,
  notFound,
  PLATE_DELETED,
  plateDeleteFailed,
  quotaExhausted,
  rankedMatches,
  recognitionFailure,
  recognizedPlate,
  recordPlateSuccess,
  storeFailure,
  transcribedText,
  transcriptionFailure,
} from '../src/index';
import { note, plateWith, question } from './helpers';

const plate = plateWith(1, [{ group: 'protein', name: 'Egg' }]);

// One value of every member of every result union in src/results.
const samples: Record<string, unknown> = {
  rankedMatches: rankedMatches([]),
  notFound: notFound('x'),
  catalogFailure: catalogFailure('network'),
  catalogFailureMsg: catalogFailure('timeout', 'slow'),
  coachFound: coachFound(question('postResolve', 'balanced')),
  noCoachQuestion: NO_COACH_QUESTION,
  coachNoteAppended: { kind: 'coachNoteAppended', note: note() },
  coachNoteAppendFailure: { kind: 'coachNoteAppendFailure', cause: storeFailure('keyLost') },
  coachNoteGenerated: { kind: 'coachNoteGenerated', note: note(), reason: 'matched' },
  noCoachNoteGenerated: { kind: 'noCoachNoteGenerated', reason: 'appendFailed' },
  coachInteractionRecorded: coachInteractionRecorded(3),
  coachInteractionFailed: coachInteractionFailed(storeFailure('storeOperation')),
  eraseSuccess: ERASE_SUCCESS,
  eraseFailure: eraseLocalDataFailure(['closeStore', 'exportFiles']),
  exportReady: exportReady([plate]),
  exportFailure: { kind: 'storeClosed' },
  recognizedPlate: recognizedPlate([]),
  noMatch: NO_MATCH,
  recognitionFailure: recognitionFailure('keyRejected', 'bad key'),
  quotaExhausted: quotaExhausted(1_000),
  quotaExhaustedNoReset: quotaExhausted(),
  storeFailure: storeFailure('emptyPlate'),
  recordPlateSuccess: recordPlateSuccess(plate, [{ step: 'coachNote' }]),
  platesRead: { kind: 'platesRead', plates: [plate] },
  platesReadFailed: { kind: 'platesReadFailed', failure: storeFailure('keyLost') },
  plateDeleted: PLATE_DELETED,
  plateDeleteFailed: plateDeleteFailed(storeFailure('storeOperation')),
  enqueued: ENQUEUED,
  alreadyEnqueued: ALREADY_ENQUEUED,
  enqueueFailed: enqueueFailed('disk'),
  drained: DRAINED,
  drainFailedRetryable: drainFailedRetryable('5xx'),
  drainFailedPermanent: drainFailedPermanent('schema'),
  drainSkippedNoTransport: DRAIN_SKIPPED_NO_TRANSPORT,
  marked: MARKED,
  markFailed: markFailed('disk'),
  transcribedText: transcribedText('hello'),
  transcriptionFailure: transcriptionFailure('microphoneDenied'),
};

describe('results are structured-clone safe (no class instances, no functions)', () => {
  it.each(Object.entries(samples))('%s round-trips through structuredClone', (_name, value) => {
    expect(structuredClone(value)).toEqual(value);
  });
});
