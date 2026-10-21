import { describe, expect, it } from 'vitest';
import {
  COACH_ANCHORS,
  COMPOSITION_PATTERNS,
  coachAnchorKeyToken,
  coachFound,
  coachQuestionEquals,
  coachQuestionKey,
  compositionPatternKeyToken,
  isCoachAnchor,
  NO_COACH_QUESTION,
  parseCompositionPattern,
  type Coach,
  type CoachQuestion,
} from '../src/index';

const vegLight: CoachQuestion = {
  key: 'post.resolve.vegLight',
  text: 'A handful of greens would round this plate out.',
  anchor: 'postResolve',
  pattern: 'vegLight',
};

describe('CompositionPattern + CoachAnchor (NFR3)', () => {
  it('CompositionPattern ships the exact fourteen-entry taxonomy', () => {
    expect(COMPOSITION_PATTERNS).toEqual([
      'vegLight',
      'proteinHeavy',
      'starchHeavy',
      'dairyLight',
      'vegRich',
      'balanced',
      'breakfastSimple',
      'proteinMissingDay',
      'sugarsHighItem',
      'saltHighPlate',
      'satFatHighPlate',
      'energyDenseSnack',
      'proteinLowDay',
      'fibreLowDay',
    ]);
  });

  it('CoachAnchor ships the exact v1 three-entry anchor set', () => {
    expect(COACH_ANCHORS).toEqual(['postResolve', 'openPlate', 'depthFollowUp']);
  });

  it('CompositionPattern key tokens are stable', () => {
    expect(COMPOSITION_PATTERNS.map(compositionPatternKeyToken)).toEqual([
      'vegLight',
      'proteinHeavy',
      'starchHeavy',
      'dairyLight',
      'vegRich',
      'balanced',
      'breakfastSimple',
      'proteinMissingDay',
      'sugarsHighItem',
      'saltHighPlate',
      'satFatHighPlate',
      'energyDenseSnack',
      'proteinLowDay',
      'fibreLowDay',
    ]);
  });

  it('CoachAnchor key tokens are stable', () => {
    expect(coachAnchorKeyToken('postResolve')).toBe('post.resolve');
    expect(coachAnchorKeyToken('openPlate')).toBe('openPlate');
    expect(coachAnchorKeyToken('depthFollowUp')).toBe('depth.followUp');
  });

  it('the {anchor}.{pattern} key token rule', () => {
    expect(coachQuestionKey('postResolve', 'vegLight')).toBe('post.resolve.vegLight');
    expect(coachQuestionKey('depthFollowUp', 'balanced')).toBe('depth.followUp.balanced');
    expect(coachQuestionKey('openPlate', 'dairyLight')).toBe('openPlate.dairyLight');
  });

  it('parseCompositionPattern and guards reject unknown tokens', () => {
    expect(parseCompositionPattern('vegRich')).toBe('vegRich');
    expect(parseCompositionPattern('???')).toBeNull();
    expect(isCoachAnchor('postResolve')).toBe(true);
    expect(isCoachAnchor('nope')).toBe(false);
  });
});

describe('CoachQuestion value type (AD-7 / NFR3)', () => {
  it('carries key + text + anchor + pattern', () => {
    expect(vegLight.key).toBe('post.resolve.vegLight');
    expect(vegLight.text).toBe('A handful of greens would round this plate out.');
    expect(vegLight.anchor).toBe('postResolve');
    expect(vegLight.pattern).toBe('vegLight');
  });

  it('equality is by key: same key compares equal regardless of text', () => {
    const other: CoachQuestion = {
      key: 'post.resolve.vegLight',
      text: 'Second copy (different).',
      anchor: 'openPlate',
      pattern: 'proteinHeavy',
    };
    expect(coachQuestionEquals(vegLight, other)).toBe(true);
  });

  it('different keys compare not equal', () => {
    const b: CoachQuestion = {
      key: 'post.resolve.proteinHeavy',
      text: vegLight.text,
      anchor: 'postResolve',
      pattern: 'proteinHeavy',
    };
    expect(coachQuestionEquals(vegLight, b)).toBe(false);
  });

  it('spreading swaps fields immutably', () => {
    const updated = { ...vegLight, text: 'Revised copy.' };
    expect(updated.key).toBe('post.resolve.vegLight');
    expect(updated.text).toBe('Revised copy.');
    expect(vegLight.text).toBe('A handful of greens would round this plate out.');
  });
});

describe('CoachQuestionResult is a union: coachFound | noCoachQuestion', () => {
  it('the two variants are the only members', () => {
    expect([coachFound(vegLight).kind, NO_COACH_QUESTION.kind]).toEqual([
      'coachFound',
      'noCoachQuestion',
    ]);
  });

  it('coachFound equality: same question compares equal', () => {
    expect(coachFound(vegLight)).toEqual(coachFound(vegLight));
  });

  it('noCoachQuestion is a constant singleton', () => {
    expect(NO_COACH_QUESTION).toBe(NO_COACH_QUESTION);
    expect(NO_COACH_QUESTION).toEqual({ kind: 'noCoachQuestion' });
  });
});

describe('Coach port contract (AD-1 / AD-5)', () => {
  const stub: Coach = {
    questionFor: ({ anchor, pattern }) =>
      anchor === 'postResolve' && pattern === 'vegLight' ? coachFound(vegLight) : NO_COACH_QUESTION,
  };

  it('a minimal adapter returning the result shape compiles against the port', () => {
    const f = stub.questionFor({ anchor: 'postResolve', pattern: 'vegLight' });
    expect(f.kind === 'coachFound' && f.question.key).toBe('post.resolve.vegLight');
    expect(stub.questionFor({ anchor: 'postResolve', pattern: 'balanced' }).kind).toBe(
      'noCoachQuestion',
    );
  });

  it('the port signature accepts every (anchor, pattern) combination', () => {
    for (const anchor of COACH_ANCHORS) {
      for (const pattern of COMPOSITION_PATTERNS) {
        expect(['coachFound', 'noCoachQuestion']).toContain(
          stub.questionFor({ anchor, pattern }).kind,
        );
      }
    }
  });
});
