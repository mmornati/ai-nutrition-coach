/**
 * The searchable CIQUAL table: loader, token index and ranking.
 *
 * LOADING. The table (`public/catalog/ciqual-2025.json`, ~500 kB, precached by the service worker) is
 * fetched from the app's own origin, once, on the first search, by an injectable {@link CiqualLoader}
 * (tests pass their own; nothing leaves the device and no new host is involved). A failed load is
 * not fatal: the catalog keeps answering with the curated foods alone (which carry their own
 * nutrients) and retries later with a growing delay. A file that arrives but cannot be parsed is not
 * downloaded again after the second attempt in a session. This request is the one fetch the
 * search path makes, to the app's own origin only (docs/telemetry-posture.md).
 *
 * INDEX. Built once per table: for each food the French and English names are folded (lower-case, no
 * accents, `oe` ligatures spelled out), split into tokens, lightly stemmed (a trailing plural
 * `s` / `x`) and stripped of French / English glue words ("de", "au", "et"...; "sans" / "without"
 * stay, they change the meaning). Foods with neither energy nor protein are
 * left out: a row with no number to show (25 of 3,484, mostly generic placeholders) cannot feed a
 * nutrient bar and would only add noise to the results.
 *
 * SEARCH. A name matches when EVERY query token matches one of its tokens: exactly (1.0) or as a
 * prefix (0.7, so "past" finds "pasta" while typing). The score blends the mean token score (0.35),
 * a bonus when the name STARTS with the first query word (0.25; CIQUAL puts the main noun first:
 * "Riz blanc, cuit...") and specificity, the share of the name the query covers (0.4), so the short
 * generic "Pain blanc" outranks "Pain au chocolat et aux amandes" for "pain"; CIQUAL's generic
 * "(aliment moyen)" row gets a small extra. Either language's name may match, whatever the UI
 * language (the other language counts x0.85); the display name follows the UI language. Ties: fewer name tokens, then code.
 * Meat, poultry, fish and eggs (group 04) are offered cooked / ready-to-eat first: a raw row
 * ("Poulet, viande crue") loses {@link RAW_ANIMAL_PENALTY} and a cooked or prepared one gains a
 * little, unless the query says "cru" / "raw" (see {@link animalBias}); raw rows stay in the list.
 * TYPOS. When fewer than {@link FUZZY_TRIGGER} (3) foods match exactly or by prefix, query words
 * of {@link FUZZY_MIN_LENGTH} (5) letters or more are also matched against the vocabulary of index
 * tokens at edit distance 1 (one insert, delete, substitution or swap of two neighbours:
 * "brocolli" -> "brocoli", "yogourt" -> "yogurt"). Shorter words never fuzzy-match. The vocabulary is
 * built once, lazily, and bucketed by length, so a fallback compares a word with the few hundred
 * tokens of length +-1, not with every row. Typo hits always come after the exact / prefix ones. A linear scan over ~3.4k entries with precomputed
 * tokens; typical queries take about a millisecond (see the benchmark test).
 */
import type { DatabaseFood, FoodGroup, Nutrients } from '@anc/core';
import { databaseFood } from '@anc/core';
import type { Locale } from '../i18n/locale';
import { CIQUAL_FILE, ciqualFoods, type CiqualFood, type CiqualTable } from './ciqual';
import { ciqualFoodGroup } from './ciqual-groups';
import { foldText } from './fold';

/** Supplies the table. Rejects when it cannot (offline and not precached, bad file). */
export type CiqualLoader = () => Promise<CiqualTable>;

/** The file arrived but is not a usable table: downloading it again will not help. */
export class CiqualParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CiqualParseError';
  }
}

export const CIQUAL_SOURCE_PREFIX = 'ciqual:';

type FetchFn = (input: string) => Promise<Response>;

/**
 * Loads the table from the app's own origin: `<BASE_URL>catalog/ciqual-2025.json`. The service
 * worker answers from the precache when offline.
 */
export function createCiqualFetchLoader(
  options: { readonly baseUrl?: string; readonly fetchImpl?: FetchFn } = {},
): CiqualLoader {
  return async () => {
    const base = options.baseUrl ?? import.meta.env.BASE_URL;
    const doFetch: FetchFn = options.fetchImpl ?? ((url) => globalThis.fetch(url));
    const response = await doFetch(`${base}catalog/${CIQUAL_FILE}`);
    if (!response.ok) throw new Error(`CIQUAL table HTTP ${response.status}`);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new CiqualParseError('CIQUAL table is not valid JSON');
    }
    if (
      typeof body !== 'object' ||
      body === null ||
      !Array.isArray((body as { foods?: unknown }).foods)
    ) {
      throw new CiqualParseError('CIQUAL table is not the expected JSON');
    }
    return body as CiqualTable;
  };
}

const STOP_WORDS: ReadonlySet<string> = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'au',
  'aux',
  'et',
  'ou',
  'en',
  'un',
  'une',
  'a',
  'd',
  'l',
  'the',
  'of',
  'and',
  'with',
  'or',
  'in',
  'to',
]);

/** Words whose plural-looking end is part of the word (pâtes vs pâté), kept as typed. */
const KEEP_FORM: ReadonlySet<string> = new Set([
  'pates',
  'pois',
  'mais',
  'riz',
  'noix',
  'bas',
  'sans',
  'plus',
]);

function stem(token: string): string {
  if (token.length <= 3 || KEEP_FORM.has(token)) return token;
  return token.endsWith('s') || token.endsWith('x') ? token.slice(0, -1) : token;
}

/** Folded, stemmed, stop-word-free tokens of a name or query. */
export function indexTokens(raw: string): string[] {
  const out: string[] = [];
  for (const t of foldText(raw).split(/[^a-z0-9]+/)) {
    if (t.length > 0 && !STOP_WORDS.has(t)) out.push(stem(t));
  }
  return out;
}

export interface CiqualEntry {
  readonly code: string;
  readonly nameFr: string;
  readonly nameEn: string;
  readonly groupCode: string;
  readonly subgroupCode: string | undefined;
  readonly nutrients: Nutrients;
  /** @internal */ readonly frTokens: readonly string[];
  /** @internal */ readonly enTokens: readonly string[];
}

export interface CiqualHit {
  readonly entry: CiqualEntry;
  /** 0..1, higher is a better match. */
  readonly score: number;
}

const MAX_QUERY_TOKENS = 8;
const MAX_QUERY_LENGTH = 100;

/** Score of `query` tokens against `name` tokens: 0 when any query token has no match. */
function scoreName(query: readonly string[], name: readonly string[]): number {
  if (name.length === 0) return 0;
  let total = 0;
  let head = 0;
  for (const [i, q] of query.entries()) {
    let best = 0;
    for (const [j, n] of name.entries()) {
      const s = n === q ? 1 : n.startsWith(q) ? 0.7 : 0;
      if (s > best) best = s;
      if (i === 0 && j === 0 && s > 0) head = 1;
    }
    if (best === 0) return 0;
    total += best;
  }
  const mean = total / query.length;
  const specificity = Math.min(1, query.length / name.length);
  // "(aliment moyen)" / "(average)" marks CIQUAL's generic row of a food: the one to offer first.
  const generic = name.includes('moyen') || name.includes('average') ? 0.06 : 0;
  return Math.min(1, 0.35 * mean + 0.25 * head + 0.4 * specificity + generic);
}

/** Sub-groups of tubers, pulses and pasta / rice / grains, where raw and cooked rows both exist. */
const COOKABLE_SUBGROUPS: ReadonlySet<string> = new Set(['0202', '0203', '0301']);
const COOKED_WORDS: ReadonlySet<string> = new Set(['cuit', 'cooked', 'boiled', 'bouilli']);
const RAW_WORDS: ReadonlySet<string> = new Set([
  'cru',
  'crue', // "crues" stems to "crue"
  'raw',
  'sec',
  'seche',
  'dry',
  'dried',
]);
/** How much a cooked row gains (a raw or dry one loses) when the query does not say "raw" / "dry". */
const COOKED_BIAS = 0.15;

/**
 * "riz" means the cooked rice on the plate, not the dry grain in the bag: for tubers, pulses, pasta,
 * rice and grains, cooked rows rank above raw / dry ones unless the query itself says "cru", "raw",
 * "sec" or "dry".
 */
function cookedBias(entry: CiqualEntry, queryWantsRaw: boolean): number {
  if (queryWantsRaw || entry.subgroupCode === undefined) return 0;
  if (!COOKABLE_SUBGROUPS.has(entry.subgroupCode)) return 0;
  const tokens = [...entry.frTokens, ...entry.enTokens];
  if (tokens.some((t) => RAW_WORDS.has(t))) return -COOKED_BIAS;
  if (tokens.some((t) => COOKED_WORDS.has(t))) return COOKED_BIAS;
  return 0;
}

/** Words that say a meat / fish row is cooked or ready to eat (stemmed, folded; French and English). */
const READY_WORDS: ReadonlySet<string> = new Set([
  ...COOKED_WORDS,
  'cuite',
  'grille',
  'roti',
  'rotie',
  'poele',
  'braise',
  'braisee',
  'saute',
  'vapeur',
  'frit',
  'frite',
  'fume',
  'fumee',
  'preemballe',
  'preemballee',
  'appertise',
  'appertisee',
  'grilled',
  'roasted',
  'fried',
  'braised',
  'steamed',
  'baked',
  'smoked',
  'prepacked',
  'canned',
]);
/** Folded raw markers for animal foods ("sec" is left out: dry-cured ham is ready to eat). */
const RAW_ANIMAL_WORDS: ReadonlySet<string> = new Set(['cru', 'crue', 'raw']);
/** Penalty of a raw meat / fish / egg row, and the small gain of a cooked or ready-to-eat one. */
const RAW_ANIMAL_PENALTY = 0.1;
const READY_ANIMAL_BONUS = 0.03;

/**
 * "poulet" means something to eat, not the raw bird: in CIQUAL group 04 (meat, eggs, fish) a row
 * marked raw ("cru", "crue", "raw", either language) drops {@link RAW_ANIMAL_PENALTY} and a cooked
 * or prepared one gains {@link READY_ANIMAL_BONUS}, unless the query itself says raw / cooked
 * ({@link cookedBias} handles tubers and grains). Deterministic and small enough that name match
 * quality still decides; raw rows are lower, never removed.
 */
function animalBias(entry: CiqualEntry, queryWantsRaw: boolean): number {
  if (queryWantsRaw || entry.groupCode !== '04') return 0;
  const tokens = [...entry.frTokens, ...entry.enTokens];
  if (tokens.some((t) => RAW_ANIMAL_WORDS.has(t))) return -RAW_ANIMAL_PENALTY;
  if (tokens.some((t) => READY_WORDS.has(t))) return READY_ANIMAL_BONUS;
  return 0;
}

/** Fewer exact / prefix hits than this lets the typo fallback run. */
const FUZZY_TRIGGER = 3;
/** Only query words at least this long are matched at edit distance 1 (short words are too ambiguous). */
const FUZZY_MIN_LENGTH = 5;
/** Weight of a token reached through a typo correction (below a prefix, 0.7). */
const FUZZY_TOKEN_SCORE = 0.5;

/** True when `a` and `b` differ by exactly one insertion, deletion, substitution or adjacent swap. */
export function withinOneEdit(a: string, b: string): boolean {
  const la = a.length;
  const lb = b.length;
  if (a === b || Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    let first = -1;
    for (let i = 0; i < la; i++) {
      if (a.charCodeAt(i) === b.charCodeAt(i)) continue;
      if (first < 0) {
        first = i;
        continue;
      }
      // second mismatch: only an adjacent swap is still one edit
      return (
        i === first + 1 &&
        a.charCodeAt(first) === b.charCodeAt(i) &&
        a.charCodeAt(i) === b.charCodeAt(first) &&
        a.slice(i + 1) === b.slice(i + 1)
      );
    }
    return true; // exactly one substitution
  }
  const [shorter, longer] = la < lb ? [a, b] : [b, a];
  let i = 0;
  while (i < shorter.length && shorter.charCodeAt(i) === longer.charCodeAt(i)) i++;
  return shorter.slice(i) === longer.slice(i + 1);
}

/** Score of a name for a query whose words each carry their typo corrections (see {@link FUZZY_TRIGGER}). */
function scoreNameFuzzy(
  query: readonly string[],
  fixes: readonly ReadonlySet<string>[],
  name: readonly string[],
): number {
  if (name.length === 0) return 0;
  let total = 0;
  for (const [i, q] of query.entries()) {
    let best = 0;
    for (const n of name) {
      const s =
        n === q
          ? 1
          : n.startsWith(q)
            ? 0.7
            : (fixes[i] as Set<string>).has(n)
              ? FUZZY_TOKEN_SCORE
              : 0;
      if (s > best) best = s;
    }
    if (best === 0) return 0;
    total += best;
  }
  const mean = total / query.length;
  const specificity = Math.min(1, query.length / name.length);
  return Math.min(1, 0.35 * mean + 0.4 * specificity);
}

/** A match through the name in the other language than the UI's counts a little less. */
const OTHER_LANGUAGE = 0.85;

/** Best score first; ties: fewer name tokens, then code (stable and deterministic). */
function byScore(a: CiqualHit, b: CiqualHit): number {
  return (
    b.score - a.score ||
    a.entry.frTokens.length - b.entry.frTokens.length ||
    (a.entry.code < b.entry.code ? -1 : a.entry.code > b.entry.code ? 1 : 0)
  );
}

export class CiqualIndex {
  private readonly entries: readonly CiqualEntry[];
  private readonly byCodeMap: ReadonlyMap<string, CiqualEntry>;
  private readonly groups = new Map<string, FoodGroup>();
  /** Every distinct index token, bucketed by length (built on the first typo fallback). */
  private vocabulary: Map<number, string[]> | null = null;

  private constructor(entries: readonly CiqualEntry[]) {
    this.entries = entries;
    this.byCodeMap = new Map(entries.map((e) => [e.code, e]));
  }

  /** Builds the index; throws a {@link CiqualParseError} when the table has the wrong shape. */
  static fromTable(table: CiqualTable): CiqualIndex {
    const entries: CiqualEntry[] = [];
    let foods: ReturnType<typeof ciqualFoods>;
    try {
      foods = ciqualFoods(table);
    } catch (e) {
      throw new CiqualParseError(e instanceof Error ? e.message : 'bad CIQUAL table');
    }
    for (const food of foods) {
      if (!isUseful(food)) continue;
      entries.push({
        code: food.code,
        nameFr: food.nameFr,
        nameEn: food.nameEn,
        groupCode: food.groupCode,
        subgroupCode: food.subgroupCode,
        nutrients: food.per100g,
        frTokens: indexTokens(food.nameFr),
        enTokens: indexTokens(food.nameEn),
      });
    }
    return new CiqualIndex(entries);
  }

  get size(): number {
    return this.entries.length;
  }

  byCode(code: string): CiqualEntry | undefined {
    return this.byCodeMap.get(code);
  }

  /** The best `limit` matches for `query`, best first. Empty for a blank query. */
  search(
    query: string,
    limit: number,
    options: { readonly exclude?: ReadonlySet<string>; readonly locale?: Locale } = {},
  ): CiqualHit[] {
    const { exclude, locale = 'en' } = options;
    const tokens = indexTokens(query.slice(0, MAX_QUERY_LENGTH)).slice(0, MAX_QUERY_TOKENS);
    if (tokens.length === 0 || limit <= 0) return [];
    const hits: CiqualHit[] = [];
    const queryWantsRaw = tokens.some((t) => RAW_WORDS.has(t) || COOKED_WORDS.has(t));
    for (const entry of this.entries) {
      if (exclude?.has(entry.code)) continue;
      const fr = scoreName(tokens, entry.frTokens);
      const en = scoreName(tokens, entry.enTokens);
      const base =
        locale === 'fr' ? Math.max(fr, en * OTHER_LANGUAGE) : Math.max(en, fr * OTHER_LANGUAGE);
      if (base > 0) {
        const bias = cookedBias(entry, queryWantsRaw) + animalBias(entry, queryWantsRaw);
        const score = Math.min(1, Math.max(0.01, base + bias));
        hits.push({ entry, score });
      }
    }
    hits.sort(byScore);
    if (hits.length >= FUZZY_TRIGGER) return hits.slice(0, limit);
    const typo = this.typoHits(tokens, hits, locale, queryWantsRaw, exclude);
    return hits.concat(typo).slice(0, limit);
  }

  /**
   * Hits reached only through a one-edit correction of a long query word, ranked after `exact`
   * (their scores are capped at the lowest exact one). Empty when no word qualifies.
   */
  private typoHits(
    tokens: readonly string[],
    exact: readonly CiqualHit[],
    locale: Locale,
    queryWantsRaw: boolean,
    exclude: ReadonlySet<string> | undefined,
  ): CiqualHit[] {
    const fixes = tokens.map((q) => this.corrections(q));
    if (fixes.every((f) => f.size === 0)) return [];
    const seen = new Set(exact.map((h) => h.entry.code));
    const cap = exact.length > 0 ? (exact[exact.length - 1] as CiqualHit).score : 1;
    const out: CiqualHit[] = [];
    for (const entry of this.entries) {
      if (seen.has(entry.code) || exclude?.has(entry.code)) continue;
      const fr = scoreNameFuzzy(tokens, fixes, entry.frTokens);
      const en = scoreNameFuzzy(tokens, fixes, entry.enTokens);
      const base =
        locale === 'fr' ? Math.max(fr, en * OTHER_LANGUAGE) : Math.max(en, fr * OTHER_LANGUAGE);
      if (base <= 0) continue;
      const bias = cookedBias(entry, queryWantsRaw) + animalBias(entry, queryWantsRaw);
      out.push({ entry, score: Math.min(cap, Math.max(0.01, base * 0.8 + bias)) });
    }
    return out.sort(byScore);
  }

  /** Index tokens one edit away from `q` (empty for a word shorter than {@link FUZZY_MIN_LENGTH}). */
  private corrections(q: string): ReadonlySet<string> {
    const out = new Set<string>();
    if (q.length < FUZZY_MIN_LENGTH) return out;
    const vocabulary = this.vocabularyByLength();
    for (let len = q.length - 1; len <= q.length + 1; len++) {
      for (const t of vocabulary.get(len) ?? []) if (withinOneEdit(q, t)) out.add(t);
    }
    return out;
  }

  private vocabularyByLength(): Map<number, string[]> {
    if (this.vocabulary === null) {
      const distinct = new Set<string>();
      for (const e of this.entries) {
        for (const t of e.frTokens) distinct.add(t);
        for (const t of e.enTokens) distinct.add(t);
      }
      const buckets = new Map<number, string[]>();
      for (const t of distinct) {
        const bucket = buckets.get(t.length);
        if (bucket === undefined) buckets.set(t.length, [t]);
        else bucket.push(t);
      }
      this.vocabulary = buckets;
    }
    return this.vocabulary;
  }

  /** The app's food group for an entry (memoised; name-based rules cost a classification). */
  groupOf(entry: CiqualEntry): FoodGroup {
    let group = this.groups.get(entry.code);
    if (group === undefined) {
      group = ciqualFoodGroup({
        groupCode: entry.groupCode,
        ...(entry.subgroupCode !== undefined ? { subgroupCode: entry.subgroupCode } : {}),
        nameFr: entry.nameFr,
      });
      this.groups.set(entry.code, group);
    }
    return group;
  }
}

/** A row with at least an energy or a protein value; the rest has nothing to show. */
function isUseful(food: CiqualFood): boolean {
  return food.per100g.energyKcal !== undefined || food.per100g.protein !== undefined;
}

/** The entry's name in `locale`, falling back to the other language when empty. */
export function ciqualName(entry: CiqualEntry, locale: Locale): string {
  const primary = locale === 'fr' ? entry.nameFr : entry.nameEn;
  const other = locale === 'fr' ? entry.nameEn : entry.nameFr;
  return primary.trim().length > 0 ? primary : other;
}

/** The `DatabaseFood` a CIQUAL entry logs as (`ciqual:<code>`, stable across releases of the app). */
export function ciqualDatabaseFood(
  index: CiqualIndex,
  entry: CiqualEntry,
  locale: Locale,
): DatabaseFood {
  return databaseFood({
    sourceRef: `${CIQUAL_SOURCE_PREFIX}${entry.code}`,
    displayName: ciqualName(entry, locale),
    source: 'ciqual',
    foodGroup: index.groupOf(entry),
    nutrientsPer100g: entry.nutrients,
  });
}
