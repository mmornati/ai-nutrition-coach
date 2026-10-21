#!/usr/bin/env node
// tools/ciqual/build-ciqual.mjs: turn the official ANSES CIQUAL XML release into the compact
// per-100 g nutrient table the catalogue ships.
//
//   node tools/ciqual/build-ciqual.mjs <dir-with-the-4-xml-files> [--out <file>]
//
// The directory holds alim_*.xml, alim_grp_*.xml, compo_*.xml and const_*.xml exactly as published
// (see README.md for the source, version and checksums). Output defaults to
// apps/web/public/catalog/ciqual-<year>.json. Node >= 24 built-ins only; the input is treated as
// untrusted data (never executed, parsed by a small tag-pair scanner, entities decoded by hand).
//
// Per food we keep one row: [code, nameFr, nameEn, groupCode ('' when none), subgroupCode ('' when none), then
// eight per-100 g values (null = unknown), in this fixed order (NUTRIENT_KEYS):
//   energyKcal     const 328    "Energie, Reglement UE N 1169/2011 (kcal/100 g)"
//   protein        const 25000  "Proteines, N x facteur de Jones (g/100 g)"
//   carbohydrate   const 31000  "Glucides (g/100 g)"
//   sugars         const 32000  "Sucres (g/100 g)"
//   fat            const 40000  "Lipides (g/100 g)"
//   saturatedFat   const 40302  "AG satures (g/100 g)"
//   fibre          const 34100  "Fibres alimentaires (g/100 g)"
//   salt           const 10004  "Sel chlorure de sodium (g/100 g)"
// The constituent codes are checked against const_*.xml (French name must match) so a renumbered
// release fails loudly instead of silently shipping the wrong column.
//
// Value rules (a missing value is UNKNOWN, never zero; ADR 0006):
//   "12,5" / "12.5" / "12"   the number (comma or dot decimal)
//   "traces"                 0
//   "< x"                    0 when x <= 0.1 (below what the app can show anyway); otherwise
//                            UNKNOWN. We never invent x/2 or x.
//   "-", "", anything else   UNKNOWN (null in the file, absent in the loader)
//   no row for the pair      UNKNOWN
// Numbers are rounded to 2 decimals. Negative or malformed values are UNKNOWN.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NUTRIENT_KEYS = [
  'energyKcal',
  'protein',
  'carbohydrate',
  'sugars',
  'fat',
  'saturatedFat',
  'fibre',
  'salt',
];

/** Constituent code and the French name fragment it must carry in const_*.xml. */
export const NUTRIENT_CONSTS = {
  energyKcal: { code: '328', name: 'Règlement UE N° 1169/2011 (kcal/100 g)' },
  protein: { code: '25000', name: 'Protéines, N x facteur de Jones (g/100 g)' },
  carbohydrate: { code: '31000', name: 'Glucides (g/100 g)' },
  sugars: { code: '32000', name: 'Sucres (g/100 g)' },
  fat: { code: '40000', name: 'Lipides (g/100 g)' },
  saturatedFat: { code: '40302', name: 'AG saturés (g/100 g)' },
  fibre: { code: '34100', name: 'Fibres alimentaires (g/100 g)' },
  salt: { code: '10004', name: 'Sel chlorure de sodium (g/100 g)' },
};

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** Decodes the XML character references and the five predefined entities. */
export function decodeXml(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isInteger(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

/** Yields one Record<tag, string> per `<ELEMENT>...</ELEMENT>` block (flat children only). */
export function* records(xml, element) {
  const open = `<${element}>`;
  const close = `</${element}>`;
  let i = 0;
  for (;;) {
    const start = xml.indexOf(open, i);
    if (start < 0) return;
    const end = xml.indexOf(close, start);
    if (end < 0) throw new Error(`unterminated <${element}>`);
    const body = xml.slice(start + open.length, end);
    const rec = {};
    for (const m of body.matchAll(/<([A-Za-z_]\w*)(?:\s[^>]*?)?(?:\/>|>([^<]*)<\/\1>)/g)) {
      rec[m[1]] = m[2] === undefined ? '' : decodeXml(m[2]).trim();
    }
    yield rec;
    i = end + close.length;
  }
}

const clean = (s) => s.replace(/\s+/g, ' ').trim();
const round2 = (n) => Math.round(n * 100) / 100;

/** One `teneur` text -> number, or null for unknown. See the rules in the header. */
export function parseValue(raw) {
  const t = (raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (t === '' || t === '-') return null;
  if (t === 'traces') return 0;
  const lt = /^<\s*(\d+(?:[.,]\d+)?)$/.exec(t);
  if (lt) return Number(lt[1].replace(',', '.')) <= 0.1 ? 0 : null;
  const m = /^(\d+(?:[.,]\d+)?)$/.exec(t);
  if (!m) return null;
  return round2(Number(m[1].replace(',', '.')));
}

/** Builds the output object from the four XML texts. */
export function buildCiqual({ alim, grp, compo, consts, version, revision }) {
  const constList = [...records(consts, 'CONST')];
  for (const [key, { code, name }] of Object.entries(NUTRIENT_CONSTS)) {
    const found = constList.find((c) => c.const_code === code);
    if (!found || !found.const_nom_fr.includes(name)) {
      throw new Error(`constituent ${code} (${key}) is not "${name}" in this release`);
    }
  }
  const codeToIndex = new Map(NUTRIENT_KEYS.map((k, i) => [NUTRIENT_CONSTS[k].code, i]));

  const groups = {};
  const subgroups = {};
  for (const g of records(grp, 'ALIM_GRP')) {
    const gc = g.alim_grp_code;
    const sc = g.alim_ssgrp_code;
    if (gc && g.alim_grp_nom_fr) groups[gc] = [g.alim_grp_nom_fr, g.alim_grp_nom_eng || ''];
    if (sc && sc !== '0000' && g.alim_ssgrp_nom_fr) {
      subgroups[sc] = [g.alim_ssgrp_nom_fr, g.alim_ssgrp_nom_eng || ''];
    }
  }

  const values = new Map(); // alim_code -> (number|null)[8]
  for (const c of records(compo, 'COMPO')) {
    const idx = codeToIndex.get(c.const_code);
    if (idx === undefined) continue;
    let row = values.get(c.alim_code);
    if (!row) values.set(c.alim_code, (row = NUTRIENT_KEYS.map(() => null)));
    row[idx] = parseValue(c.teneur);
  }

  const foods = [];
  for (const a of records(alim, 'ALIM')) {
    const code = a.alim_code;
    if (!code || !a.alim_nom_fr) continue;
    const row = values.get(code) ?? NUTRIENT_KEYS.map(() => null);
    const grp0 = a.alim_grp_code && a.alim_grp_code !== '00' ? a.alim_grp_code : '';
    const sub = a.alim_ssgrp_code && a.alim_ssgrp_code !== '0000' ? a.alim_ssgrp_code : '';
    foods.push([code, clean(a.alim_nom_fr), clean(a.alim_nom_eng || ''), grp0, sub, ...row]);
  }
  foods.sort((x, y) => Number(x[0]) - Number(y[0]));
  return { version, revision, nutrients: NUTRIENT_KEYS, groups, subgroups, foods };
}

/** Share of foods (0..1) with a known value, per nutrient. */
export function coverage(out) {
  return Object.fromEntries(
    NUTRIENT_KEYS.map((k, i) => [
      k,
      out.foods.filter((f) => f[5 + i] !== null).length / out.foods.length,
    ]),
  );
}

function pick(dir, prefix) {
  const re = new RegExp(`^${prefix}_\\d{4}_\\d{2}_\\d{2}\\.xml$`);
  const hits = readdirSync(dir).filter((n) => re.test(n));
  if (hits.length !== 1) {
    throw new Error(`expected exactly one ${prefix}_YYYY_MM_DD.xml in ${dir}, found ${hits.length}`);
  }
  return hits[0];
}

const readText = (p) => readFileSync(p, 'utf8').replace(/^﻿/, '');

export function main(argv) {
  const args = argv.slice(2);
  const outIdx = args.indexOf('--out');
  let outArg = null;
  if (outIdx >= 0) outArg = args.splice(outIdx, 2)[1];
  if (args.length !== 1) {
    console.error('usage: build-ciqual.mjs <dir-with-ciqual-xml> [--out <file>]');
    return 2;
  }
  const dir = resolve(args[0]);
  const names = {
    alim: pick(dir, 'alim'),
    grp: pick(dir, 'alim_grp'),
    compo: pick(dir, 'compo'),
    consts: pick(dir, 'const'),
  };
  const stamp = /_(\d{4})_(\d{2})_(\d{2})\.xml$/.exec(names.compo);
  const version = stamp[1];
  const revision = `${stamp[1]}-${stamp[2]}-${stamp[3]}`;
  const out = buildCiqual({
    alim: readText(join(dir, names.alim)),
    grp: readText(join(dir, names.grp)),
    compo: readText(join(dir, names.compo)),
    consts: readText(join(dir, names.consts)),
    version,
    revision,
  });
  const target = outArg
    ? resolve(outArg)
    : join(
        dirname(fileURLToPath(import.meta.url)),
        '../../apps/web/public/catalog',
        `ciqual-${version}.json`,
      );
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(out) + '\n');
  const cov = coverage(out);
  console.log(`ciqual ${revision}: ${out.foods.length} foods -> ${target}`);
  for (const k of NUTRIENT_KEYS) console.log(`  ${k.padEnd(13)} ${(cov[k] * 100).toFixed(1)}%`);
  return 0;
}

if (process.argv[1] && basename(process.argv[1]) === 'build-ciqual.mjs') {
  process.exitCode = main(process.argv);
}
