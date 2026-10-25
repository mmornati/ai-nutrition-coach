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
no third-party sync, no telemetry. (An encrypted copy on the server you got the app from is
available if its operator turned it on and you choose it: see
[Backing up to a server](#backing-up-to-a-server).) (Design and threat model: ADR 0005, which
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

## Your profile

*Settings → Profile* is optional: an age range, sex, activity, a goal, a diet and a few free
allergy tags, all "Not set" by default. There is no name, no birth date, no weight and no height.
It only tunes the daily guide (the reference the nutrient bars are drawn against) and the coach.
It is one row in the encrypted key/value table (`profile`), readable only after you unlock,
deleted by *Clear profile* and by *Erase all local data*, and included in the JSON export (see
below). Without a profile the bars use the EU Reference Intakes.

## Your saved meals and recipes

*Settings → Saved meals* lists the meals you chose to keep (*Save as a meal* on a plate's page) and
the home recipes you wrote (*New recipe*, from there or from the capture sheet). They live in the
same encrypted store as your plates (schema v3: `saved_meal`, `saved_meal_item`, `recipe`,
`recipe_item`), readable only after you unlock, and *Erase all local data* removes them with
everything else. A saved meal is a list of foods with amounts (each food keeps the nutrient values it
had when you saved it); a recipe is a list of ingredients with grams, a number of servings and,
optionally, the weight of the finished dish. Per-serving values are worked out from the ingredients
and are estimates: an ingredient with no nutrient data adds nothing and is named as missing, never
counted as zero. A plate you log from a meal or a recipe keeps its own copy of the foods, so
renaming or deleting the template never changes your history.

The JSON export is a readable copy of all this (it cannot be imported: it is for your own
reference and for other tools. To get a store back, use the [encrypted backup](#encrypted-backup-and-restore)). Recent and frequent foods in *Type it* are worked out on the fly from your last 30 days of plates;
nothing extra is stored for them.

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

## Groundwork for backup and sync (schema v4)

Nothing leaves your device because of this; the encrypted backup below is built on it. Schema v4 gives every
plate, food entry, coach note, interaction, saved meal and recipe (and the items of the last two) a
permanent identifier (a `uid`, a UUIDv7: random, but it also encodes the time the row was created),
stamps saved meals, recipes and the small settings with a logical-clock time of their last change,
and keeps a **tombstone** (an identifier, the kind of record and a time, no content) for each
record you delete, so that a future encrypted backup or sync can tell "deleted" from "never seen".
Tombstones are written for: a removed plate, its food entries, its coach notes and their
interactions (also when only the notes are cleared); a deleted saved meal or recipe and its items;
and a deleted setting among the ones listed below. They are written in the same transaction as the
delete, are kept until you choose *Erase all local data* (there is no pruning yet), and are removed
with everything else. The device also stores a random device id (the `sync.deviceId` entry in the
encrypted key/value table), and every stamp embeds it. The upgrade is automatic, re-runnable and
loses no row. There is **no live multi-device sync yet** (phase S3); the cross-device design is in
[`docs/adr/0007-encrypted-vault.md`](./adr/0007-encrypted-vault.md) and
[`docs/encrypted-sync-plan.md`](https://github.com/mmornati/ai-nutrition-coach/blob/main/docs/encrypted-sync-plan.md). The encrypted backup file (next section) is
the first part of it.

## Encrypted backup and restore

*Settings → Your data → Encrypted backup → Save an encrypted backup* writes one file,
`ai-nutrition-coach-YYYY-MM-DD.ancvault` (the local date), through the same download or share sheet
as an export. It is the way back if this browser loses your data (Safari's storage eviction, an
installed web app that keeps its own storage, a new device, cleared site data). It works on every
instance, offline, with no server.

**What is in it:** your plates and their food entries, coach notes and their interactions, dismissals
of notes, saved meals, recipes, your profile, the interface language, the nutrition-numbers
preference, the "About this app" acknowledgement, the export reminder dates, and the tombstones of
what you deleted (an identifier, a kind and a time, no content). **What is never in it:** your AI key,
your AI settings, your AI and describe-a-meal consents, your Open Food Facts answer, the device id and
the idle auto-lock choice (a browser setting). Photos are never stored at all.

**How it is locked.** You choose a *backup passphrase* (typed twice, the same strength floor as the app
passphrase; the screen suggests using the app passphrase, so there is one thing to remember, and says
plainly that a forgotten one cannot be recovered). The key is made on your device:

```
backup passphrase --Argon2id (random 16-byte salt, 64 MiB, 3 passes, 1 lane, 32 bytes)--> master key
master key --HKDF-SHA256 (info "anc/vault/backup-file")--> AES-256-GCM key (non-extractable)
snapshot --canonical JSON--> gzip --AES-256-GCM--> the envelope
```

The Argon2id derivation runs in a worker from a pinned, self-hosted build (hash-wasm, see
[`pwa.md`](./pwa.md#argon2id-for-the-encrypted-backup)); the worker loads only that one pinned file (it builds the URL itself) and is terminated after each
derivation. The 32-byte master key does come back to the page, which imports it into a
non-extractable AES key and zeroes the bytes at once (the passphrase bytes are handed to the worker,
not copied). The envelope is one JSON object:
`{ v, vaultId, version, alg: "A256GCM", kdf: { name: "argon2id", v: 19, m, t, p }, salt, nonce, ct }`,
binary fields in unpadded base64url. Every field except `ct` is bound as associated data, so editing
the header (another vault id, a replayed version, a weaker KDF, another salt) makes the file fail
authentication. A file's `vaultId` is 16 random bytes and `version` is 1; the relay of a later phase
gives them their meaning. The file shows the cost and the salt, which are not secret, and nothing
about its contents but their size. **A lost backup passphrase cannot be recovered**: there is no
escrow, no reset, no copy.

**Restoring.** There are two places, and in both the file is opened and validated completely before
anything is written:

- *Your data → Restore from a backup* (file and passphrase) **merges** the backup into the open store
  (the rule is the one in ADR 0007). Nothing is removed merely for being absent from the backup; a
  plate deleted before the backup was made stays deleted; a saved meal, recipe or setting that
  differs is replaced only when the backup's copy is newer. Restoring twice changes nothing more.
- The *create-passphrase* screen has *Restore from a backup*: the file is opened first (a wrong
  passphrase, a damaged or foreign file creates nothing), then the store is created with the backup's
  passphrase, which becomes this device's passphrase (the screen says so), then the data is written.
  If that passphrase would not pass the strength floor of an app passphrase it is refused calmly
  (create a passphrase, restore from Your data). If the data cannot be written after the store was
  created, the empty store is removed again, so a restore never looks successful when it was not. If
  that removal fails too (or only partly works), the store is locked and the unlock screen says an
  empty store was left behind, with the backup's passphrase, and that it can be unlocked or erased
  from there; it never says "nothing was changed" in that case. While a restore runs, the screen
  offers no way out.

**What is refused, each with one calm line and nothing written.** A wrong passphrase or a damaged or
altered file (the cipher cannot tell these apart, and the screen does not pretend to); a file that is
not a backup (not JSON, the wrong shape, an unknown cipher or KDF); a KDF cost below the floor
(64 MiB, 3 passes: a downgrade) or above the ceiling (256 MiB, 10 passes: a denial of service), both
refused *before* anything is derived; a file larger than 32 MiB (refused before it is read), a
ciphertext or a decompressed snapshot beyond its cap (a compression bomb stops at 96 MiB of output, fed in 32 KiB slices so the input is not read ahead);
a backup made by a newer version of the app (update it); a decrypted snapshot the strict parser does not accept; a backup
stamped further ahead than 24 hours of this device's clock; and a store that cannot take the data.

*Your data* tells you the date of the last export **or** backup, and the quiet suggestion (older than
14 days, or never; "Not now" quiets it) now points at the encrypted backup and has a button that takes
you to the passphrase field. A backup counts as an export for it. No badge, no modal, no counter.

*Copy sign-off:* the backup and restore strings (English and French), including the privacy page
paragraph, are awaiting the named reviewer's sign-off (ADR 0007, "Copy sign-off").

## Backing up to a server

If the person who runs the server you got this app from turned on its **encrypted backup relay**
([`self-host.md`](./self-host.md#encrypted-backup-on-your-own-server)), *Your data* offers to keep an
encrypted copy of your data there, so you can get it back on a new phone or after clearing this
browser, and use it on another device. If the server has no relay, none of this is shown and the app
is exactly what the sections above describe. There is never a server we run: the relay is part of the
self-host image, off by default, and belongs to whoever hosts it.

**What the server can see.** Your *handle* (a name you choose for the copy; not an email address), a
random salt, a wrapped key it cannot open, a keyed hash of a value derived from your passphrase, the
size of the copy and when it changed, and your internet address and browser type as any website sees
them. It cannot read your foods, times, notes, saved meals, recipes, profile or language, and it never
receives your passphrase. A person who steals its disk learns the same, and can try passphrases offline
at the cost of one Argon2id run (64 MiB, 3 passes) per guess: pick a long one.

**Keys.** Your passphrase is stretched with Argon2id into a master key, which makes two unrelated keys by
HKDF-SHA256: one *proves* the passphrase to the server (it is what the server stores a keyed hash of),
the other (a key-encryption key) wraps a **random vault key** with AES-256-GCM, bound to the vault's id.
The vault key encrypts each snapshot (AES-256-GCM over the gzip of the same canonical snapshot a backup
file holds, with the vault id and the version bound as associated data, so the server cannot swap vaults
or replay an old copy). Changing a passphrase later only re-wraps the vault key (phase S4). The vault
key and a revocable device token are kept in the encrypted store on each device that is connected, and
in no snapshot and no export. A forgotten passphrase cannot be recovered, by us or by the server's
operator (a recovery key is planned for S4).

**Three ways in, always with the handle and the passphrase together.** The server never says whether a
handle exists, so there is one calm line for "nothing on this server matches this handle and
passphrase" (a wrong passphrase and an unknown handle look the same) and a separate one for "too many
tries". Only creating a copy can say "that handle is already taken".

- *Back up to this server* (*Your data*): the first device creates the copy. The passphrase may be the
  app's or another one (then it protects only the copy).
- *Connect to this server's copy* (*Your data*): a device that already has data joins. The copy is
  downloaded and decrypted, then **a preview of the merge is shown before anything is written**: how many
  plates are on the server, on this device (and how many of those the server already has) and together.
  *Combine* keeps everything from both and deletes nothing. If the profile on the two sides differs in
  content, you pick which to keep, once, and it is used on every device. *Start fresh from the server
  copy*, behind *Other options*, is for a device whose data is not wanted: it names the plates that
  would leave this device, offers to save an encrypted backup first, and after a confirmation erases this
  device and restores the copy (the copy on the server is not changed). There is no "replace the server
  copy with this device": under a merge the other devices would put the data back.
- *Restore from this server* (the first screen of a new device): the copy is found and shown
  ("Found your data: 412 plates, from March 2026 to today") before a store is created; the passphrase
  becomes this device's, and if anything fails no store is left behind.

**After that, the copy keeps itself up to date**, silently and only while the app is unlocked and
online: about 30 seconds after your last change, when you switch away from the page, and when the
connection returns. Every upload is a compare-and-swap: if another device uploaded first, the app
downloads that copy, merges it with the same rules as a restore, and uploads again; it never overwrites
blindly. The app remembers the newest version it has seen and refuses an older one ("the server returned
an older copy than this device has seen"), a copy from a newer version of the app, a revoked device and
a copy too large for the server, and says so on *Your data* instead of retrying. *Back up now* tries at
once; *Stop backing up from this device* only makes this device forget the connection.

**The status chip still says "On this device"** on every plate. *Your data* says "backed up" only after
the server acknowledged an upload that included your last change; a per-plate "synced" waits for the pull
side (phase S3). Pulling changes made on another device on unlock or focus is also S3: today another
device's changes arrive when this device next uploads, or when you reconnect.

*Not built yet (S4):* the recovery key, changing the passphrase, listing and revoking devices, deleting
your copy on the server, single sign-on instead of a handle. *Copy sign-off:* these strings (English and
French) await the named reviewer (ADR 0007, "Copy sign-off").

## Open Food Facts lookups

The first time a scanned barcode is about to be looked up online, a one-time
notice says so: *"Barcodes you scan are looked up on Open Food Facts (public, no
account). Only the barcode is sent."* **OK** allows lookups; **Don't look up
online** keeps the app on its offline catalog (an unknown barcode opens manual
entry). The answer is stored in the encrypted store (`privacy.offLookup`) and can
be changed in *Settings → Privacy*. Nothing is sent until you have answered: the
catalog itself refuses to send a barcode unless the stored answer is "OK". The
camera frames are decoded on your device and never leave it.

What is read back from Open Food Facts for a scanned product is limited to the fields the app
uses: its name (in several languages), brand, categories, the per-100 g nutrition values
(energy, protein, carbohydrate, sugars, fat, saturated fat, fibre, salt or sodium), the serving
and pack size, and its Nutri-Score and NOVA group. Those are third-party product information and
are kept with the plate you log (a missing value stays missing, never zero). The request itself is
unchanged: the barcode only.

## The built-in food table (CIQUAL)

Searching foods also uses the CIQUAL table (ANSES, Etalab Open Licence 2.0): about 3,500 generic
foods with per-100 g nutrition, shipped with the app as one file from this app's own address, saved
for offline use and read on your first search. Nothing is sent anywhere to search it.

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

Exports cover plates, plus the **optional profile** under a top-level `profile` key in the JSON
export (only when you set one; the CSV has none), and your **saved meals and recipes** under
top-level `savedMeals` and `recipes` keys in the JSON export (only when you keep any; the CSV is
unchanged and has no such rows: a plate logged from a recipe is an ordinary row there, with
`database_food_source` `recipe`). Coach notes, AI settings, the language and these
notices are not exported, and a CSV or JSON export cannot be imported (an installed iOS web app keeps
its data separate from Safari's; the [encrypted backup](#encrypted-backup-and-restore) is what bridges
them).

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
- CSV and JSON exports are plaintext and cannot be imported; the encrypted backup is the way back.
- A forgotten app or backup passphrase cannot be recovered; there is no escrow.
- Shared devices see one history.

Safari may clear a *tab's* site data after a period without a visit — an app added
to the Home Screen is exempt, and keeps its own data separate from Safari's
(install first, then log). Keep an encrypted backup regardless of browser.

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
  self-hosted zxing-wasm barcode decoder (`scripts/fetch_web_zxing_pwa.sh`) and the hash-wasm
  Argon2id build used by the encrypted backup (`scripts/fetch_web_argon2.sh`).
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
