// The accessibility-floor gate (tools/check_accessibility_floor.mjs) is itself tested: it must
// pass on this repository, and fail on a screen with no axe test, a skipped one, one that never
// asserts, and an allow-list entry that points at nothing.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

interface Report {
  readonly components: readonly { name: string; status: string }[];
  readonly problems: readonly string[];
}
type Gate = (options: {
  root: string;
  coveredBy?: Record<string, string>;
  exempt?: Record<string, string>;
}) => Report;

const REPO = resolve(__dirname, '../../..');
const load = async (): Promise<{
  checkAccessibilityFloor: Gate;
  hasAxeTest: (t: string) => boolean;
  exportedComponents: (t: string) => { name: string; aliases: string[] }[];
}> =>
  (await import(
    /* @vite-ignore */ pathToFileURL(join(REPO, 'tools/check_accessibility_floor.mjs')).href
  )) as never;

const NO_LISTS = { coveredBy: {}, exempt: {} };
const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'a11y-floor-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, 'apps/web/src', path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}

const SCREEN = { 'screens/foo/FooScreen.tsx': 'export function FooScreen() { return null; }\n' };
const GOOD_TEST = `import { axe } from 'vitest-axe';
describe('FooScreen', () => {
  it('has no axe violations', async () => {
    expect(await axe(render(<FooScreen />).container)).toHaveNoViolations();
  });
});
`;

/** The same test with the component never rendered in the axe block. */
const UNRENDERED = GOOD_TEST.replace('render(<FooScreen />).container', 'document.body');

describe('check_accessibility_floor', () => {
  it('passes on this repository: every screen component has an axe test', async () => {
    const { checkAccessibilityFloor } = await load();
    const report = checkAccessibilityFloor({ root: REPO });
    expect(report.problems).toEqual([]);
    const names = report.components.map((c) => c.name);
    for (const screen of [
      'TodayScreen',
      'WeekScreen',
      'PlateScreen',
      'UnlockScreen',
      'SettingsScreen',
      'YourAiScreen',
      'YourDataScreen',
      'PrivacyScreen',
      'InstallScreen',
      'AboutScreen',
    ]) {
      expect(names).toContain(screen);
    }
  });

  it('fails a screen that has no test at all', async () => {
    const { checkAccessibilityFloor } = await load();
    const report = checkAccessibilityFloor({ root: fixture(SCREEN), ...NO_LISTS });
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toContain('FooScreen');
  });

  it('passes a screen that is exercised by an axe test', async () => {
    const { checkAccessibilityFloor } = await load();
    const root = fixture({ ...SCREEN, 'screens/foo/FooScreen.test.tsx': GOOD_TEST });
    expect(checkAccessibilityFloor({ root, ...NO_LISTS }).problems).toEqual([]);
  });

  it('fails when the axe call is skipped, never asserted or only in a comment', async () => {
    const { checkAccessibilityFloor } = await load();
    const skipped = GOOD_TEST.replace('it(', 'it.skip(');
    const unasserted = GOOD_TEST.replace(
      'expect(await axe(render(<FooScreen />).container)).toHaveNoViolations();',
      'await axe(render(<FooScreen />).container);',
    );
    const commented = `import { axe } from 'vitest-axe';
describe('FooScreen', () => {
  it('renders', () => {
    // await axe(document.body); toHaveNoViolations()
  });
});
`;
    for (const text of [skipped, unasserted, commented]) {
      const root = fixture({ ...SCREEN, 'screens/foo/FooScreen.test.tsx': text });
      expect(checkAccessibilityFloor({ root, ...NO_LISTS }).problems, text).toHaveLength(1);
    }
  });

  it('fails when the axe test never mentions the screen', async () => {
    const { checkAccessibilityFloor } = await load();
    const other = GOOD_TEST.replaceAll('FooScreen', 'BarScreen');
    const root = fixture({ ...SCREEN, 'screens/foo/Other.test.tsx': other });
    expect(checkAccessibilityFloor({ root, ...NO_LISTS }).problems).toHaveLength(1);
  });

  it('sees axe tests written with it.each', async () => {
    const { hasAxeTest } = await load();
    const each = `it.each([1, 2])('case %i', async () => { expect(await axe(document.body)).toHaveNoViolations(); });`;
    expect(hasAxeTest(each)).toBe(true);
    expect(hasAxeTest(each.replace('it.each', 'it.skip.each'))).toBe(false);
  });

  it('fails a stale allow-list entry', async () => {
    const { checkAccessibilityFloor } = await load();
    const root = fixture({
      'screens/foo/FooScreen.tsx': 'export function FooScreen() { return null; }\n',
      'screens/foo/FooScreen.test.tsx': GOOD_TEST,
    });
    const report = checkAccessibilityFloor({ root, coveredBy: { Ghost: 'FooScreen' }, exempt: {} });
    expect(report.problems.join('\n')).toContain('stale allow-list entry');
  });

  describe('every export form is seen, and a name mentioned is not a name rendered', () => {
    const FORMS: Record<string, string> = {
      'export function': 'export function FooScreen() { return null; }\n',
      'export default function': 'export default function FooScreen() { return null; }\n',
      'export default X': 'function FooScreen() { return null; }\nexport default FooScreen;\n',
      'export { X }': 'function FooScreen() { return null; }\nexport { FooScreen };\n',
      'export { X as Y }': 'function Inner() { return null; }\nexport { Inner as FooScreen };\n',
      'export const': 'export const FooScreen = () => null;\n',
    };

    it('finds the component in each form (and skips type exports)', async () => {
      const { exportedComponents } = await load();
      for (const [form, source] of Object.entries(FORMS)) {
        expect(
          exportedComponents(source).map((c) => c.name),
          form,
        ).toEqual(['FooScreen']);
      }
      expect(exportedComponents('export type { FooScreen };\nexport { type Bar };')).toEqual([]);
      expect(exportedComponents('// export default function Ghost() {}\n')).toEqual([]);
    });

    it.each(Object.keys(FORMS))(
      '%s with no test fails; with a rendering axe test passes',
      async (form) => {
        const { checkAccessibilityFloor } = await load();
        const source = FORMS[form] as string;
        const bare = fixture({ 'screens/foo/FooScreen.tsx': source });
        expect(checkAccessibilityFloor({ root: bare, ...NO_LISTS }).problems, form).toHaveLength(1);
        const aliased = form === 'export { X as Y }';
        const jsx = aliased ? '<Inner />' : '<FooScreen />';
        const root = fixture({
          'screens/foo/FooScreen.tsx': source,
          'screens/foo/FooScreen.test.tsx': GOOD_TEST.replace('<FooScreen />', jsx),
        });
        expect(checkAccessibilityFloor({ root, ...NO_LISTS }).problems, form).toEqual([]);
      },
    );

    const flawed: Record<string, string> = {
      'a mention in a comment': UNRENDERED.replace(
        "it('has no axe violations', async () => {",
        "it('has no axe violations', async () => {\n    // <FooScreen />",
      ),
      'a mention in a string or title': UNRENDERED.replace(
        "it('has no axe violations'",
        "it('renders <FooScreen /> and has no axe violations'",
      ),
      'a mention in the describe title only': UNRENDERED,
      'rendered in a different block than the one that calls axe': `import { axe } from 'vitest-axe';
describe('FooScreen', () => {
  it('renders', () => {
    render(<FooScreen />);
  });
  it('has no axe violations', async () => {
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
`,
      'an import only': `import { FooScreen } from './FooScreen';\n${UNRENDERED}`,
    };

    it.each(Object.keys(flawed))('fails %s', async (name) => {
      const { checkAccessibilityFloor } = await load();
      const root = fixture({ ...SCREEN, 'screens/foo/FooScreen.test.tsx': flawed[name] as string });
      expect(checkAccessibilityFloor({ root, ...NO_LISTS }).problems, name).toHaveLength(1);
    });

    it('accepts a render call (not only JSX) inside the axe block', async () => {
      const { checkAccessibilityFloor } = await load();
      const text = GOOD_TEST.replace(
        'render(<FooScreen />).container',
        'renderInSession(FooScreen())',
      );
      const root = fixture({ ...SCREEN, 'screens/foo/FooScreen.test.tsx': text });
      expect(checkAccessibilityFloor({ root, ...NO_LISTS }).problems).toEqual([]);
    });
  });
});
