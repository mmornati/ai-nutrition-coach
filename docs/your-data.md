# Your data — protection posture

AI Nutrition Coach is yours to run. This page is the honest answer to *"how is
my history protected?"* It is a web app, so the answer is about your browser:
what is written there, what protects it, and what does not.

## Where your history lives

Your history lives in a local SQLite database inside your browser's private file
system (OPFS), opened by a dedicated Web Worker, encrypted at rest with
**ChaCha20-Poly1305** (SQLite3 Multiple Ciphers compiled to WebAssembly; an
authenticated cipher, so tampered pages are detected). The 32-byte key is derived
from a **passphrase you choose** with **PBKDF2-HMAC-SHA256, 600,000 iterations
and a random per-store salt**, computed by the browser's WebCrypto inside the
worker, so the derived key never exists on the page's main thread. The key is
held in memory only while the store is unlocked and is **never written to
disk**. What is written next to the data is not secret: the salt, the KDF name
and cost, and a format version, kept in `localStorage` (`anc.pwa.store.meta`)
with a copy inside IndexedDB so clearing `localStorage` alone does not orphan
your data. Your passphrase is Unicode-normalised (NFC) before use, so the same
visible passphrase works whatever keyboard typed it. There is no server mirror,
no third-party sync, no telemetry. (Design and threat model: ADR 0005, which
supersedes the storage part of the earlier ADR-0002.)

What this means in practice:

- **First run** asks you to create a passphrase (typed twice, at least 10
  characters). It says plainly, before you set it, that a forgotten passphrase
  **cannot be recovered**: there is no copy, no reset link, no escrow.
- **Every later visit** starts at an unlock screen. A wrong passphrase can never
  open the store: the database pages simply do not decrypt. After a few wrong
  attempts the screen adds a short wait. That wait is friction for fat fingers,
  **not** a security control: someone who copies your browser's storage can guess
  offline at the cost of 600,000 hashes per guess. Pick a long passphrase.
- On open the app verifies the database really is encrypted with the expected
  cipher and the key works; if not, it **refuses to open** (it never falls back to
  an unencrypted file).
- **Locking** closes the database and terminates the worker, which frees the
  memory the key lived in. It happens when you press *Lock*, after an idle delay
  (15 minutes by default; 5 / 15 / 30 / 60 in *Your data*), and when the page has
  been hidden for 5 minutes. Locking restarts the app view, so nothing decrypted
  is kept around by the UI. We do not claim the key is forensically erased from
  RAM.
- **Forgot the passphrase?** The unlock screen offers *Erase and start over*,
  behind a confirmation. It deletes the encrypted database and the header from
  this browser, and returns to first run. (An AI key and your AI settings are
  stored *inside* the encrypted store and go with it; see
  [`ai-tiers.md`](./ai-tiers.md).) *Erase all local data* in *Your data* does the
  same.
- If the browser's site data was partly cleared (header without data, or data
  without any header) the app does not guess and never creates a new store over
  what is left: it says the store can't be found and offers the same erase. (A
  header lost from `localStorage` only is restored from the IndexedDB copy
  automatically.) A browser that merely cannot reach its storage right now (for
  example a private window that refuses OPFS) is told apart from a lost store: it
  offers *Try again*, never an erase.
- **One tab at a time.** The store is held by one tab (a Web Lock); a second tab
  says AI Nutrition Coach is open in another tab and lets you retry once the first
  has locked or closed. A browser without the Web Locks API gets no tab exclusion
  rather than a lock-out, so two tabs could write at once there (a known accepted
  gap).
- **Protected from clean-up?** Browsers may clear a site's storage when space runs
  low unless the site is *persistent*. After every create/unlock the app asks the
  browser to protect the data (`navigator.storage.persist()`) and *Your data* says
  what the browser answered: "protected from automatic clean-up" or "the browser may
  clear this data if space runs low — export regularly". The answer is the browser's
  to give; export regardless.
- **Last export.** *Your data* shows when you last exported (the date is stored
  inside the encrypted store). If there is data and the last export is older than
  14 days, or there never was one, one quiet line suggests an export; "Not now"
  quiets it for another 14 days. No badge, no modal, no counter.
- **Your AI key and settings** are kept in a small key/value table *inside* the
  encrypted store — readable only after you unlock, protected by the same
  passphrase-derived key, deleted by *Erase all local data*, never in
  `localStorage` or `sessionStorage`.

## Your language

*Settings → Language* offers *Match my device* (the default; the app follows your
browser's language), *English* and *Français*. The choice is kept in the encrypted
store (`ui.locale`), so it travels with the rest of your data and is deleted by
*Erase all local data*.

The screens before the unlock (create passphrase, unlock, lost store) cannot read
the encrypted store, so a pick is also written as a **plain note in `localStorage`**
(`anc.pwa.locale`, value `en` or `fr`). It reveals only the language you chose,
nothing about your plates. It is removed when you go back to *Match my device*, and
*Erase all local data* removes it with every other key the app owns; after an erase
the app follows the browser's language again. If the browser refuses
`localStorage`, the gate simply follows the browser. The language preference is not
part of an export (exports cover plates only).

## The privacy page and the first-run notice

*Settings → Privacy* ("What this app stores and sends") is the in-app privacy
notice: what is stored and where, what leaves the device and when, what the
server you got the app from sees, what is never collected, how to delete and
export, and a note on shared devices. It is linked from the one-time *About this
app* notice, from the Open Food Facts notice, from the photo consent dialog and
from *Your AI*. Every string is in the typed catalogue
(`apps/web/src/i18n/en.ts`).

The *About this app* notice (designed for adults; photo recognition is off by
default and only sends a photo to a service you choose, after you say yes; plates
stay in your browser, encrypted) appears **once**, before the passphrase screen.
The store does not exist yet when it first appears, so the answer is kept for the
session and written (inside the encrypted store, `privacy.aboutAckAtUtc`) as soon
as the store is created; if it cannot be read or written the notice is simply
shown again (never silently skipped).

## Deleting one plate

Open a plate from Today and choose *Remove this plate*, then confirm. The plate,
its food entries, its coach notes, the interactions logged against those notes and
their dismissal markers are removed in ONE database transaction (it rolls back as
a whole on failure, and a test asserts the absence of rows table by table). There
is no undo, hence the confirm. Editing a plate is not supported; remove it and log
it again.

## Open Food Facts lookups

The first time a scanned barcode is about to be looked up online, a one-time
notice says so: *"Barcodes you scan are looked up on Open Food Facts (public, no
account). Only the barcode is sent."* **OK** allows lookups; **Don't look up
online** keeps the app on its offline catalog (an unknown barcode opens manual
entry). The answer is stored in the encrypted store (`privacy.offLookup`) and can
be changed in *Settings → Privacy*. Nothing is sent until you have answered: the
catalog itself refuses to send a barcode unless the stored answer is "OK". The
camera frames are decoded on your device and never leave it.

## Photos

A photo you take or pick is held in memory only for the recognition call: it is
never written to storage, its metadata is stripped before anything is sent, and
its object URL is revoked afterwards. Browsers leave no picker files for the app
to clean up.

## Exports and erase

Exports are **plain, unencrypted** CSV / JSON files, and say so under the Export
button. In the browser they are a download (or the system share sheet where the
browser offers Web Share); the app does not keep them and cannot delete them
later. *Erase all local data* cannot reach a file you downloaded or shared
(Chrome saves to Downloads without asking, and Downloads may sync to a cloud).
The CSV has one row per food entry. Columns are only ever appended: `id, logged_at_utc, entry_id,
database_food_source, database_food_ref, database_food_display_name, quantity_low, quantity_high,
quantity_unit, quantity_display_label, food_group, grams, grams_estimated, energy_kcal, protein_g,
carbohydrate_g, sugars_g, fat_g, saturated_fat_g, fibre_g, salt_g`. `grams` is the entry's weight
and `grams_estimated` is `true` when it was a preset or a guess; the nutrient columns are the values
for that entry (per 100 g scaled by the weight), with a dot decimal and at most one decimal, and
**empty when unknown** (never zero). The JSON export also carries `grams`, `gramsEstimated`, and the
food's per-100 g `nutrientsPer100g` and product `extra` (Nutri-Score and NOVA from Open Food Facts)
when known.

Exports cover plates only: coach notes, AI settings, the language and these notices are not
exported, and **there is no import** (an installed iOS web app keeps its data
separate from Safari's, so only an export could bridge them, by hand).

Food names are stored in the language they were logged in, so an export can mix languages; the stable `sourceRef` identifies built-in foods.

## Shared devices

There is one store per browser profile, and no profiles inside the app: everyone
who knows the passphrase and can open the browser profile sees the same history.
For separate histories use a separate device or browser profile, each with its own
passphrase. This is by design for v1 and is stated on the privacy page.

## Browser coverage and known accepted gaps

The store and the installable app are exercised in Chromium and WebKit
(Safari's engine) by the Playwright suite (`pnpm e2e`) and by the production-image
smoke (`scripts/webkit_smoke.sh`, [`pwa.md`](./pwa.md#browser-smoke-webkit-and-chromium)).
Stated plainly, so nothing is overclaimed:

- Firefox is untested.
- Real-device Safari and Chrome are untested (Playwright's WebKit is not iOS Safari).
- Without the Web Locks API there is no tab exclusion.
- Exports are plaintext; there is no import.
- Shared devices see one history.

Safari may clear a *tab's* site data after a period without a visit — an app added
to the Home Screen is exempt, and keeps its own data separate from Safari's
(install first, then log). Keep exports regardless of browser.

Limits, stated plainly: this protects the data on a locked/closed browser
profile. It does not protect against malware or a malicious extension in your
browser, against someone using your unlocked tab, or against a weak passphrase.
The app needs a **secure context** (https or `localhost`) because that is where
browsers expose WebCrypto.

## What this means for self-hosters

- The first paint is the create-passphrase screen (first run) or the unlock
  screen. There is no "auto-unlock" affordance and there will never be one.
- Serve the app over https (see [`self-host.md`](./self-host.md),
  [`pwa.md`](./pwa.md)); the bundle also ships the SQLite3 Multiple Ciphers wasm
  under a versioned path, fetched at build time by
  `scripts/fetch_web_sqlite3mc.sh` and verified against a pinned SHA-256, and a
  self-hosted zxing-wasm barcode decoder (`scripts/fetch_web_zxing_pwa.sh`).
- The passphrase fields mask input; the key never leaves the browser; no telemetry
  on the unlock event (pinned by `pnpm check:telemetry`).
- A wrong passphrase renders a single calm line: *"That passphrase does not open
  this store."* No exception is ever thrown across the storage port.

## What this means for contributors

- `apps/web/src/storage/` implements the `EncryptedStore`, `CoachNoteStore` and
  `LocalDataEraser` ports of `@anc/core`. The store controller owns create /
  unlock / lock / erase, throttling and auto-lock against injected seams (KDF,
  header storage, engine, lock); everything but the browser adapters runs in Node
  under Vitest, and the SQL runs against the real wasm engine.
- The session key is held by the controller only while unlocked, zeroed on lock;
  never log it, never serialize it. While locked every `recordPlate` returns a
  typed `StoreFailure`; no exception crosses the port.
- An unencrypted in-memory store exists only behind `import.meta.env.DEV` and
  `VITE_DEV_MEMORY_STORE=1` (red "DEV, not encrypted" banner); the release build
  provably contains neither the branch nor the banner
  (`apps/web/src/storage/build-guard.test.ts`, `tools/check_no_dev_store_in_build.sh`).
- The AD-1 invariant holds: `packages/core` is free of React, DOM, storage and
  network imports (`packages/core/test/ad1-lint.test.ts`).

## Cross-references

- [`adr/0005-web-encrypted-store.md`](./adr/0005-web-encrypted-store.md) — the
  web store design, threat model and what is not verified in automation.
- [`pwa.md`](./pwa.md) — the installable, offline-capable web app (service worker,
  persistence, install, updates).
- [`ai-tiers.md`](./ai-tiers.md) — the AI surface; same privacy posture.
- [`self-host.md`](./self-host.md) — the one-command self-host install.
- [`no-dark-patterns-standard.md`](./no-dark-patterns-standard.md) — the
  named-reviewer gate (FR-15) that signs off this copy.
