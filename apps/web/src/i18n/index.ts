import { en, type Strings } from './en';

export type { Strings };

/** Replace `{name}` placeholders. A missing variable is left visible rather than hidden. */
export function fill(template: string, vars: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = vars[key];
    return value === undefined ? whole : String(value);
  });
}

const active: Strings = en;

/** Phase 3 has one locale; phase 7 swaps this for a context-backed locale switch. */
export function useStrings(): Strings {
  return active;
}

/** Non-hook access for code outside React (tests, formatters). */
export function strings(): Strings {
  return active;
}

export interface PluralForms {
  readonly zero?: string;
  readonly one: string;
  readonly other: string;
}

const pluralRules = new Intl.PluralRules('en');

/** Pick the form for `count` (an explicit `zero` wins at 0), then fill `{count}`. */
export function plural(forms: PluralForms, count: number): string {
  const template =
    count === 0 && forms.zero !== undefined
      ? forms.zero
      : forms[pluralRules.select(count) === 'one' ? 'one' : 'other'];
  return fill(template, { count });
}

const listFormat = new Intl.ListFormat('en-GB', { style: 'long', type: 'conjunction' });

/** "a", "a and b", "a, b and c". */
export const joinNames = (names: readonly string[]): string => listFormat.format(names);

const unitFormat = new Intl.ListFormat('en-GB', { style: 'short', type: 'unit' });

/** "a", "a, b", "a, b, c": a plain run of items with no conjunction. */
export const joinPlain = (names: readonly string[]): string => unitFormat.format(names);

export const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
