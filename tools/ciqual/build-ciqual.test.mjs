import { describe, expect, it } from 'vitest';
import { NUTRIENT_CONSTS, NUTRIENT_KEYS, buildCiqual, coverage, decodeXml, parseValue } from './build-ciqual.mjs';

const constXml =
  '<TABLE>' +
  Object.values(NUTRIENT_CONSTS)
    .map((c) => `<CONST><const_code> ${c.code} </const_code><const_nom_fr> X ${c.name} </const_nom_fr></CONST>`)
    .join('') +
  '</TABLE>';

const grpXml = `<TABLE>
<ALIM_GRP><alim_grp_code> 05 </alim_grp_code><alim_grp_nom_fr> produits laitiers </alim_grp_nom_fr><alim_grp_nom_eng> milk </alim_grp_nom_eng>
<alim_ssgrp_code> 0501 </alim_ssgrp_code><alim_ssgrp_nom_fr> laits </alim_ssgrp_nom_fr><alim_ssgrp_nom_eng> milks </alim_ssgrp_nom_eng></ALIM_GRP>
<ALIM_GRP><alim_grp_code> 05 </alim_grp_code><alim_grp_nom_fr> produits laitiers </alim_grp_nom_fr><alim_grp_nom_eng> milk </alim_grp_nom_eng>
<alim_ssgrp_code> 0502 </alim_ssgrp_code><alim_ssgrp_nom_fr> fromages </alim_ssgrp_nom_fr><alim_ssgrp_nom_eng> cheeses </alim_ssgrp_nom_eng></ALIM_GRP>
</TABLE>`;

const alimXml = `<TABLE>
<ALIM><alim_code> 2 </alim_code><alim_nom_fr> Fromage  &amp; noix </alim_nom_fr><alim_nom_eng> Cheese </alim_nom_eng><alim_grp_code> 05 </alim_grp_code><alim_ssgrp_code> 0502 </alim_ssgrp_code></ALIM>
<ALIM><alim_code> 1 </alim_code><alim_nom_fr> Lait </alim_nom_fr><alim_nom_eng> Milk </alim_nom_eng><alim_nom_sci missing=" " /><alim_grp_code> 05 </alim_grp_code><alim_ssgrp_code> 0000 </alim_ssgrp_code></ALIM>
<ALIM><alim_code> 3 </alim_code><alim_nom_fr> Sans donnees </alim_nom_fr><alim_nom_eng> No data </alim_nom_eng><alim_grp_code> 05 </alim_grp_code><alim_ssgrp_code> 0501 </alim_ssgrp_code></ALIM>
</TABLE>`;

const row = (food, code, teneur) =>
  `<COMPO><alim_code> ${food} </alim_code><const_code> ${code} </const_code><teneur> ${teneur} </teneur><min missing=" " /></COMPO>`;

const compoXml = `<TABLE>
${row(1, 328, '64,5')}
${row(1, 25000, '3,3')}
${row(1, 31000, 'traces')}
${row(1, 32000, '&lt; 0,1')}
${row(1, 40000, '&lt; 0,5')}
${row(1, 40302, '-')}
${row(1, 10004, '0.09')}
${row(1, 99999, '12')}
${row(2, 328, '350')}
${row(2, 25000, '25')}
</TABLE>`;

describe('parseValue', () => {
  it('reads comma and dot decimals and rounds to 2 decimals', () => {
    expect(parseValue(' 12,5 ')).toBe(12.5);
    expect(parseValue('12.5')).toBe(12.5);
    expect(parseValue('7')).toBe(7);
    expect(parseValue('0,123456')).toBe(0.12);
  });
  it('traces is zero', () => {
    expect(parseValue('traces')).toBe(0);
    expect(parseValue(' Traces ')).toBe(0);
  });
  it('"< x" is zero only when x <= 0.1, otherwise unknown', () => {
    expect(parseValue('< 0,1')).toBe(0);
    expect(parseValue('< 0,01')).toBe(0);
    expect(parseValue('< 0,5')).toBeNull();
    expect(parseValue('< 20')).toBeNull();
  });
  it('dash, empty, garbage and negatives are unknown, never zero', () => {
    for (const v of ['-', '', '   ', undefined, 'n/a', '-3', '1,2,3', '> 5']) expect(parseValue(v)).toBeNull();
  });
});

describe('decodeXml', () => {
  it('decodes entities and character references', () => {
    expect(decodeXml('a &amp; b &lt; c &#233; &#xE9; &apos;&quot;')).toBe('a & b < c é é \'"');
  });
});

describe('buildCiqual', () => {
  const out = buildCiqual({
    alim: alimXml,
    grp: grpXml,
    compo: compoXml,
    consts: constXml,
    version: '2025',
    revision: '2025-11-03',
  });

  it('maps rows in code order with the eight nutrients in the fixed order', () => {
    expect(out.nutrients).toEqual(NUTRIENT_KEYS);
    expect(out.foods.map((f) => f[0])).toEqual(['1', '2', '3']);
    // group, '' sub-group when 0000, then kcal, protein, carb, sugars, fat, sat, fibre, salt
    expect(out.foods[0]).toEqual(['1', 'Lait', 'Milk', '05', '', 64.5, 3.3, 0, 0, null, null, null, 0.09]);
  });
  it('collapses whitespace and decodes entities in names; missing columns stay null', () => {
    expect(out.foods[1]).toEqual(['2', 'Fromage & noix', 'Cheese', '05', '0502', 350, 25, null, null, null, null, null, null]);
  });
  it('a food with no composition rows is all unknown, not zero', () => {
    expect(out.foods[2].slice(5)).toEqual(Array(8).fill(null));
  });
  it('deduplicates groups and sub-groups into small tables', () => {
    expect(out.groups).toEqual({ '05': ['produits laitiers', 'milk'] });
    expect(out.subgroups).toEqual({ '0501': ['laits', 'milks'], '0502': ['fromages', 'cheeses'] });
  });
  it('reports per-nutrient coverage', () => {
    const cov = coverage(out);
    expect(cov.energyKcal).toBeCloseTo(2 / 3);
    expect(cov.fibre).toBe(0);
  });
  it('refuses a release whose constituent codes no longer match', () => {
    const bad = constXml.replace('Glucides (g/100 g)', 'Autre chose');
    expect(() => buildCiqual({ alim: alimXml, grp: grpXml, compo: compoXml, consts: bad })).toThrow(/31000/);
  });
});
