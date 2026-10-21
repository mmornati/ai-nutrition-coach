// `OffBarcodeSource` network hygiene (N3): request shape, timeouts, response-size cap, capped
// parsed text. Ported from the earlier client plus the
// response-parsing cases of the earlier client ("OffBarcodeSource (dio wrapper)").
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FakeFetch } from '../net/testing';
import {
  createOffBarcodeSource,
  MAX_OFF_NAME_LENGTH,
  MAX_OFF_TAGS,
  OFF_FIELDS,
  offProductUrl,
} from './off-barcode-source';

const source = (f: FakeFetch) => createOffBarcodeSource({ fetchImpl: f.fetch });

describe('the request', () => {
  it('asks only for the fields the parser reads', async () => {
    const f = new FakeFetch();
    f.jsonBody = {
      status: 1,
      product: { product_name: 'Nutella', categories_tags: [] },
    };
    const r = await source(f).lookup('3017620422003');
    expect(r.kind).toBe('match');
    const url = new URL(f.last.url);
    expect(url.searchParams.get('fields')).toBe(OFF_FIELDS);
    expect(OFF_FIELDS).toContain('product_name');
    expect(OFF_FIELDS).toContain('categories_tags');
    // The French name is asked for on every request, whatever the language.
    expect(OFF_FIELDS.split(',')).toContain('product_name_fr');
    expect(url.pathname).toBe('/api/v2/product/3017620422003');
  });

  it.each([
    // tools/webkit_smoke is a separate package and cannot import this constant; the Playwright
    // spec runs in Node outside the app bundle. Both keep a literal, so read their sources.
    '../../tools/webkit_smoke/smoke.spec.mjs',
    'e2e/capture.spec.ts',
  ])('%s pins the same OFF_FIELDS (one source of truth)', (path) => {
    const spec = readFileSync(resolve(process.cwd(), path), 'utf8');
    const m = /const OFF_FIELDS =\s*'([^']+)';/.exec(spec);
    expect(m, `OFF_FIELDS literal in ${path}`).not.toBeNull();
    expect(m?.[1]).toBe(OFF_FIELDS);
  });

  it('privacy: exactly GET /api/v2/product/<barcode>?fields= with an Accept, nothing else', async () => {
    const f = new FakeFetch();
    f.jsonBody = { status: 0 };
    await source(f).lookup(' 3017620422003 ');
    const { url: raw, init } = f.last;
    const url = new URL(raw);

    expect(init.method).toBe('GET');
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('world.openfoodfacts.org');
    expect(url.port).toBe('');
    expect(url.pathname).toBe('/api/v2/product/3017620422003');
    expect(Array.from(url.searchParams.keys())).toEqual(['fields']);
    expect(url.searchParams.get('fields')).toBe(OFF_FIELDS);
    expect(url.hash).toBe('');
    expect(url.username + url.password).toBe('');
    expect(init.body).toBeUndefined();

    // Only Accept may be sent; User-Agent cannot be set in a browser so it is omitted.
    const names = Object.keys(init.headers as Record<string, string>).map((h) => h.toLowerCase());
    expect(names).toEqual(['accept']);
    for (const forbidden of [
      'referer',
      'cookie',
      'authorization',
      'origin',
      'user-agent',
      'x-forwarded-for',
    ]) {
      expect(names).not.toContain(forbidden);
    }
    expect((init.headers as Record<string, string>)['Accept']).toBe('application/json');
    expect(OFF_FIELDS.split(',')).not.toContain('code');
    // No ambient credentials or referrer, and redirects are never followed.
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(init.redirect).toBe('manual');
  });

  it('the barcode is path-encoded, never able to change the path or query', () => {
    const url = new URL(offProductUrl('../x?y=1#z'));
    expect(url.pathname).toBe('/api/v2/product/..%2Fx%3Fy%3D1%23z');
    expect(Array.from(url.searchParams.keys())).toEqual(['fields']);
  });
});

describe('response hygiene', () => {
  it('a response past 2 MiB is aborted -> failure', async () => {
    const f = new FakeFetch();
    f.chunks = () => new Uint8Array(256 * 1024);
    const r = await source(f).lookup('1');
    expect(r.kind).toBe('failure');
    expect(f.aborted).toBeGreaterThanOrEqual(1);
    expect(f.chunksEmitted).toBeLessThan(40); // aborted near the cap
  });

  it('name and tags are capped (OFF data is user-contributed)', async () => {
    const f = new FakeFetch();
    f.jsonBody = {
      status: 1,
      product: {
        product_name: 'N'.repeat(400),
        categories_tags: Array.from({ length: 200 }, (_, i) => `en:tag-${i}`),
      },
    };
    const r = await source(f).lookup('1');
    if (r.kind !== 'match') throw new Error('expected a match');
    expect([...r.displayName].length).toBe(MAX_OFF_NAME_LENGTH);
    expect(r.categoryTags.length).toBe(MAX_OFF_TAGS);
  });

  it('each tag is capped at 100 characters and lower-cased', async () => {
    const f = new FakeFetch();
    f.jsonBody = {
      status: 1,
      product: { product_name: 'X', categories_tags: ['EN:' + 'A'.repeat(300), 7, '', 'en:ok'] },
    };
    const r = await source(f).lookup('1');
    if (r.kind !== 'match') throw new Error('expected a match');
    expect(r.categoryTags[0]).toBe(('en:' + 'a'.repeat(300)).slice(0, 100));
    expect(r.categoryTags[1]).toBe('en:ok');
    expect(r.categoryTags).toHaveLength(2);
  });

  it('a name is capped by characters, never splitting a surrogate pair', async () => {
    const f = new FakeFetch();
    f.jsonBody = { status: 1, product: { product_name: '🍎'.repeat(150) } };
    const r = await source(f).lookup('1');
    if (r.kind !== 'match') throw new Error('expected a match');
    expect([...r.displayName]).toHaveLength(100);
  });

  it('404 is not-found, 503 is a failure (the body of a non-2xx is not read)', async () => {
    const nf = new FakeFetch();
    nf.status = 404;
    nf.jsonBody = { status: 0 };
    expect((await source(nf).lookup('1')).kind).toBe('notFound');
    const err = new FakeFetch();
    err.status = 503;
    expect(await source(err).lookup('1')).toMatchObject({ kind: 'failure', reason: 'httpError' });
  });

  it('redirects are not followed; a 302 is a failure', async () => {
    const f = new FakeFetch();
    f.status = 302;
    f.responseHeaders = { location: 'https://evil.example.net/' };
    const r = await source(f).lookup('1');
    expect(r.kind).toBe('failure');
    expect(f.requests).toHaveLength(1);
    expect(f.last.init.redirect).toBe('manual');
  });

  it('a transport error is a typed failure', async () => {
    const f = new FakeFetch();
    f.error = new TypeError('Failed to fetch');
    expect(await source(f).lookup('1')).toMatchObject({ kind: 'failure', reason: 'network' });
  });

  it('a body that is not a JSON object is an invalid-response failure', async () => {
    for (const body of ['not json', '[]', 'null', '"str"']) {
      const f = new FakeFetch();
      f.jsonBody = body;
      expect(await source(f).lookup('1'), body).toMatchObject({
        kind: 'failure',
        reason: 'invalidResponse',
      });
    }
  });
});

describe('parsing', () => {
  it('HAPPY: 200 with status=1 + product maps to a match', async () => {
    const f = new FakeFetch();
    f.jsonBody = {
      status: 1,
      status_verbose: 'product found',
      product: {
        product_name: 'Nutella',
        brands: 'Ferrero',
        categories_tags: ['en:spreads', 'en:sweet-spreads'],
      },
    };
    expect(await source(f).lookup('3017620422003')).toEqual({
      kind: 'match',
      barcode: '3017620422003',
      displayName: 'Nutella',
      categoryTags: ['en:spreads', 'en:sweet-spreads'],
    });
  });

  it('NOT_FOUND_GHOST: 200 with status=0 (OFF\'s ghost 404) is not-found; "1" as a string counts as found', async () => {
    const f = new FakeFetch();
    f.jsonBody = { status: 0, product: null };
    expect(await source(f).lookup('0000000000000')).toEqual({
      kind: 'notFound',
      barcode: '0000000000000',
    });
    const g = new FakeFetch();
    g.jsonBody = { status: '1', product: { product_name: 'Jam' } };
    expect((await source(g).lookup('1')).kind).toBe('match');
  });

  it('NAME_TRIM: a leading brand is stripped when OFF prefixes the name with it', async () => {
    const f = new FakeFetch();
    f.jsonBody = {
      status: 1,
      product: { product_name: 'Nutella - hazelnut spread', brands: 'Nutella' },
    };
    const r = await source(f).lookup('3017620422003');
    expect(r).toMatchObject({ displayName: 'hazelnut spread' });
  });

  it('a brand followed by a space is stripped too; a different brand is left alone', async () => {
    const a = new FakeFetch();
    a.jsonBody = {
      status: 1,
      product: { product_name: 'Ferrero Rocher', brands: 'Ferrero, Other' },
    };
    expect(await source(a).lookup('1')).toMatchObject({ displayName: 'Rocher' });
    const b = new FakeFetch();
    b.jsonBody = { status: 1, product: { product_name: 'Rocher', brands: 'Ferrero' } };
    expect(await source(b).lookup('1')).toMatchObject({ displayName: 'Rocher' });
  });

  it('NAME_FALLBACK: product_name_en, then generic_name, when product_name is empty', async () => {
    const f = new FakeFetch();
    f.jsonBody = { status: 1, product: { product_name: '', product_name_en: 'English Name' } };
    expect(await source(f).lookup('1')).toMatchObject({ displayName: 'English Name' });
    const g = new FakeFetch();
    g.jsonBody = { status: 1, product: { generic_name: 'Generic' } };
    expect(await source(g).lookup('1')).toMatchObject({ displayName: 'Generic' });
  });

  it('NAME_LOCALE: French prefers product_name_fr, then the generic order; English is unchanged', async () => {
    const product = {
      product_name: 'Hazelnut spread',
      product_name_fr: 'Pâte à tartiner',
      product_name_en: 'English Name',
      generic_name: 'Generic',
    };
    const f = new FakeFetch();
    f.jsonBody = { status: 1, product };
    expect(await source(f).lookup('1', { locale: 'fr' })).toMatchObject({
      displayName: 'Pâte à tartiner',
    });
    // English still reads product_name first and ignores the French field.
    expect(await source(f).lookup('1', { locale: 'en' })).toMatchObject({
      displayName: 'Hazelnut spread',
    });
    // French without a French name falls back: product_name, product_name_en, generic_name.
    for (const [rest, expected] of [
      [{ product_name: 'Nom', product_name_en: 'En', generic_name: 'G' }, 'Nom'],
      [{ product_name_fr: '  ', product_name_en: 'En', generic_name: 'G' }, 'En'],
      [{ generic_name: 'Générique' }, 'Générique'],
    ] as const) {
      const g = new FakeFetch();
      g.jsonBody = { status: 1, product: rest };
      expect(await source(g).lookup('1', { locale: 'fr' })).toMatchObject({
        displayName: expected,
      });
    }
  });

  it('NAME_LOCALE: the brand is stripped from the French name too', async () => {
    const f = new FakeFetch();
    f.jsonBody = {
      status: 1,
      product: { product_name_fr: 'Nutella - pâte à tartiner', brands: 'Nutella' },
    };
    expect(await source(f).lookup('1', { locale: 'fr' })).toMatchObject({
      displayName: 'pâte à tartiner',
    });
  });

  it('NAME_BLANK: status=1 with an empty name is not-found (the UI hands off to manual entry)', async () => {
    const f = new FakeFetch();
    f.jsonBody = { status: 1, product: { product_name: '', categories_tags: [] } };
    expect((await source(f).lookup('3017620422003')).kind).toBe('notFound');
  });

  it('EMPTY_INPUT: an empty / whitespace barcode short-circuits without an HTTP call', async () => {
    const f = new FakeFetch();
    expect((await source(f).lookup('')).kind).toBe('notFound');
    expect((await source(f).lookup('   ')).kind).toBe('notFound');
    expect(f.requests).toHaveLength(0);
  });
});
