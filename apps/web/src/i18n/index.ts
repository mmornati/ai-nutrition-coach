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
