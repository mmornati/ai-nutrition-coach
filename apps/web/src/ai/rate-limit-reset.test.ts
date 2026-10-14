import { describe, expect, it } from 'vitest';
import { parseRateLimitReset } from './rate-limit-reset';

const now = Date.UTC(2026, 7, 16, 12);
const sec = 1000;
const min = 60 * sec;
const hour = 60 * min;
const day = 24 * hour;
const parse = (raw: string | null | undefined) => parseRateLimitReset(raw, now);

describe('parseRateLimitReset', () => {
  it('absent, blank or garbage is unknown', () => {
    for (const raw of [null, undefined, '', '   ', 'soon', '6x', '-5', 'NaN', 'Infinity', '0x10']) {
      expect(parse(raw), String(raw)).toBeUndefined();
    }
  });

  it('small numbers are a delta in SECONDS', () => {
    expect(parse('30')).toBe(now + 30 * sec);
    expect(parse('1.5')).toBe(now + 1500);
    expect(parse('0')).toBe(now);
  });

  it('~1e9..1e11 is an epoch in SECONDS', () => {
    const t = Date.UTC(2026, 7, 16, 13);
    expect(parse(String(t / 1000))).toBe(t);
  });

  it('>= 1e11 is an epoch in MILLISECONDS', () => {
    const t = Date.UTC(2026, 7, 16, 13);
    expect(parse(String(t))).toBe(t);
  });

  it('understands duration strings', () => {
    expect(parse('6m0s')).toBe(now + 6 * min);
    expect(parse('1.5s')).toBe(now + 1500);
    expect(parse('20ms')).toBe(now + 20);
    expect(parse('1h2m3s')).toBe(now + hour + 2 * min + 3 * sec);
    expect(parse('2d')).toBe(now + 2 * day);
    expect(parse(' 6M0S ')).toBe(now + 6 * min); // case-insensitive, trimmed
  });

  it('rejects a duration with junk around it', () => {
    expect(parse('about 6m')).toBeUndefined();
    expect(parse('6m later')).toBeUndefined();
    expect(parse('m6')).toBeUndefined();
  });

  it('clamps: beyond now + 7 days, or huge, is unknown and never throws', () => {
    for (const raw of [
      '1e18',
      '1e300',
      '1e15',
      '9e15',
      '99999999999999h',
      '99999999999999999999d',
      '700000', // > 7 days in seconds
      '8d',
      '4102444800', // year 2100 in epoch seconds
    ]) {
      expect(() => parse(raw), raw).not.toThrow();
      expect(parse(raw), raw).toBeUndefined();
    }
    expect(parse('7d')).toBe(now + 7 * day); // exactly at the limit is kept
    expect(() => parse('1e11')).not.toThrow(); // epoch ms in 1973: in the past is fine
    expect(parse('1e11')).toBe(1e11);
  });
});
