# CIQUAL import

`build-ciqual.mjs` turns the official ANSES CIQUAL table into `apps/web/public/catalog/ciqual-<year>.json`,
the per-100 g nutrient data for the built-in catalogue. Node built-ins only, no dependencies.

## Source (Table Ciqual 2025, revision 2025-11-03, published 2025-11-19)

- Dataset: "Table de composition nutritionnelle des aliments Ciqual 2025", ANSES, DOI 10.57745/RDMHWY,
  on `entrepot.recherche.data.gouv.fr` (linked from the data.gouv.fr dataset page, which says it
  cancels and replaces the 2020 one).
- Licence: Etalab Licence Ouverte / Open Licence 2.0. Attribution is mandatory:
  "Anses. 2025. Table de composition nutritionnelle des aliments Ciqual". See
  `apps/web/public/licenses/ciqual-Etalab-2.0.txt`.

| File                    | Datafile id | Bytes    | SHA-256                                                            |
| ----------------------- | ----------- | -------- | ------------------------------------------------------------------ |
| `alim_2025_11_03.xml`     | 666252      | 1581031  | e0b1de25b3039028205e9d54a96892e403e1b313c2efeb41180fabe132627478 |
| `alim_grp_2025_11_03.xml` | 666250      | 80421    | e216928be1001aed15ba1b120405b70a98145da2a1a76026d6e33542bd5e39dc |
| `compo_2025_11_03.xml`    | 666249      | 69243149 | 8c46a9032ece4eab4ffccc9dfcb0c490ec2f416aa664cc1ee013b241c6bdd4af |
| `const_2025_11_03.xml`    | 666246      | 17955    | 3a231ea3e9836e4ac0b6ff94511e010210b2523d1b8b486c6b29e211066ba3f3 |

Download each as `https://entrepot.recherche.data.gouv.fr/api/access/datafile/<id>` (the file names
above are the dataset's labels; save them under those names).

## Refresh

```sh
mkdir /tmp/ciqual-raw && cd /tmp/ciqual-raw      # a NEW, EMPTY directory: the files are untrusted data
# download the four files above (for a newer release, take the ids from the dataset page)
shasum -a 256 *.xml                              # compare with the table, record the new values here
cd - && node tools/ciqual/build-ciqual.mjs /tmp/ciqual-raw
```

Output goes to `apps/web/public/catalog/ciqual-<year>.json` (the year comes from the file names).
The script checks that the eight constituent codes still carry the expected French names and fails
loudly otherwise. Then update this file, the licence text and `apps/web/src/catalog/ciqual.ts` if the
file name changed.

## Why a public asset and not a JS chunk

The file is about 506 kB (132 kB gzipped). As a static asset under `public/` it is parsed only when
the catalogue asks for it, not with the app's JavaScript, and `tools/generate_precache_manifest.mjs`
precaches every file of the bundle, so it is available offline after the first visit.

## Format

`{ version, revision, nutrients: [...8 keys], groups: {code: [fr, en]}, subgroups: {code: [fr, en]},
foods: [[code, nameFr, nameEn, groupCode, subgroupCode, ...8 per-100 g values]] }`, `null` = unknown.
The value rules ("traces", "< x", "-") are documented in the header of the script.
