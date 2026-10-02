# OpenPlate — Security & Quality Review (2026-10-01)

Scope: whole repository at `d7ac31b` (branch `claude/project-security-review-b3675a`).
Method: four parallel read-only audits (storage/crypto, network/AI/sync/export,
infra/CI/supply chain, architecture/code quality), with the critical claims
re-verified by hand against the source. **No Flutter/Dart toolchain was
available on the host, so nothing was compiled or executed.** Items marked
**[verify]** depend on upstream library behaviour that should be confirmed with
a build or test.

---

## Status (2026-10-02)

All seven remediation phases have been implemented on this branch. This review
body below is the **2026-10-01 snapshot** (the findings as first made); the
table says what has since been done, and the list after it what has not.

| Phase | Commit | Result |
| ----- | ------ | ------ |
| 0 Containment + 1 Build and "done means verified" | `81bce04`, `1404f50` | key define removed; workspace compiles; `scripts/verify.sh` is the gate |
| 2A Mobile encryption that encrypts | `aa0ce56` | keyed sqlite3mc; refuses to open plaintext; integration test on file header |
| 2B Web store | `5efdefe` | sqlite3mc-wasm in IndexedDB, passphrase-derived key, locking |
| 3 Secrets, BYOK, privacy | `a5a00f8` | runtime BYOK, per-host consent, photo metadata stripped, key bound to host |
| 4 Self-host hardening | `eb948be` | non-root read-only image, strict CSP, zero third-party loads proven |
| 5 Functional correctness | `f53bf31` | F1-F10 (store, Day Board, coach, sync) |
| 6 Platform and supply chain | `914710b` | permissions, signing, pinned actions, SECURITY.md, Dependabot, gitleaks/Trivy/SBOM jobs |
| 7 Test and doc integrity | committed (see `git log`) | contract tests, measured a11y gate, ARB i18n + literal gate, README proof table, truth-audited docs |

Commit hashes are from `git log` on `claude/project-security-review-b3675a`.

**PWA (2026-10-02, uncommitted work in the tree, ADR-0003, [`docs/pwa.md`](../../docs/pwa.md)).**
The web build is now an installable, offline-capable PWA and the primary distribution for the family
test: own service worker (checksummed precache manifest, calm "new version is ready" flow, never
touches cross-origin or non-GET requests), manifest + maskable icons + iOS tags, durable-storage
request and a quiet last-export reminder, the web BYOK key and AI settings moved **into the encrypted
store** (schema v5, never `localStorage`; this supersedes S4's "memory only"), a self-hosted
SHA-256-verified zxing-wasm decoder so Safari/iOS can scan, `bin/openplate up --traefik`
(no published port, HSTS-only middleware, optional cert-resolver / IP allow-list overlays, host-Traefik
file-provider example), and `scripts/webkit_smoke.sh` (production image under Playwright, WebKit +
Chromium). Remaining PWA items:

- **Firefox, real iOS Safari and real Android Chrome devices are untested**; WebKit/Chromium run under
  Playwright on Linux only (see `docs/pwa.md` for what the WebKit run found). The smoke is opt-in and
  has never run in CI (no remote); the CI job is defined but unrun.
- The Traefik compose was validated by `docker compose config` and by the smoke's assertions, **not**
  against a live Traefik; label names follow Traefik v3 (`ipAllowList`), unverified on v2.
- The service worker has not seen a real production deploy-over-deploy upgrade on a phone.
- iOS keeps an installed web app's data separate from Safari's, and has no import: only exports bridge
  them. Android/iOS native launcher icons are still the Flutter placeholders.
- A passphrase guess against a copied IndexedDB now also yields the stored BYOK key (documented in
  `docs/ai-tiers.md`).
- The unencrypted DEV banner (`OPENPLATE_DEV_IN_MEMORY_STORE`) still sits before the Navigator in
  semantic order, so a Navigator route hides it from screen readers (dev-only; the update banner was
  fixed).

### Known remaining items

Verified by nobody yet (not claimed anywhere as done):

- **Android APK build is unverified**: the local AAPT2 runs under emulation and
  failed; only CI (with the Android SDK) can confirm `flutter build apk`.
- **iOS has never been built** (no macOS runner in the toolchain image).
- **CI has never run**: there is no remote, so no workflow has executed.
- **Trivy, SBOM, gitleaks and Dependabot** are configured but unrun.

Decisions / follow-ups for the maintainer:

- `ITSAppUsesNonExemptEncryption`: deliberately unset; the export-compliance
  answer (and a possible French ANSSI declaration) is a maintainer decision.
- **iOS database file is still in iCloud/iTunes backups** (ciphertext only; the
  key is not). Excluding it needs a small native `AppDelegate` hook
  (`NSURLIsExcludedFromBackupKey`).
- **Firefox is untested** for the web store; Safari's engine (WebKit) and Chromium are exercised by the
  opt-in `scripts/webkit_smoke.sh` (see the PWA paragraph above). Real-device Safari is untested.
- **Web Locks unavailable** => tab exclusion silently not enforced (documented
  in ADR-0002 and `docs/your-data.md`).
- **Caddy runs as root** inside its container (binds 80/443); mitigated with
  dropped capabilities, read-only root and no-new-privileges, but not removed.
- **CJK / emoji glyphs** render as missing-glyph boxes on web (no CDN fallback
  by design); bundle the fonts if needed.
- **Open Food Facts `User-Agent` uses a placeholder project URL** until the
  public repository exists (`app_identity.dart`, `TODO(phase-6)`).
- **The photo sheet logs one food per plate** even when several foods are
  recognised.
- **Key rotation reminder**: any key that was ever compiled into a bundle or
  held by an older build must be revoked at the provider; the repo cannot do it.

From the final sweep (not fixed here):

- `coach_strings.dart` (coach, session, export copy) is English-only keyed Dart,
  **not ARB**; it should move to the ARB pipeline before a second language.
- Day Board tests hard-code `2026-08-15`; they are stable only because the clock
  is injected (`clockProvider`).
- `QuantityRange`'s `const` constructor validates by `assert` only (debug).
  `QuantityRange.checked` throws in every build mode and `copyWith` uses it;
  stored / model data is validated with `isValidRange` before construction.

Not a finding, but good to know: the `.opencode/commands/*.md` files reference
`@skills/...` paths that are gitignored installer output (regenerable), see
`_bmad-output/README.md`; the i18n migration covers `apps/client` (94 ARB
strings); coach/session/export copy was already keyed in `integrations` and
stays there; there is only one `SyncQueue` implementation, so no sync contract
test exists.

---

## 1. Executive summary

The architecture is sound (pure-Dart `domain_core`, ports/adapters, sealed
result types, careful secret redaction, no secrets in git history). But the
project's headline trust promises are **not currently true in code**, and the
work from Epics 3–5 has **never been compiled** (`loop-status.yaml` runs with
`skip_ci: true`, `skip_pr: true`, `review_strategy: self`).

Top problems, in order:

1. **A real OpenRouter API key is baked into build output.** the build-time BYOK key
   define (since removed) was a `const String.fromEnvironment`; the main checkout's
   `apps/client/build/web/main.dart.js` contains an `sk-or-v1-…` string, and
   `scripts/run_local_web.sh --tunnel` publishes that bundle on a public ngrok URL.
2. **Mobile "AES-256 encrypted store" can silently be plaintext.** The key
   attach routine is `async` inside drift's synchronous `setup:` hook, so every
   failure (missing cipher, bad pragma) is swallowed and the DB opens unkeyed.
3. **Web "session-sealed store" is a placeholder.** The derived key is ignored,
   data is in-memory, the salt is a global constant, and the unlock flow can't
   actually succeed or leave the lock screen.
4. **The workspace does not compile at HEAD** (several definite errors), and the
   self-host image cannot build. All "done" stories since Epic 3 are unverified.
5. **Core features are broken or dishonest at runtime:** photo recognition always
   throws, food groups are never persisted (so the coach never fires), the Day
   Board drops plates, the sync chip says "synced" when nothing was sent, and
   the Settings/Your AI/Export screens are unreachable.

---

## 2. Findings

Severity: **C** critical · **H** high · **M** medium · **L** low.
✔ = re-verified by hand during this review.

### 2.1 Secrets & BYOK

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| S1 ✔ | C | BYOK API key compiled into every build (web JS, `libapp.so`) | `packages/integrations/lib/src/config/build_config.dart:38`, `apps/client/lib/main.dart:47-62`, `scripts/run_local_web.sh:66-78` | Remove the define entirely; key only entered at runtime into secure storage. Rotate the key now. |
| S2 | C | `--tunnel` serves that bundle publicly; `python3 -m http.server` bound to all interfaces | `scripts/run_local_web.sh:86-90,122-153` | Refuse `--tunnel` with any secret; bind `127.0.0.1`; ngrok basic-auth. |
| S3 | M | Key visible in `ps` / docker args; `.env` values interpolated unquoted into `sh -c` (shell injection) | `scripts/run_local_web.sh:78` | `--dart-define-from-file` on a mounted file, bash arrays, quoting. |
| S4 | H | Web BYOK key stored in `localStorage` (default `WebOptions`), docs say "session-only" **[verify]** | `packages/integrations/lib/src/ai/byok_key_store.dart:5-8,44-47`, `docs/ai-tiers.md:88` | Memory-only on web, or wrap with session-derived key; fix docs. |
| S5 | M | Planned hosted tiers (Cloudflare, Gemini) document shipping a shared provider token in the client | `cloudflare_workers_ai_provider.dart:52-56`, `gemini_free_provider.dart:41-45` | Server-side relay holding the token + quota enforcement. |
| S6 | L | `.dockerignore` does not exclude `.env*` (sent in build context) | `.dockerignore` | Add `.env`, `.env.*`. |

No secrets in git history (all 57 commits scanned; only test fixtures and placeholders).

### 2.2 Data at rest — mobile

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| D1 ✔ | C | `_attachKey` is `async` → thrown errors are lost; DB opens **unencrypted** while code comments promise a typed failure | `packages/integrations/lib/src/store/create_encrypted_store_io.dart:39,108-118` (dup. `encrypted_store_adapter.dart:160-187`) | Make it synchronous; after keying run `SELECT count(*) FROM sqlite_master` and fail hard. |
| D2 | C | `PRAGMA key = X'…'` blob literal is probably not valid pragma syntax **[verify]** | same | Use `PRAGMA hexkey='…'` (sqlite3mc) or `PRAGMA key="x'…'"`. |
| D3 ✔ | C | `hooks.user_defines: sqlite3 → sqlite3mc` only in `packages/integrations/pubspec.yaml`; root workspace pubspec has none — cipher may not be compiled in **[verify]** | `packages/integrations/pubspec.yaml:71`, root `pubspec.yaml` | Move to root pubspec. |
| D4 | H | Docs/UI say AES-256; cipher never pinned (sqlite3mc default is ChaCha20-Poly1305) | `docs/your-data.md:10`, `coach_strings.dart:497` | `PRAGMA cipher=…` explicitly; align copy. |
| D5 | M | iOS keychain default accessibility (not `*ThisDeviceOnly`) + DB in Documents → both in backups; "never leaves the device" overstated | `secure_key_source.dart:36` | `KeychainAccessibility.first_unlock_this_device`; exclude DB from backup. |
| D6 | M | Android `allowBackup` defaults true → encrypted DB restored without its Keystore key | `apps/client/android/app/src/main/AndroidManifest.xml` | `allowBackup="false"` + `dataExtractionRules`. |
| D7 | M | Lost key ⇒ silently generates a new key for an existing DB ⇒ permanent "can't open", no recovery | `secure_key_source.dart:43-51` | Detect "file exists, key missing" state; offer explicit reset. |
| D8 | M | No "erase all local data" anywhere | grep delete/erase/wipe | Use case: close DB, delete file + `-wal`/`-shm`, delete all secure-storage aliases, exports, web storage. |
| D9 | M | Exports written as plaintext into backed-up Documents and never cleaned | `export/mobile_export_destination.dart:24-26` | Temp dir → share sheet / save picker → delete. |
| D10 | M | Store error mapping: catches only `SqliteException` (misses `DriftRemoteException` from background isolate), `watchRecent` has no error mapping, all SQL errors reported as `SecureKeyFailure` | `encrypted_store_adapter.dart:92-118`, `local_coach_note_store.dart` | Map by cause; `handleError` on streams. |

### 2.3 Data at rest — web

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| W1 ✔ | C | Derived key ignored; DB is `NativeDatabase.memory()`; any passphrase "valid"; no persistence | `create_encrypted_store_web.dart:65-89` | Implement `WasmDatabase` with cipher + OPFS/IndexedDB VFS, key verified on unlock — or ship web as an explicit "unprotected preview". |
| W2 ✔ | H | Fixed global salt `openplate-web-v1` (comment claims per-install), PBKDF2 100k iterations in pure Dart on UI isolate | `web_session_key.dart:29,129-141` | Random per-store salt stored with DB; WebCrypto `deriveBits` ≥600k or Argon2id; store KDF params/version. |
| W3 | H | Unlock ordering bug: probe runs before `_derived` is set, `tryOpen()` checks `isOpen` → always false | `web_session_key.dart:97-110`, `wasm_encrypted_store.dart:61-71` | Pass candidate key into the probe. |
| W4 | H | `UnlockGate` never rebuilds (`notifyListeners` never called), spinner stuck (`_busy` never reset), no lock/auto-lock | `widgets/unlock_gate.dart:78-97`, `screens/lock_screen.dart:75-86` | `WebSessionKey` as Notifier; reset `_busy`; idle + `visibilitychange` lock. |
| W5 | H | `package:drift/native.dart` (FFI) imported into the web branch — likely breaks `flutter build web` (regression of commit 55ce05a) **[verify]** | `create_encrypted_store_web.dart` | Remove import; add web build to CI. |
| W6 | M | No passphrase creation/confirmation flow or strength floor; typo on first use becomes the key | lock screen | Create-passphrase screen with confirmation. |
| W7 | L | "Passphrase wiped" claim false (Dart strings immutable; buffers not zeroed) | `web_session_key.dart:90` | Zero `Uint8List`s, clear controller, reword. |
| W8 | L | `OPENPLATE_DEV_IN_MEMORY_STORE` has no visible indicator | `create_encrypted_store_web.dart:40` | "DEV — unprotected" banner. |

### 2.4 Network, AI, export, privacy

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| N1 | H | Photos sent to third-party LLM automatically, no consent, full resolution, possible EXIF GPS, MIME hard-coded `image/jpeg` | `capture_photo_screen.dart:158`, `photo_provider.dart:112`, `openai_compatible_byok_provider.dart:86,96` | Per-provider consent naming the host; `maxWidth 1024` + `imageQuality`; strip EXIF; real MIME. |
| N2 | H | CSV formula injection: OFF product names & LLM output flow into cells; `\r` not quoted | `export/csv_exporter.dart:131-136` | Prefix `= + - @ \t \r` with `'`; quote `\r`; cap length. |
| N3 | M | No timeouts / response-size caps on any Dio client; OFF fetches full product JSON, no User-Agent | `openai_compatible_byok_provider.dart:85`, `off_barcode_source.dart:97` | `BaseOptions` timeouts, size cap, `fields=` filter, UA. |
| N4 ✔ | M | Transient OFF failure cached in LRU for process life | `catalog/offline_first_food_catalog.dart:179-182` | Cache only matches and not-found. |
| N5 | M | Flutter web loads CanvasKit/fonts from Google CDNs → contradicts zero-telemetry | `melos.yaml:31`, `run_local_web.sh:78` | `--no-web-resources-cdn`, bundle fonts, CI grep `gstatic` in `build/web`. |
| N6 | M | Telemetry gate is string-matching (`dio.get`, `http.post`…), whitelists `sync/`; smoke "network quiet" only greps `index.html` | `tools/check_telemetry_claims.dart:30,105-111`, `scripts/smoke_self_host.sh:63-81` | Import/AST-based check; egress capture or `--network none` in smoke; scan built JS for hosts. |
| N7 | L | Endpoint URL not validated (https), naive concatenation | `openai_compatible_byok_provider.dart:107` | Require https (allow `http://localhost`), `Uri.resolve`. |
| N8 | L | `x-ratelimit-reset` parsing wrong for ms / duration strings | `openai_compatible_byok_provider.dart:226-246` | Magnitude detection + duration parsing. |
| N9 | L | Quota counts only successful calls; RMW unlocked; `!` casts crash on corrupt storage | `ai/quota_counter.dart` | Count every call; server-side enforcement for hosted tiers. |
| N10 | L | `lastPhotoBytesProvider` retains last photo for app lifetime, unread | `state/photo_provider.dart` | Remove. |

### 2.5 Self-host infrastructure

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| I1 ✔ | H | Image can't build: no root `Dockerfile` but `docker build .` without `-f`; `.dockerignore` excludes `**/*.g.dart` (drops committed `app_database.g.dart`) | `bin/openplate:46`, `scripts/smoke_self_host.sh:49`, `.dockerignore:32` | `-f infra/Dockerfile`; remove exclusion or run `build_runner`. |
| I2 ✔ | H | Container runs as root (no `USER`; `useradd … \|\| true`), contrary to comments | `infra/Dockerfile:51-70` | `nginx-unprivileged` by digest, port 8080, `read_only`, `cap_drop: ALL`, `no-new-privileges`, tmpfs. |
| I3 | H | Plain HTTP on `0.0.0.0:80`, no TLS path — passphrase/JS injectable on LAN; camera & `crypto.subtle` need a secure context | `infra/docker-compose.yml:20`, `bin/openplate:64` | Bind `127.0.0.1` by default; opt-in Caddy/Traefik TLS profile; HSTS; doc. |
| I4 | H | CSP `connect-src 'self'` blocks OFF + BYOK; `script-src`/`font-src` block CDN CanvasKit/fonts; wasm needs `'wasm-unsafe-eval'` | `infra/nginx.conf:64` | Self-hosted CanvasKit; explicit allow-list; drop `'unsafe-inline'` if possible. |
| I5 | M | Asset `location` has own `add_header` → security headers not inherited on JS/wasm; `immutable 7d` on unhashed `main.dart.js` (stale code after upgrade); no `server_tokens off`; thin `Permissions-Policy` | `infra/nginx.conf:43` | `include` header snippet; `no-cache` for bootstrap files; `camera=(self), microphone=(), geolocation=()`. |
| I6 | M | `/data` volume & "DB lives at /data/openplate_v1.sqlite" claim is false — container is static nginx | `docs/self-host.md:35-38`, `docker-compose.yml`, `Dockerfile:61-64` | Remove volume + claim; document browser-side storage. |
| I7 | M | Non-reproducible: `pubspec.lock` not copied, `flutter:stable` floating tag, Flutter/Dart versions inconsistent across CI/Docker/docs | `Dockerfile:19,27`, `ci.yml:39`, `release-gate.yml` | Copy lockfile + `--enforce-lockfile`; pin Flutter image by version+digest; one version everywhere. |
| I8 | L | `bin/openplate` assumes CWD = repo root; `OPENPLATE_HOST_PORT` ignored with `--with-persist`; smoke uses fixed `sleep 8` | `bin/openplate`, `smoke_self_host.sh` | `cd "$(dirname "$0")/.."`; readiness loop. |

### 2.6 Mobile platform config

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| P1 ✔ | H | Release Android build has no `INTERNET` permission (only debug/profile) → OFF/BYOK silently fail in release | `android/app/src/main/AndroidManifest.xml` | Add permission to `main/`. |
| P2 ✔ | H | iOS `Info.plist` lacks `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` → crash on camera; no Podfile `PERMISSION_CAMERA=1` | `ios/Runner/Info.plist` | Add strings + Podfile macro. |
| P3 | M | Release signed with debug key | `android/app/build.gradle.kts:28-33` | Release `signingConfig` from gitignored `key.properties`. |
| P4 | L | Template text "A new Flutter project." in web manifest/index; no `ITSAppUsesNonExemptEncryption`; Gradle wrapper lacks `distributionSha256Sum` | `web/manifest.json:8`, `web/index.html:21` | Fix metadata. |

### 2.7 Build, CI & supply chain

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| B1 ✔ | C | Workspace does not compile: `const StatusChip()` missing required `plateLogId`; `status_chip.dart`/`sync_queue_provider.dart` use domain types without importing `domain_core`; `Exporter`/`ExportResult` not exported from `domain_core.dart`; `ExportScope` subclasses `implements` (not `extends`) and lack `when()`; `stream.cancel()` on `Stream`; `AsyncValue.valueOrNull` removed in Riverpod 3 **[verify last]** | `widgets/plate_row.dart:130`, `widgets/status_chip.dart`, `domain_core/lib/domain_core.dart`, `value_types/export_scope.dart:44-56`, `export/csv_exporter.dart:60`, `json_exporter.dart` | Fix each; then enforce CI. |
| B2 | H | Process gap: autonomous loop runs with `skip_ci`, `skip_pr`, self-review; no git remote, so CI has never run; sprint-status marks uncompiled stories done | `_bmad-output/implementation-artifacts/loop-status.yaml` | Make `melos run analyze && melos run test` a hard gate in the loop before "committed". |
| B3 | M | Release gates call melos scripts not defined where melos 8 reads them (`check:telemetry`, `check:release-posture`, `smoke:self-host` only in legacy `melos.yaml`) | root `pubspec.yaml:23-45`, `melos.yaml:37-47`, `release-gate.yml:48-52` | Move scripts to root pubspec; delete `melos.yaml`. |
| B4 | M | `integrations` imports Flutter (`lock_screen.dart`) but is tested with `dart test` | `packages/integrations/pubspec.yaml` | Move Flutter widgets to the app, or test with `flutter test`. |
| B5 | M | Actions pinned by tag not SHA (incl. third-party `subosito/flutter-action@v2`); 3 workflows lack `permissions:` | `.github/workflows/*` | SHA pins; `permissions: contents: read`. |
| B6 | L | No `SECURITY.md`, Dependabot/Renovate, gitleaks, trivy/SBOM; CODEOWNERS placeholder that the review gate depends on | `.github/` | Add them; decouple gate from placeholder. |
| B7 | L | Lints weaker than claimed (no `strict-casts/inference/raw-types` despite comment; client on plain `flutter_lints`) | `analysis_options.yaml` | Enable strict modes + stricter lint set. |

### 2.8 Functional correctness

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| F1 ✔ | H | Photo recognition always throws: screen imports the `aiRungProvider` from `photo_provider.dart` (throws `UnimplementedError`, never overridden) instead of the real one in `ai_rung_provider.dart`; call is outside `try` → shimmer forever | `screens/capture_photo_screen.dart:55,158`, `state/photo_provider.dart:59` | Delete duplicate provider; move read inside `try`. |
| F2 ✔ | H | `foodGroup` not persisted (no column) → re-read plates are all `other` → coach never generates a note; exports lose it | `store/tables/food_entry_table.dart`, `_entriesFor` in both stores | Add column + schema migration; round-trip test. |
| F3 ✔ | H | Day Board drops plates logged 23:00–04:59, keeps only latest plate per slot, uses `add(Duration(days:1))` (DST bug, also in exporter & quota), captures `now()` once | `state/day_board_provider.dart:40-46,171,193-200` | Multiple plates per slot + "late" bucket; calendar arithmetic; midnight ticker; injectable clock. |
| F4 | H | Sync: drain loop never calls adapter; queue is in-memory despite the name; chip defaults to "synced" when no op exists; op IDs not UUIDs | `state/sync_queue_provider.dart`, `sync/*`, `widgets/status_chip.dart` | Default "saved locally"; implement drain or hide chip; persist queue; UUIDs. |
| F5 | H | Settings / Your AI / Export / About unreachable; several providers never overridden; rung config not persisted & can't change at runtime | `apps/client/lib/main.dart`, routes | Add navigation + Your AI screen; override providers; persist config. |
| F6 | M | Coach whisper race (non-autoDispose family cached empty before note appended); side-effecting `FutureProvider` (`depthFollowUpProvider`); dismissals not durable; synthetic notes with `plateLogId: 0` | `state/coach_note_provider.dart` | Stream/invalidate; move writes to notifier; persist dismissals. |
| F7 | M | `RecordPlate` post-commit steps not guarded → committed plate reported as failure; `_submitting` stuck in manual entry | `use_cases/record_plate.dart:56-71`, `screens/manual_entry_screen.dart` | try/catch post-commit; try/finally. |
| F8 | M | N+1 queries & unbounded history in `watchRecent` for every change | both store adapters | Join query; date-ranged watch. |
| F9 | M | Fakes: "closest matches" searches literal `'closest'`; balance arc hard-coded; `PrivacyGuard._assertClean()` always true; a11y checker passes on any `Semantics(` | `capture_photo_screen.dart`, `plate_row.dart`, `privacy_guard.dart`, `tools/check_accessibility_floor.dart` | Implement or remove; don't claim. |
| F10 | L | i18n hard-coded English in widgets; misc dead code & duplicated helpers; `PlateLog.entries` mutable; `QuantityRange` unvalidated; NaN/Infinity poison stream | various | Cleanup pass. |

### 2.9 Tests

- Encryption path never tested (`NativeDatabase.memory()` everywhere); no test asserts the DB file header ≠ `SQLite format 3\0`.
- PBKDF2 test checks a *copy* of the algorithm, 1 iteration, length only.
- No test boots `main.dart`'s real `ProviderScope` (would have caught F1, F5).
- Fakes preserve `foodGroup`, hiding F2; unlock tests stub the probe, hiding W3.
- `quota_counter_test.dart:94` is `expect(true, isTrue)`; date-fragile Day Board tests hard-code `2026-08-15`.

### 2.10 Done well

Pure-Dart domain enforced by a test; sealed results instead of exceptions;
`toString` redaction for every secret holder; key sent only in `Authorization`
header; defensive JSON parsing of LLM/OFF responses; OFF barcode URL-encoded on
fixed https host; drift typed queries (no SQL injection); no telemetry SDKs; no
cleartext/ATS exceptions; nginx base pinned by digest; `ci.yml` least-privilege
with timeouts; no `pull_request_target` / script injection; `.gitignore` covers
secrets; honest deferred-work log.

---

## 3. Remediation plan

Ordered by dependency and risk. Each phase ends with an explicit exit check.

### Phase 0 — Containment (today, ~1 h)

1. **Rotate the OpenRouter key** that was placed in `.env`; check OpenRouter usage logs for abuse.
2. Delete `apps/client/build/` in the main checkout (and any copy that was tunnelled/shared).
3. Disable `--tunnel` in `scripts/run_local_web.sh` until Phase 3 lands; bind the dev server to `127.0.0.1`.
4. Add a README/`docs/your-data.md` banner: *web build is a preview — data is not encrypted or persisted* (until Phase 2B).

**Exit:** old key revoked; no bundle containing a key exists anywhere.

### Phase 1 — Make it build, and make "done" mean "verified" (1–2 days)

Everything after this depends on being able to compile and test.

1. Fix compile errors B1 (StatusChip arg, missing imports/exports, `ExportScope` → `final class _X extends ExportScope` with private ctor or native sealed `switch`, remove `stream.cancel()`, `valueOrNull` → `value`).
2. Fix I1 (`-f infra/Dockerfile`, drop `**/*.g.dart` from `.dockerignore`) and W5 (remove FFI import from web branch).
3. Consolidate melos scripts into root `pubspec.yaml`, delete `melos.yaml` (B3); resolve B4.
4. Pin one Flutter version (image by version + digest) for CI, Docker and `run_local_web.sh`; copy `pubspec.lock` and use `--enforce-lockfile` (I7).
5. Create the GitHub remote, push, enable branch protection requiring `ci.yml` (analyze + test + `flutter build web` + `flutter build apk --release` + Docker build).
6. **Change the autonomous loop**: set `skip_ci: false`; a story can't be "committed" unless `melos run analyze`, `melos run test`, and the web/apk builds pass (B2).
7. Re-run all suites; triage the failures you find (expect the deferred Day Board date tests among them — inject a clock).

**Exit:** green CI on `main` with build of web, apk, and Docker image.

### Phase 2A — Mobile encryption that actually encrypts (2–3 days)

1. Single shared `attachKey(Database, key)` helper, **synchronous** (D1, removes duplication).
2. Move `hooks.user_defines` to root pubspec (D3); use `PRAGMA hexkey` (D2); pin cipher explicitly and align all copy/docs (D4).
3. After keying, verify: `PRAGMA cipher` matches expected, `SELECT count(*) FROM sqlite_master` succeeds — else throw synchronously → typed `StoreFailure`.
4. **Integration test** (device/desktop FFI): create store through the real factory, write a plate, close, assert first 16 bytes ≠ `SQLite format 3\0`; reopen with wrong key → typed failure; missing-cipher build → typed failure.
5. Keychain `first_unlock_this_device`; Android `allowBackup="false"` + `dataExtractionRules`; exclude DB from iCloud backup (D5, D6).
6. Key-loss state + explicit "Erase local data and start over" (D7, D8); erase also clears secure-storage aliases, exports, quota, rung config.
7. Exports to temp dir → share sheet → delete (D9). Error mapping incl. `DriftRemoteException` and stream `handleError` (D10).

**Exit:** encryption integration test in CI on at least one FFI platform.

### Phase 2B — Web store: implement properly or label honestly (decision needed)

Option **A (recommended short-term):** ship web as an explicit "unprotected local preview": remove the lock screen, remove PBKDF2/sealed claims from README, `docs/your-data.md`, `coach_strings.dart`; show a persistent banner.

Option **B (full):**
1. drift `WasmDatabase` with sqlite3mc wasm + OPFS (IndexedDB fallback) (W1).
2. Random 16-byte per-store salt + KDF params/version stored beside the DB; WebCrypto PBKDF2 ≥600k (or Argon2id via wasm) off the UI thread (W2).
3. Probe receives the candidate key and verifies by decrypting `sqlite_master` (W3).
4. `WebSessionKey` as a Riverpod `Notifier`; manual lock + idle/visibility auto-lock; zero buffers (W4, W7).
5. Create-passphrase flow with confirmation + minimum strength, and a clear "forgotten passphrase = data unrecoverable, reset" path (W6).
6. Tests with real PBKDF2 vectors and the real unlock ordering.

**Exit:** either no web security claim remains, or a browser test proves a wrong passphrase cannot open persisted data.

### Phase 3 — Secrets, BYOK and privacy (2–3 days)

1. Delete the build-time BYOK key define from `BuildConfig`/`main.dart`/scripts (S1). Keep endpoint/model defaults if useful (not secret).
2. Build **Settings → Your AI** screen (key entry, endpoint with https validation N7, model, test-connection, clear key) and the navigation to Settings / Your data / Export / About (F5).
3. Web: BYOK key in memory only (S4). Fix docs.
4. CI guard: fail if `build/web/**` or the APK contains `sk-` / `sk-or-v1-` / `AIza` patterns.
5. Photo privacy (N1): one-time consent per provider naming the host; downscale (`maxWidth: 1024`, `imageQuality: 80`) which re-encodes and drops EXIF; correct MIME.
6. Network hygiene (N3, N4, N8): Dio timeouts and size caps; OFF `fields=` + User-Agent; don't cache transient failures; fix rate-limit parsing.
7. CSV injection fix + tests with `=HYPERLINK(...)` fixtures (N2).
8. Hosted tiers (S5): design a relay; never ship shared tokens — document before implementing.
9. `run_local_web.sh` hardening (S3): arrays, quoting, `mktemp`, define-from-file.

**Exit:** no secret in any artifact (CI-enforced); photo upload requires consent.

### Phase 4 — Self-host hardening (1–2 days)

1. Unprivileged nginx image pinned by digest, listen 8080; compose `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, tmpfs (I2).
2. Default bind `127.0.0.1`; opt-in Caddy profile with automatic TLS + HSTS; doc that plain HTTP on a network is unsupported (I3).
3. Build with `--no-web-resources-cdn`, bundle fonts (N5); CSP with self-hosted CanvasKit, `'wasm-unsafe-eval'` if needed, explicit `connect-src` allow-list for OFF and the configured BYOK host (or document those features as off) (I4).
4. Header `include` snippet reused in every location; `no-cache` for `index.html`/`flutter_bootstrap.js`/`main.dart.js`, `immutable` only for hashed assets; `server_tokens off`; full `Permissions-Policy` (I5).
5. Remove `/data` volume and the false persistence claim (I6).
6. Smoke test: readiness loop, run with egress capture (or `--network none` + assert app boots), scan built JS for external hosts (N6, I8). Rewrite `check_telemetry_claims` to be import-based.

**Exit:** `bin/openplate up` works from any CWD, image runs non-root, smoke proves zero egress.

### Phase 5 — Functional correctness (3–4 days)

1. F1: single `aiRungProvider`; error handling inside `try`; widget test using real `main.dart` overrides.
2. F2: `food_group` column, schema migration, both stores + exporters; round-trip test against the real adapter (not fakes).
3. F3: Day Board lists per slot + late/night bucket, calendar-day arithmetic everywhere (`DateTime(y, m, d + 1)`), injectable clock + midnight refresh; DST tests.
4. F4: status chip defaults to "saved locally"; hide sync UI until a transport exists, or implement the drain loop + persisted queue table + UUID op IDs.
5. F6/F7: coach-note stream instead of cached family; side effects in notifiers; durable dismissals; guarded post-commit steps; `try/finally` for submit state.
6. F8: join query + date-ranged watch for Day Board.
7. F9: remove or implement fakes (closest matches, balance arc, `PrivacyGuard`); stop claiming them in docs.

**Exit:** end-to-end tests for photo → recognized → logged → coach whisper, on the real store adapter.

### Phase 6 — Platform & supply chain (1 day)

1. P1 INTERNET permission; P2 iOS usage strings + Podfile macro; P3 release signing; P4 metadata, `ITSAppUsesNonExemptEncryption`, Gradle checksum.
2. B5: SHA-pinned actions, `permissions: contents: read` everywhere.
3. B6: `SECURITY.md` (disclosure process), Dependabot (`pub`, `github-actions`, `docker`), gitleaks + trivy jobs, SBOM on release; fix CODEOWNERS/gate coupling.
4. B7: strict analyzer modes; tighten lints; remove `!`/`as` where possible.

### Phase 7 — Test & doc integrity (ongoing)

1. Remove no-op tests; add RFC PBKDF2 vectors; boot-the-app test; replace fakes that diverge from real adapters with contract tests run against both.
2. Make the accessibility checker actually measure hit targets/semantics labels.
3. Move UI strings to ARB/`flutter_localizations` (AD-7).
4. **Truth audit of docs:** README trust table, `docs/your-data.md`, `docs/ai-tiers.md`, `docs/self-host.md`, in-app copy — each claim must point to a test that proves it (extend `check_release_posture` to require that link).
5. Consider moving `_bmad-output/` and `.opencode/` out of the public OSS tree or into a `planning/` area with a note.

### Suggested sequencing

```
Phase 0 ─► Phase 1 ─┬─► Phase 2A ─┐
                    ├─► Phase 2B ─┤
                    ├─► Phase 3 ──┼─► Phase 5 ─► Phase 7
                    └─► Phase 4 ──┘
Phase 6 can run in parallel any time after Phase 1.
```

Rough total: ~3 weeks of focused work for one developer (Phase 2B option B adds ~1 week).
