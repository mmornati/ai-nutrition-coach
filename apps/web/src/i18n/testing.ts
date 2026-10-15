// Test support for the catalogues. Test-only: nothing in the app imports this.
import { en } from './en';
import { fr } from './fr';

/** Every string leaf of a catalogue, by its dotted path (array items by index). */
export function catalogueLeaves(node: unknown, path = ''): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof node === 'string') {
    out.set(path, node);
  } else if (Array.isArray(node)) {
    node.forEach((item, i) =>
      catalogueLeaves(item, `${path}[${i}]`).forEach((v, k) => out.set(k, v)),
    );
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      catalogueLeaves(value, path ? `${path}.${key}` : key).forEach((v, k) => out.set(k, v));
    }
  }
  return out;
}

/**
 * Pieces of English copy that must not appear on a French screen: the literal runs of every
 * English string that French words differently (placeholders split them), kept when they are a
 * phrase of two words or more, or a single word of five letters or more.
 */
const ENGLISH_PIECES: readonly string[] = (() => {
  const same = new Set(catalogueLeaves(fr).values());
  const out = new Set<string>();
  for (const text of catalogueLeaves(en).values()) {
    if (same.has(text)) continue;
    for (const part of text.split(/\{\w+\}/)) {
      const piece = part.trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
      if (/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(piece) || /^[A-Za-z]{5,}$/.test(piece)) out.add(piece);
    }
  }
  return [...out];
})();

const COPY_ATTRIBUTES = ['aria-label', 'aria-description', 'placeholder', 'title', 'alt'];

/** The text under `node`, with a space between elements (textContent would glue "Your dataexport"). */
const spacedText = (node: Node): string =>
  node.nodeType === Node.TEXT_NODE
    ? (node.nodeValue ?? '')
    : [...node.childNodes].map(spacedText).join(' ');

/** Every piece of English copy found in `root`'s text or its copy-carrying attributes. */
export function englishLeaks(root: Element = document.body): string[] {
  const texts = [spacedText(root)];
  for (const el of root.querySelectorAll('*')) {
    for (const name of COPY_ATTRIBUTES) {
      const value = el.getAttribute(name);
      if (value) texts.push(value);
    }
  }
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return ENGLISH_PIECES.filter((piece) => {
    const pattern = new RegExp(`(?<![A-Za-z])${escape(piece)}(?![A-Za-z])`);
    return texts.some((text) => pattern.test(text));
  });
}
