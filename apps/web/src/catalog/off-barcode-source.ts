/**
 * `OffBarcodeSource`: the network seam for barcode lookups (port of
 * the earlier client).
 *
 * Reads the public Open Food Facts product endpoint. No API key is needed; the endpoint is open
 * and rate-limited by source IP, which is fine for the calm, single-scan cadence of the camera.
 *
 * The request is exactly
 *
 *     GET https://world.openfoodfacts.org/api/v2/product/<barcode>?fields=<only what is parsed>
 *     Accept: application/json
 *
 * and nothing else: no Referer (`referrerPolicy: no-referrer`), no Cookie (`credentials: omit`),
 * no Authorization, no identifier. A browser does not let a page set `User-Agent`, so it is
 * omitted (the earlier client sent a descriptive one). The browser itself adds `Origin` to a
 * cross-origin request, which the privacy page says.
 *
 * Typed result, three observable outcomes:
 *  - `match`     OFF resolved the product (display name and category tags).
 *  - `notFound`  OFF answered 404 or `status: 0`, or the product has no name.
 *  - `failure`   a transport error, a timeout, a 5xx, a redirect, a body over 2 MiB, or a body
 *                that is not the expected JSON.
 *
 * Network hygiene (N3): headers within 45 s and the body within 60 s, the response read is aborted
 * past 2 MiB, redirects are never followed (see `cappedFetch`). A product record is
 * user-contributed, i.e. untrusted: the name is capped at 100 characters and the tags at 50 of
 * 100 characters each. No caching and no retries here; the offline-first cache lives one layer up.
 *
 * The barcode string is the only thing sent off-device. No camera frames, nothing about the person.
 */
import {
  isValidGrams,
  sanitizeFoodExtra,
  sanitizeNutrients,
  type CatalogFailureReason,
  type FoodExtra,
  type Nutrients,
} from '@anc/core';
import { currentLocale } from '../i18n';
import type { Locale } from '../i18n/locale';
import { cappedFetch, parseJsonBody, type FetchLike } from '../net/capped-fetch';

/**
 * The only product fields the parser reads (do not download the whole product record). The French
 * name is asked for on every request, whatever the language: the request is the same for everyone.
 */
export const OFF_FIELDS = [
  'product_name',
  'product_name_fr',
  'product_name_en',
  'generic_name',
  'brands',
  'categories_tags',
  // Nutrition (docs/adr/0006): per-100 g values, serving and pack size, third-party grades.
  'nutriments',
  'serving_quantity',
  'serving_quantity_unit',
  'serving_size',
  'product_quantity',
  'product_quantity_unit',
  'nutriscore_grade',
  'nova_group',
].join(',');

/** A whole pack is offered as a preset up to this many grams (or millilitres). */
export const MAX_OFF_PACK_GRAMS = 2000;

export const OFF_ORIGIN = 'https://world.openfoodfacts.org';

/** Longest product name kept (characters), and most / longest category tags. */
export const MAX_OFF_NAME_LENGTH = 100;
export const MAX_OFF_TAGS = 50;
export const MAX_OFF_TAG_LENGTH = 100;

export type OffBarcodeResult =
  | {
      readonly kind: 'match';
      /** The verbatim (trimmed) barcode looked up. */
      readonly barcode: string;
      /** Best-effort name, with a leading brand stripped. */
      readonly displayName: string;
      /** Lower-cased category tags, e.g. `en:spreads`. Empty when OFF ships none. */
      readonly categoryTags: readonly string[];
      /** Per-100 g values OFF knows (sanitized); absent when it has none. Missing is never zero. */
      readonly nutrientsPer100g?: Nutrients;
      /** OFF's own Nutri-Score grade / NOVA group, as third-party product information. */
      readonly extra?: FoodExtra;
      /** The producer's serving in grams (g or ml taken as grams), when valid. */
      readonly servingGrams?: number;
      /** The whole pack in grams, when valid and at most {@link MAX_OFF_PACK_GRAMS}. */
      readonly packGrams?: number;
    }
  | { readonly kind: 'notFound'; readonly barcode: string }
  | {
      readonly kind: 'failure';
      readonly barcode: string;
      readonly reason: CatalogFailureReason;
      readonly message: string;
    };

export interface OffBarcodeSource {
  /** Never throws. `locale` picks which of the product's names is preferred (default: current). */
  lookup(barcode: string, options?: { readonly locale?: Locale }): Promise<OffBarcodeResult>;
}

/** The exact request URL for `barcode` (already trimmed, non-empty). */
export function offProductUrl(barcode: string, origin: string = OFF_ORIGIN): string {
  const url = new URL(`${origin}/api/v2/product/${encodeURIComponent(barcode)}`);
  url.searchParams.set('fields', OFF_FIELDS);
  return url.toString();
}

export function createOffBarcodeSource(
  options: {
    readonly fetchImpl?: FetchLike;
    readonly origin?: string;
    /** Aborts an in-flight lookup (the session ended). */
    readonly signal?: AbortSignal;
  } = {},
): OffBarcodeSource {
  return {
    async lookup(barcode, lookupOptions) {
      const trimmed = barcode.trim();
      // A blank barcode is a UI error, not an OFF call.
      if (trimmed.length === 0) return { kind: 'notFound', barcode: trimmed };

      const result = await cappedFetch(offProductUrl(trimmed, options.origin), {
        headers: { Accept: 'application/json' },
        // Only a 2xx has a body worth reading.
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      });

      if (result.kind === 'failure') {
        const reason: CatalogFailureReason =
          result.reason === 'timeout'
            ? 'timeout'
            : result.reason === 'network'
              ? 'network'
              : result.reason === 'tooLarge'
                ? 'invalidResponse'
                : 'httpError';
        return { kind: 'failure', barcode: trimmed, reason, message: `OFF ${result.reason}` };
      }
      return parseResponse(
        trimmed,
        result.status,
        parseJsonBody(result.body),
        lookupOptions?.locale ?? currentLocale(),
      );
    },
  };
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Translate a response into the typed result. Exported so the parser is tested without a network. */
export function parseResponse(
  barcode: string,
  status: number,
  body: unknown,
  locale: Locale = currentLocale(),
): OffBarcodeResult {
  if (status === 404) return { kind: 'notFound', barcode };
  if (status < 200 || status >= 300) {
    return { kind: 'failure', barcode, reason: 'httpError', message: `OFF HTTP ${status}` };
  }
  if (!isObject(body)) {
    return {
      kind: 'failure',
      barcode,
      reason: 'invalidResponse',
      message: 'OFF body is not a JSON object',
    };
  }

  // `status` is 1 (found) or 0 (not found). 0 with no product is not-found even when the HTTP
  // status was 200: OFF's "ghost" 404.
  const found = body['status'] === 1 || body['status'] === '1';
  const product = body['product'];
  if (!found || !isObject(product)) return { kind: 'notFound', barcode };

  const name = extractDisplayName(product, locale);
  // OFF sometimes returns a found body with an empty product name (a user-submitted photo with no
  // name yet). That is not-found, so the UI hands off to manual entry instead of logging a blank.
  if (name.length === 0) return { kind: 'notFound', barcode };

  const nutrientsPer100g = extractNutrients(product['nutriments']);
  const extra = sanitizeFoodExtra({
    nutriscoreGrade: lowerText(product['nutriscore_grade']),
    novaGroup: numeric(product['nova_group']),
  });
  const servingGrams = extractAmount(product['serving_quantity'], product['serving_quantity_unit']);
  const packRaw = extractAmount(product['product_quantity'], product['product_quantity_unit']);
  const packGrams = packRaw !== undefined && packRaw <= MAX_OFF_PACK_GRAMS ? packRaw : undefined;

  return {
    kind: 'match',
    barcode,
    displayName: name,
    categoryTags: extractCategoryTags(product),
    ...(nutrientsPer100g ? { nutrientsPer100g } : {}),
    ...(extra ? { extra } : {}),
    ...(servingGrams !== undefined ? { servingGrams } : {}),
    ...(packGrams !== undefined ? { packGrams } : {}),
  };
}

/** A finite number from a number or a plain numeric string (OFF ships both); else undefined. */
function numeric(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && /^\s*-?\d{1,12}(\.\d{1,12})?\s*$/.test(v)) return Number(v);
  return undefined;
}

const lowerText = (v: unknown): string | undefined =>
  typeof v === 'string' ? v.trim().toLowerCase().slice(0, 16) : undefined;

const round2 = (n: number): number => Math.round(n * 100) / 100;

const KJ_PER_KCAL = 4.184;
/** Salt (g) = sodium (g) x 2.5, the regulation's conversion. */
const SALT_PER_SODIUM = 2.5;

/**
 * Per-100 g nutrients from OFF's `nutriments` object. Energy is `energy-kcal_100g`, or the kJ value
 * divided by 4.184 ONLY when kcal is absent; salt is `salt_100g`, or `sodium_100g` x 2.5 when absent.
 * Everything else is read as is. Untrusted: a non-number, a negative or an implausible value is
 * dropped by `sanitizeNutrients` (which also drops sugars above carbohydrate), never turned into 0.
 */
function extractNutrients(raw: unknown): Nutrients | undefined {
  if (!isObject(raw)) return undefined;
  const get = (key: string): number | undefined => numeric(raw[key]);
  const kcal = get('energy-kcal_100g');
  const kj = get('energy-kj_100g') ?? get('energy_100g');
  const salt = get('salt_100g');
  const sodium = get('sodium_100g');
  const candidate: Record<string, number | undefined> = {
    energyKcal: kcal ?? (kj !== undefined ? round2(kj / KJ_PER_KCAL) : undefined),
    protein: get('proteins_100g'),
    carbohydrate: get('carbohydrates_100g'),
    sugars: get('sugars_100g'),
    fat: get('fat_100g'),
    saturatedFat: get('saturated-fat_100g'),
    fibre: get('fiber_100g'),
    salt: salt ?? (sodium !== undefined ? round2(sodium * SALT_PER_SODIUM) : undefined),
  };
  return sanitizeNutrients(candidate);
}

/** A serving / pack size in grams: only g or ml (taken 1:1), positive and at most 5 kg. */
function extractAmount(quantity: unknown, unit: unknown): number | undefined {
  const n = numeric(quantity);
  if (n === undefined || !isValidGrams(n)) return undefined;
  if (unit !== undefined && unit !== null && unit !== '') {
    const u = lowerText(unit);
    if (u !== 'g' && u !== 'ml') return undefined;
  }
  return round2(n);
}

/** Caps `text` at `max` characters (code points, so no split surrogate pair). */
function capText(text: string, max: number = MAX_OFF_NAME_LENGTH): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, max).join('').trim();
}

/** Which product fields name a food, best first, for each language. */
const NAME_FIELDS: Readonly<Record<Locale, readonly string[]>> = {
  en: ['product_name', 'product_name_en', 'generic_name'],
  fr: ['product_name_fr', 'product_name', 'product_name_en', 'generic_name'],
};

/**
 * Best-effort product name in the person's language: English is `product_name`, else
 * `product_name_en`, else `generic_name`; French tries `product_name_fr` first. A leading brand is
 * stripped when followed by a separator ("Nutella - Ferrero" -> "Nutella"), so the name reads
 * cleanly on the match sheet.
 */
function extractDisplayName(product: Json, locale: Locale): string {
  const pick = (key: string): string | null => {
    const v = product[key];
    if (typeof v !== 'string') return null;
    const trimmed = v.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  let picked: string | null = null;
  for (const field of NAME_FIELDS[locale]) {
    picked = pick(field);
    if (picked !== null) break;
  }
  const raw = capText(picked ?? '');
  const brands = pick('brands');
  if (brands === null) return raw;
  const lower = raw.toLowerCase();
  const brandLower = (brands.toLowerCase().split(',')[0] ?? '').trim();
  if (brandLower.length === 0) return raw;
  if (lower.startsWith(`${brandLower} -`)) return raw.slice(brandLower.length + 3).trim();
  if (lower.startsWith(`${brandLower} `)) return raw.slice(brandLower.length + 1).trim();
  return raw;
}

/** OFF's `categories_tags`: lower-cased, language-prefixed tags; at most 50, 100 characters each. */
function extractCategoryTags(product: Json): string[] {
  const raw = product['categories_tags'];
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (out.length >= MAX_OFF_TAGS) break;
    if (typeof entry === 'string' && entry.length > 0) {
      out.push(capText(entry.toLowerCase(), MAX_OFF_TAG_LENGTH));
    }
  }
  return out;
}
