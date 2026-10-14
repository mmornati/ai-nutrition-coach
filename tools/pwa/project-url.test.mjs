import { describe, expect, it } from 'vitest';
import { checkProjectUrl } from '../check_project_url.mjs';

describe('project URL rule', () => {
  it('unset is fine for any flavour (the default repository URL is used)', () => {
    expect(checkProjectUrl({})).toEqual([]);
    expect(checkProjectUrl({ AI_NUTRITION_COACH_BUILD: 'selfhost' })).toEqual([]);
  });
  it('a plain https URL passes', () => {
    const env = { AI_NUTRITION_COACH_PROJECT_URL: 'https://example.org/ai-nutrition-coach', AI_NUTRITION_COACH_BUILD: 'release' };
    expect(checkProjectUrl(env)).toEqual([]);
  });
  it.each(['http://example.org', 'https://a b.test', "https://a.test/'x", 'https://a.test;rm', 'ftp://x.test', 'https://a.test/\nb'])(
    'refuses %j for every flavour',
    (url) => {
      expect(checkProjectUrl({ AI_NUTRITION_COACH_PROJECT_URL: url })).not.toEqual([]);
    },
  );
  it('a release build refuses an .invalid host', () => {
    for (const build of ['selfhost', 'release']) {
      expect(
        checkProjectUrl({ AI_NUTRITION_COACH_PROJECT_URL: 'https://x.invalid/p', AI_NUTRITION_COACH_BUILD: build }),
      ).not.toEqual([]);
    }
    // ...but a development build does not care.
    expect(checkProjectUrl({ AI_NUTRITION_COACH_PROJECT_URL: 'https://x.invalid/p' })).toEqual([]);
  });
});
