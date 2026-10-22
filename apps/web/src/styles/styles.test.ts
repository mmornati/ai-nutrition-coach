import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const base = read('./base.css');
const tokens = read('./tokens.css');
const day = read('../components/day/day.css');

const sources = import.meta.glob(['../components/**/*.tsx', '!../components/**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function token(name: string): string {
  const m = new RegExp(`--color-${name}: (#[0-9a-f]{6});`).exec(tokens);
  if (!m?.[1]) throw new Error(`missing colour token ${name}`);
  return m[1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('focus indicator contrast (WCAG 1.4.11, >= 3:1)', () => {
  it('ink is the ring on cloth and on raised white', () => {
    expect(contrast(token('ink'), token('cloth'))).toBeGreaterThanOrEqual(3);
    expect(contrast(token('ink'), token('raised'))).toBeGreaterThanOrEqual(3);
  });

  it('ink surfaces switch the ring to cloth, which also clears 3:1', () => {
    expect(contrast(token('cloth'), token('ink'))).toBeGreaterThanOrEqual(3);
    expect(base).toMatch(/\.on-ink :focus-visible[^{]*\{[^}]*outline-color: var\(--color-cloth\)/);
  });
});

describe('text and non-text contrast on the cloth', () => {
  it('thread text is at least 4.5:1 on cloth and on raised white', () => {
    expect(contrast(token('thread'), token('cloth'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('thread'), token('raised'))).toBeGreaterThanOrEqual(4.5);
  });

  it('control edges are at least 3:1 on their grounds', () => {
    expect(contrast(token('control'), token('cloth'))).toBeGreaterThanOrEqual(3);
    expect(contrast(token('control-raised'), token('raised'))).toBeGreaterThanOrEqual(3);
  });

  it.each(['veg', 'protein', 'starch', 'dairy'])(
    'the %s dye is at least 3:1 on cloth as a non-text stripe',
    (dye) => {
      expect(contrast(token(dye), token('cloth'))).toBeGreaterThanOrEqual(3);
    },
  );
});

describe('reduced motion', () => {
  it('keeps the .day-enter fade out of the global reduction and runs it as opacity only', () => {
    expect(base).toMatch(/\*:not\(\.day-enter\)/);
    const reduced = day.slice(day.lastIndexOf('prefers-reduced-motion'));
    expect(reduced).toMatch(/\.day-enter\s*\{\s*animation: day-fade/);
    const fade = /@keyframes day-fade\s*\{[\s\S]*?\n\}/.exec(day)?.[0] ?? '';
    expect(fade).toContain('opacity');
    expect(fade).not.toContain('transform');
  });
});

describe('text scaling', () => {
  it('no type token size is in pixels', () => {
    expect(tokens).toMatch(/--text-display: 3\.125rem;/);
    expect(tokens).not.toMatch(/--text-[a-z-]+: [\d.]+px;/);
  });

  it('no component sets a font size in arbitrary pixels', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    for (const [file, src] of Object.entries(sources)) {
      expect(src, file).not.toMatch(/text-\[[\d.]+px\]/);
    }
  });
});
