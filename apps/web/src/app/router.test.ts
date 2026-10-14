import { describe, expect, it } from 'vitest';
import { hrefs, isPrivacyRoute, parseRoute, replaceRoute } from './router';

describe('parseRoute', () => {
  it.each([
    ['', { name: 'today' }],
    ['#', { name: 'today' }],
    ['#/', { name: 'today' }],
    ['#/week', { name: 'week' }],
    ['#/week/', { name: 'week' }],
    ['#/plate/12', { name: 'plate', id: 12 }],
    ['#/settings', { name: 'settings', section: null }],
    ['#/settings/ai', { name: 'settings', section: 'ai' }],
    ['#/privacy', { name: 'settings', section: 'privacy' }],
  ])('%s', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });

  it.each(['#/plate', '#/plate/abc', '#/plate/-3', '#/plate/1.5', '#/nope', '#//', '#/?x=1'])(
    'anything unknown or malformed is Today: %s',
    (hash) => {
      expect(parseRoute(hash)).toEqual({ name: 'today' });
    },
  );

  it('round-trips the links the app builds', () => {
    expect(parseRoute(hrefs.plate(7))).toEqual({ name: 'plate', id: 7 });
    expect(parseRoute(hrefs.week)).toEqual({ name: 'week' });
    expect(parseRoute(hrefs.settings)).toEqual({ name: 'settings', section: null });
    expect(parseRoute(hrefs.section('data'))).toEqual({ name: 'settings', section: 'data' });
    expect(isPrivacyRoute(parseRoute(hrefs.privacy))).toBe(true);
    expect(isPrivacyRoute(parseRoute(hrefs.today))).toBe(false);
  });
});

describe('replaceRoute', () => {
  it('replaces the current history entry with the new hash and tells listeners', () => {
    window.location.hash = '#/plate/7';
    const before = window.history.length;
    const seen: string[] = [];
    const listener = () => seen.push(window.location.hash);
    window.addEventListener('hashchange', listener);
    replaceRoute('#/');
    window.removeEventListener('hashchange', listener);
    expect(['', '#/']).toContain(window.location.hash);
    expect(window.history.length).toBe(before);
    expect(seen.length).toBeGreaterThan(0);
    window.location.hash = '';
  });
});
