import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/** Proof that the i18n-literal gate (apps/web/eslint.config.js) really fails on copy in JSX. */
async function messages(code: string, filePath: string) {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) =>
    ['i18next/no-literal-string', 'no-restricted-syntax'].includes(m.ruleId ?? ''),
  );
}

const COMPONENT = 'src/components/day/Example.tsx';

describe('i18n literal gate', () => {
  it('rejects a text literal in JSX', async () => {
    expect(
      await messages('export const Example = () => <p>Hello there</p>;\n', COMPONENT),
    ).toHaveLength(1);
  });

  it.each(['aria-label', 'title', 'alt', 'placeholder'])('rejects a literal %s', async (attr) => {
    const code = `export const Example = () => <input ${attr}="Search foods" />;\n`;
    expect(await messages(code, COMPONENT)).toHaveLength(1);
  });

  const REJECTED: Record<string, string> = {
    'a ternary child':
      'export const Example = ({ x }: { x: boolean }) => <p>{x ? "Yes it is" : "No way"}</p>;',
    'a template-literal child':
      'export const Example = ({ x }: { x: string }) => <p>{`Hello there ${x}`}</p>;',
    'a concatenated child':
      'export const Example = ({ x }: { x: string }) => <p>{"Hello there " + x}</p>;',
    'a logical child':
      'export const Example = ({ x }: { x: boolean }) => <p>{x && "Shown only when"}</p>;',
    "aria-label={'...'}": "export const Example = () => <p aria-label={'Search foods'} />;",
    'a template aria-label':
      'export const Example = ({ n }: { n: number }) => <p aria-label={`Row ${n} of the list`} />;',
    'aria-valuetext': 'export const Example = () => <p aria-valuetext="Halfway there" />;',
    'label= on a custom component': 'export const Example = () => <Field label="Search foods" />;',
    'title= on a custom component': 'export const Example = () => <Panel title="Your plates" />;',
    'placeholder= on a custom component':
      'export const Example = () => <Field placeholder="Search foods" />;',
    'description= on a custom component':
      'export const Example = () => <Row description="Shown under the title" />;',
    'a *Label prop on a custom component':
      'export const Example = () => <Row confirmLabel="Yes, remove it" />;',
    'a string passed to a setter for display': `import { useState } from 'react';
export function Example() {
  const [message, setMessage] = useState('');
  return <button type="button" onClick={() => setMessage('Something went wrong')}>{message}</button>;
}
`,
    'a display string in state': `import { useState } from 'react';
export function Example() {
  const [message] = useState('Nothing logged yet');
  return <p>{message}</p>;
}
`,
    'a display string in an object': `export function Example() {
  const row = { text: 'Nothing logged yet' };
  return <p>{row.text}</p>;
}
`,
  };

  it.each(Object.keys(REJECTED))('rejects %s', async (name) => {
    expect((await messages(REJECTED[name] as string, COMPONENT)).length, name).toBeGreaterThan(0);
  });

  it('accepts what is not copy: ids, union members, class names, selectors, errors, routes', async () => {
    const code = `import { useState } from 'react';
type Kind = 'closed' | 'open';
const cn = (...parts: string[]) => parts.join(' ');
export function Example({ s, id }: { s: { a: string }; id: string }) {
  const [kind, setKind] = useState<Kind>('closed');
  const field = \`\${id}-msg\`;
  if (!id) throw new Error('Example needs an id');
  document.querySelector('[data-autofocus]');
  return (
    <section
      id={field}
      role="status"
      aria-live="polite"
      aria-current="page"
      aria-labelledby={field}
      data-testid="open-plate"
      className={cn('grid size-12 border-2', kind === 'open' ? 'border-ink' : 'border-control')}
    >
      <a href="#/week" onClick={() => setKind('open')}>{s.a}</a>
      <input type="text" name="q" autoComplete="off" aria-label={s.a} />
      {' · '}
    </section>
  );
}
`;
    expect(await messages(code, COMPONENT)).toEqual([]);
  });

  it('accepts copy that comes from the catalogue, punctuation and class names', async () => {
    const code =
      'export const Example = ({ s }: { s: { a: string } }) => <p className="mt-2" aria-label={s.a}>{s.a} · {s.a}</p>;\n';
    expect(await messages(code, COMPONENT)).toEqual([]);
  });

  it('covers the app root', async () => {
    const code = 'export const App = () => <h1>Today</h1>;\n';
    expect(await messages(code, 'src/App.tsx')).toHaveLength(1);
  });

  it.each([
    'src/screens/settings/Example.tsx',
    'src/screens/gate/Example.tsx',
    'src/app/Example.tsx',
    'src/ai/Example.tsx',
    'src/capture/Example.tsx',
    'src/some-new-folder/Example.tsx',
  ])('covers %s', async (path) => {
    const code = 'export const Example = () => <p aria-label="Search foods">Hello there</p>;\n';
    expect(await messages(code, path)).toHaveLength(2);
  });

  it('does not apply to tests or the gallery', async () => {
    const code = 'export const Example = () => <p>Hello there</p>;\n';
    expect(await messages(code, 'src/components/gallery/Example.tsx')).toEqual([]);
    expect(await messages(code, 'src/components/day/Example.test.tsx')).toEqual([]);
  });
});
