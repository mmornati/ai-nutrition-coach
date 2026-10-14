import { describe, expect, it } from 'vitest';
import {
  COACH_ANCHORS,
  COACH_TAXONOMY,
  COACH_TAXONOMY_KEYS,
  COMPOSITION_PATTERNS,
  coachQuestionEquals,
  coachQuestionKey,
  createTemplateCoach,
  type Coach,
  type CoachAnchor,
  type CompositionPattern,
} from '../src/index';

const strings = new Map(COACH_TAXONOMY_KEYS.map((k) => [k, `copy for ${k}`]));
const lookup = (key: string): string | undefined => strings.get(key);

describe('coach taxonomy (bounded and curated)', () => {
  it('ships exactly 3 anchors x 6 patterns = 18 keys, all distinct', () => {
    expect(COACH_TAXONOMY).toHaveLength(18);
    expect(new Set(COACH_TAXONOMY_KEYS).size).toBe(18);
    for (const anchor of COACH_ANCHORS) {
      for (const pattern of COMPOSITION_PATTERNS) {
        expect(COACH_TAXONOMY_KEYS).toContain(coachQuestionKey(anchor, pattern));
      }
    }
  });

  it('keys follow {anchor}.{pattern} and carry their anchor and pattern', () => {
    for (const e of COACH_TAXONOMY) {
      expect(e.key).toBe(coachQuestionKey(e.anchor, e.pattern));
    }
    expect(COACH_TAXONOMY_KEYS).toContain('post.resolve.vegLight');
    expect(COACH_TAXONOMY_KEYS).toContain('openPlate.balanced');
    expect(COACH_TAXONOMY_KEYS).toContain('depth.followUp.starchHeavy');
  });

  it('is immutable', () => {
    expect(Object.isFrozen(COACH_TAXONOMY)).toBe(true);
    expect(Object.isFrozen(COACH_TAXONOMY_KEYS)).toBe(true);
  });
});

describe('createTemplateCoach (the v1 Coach rung)', () => {
  const coach: Coach = createTemplateCoach(lookup);

  it('returns a non-empty question for every (anchor, pattern) in the taxonomy', () => {
    for (const anchor of COACH_ANCHORS) {
      for (const pattern of COMPOSITION_PATTERNS) {
        const result = coach.questionFor({ anchor, pattern });
        expect(result.kind).toBe('coachFound');
        if (result.kind !== 'coachFound') continue;
        expect(result.question.text).not.toBe('');
        expect(result.question.key).toBe(coachQuestionKey(anchor, pattern));
        expect(result.question.anchor).toBe(anchor);
        expect(result.question.pattern).toBe(pattern);
      }
    }
  });

  it('takes the copy verbatim from the injected lookup (l10n stays outside the core)', () => {
    const fr = createTemplateCoach((k) =>
      k === 'post.resolve.vegLight' ? 'Une poignée de verdure.' : undefined,
    );
    const r = fr.questionFor({ anchor: 'postResolve', pattern: 'vegLight' });
    expect(r.kind === 'coachFound' && r.question.text).toBe('Une poignée de verdure.');
  });

  it('is deterministic: the same pair yields an equal question (equality by key)', () => {
    const a = coach.questionFor({ anchor: 'postResolve', pattern: 'vegLight' });
    const b = coach.questionFor({ anchor: 'postResolve', pattern: 'vegLight' });
    expect(a).toEqual(b);
    expect(
      a.kind === 'coachFound' &&
        b.kind === 'coachFound' &&
        coachQuestionEquals(a.question, b.question),
    ).toBe(true);
  });

  it('a pair with no copy returns noCoachQuestion: no fallback copy, no error', () => {
    const partial = createTemplateCoach((k) => (k === 'post.resolve.vegLight' ? 'x' : undefined));
    expect(partial.questionFor({ anchor: 'openPlate', pattern: 'balanced' })).toEqual({
      kind: 'noCoachQuestion',
    });
  });

  it('empty copy counts as missing', () => {
    expect(
      createTemplateCoach(() => '').questionFor({ anchor: 'postResolve', pattern: 'vegLight' })
        .kind,
    ).toBe('noCoachQuestion');
  });

  it('an unknown anchor or pattern (a future value) returns noCoachQuestion', () => {
    expect(coach.questionFor({ anchor: 'someday' as CoachAnchor, pattern: 'vegLight' }).kind).toBe(
      'noCoachQuestion',
    );
    expect(
      coach.questionFor({ anchor: 'postResolve', pattern: 'pizza' as CompositionPattern }).kind,
    ).toBe('noCoachQuestion');
  });

  it('a lookup that throws never throws across the port', () => {
    const boom = createTemplateCoach(() => {
      throw new Error('bundle missing');
    });
    expect(boom.questionFor({ anchor: 'postResolve', pattern: 'vegLight' }).kind).toBe(
      'noCoachQuestion',
    );
  });

  it('only looks up keys inside the taxonomy', () => {
    const asked: string[] = [];
    const spy = createTemplateCoach((k) => {
      asked.push(k);
      return 'x';
    });
    for (const anchor of COACH_ANCHORS) {
      for (const pattern of COMPOSITION_PATTERNS) spy.questionFor({ anchor, pattern });
    }
    spy.questionFor({ anchor: 'nope' as CoachAnchor, pattern: 'vegLight' });
    expect(new Set(asked)).toEqual(new Set(COACH_TAXONOMY_KEYS));
  });
});
