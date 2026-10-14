import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/** Proof that the i18n-literal gate (apps/web/eslint.config.js) really fails on copy in JSX. */
async function messages(code: string, filePath: string) {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === 'i18next/no-literal-string');
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

  it('accepts copy that comes from the catalogue, punctuation and class names', async () => {
    const code =
      'export const Example = ({ s }: { s: { a: string } }) => <p className="mt-2" aria-label={s.a}>{s.a} · {s.a}</p>;\n';
    expect(await messages(code, COMPONENT)).toEqual([]);
  });

  it('does not apply to tests or the gallery', async () => {
    const code = 'export const Example = () => <p>Hello there</p>;\n';
    expect(await messages(code, 'src/components/gallery/Example.tsx')).toEqual([]);
    expect(await messages(code, 'src/components/day/Example.test.tsx')).toEqual([]);
  });
});
