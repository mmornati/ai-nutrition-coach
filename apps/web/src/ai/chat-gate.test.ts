// The raw text chat (`AiServices.chat`) sends whatever it is given and asks no consent. Only the
// consent-gated `CoachingAi` may use it: no code outside src/ai reaches for it.
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob(
  [
    '../**/*.{ts,tsx}',
    '!../ai/**',
    '!../**/*.test.*',
    '!../**/testing.*',
    '!../**/testing/**',
    '!../**/*.d.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const REACHES_FOR_RAW_CHAT =
  /\bai\.chat\b|\bservices\.chat\b|\.chat\.completeChat\b|\bcompleteChat\b|\{[^}]*\bchat\b[^}]*\}\s*=\s*(?:useAiServices\(\)|useSession\(\)\.ai\b|session\.ai\b|ai\b)/;

describe('the ungated text chat stays inside src/ai', () => {
  it('reads the real sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
  });

  it('no file outside src/ai uses AiServices.chat or completeChat', () => {
    const offenders = Object.entries(sources)
      .filter(([, text]) => REACHES_FOR_RAW_CHAT.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('the detector fires on violating fixtures', () => {
    for (const bad of [
      'session.ai.chat.completeChat(m)',
      'const { chat } = useAiServices();',
      'const chat = services.chat;',
      'await port.completeChat(messages)',
    ]) {
      expect(REACHES_FOR_RAW_CHAT.test(bad), bad).toBe(true);
    }
  });
});
