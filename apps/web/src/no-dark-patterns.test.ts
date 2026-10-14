// Pins the code-level half of the No-Dark-Patterns Standard (docs/no-dark-patterns-standard.md):
// the banned-everywhere patterns do not appear in shipped UI code. The named-reviewer sign-off
// covers copy; this covers what a parser can prove. (Port of the earlier client.)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const REPO = `${resolve(__dirname, '../../..')}/`;

/** Shipped UI sources (raw text), keyed by path under src/. Tests, the dev gallery and the i18n
 *  catalogue are excluded: the catalogue holds the footnote "No streaks, no countdowns" (copy that
 *  NAMES the ban), the gallery is not in the release bundle (tools/check_no_gallery_in_build.sh). */
const raw = import.meta.glob(
  [
    './**/*.{ts,tsx,css}',
    '!./**/*.test.*',
    '!./i18n/**',
    '!./components/gallery/**',
    '!./test/**',
    '!./**/testing/**',
    '!./**/testing.*',
    '!./**/*.d.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

/** Code with every comment removed, read from the parser (a `//` inside a URL string is kept). */
function withoutComments(path: string, source: string): string {
  if (path.endsWith('.css')) return source.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const sf = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (
      ts.isIdentifier(n) ||
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n) ||
      ts.isJsxText(n)
    ) {
      out.push(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out.join('\n');
}

// The component that renders the "no streaks" footnote names the ban; it is not a streak.
const NAMES_THE_BAN = /\bNoStreaksLine\b|\bnoStreaks\b/g;
const sources = Object.fromEntries(
  Object.entries(raw).map(([path, text]) => [
    path,
    withoutComments(path, text).replace(NAMES_THE_BAN, ''),
  ]),
);
const matching = (from: Record<string, string>, pattern: RegExp): string[] =>
  Object.entries(from)
    .filter(([, text]) => pattern.test(text))
    .map(([path]) => path);
const hits = (pattern: RegExp): string[] => matching(sources, pattern);
const STREAK = /streak|badge|confetti|fireworks|countdown/i;
const RED_LITERAL = /#f00\b|#ff0000\b|\bcolor-red\b|(?:^|[\s:(])red(?=[\s;,)])/im;
const SPINNER =
  /animate-spin|role="progressbar"|\bprogressbar\b|CircularProgress|[^\w]Spinner\b|\bspinner\b/i;

describe('No-Dark-Patterns Standard, code half', () => {
  it('reads the real UI sources (the globs are not silently empty)', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    expect(Object.keys(sources).some((p) => p.endsWith('.css'))).toBe(true);
  });

  it('no streak / badge / confetti / fireworks / countdown machinery in the UI', () => {
    expect(hits(STREAK)).toEqual([]);
  });

  it('no push-notification or re-engagement code or dependency', () => {
    expect(
      hits(/Notification\.requestPermission|PushManager|pushManager|showNotification/),
    ).toEqual([]);
    const sw = readFileSync(`${REPO}tools/pwa/sw.template.js`, 'utf8');
    expect(sw).not.toMatch(
      /\baddEventListener\(\s*['"](?:push|notificationclick|sync|periodicsync)['"]/,
    );
    for (const pkg of ['apps/web/package.json', 'packages/core/package.json', 'package.json']) {
      const json = JSON.parse(readFileSync(`${REPO}${pkg}`, 'utf8')) as Record<
        string,
        Record<string, string>
      >;
      const deps = [
        ...Object.keys(json['dependencies'] ?? {}),
        ...Object.keys(json['devDependencies'] ?? {}),
      ];
      expect(
        deps.filter((d) => /notification|onesignal|web-push|firebase|push/i.test(d)),
        pkg,
      ).toEqual([]);
    }
  });

  it('no red failure colour: no red palette utility, no red literal, no red token', () => {
    const redUtility =
      /\b(?:text|bg|border|ring|fill|stroke|from|via|to|outline|decoration|accent|caret|shadow)-red-\d/;
    expect(hits(redUtility)).toEqual([]);
    expect(hits(RED_LITERAL)).toEqual([]);
  });

  it('no progress spinner anywhere: no spinning animation, no progressbar, no <progress>', () => {
    expect(hits(SPINNER)).toEqual([]);
    expect(hits(/(?:^|\W)animation(?:-name)?:\s*[^;]*spin/i)).toEqual([]);
  });

  it('no card grid on the Day Board: the board is one hairline-divided stack, no Card component', () => {
    expect(hits(/\bCard(?:Grid)?\b/)).toEqual([]);
  });

  it('the standard still lists every banned-everywhere pattern', () => {
    const doc = readFileSync(`${REPO}docs/no-dark-patterns-standard.md`, 'utf8').toLowerCase();
    for (const term of [
      'streaks',
      'countdowns',
      'badges',
      'celebratory pop-ups',
      'push-notification re-engagement',
      'card sprawl',
      'red-guilt',
      'resolve spinners',
    ]) {
      expect(doc).toContain(term);
    }
  });

  it('the detectors fire on violating fixtures (the gate can fail)', () => {
    const bad = {
      streak: withoutComments('a.tsx', 'export const streakDays = 3;'),
      badge: withoutComments('b.tsx', 'export const B = () => <p>New badge earned</p>;'),
      red: withoutComments('c.css', '.err { color: red; }'),
      redHex: withoutComments('d.css', '.err { color: #ff0000; }'),
      spin: withoutComments('e.tsx', 'export const S = () => <i className="animate-spin" />;'),
    };
    expect(matching({ streak: bad.streak, badge: bad.badge }, STREAK)).toEqual(['streak', 'badge']);
    expect(matching({ red: bad.red, redHex: bad.redHex }, RED_LITERAL)).toEqual(['red', 'redHex']);
    expect(matching({ spin: bad.spin }, SPINNER)).toEqual(['spin']);
    const clean = withoutComments(
      'f.css',
      '.ok { color: var(--color-porcelain); } /* red streak */',
    );
    expect([STREAK, RED_LITERAL, SPINNER].some((p) => p.test(clean))).toBe(false);
  });

  it('comment stripping keeps strings and drops comments (the detector would otherwise be blind or noisy)', () => {
    const cleaned = withoutComments(
      'x.ts',
      "const u = 'https://x.y/streak'; // a streak comment\n/* badge */",
    );
    expect(cleaned).toContain('https://x.y/streak');
    expect(cleaned).not.toMatch(/comment|badge/);
  });
});
