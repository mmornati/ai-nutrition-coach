# How it is secured

The short version of how AI Nutrition Coach protects what you eat, on one page. Each section links to the document
that gives the full detail, and the [trust posture table](https://github.com/mmornati/ai-nutrition-coach/blob/main/README.md#trust-posture) in the README names the test
that proves each promise. To report a vulnerability, see [`SECURITY.md`](https://github.com/mmornati/ai-nutrition-coach/blob/main/SECURITY.md).

The idea is simple: trust comes from the architecture, not from a policy. There is no account, no server-side copy of
your history and nothing sent by default. What could leave the device is listed, pinned by tests, and switched on only
by you.

## Your history stays in your browser

- Plates, saved meals, recipes, your profile, your settings and any AI key live in one SQLite database in the browser's
  private file system, encrypted at rest with **ChaCha20-Poly1305** (SQLite3 Multiple Ciphers in WebAssembly, an
  authenticated cipher).
- The key is derived from **your passphrase** (PBKDF2-HMAC-SHA256, 600,000 iterations, a random salt per store), inside
  a worker. It is held in memory while unlocked and never written to disk. A wrong passphrase cannot open the store,
  and the app refuses to open a file that is not encrypted as expected.
- **Locking** closes the database and ends the worker: on *Lock*, after an idle delay, or after 5 minutes hidden.
- **A forgotten passphrase cannot be recovered.** No copy, no reset link, no escrow. This is the price of nobody else
  being able to read it.
- Honest limits: someone who copies your browser storage can guess passphrases offline, so choose a long one; and a
  script running in your unlocked page could read what the page can, which is why the Content-Security-Policy is
  strict.

Full detail: [Data protection, in detail](./your-data.md), [Back up, export, erase](./guide/your-data.md), [ADR 0005](./adr/0005-web-encrypted-store.md).

## Backups and exports

- The **encrypted backup** is one file locked with a backup passphrase (Argon2id, 64 MiB, 3 passes, then AES-256-GCM).
  It tells nothing about its contents but its size. Restoring merges and never removes data because it is absent from
  the file.
- **Exports** (CSV, JSON) are plain, unencrypted files, and the app says so under the button. Once downloaded they are
  yours to keep safe; *Erase all local data* cannot reach them.

Full detail: [Data protection, in detail](./your-data.md#encrypted-backup-and-restore), [ADR 0007](./adr/0007-encrypted-vault.md).

## What can leave the device

Nothing, until you turn something on. The production app opens no connection at start-up, and an import-based gate
(`tools/check_telemetry_claims.mjs`, run by `pnpm check:telemetry`) fails the build if any file outside a short
allow-list can reach the network, or if an analytics or crash-reporting SDK appears. The browser enforces the same list
through the Content-Security-Policy (`connect-src`).

| Path | When | What is sent |
| --- | --- | --- |
| Open Food Facts | You scan a barcode | `GET /api/v2/product/<barcode>?fields=…`, no Referer, no cookie |
| Your AI: photo | You chose an AI and said yes for that host (by default, before every photo) | The photo, metadata stripped, with a fixed instruction |
| Your AI: describe | You chose an AI and said yes to *Describe* | Your words, or a short recording for transcription, with a fixed instruction |
| Your AI: coaching | You chose an AI and turned on *AI coaching* | Food names, groups, weights, nutrient totals, dates without times, your optional profile |

Never sent: your passphrase, your history as a whole, database ids, birth dates or the time of day. Each consent is
recorded for one destination and cleared when the destination changes. The AI key, when it is yours, goes only in the
request header to your own endpoint.

Full detail: [What leaves the device](./telemetry-posture.md), [AI tiers, in detail](./ai-tiers.md).

## The server

- A hardened container: non-root, read-only filesystem, all capabilities dropped, a strict Content-Security-Policy and
  security headers on every response, no data stored, no outbound calls of its own.
- HTTPS is required beyond localhost, through the bundled Caddy profile or your own Traefik; plain HTTP over a network
  is refused by design.
- Nothing is logged per request by default. When the operator turns the access log on to debug, a line holds the
  address with its last part zeroed, the time and the file served: never the query string, the User-Agent or the Referer.
- An optional shared AI key stays on the server: nginx adds it to same-origin requests, so the browser never sees it.
- The published image is scanned (no fixable high or critical findings) and driven in WebKit and Chromium before it is
  pushed, and carries a provenance attestation and an SBOM.

Full detail: [Self-host](./self-host.md), [The installable app](./pwa.md).

## The app itself

- A hand-written service worker precaches a checksummed manifest, never intercepts other origins or non-GET requests,
  never caches at run time, and waits for you before a new version takes over.
- Pinned, SHA-256-verified WebAssembly builds (the database, the barcode decoder, Argon2id); every dependency pinned to
  an exact version at least two weeks old.
- The build output is scanned for secret-shaped strings and third-party hosts.

## Who it is for

Adults only: no child or teen profiles and no biometric API ([Adults only](./adults-only.md)). One store per
browser profile: everyone who can open that profile and knows the passphrase sees the same history.

## What is not proven yet

Firefox is untested, and Safari and Chrome are proved with Playwright's WebKit and Chromium rather than on real
devices. The full list is under [Known accepted gaps](https://github.com/mmornati/ai-nutrition-coach/blob/main/README.md#known-accepted-gaps).
