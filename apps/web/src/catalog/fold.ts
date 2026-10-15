/**
 * Case- and accent-insensitive form of a food word: lower-cased, accents and other combining marks
 * removed (`Épinards` -> `epinards`), and the ligatures NFD leaves whole spelled out (`œuf` ->
 * `oeuf`), so "oeufs" finds "Œufs". Used by the search and the classifier alike.
 */
export function foldText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');
}
