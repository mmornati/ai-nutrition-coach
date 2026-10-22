import { describe, expect, it } from 'vitest';
import {
  expandUpcE,
  gtinCheckDigitOk,
  OFF_ADD_PRODUCT_URL,
  offAddProductUrl,
  parseRetailCode,
} from './retail-code';

describe('gtinCheckDigitOk', () => {
  it.each(['3017620422003', '4006381333931', '96385074', '036000291452'])('%s is valid', (c) => {
    expect(gtinCheckDigitOk(c)).toBe(true);
  });
  it.each(['3017620422004', '96385075', '036000291453', '', '1', 'abc'])('%s is not', (c) => {
    expect(gtinCheckDigitOk(c)).toBe(false);
  });
});

describe('expandUpcE', () => {
  it('expands the documented forms (last digit 0-2, 3, 4, 5-9)', () => {
    expect(expandUpcE('04252614')).toBe('042100005264'); // the Wikipedia example
    expect(expandUpcE('01234513')?.slice(0, 11)).toBe('01210000345'); // last digit 1
    expect(expandUpcE('01234533')?.slice(0, 11)).toBe('01230000045'); // 3
    expect(expandUpcE('01234543')?.slice(0, 11)).toBe('01234000005'); // 4
    expect(expandUpcE('01234593')?.slice(0, 11)).toBe('01234500009'); // 9
  });
  it('only number systems 0 and 1, 8 digits', () => {
    expect(expandUpcE('21234565')).toBeNull();
    expect(expandUpcE('0123456')).toBeNull();
  });
});

describe('parseRetailCode', () => {
  it('accepts EAN-13, EAN-8 and UPC-A, ignoring spaces and dashes', () => {
    expect(parseRetailCode('3017620422003')).toEqual({ ok: true, code: '3017620422003' });
    expect(parseRetailCode('3 017620 422003')).toEqual({ ok: true, code: '3017620422003' });
    expect(parseRetailCode('96385074')).toEqual({ ok: true, code: '96385074' });
    expect(parseRetailCode('036000291452')).toEqual({ ok: true, code: '036000291452' });
    expect(parseRetailCode('036-000-291452')).toEqual({ ok: true, code: '036000291452' });
    expect(parseRetailCode('04252614')).toEqual({ ok: true, code: '04252614' }); // UPC-E
  });
  it('rejects a wrong length, non-digits, and a bad check digit', () => {
    expect(parseRetailCode('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseRetailCode('  ')).toEqual({ ok: false, reason: 'empty' });
    expect(parseRetailCode('12345')).toEqual({ ok: false, reason: 'length' });
    expect(parseRetailCode('30176204220a3')).toEqual({ ok: false, reason: 'length' });
    expect(parseRetailCode('3017620422004')).toEqual({ ok: false, reason: 'checksum' });
    expect(parseRetailCode('04252615')).toEqual({ ok: false, reason: 'checksum' });
  });
});

describe('offAddProductUrl', () => {
  it('is the Open Food Facts add-product page for a valid code, built from the checked digits', () => {
    expect(OFF_ADD_PRODUCT_URL).toBe(
      'https://world.openfoodfacts.org/cgi/product.pl?type=add&code=',
    );
    expect(offAddProductUrl('3017620422003')).toBe(`${OFF_ADD_PRODUCT_URL}3017620422003`);
    expect(offAddProductUrl('3 017620-422003')).toBe(`${OFF_ADD_PRODUCT_URL}3017620422003`);
    expect(offAddProductUrl('96385074')).toBe(`${OFF_ADD_PRODUCT_URL}96385074`);
    expect(offAddProductUrl('036000291452')).toBe(`${OFF_ADD_PRODUCT_URL}036000291452`);
  });
  it('is null for anything else, so a typo never becomes a link', () => {
    for (const code of ['', '1', '3017620422004', 'abc', '3017620422003&x=1', '../3017620422003']) {
      expect(offAddProductUrl(code)).toBeNull();
    }
  });
});
