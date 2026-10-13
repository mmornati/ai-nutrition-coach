# ADR-0001 — Mobile at-rest cipher is ChaCha20-Poly1305 (supersedes "AES-256")

- **Status:** Accepted (Phase 2A, security review 2026-10-01, finding D4)
- **Supersedes:** the "AES-256" wording of NFR4 / FR9 / AD-8 in the PRD, epics and spec.
- **Scope:** mobile (iOS / Android) local store. The web store is ADR-0002 (sqlite3mc-wasm on IndexedDB, same cipher).

## Context
AD-8 promised "AES-256 via the sqlite3mc build hook". The cipher was never pinned in code:
SQLite3MultipleCiphers' default is ChaCha20-Poly1305, so user copy and docs described a
cipher the app did not use. Cipher claims in a privacy product must be true.

## Decision
Pin **ChaCha20-Poly1305** (sqlite3mc `chacha20`) explicitly with `PRAGMA cipher` before the
key is supplied (`PRAGMA hexkey`), in the single shared `attachKeyAndVerify`
(`packages/integrations/lib/src/store/sqlite_key_attach.dart`). All copy says
"ChaCha20-Poly1305"; none says "AES-256".

## Rationale
- Authenticated (per-page Poly1305 tag): tampered pages are detected; sqlite3mc's AES-256-CBC
  has no per-page authentication.
- It is sqlite3mc's default and most exercised cipher; fast without AES hardware.
- The alternative (`sqlcipher`, AES-256-CBC) links OpenSSL on Android and bundles an older SQLite.

## Consequences
- NFR4 / FR9 read "encrypted at rest with an authenticated cipher (ChaCha20-Poly1305 on
  mobile)". Anywhere "AES-256" remains in older story files it is historical.
- The `hooks.user_defines.sqlite3.source: sqlite3mc` opt-in must live in the workspace-root
  `pubspec.yaml` (the hooks runner reads user-defines only from the workspace root).
- Existing plaintext databases from pre-fix builds are migrated in place (`PRAGMA hexrekey`).
