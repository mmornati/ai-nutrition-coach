# AI Nutrition Coach — AI Tiers

This document describes the v1 AI tier ladder: the four rungs the
`AiRung` port exposes, how they are configured, and how the
photo-recognition path behaves when each rung is active. It is the
canonical reference for FR6 (free quota honesty), FR7 (BYOK key
on-device), and FR8 (local-model v2 seam).

> Source of truth: the architecture spine (`ARCHITECTURE-SPINE.md`
> §AD-5 — AI tier ladder) and the story specs in
> `_bmad-output/implementation-artifacts/spec-3-1-…`,
> `spec-3-2-…`, and `spec-3-3-…`. This doc is the user-facing
> translation; the specs are the contract.

## The four rungs

Exactly one rung is active at any time. The active rung is the user's
choice in **Settings → Your AI** (reached from the gear on the Day Board)
and reads through `aiRungProvider`. It is **runtime state**: a change takes
effect on the next photo, with no restart, and is remembered across
restarts (see "Where settings live" below).

| Rung            | `AiRungKind`     | Status in this build                                   |
|-----------------|------------------|--------------------------------------------------------|
| Offline (no AI) | `noOp`           | Default; always available                              |
| Free model      | `hostedQuota`    | **Not available** — a stub; needs a server-side relay  |
| Your key        | `byok`           | Active; your key, your endpoint                        |
| Local model     | `local`          | v2 seam — not implemented                              |

The Your AI screen lists all four, but only *No AI* and *My own key* can be
chosen; the other two read "Not available yet". A persisted value naming an
unavailable rung is normalised to *No AI* when it is loaded.

The v2 `local` rung exists in the type system and the provider
wiring (`LocalAiRung` implements `AiRung`); the v1 adapter throws
`UnsupportedError` on `recognize` so the seam is declared without
crashing the core.

### Where settings live

The rung, the BYOK endpoint and model, and the per-host photo consents
(`AiSettings`) are not secrets, but they say which third parties you trust,
so they are stored like one:

- **Mobile / desktop:** the OS keystore (`flutter_secure_storage`, alias
  `openplate_ai_rung_config_v1`). Chosen over a table in the encrypted
  database because it needs no schema migration and is already wiped by
  *Erase all local data*.
- **Web:** memory only, for the unlocked session. `flutter_secure_storage`
  on web is `localStorage`, readable by any script on the origin, so it is
  never used (the app refuses to construct it there).

## Free model — quota honesty (FR6)

> **Status: not available.** The adapters (`CloudflareWorkersAiProvider`,
> `GeminiFreeProvider`) are stubs that make no request, and the rung cannot
> be selected. Everything below describes the intended behaviour once a relay
> exists — see "Hosted tiers need a relay".

The hosted-quota rung calls the configured free provider
(Cloudflare Workers AI by default — OQ-2) within a per-day
quota. The v1 quota is **`kHostedQuotaPerDay = 50`** calls per
local day. The quota resets at the next **local** midnight.

When the quota is exhausted, the rung returns
`QuotaExhausted(resetAt: <next local midnight>)`. The UI
renders a quiet plain-language 3-way choice with **zero
pressure, no countdown, no "Don't show again" easter egg**:

1. **keep logging without AI** — the rung flips to
   `AiRungKind.noOp` instantly; the photo path resolves via the
   closest-matches + manual fallback.
2. **bring your own key** — opens the BYOK entry surface (Story
   3.3).
3. **wait for the quota to reset** — the status line surfaces
   the reset timestamp as a calm human-readable local string
   (e.g. "tomorrow at 7:00 AM"); the rung stays `hostedQuota`
   until the next reset.

**Every call attempt counts** (N9) — a recognition, an empty plate, a
no-match and a transport failure alike. The slot is taken *before* the
request is made, so a failing provider cannot be retried for free. The
counter is serialised by an async mutex (two overlapping calls count two),
rolls over at the next calendar midnight (not "+24 h", which is wrong on a
daylight-saving day), and treats a corrupt or hand-edited stored value as
"no calls yet" instead of crashing.

This on-device counter is a courtesy to the user, **not enforcement**:
anyone can clear local storage. Real enforcement is the relay's job.

## Hosted tiers need a relay (S5)

A provider token — a Cloudflare API token, a Gemini key — is a credential
for *the project's* account. **It must never be shipped in the client.**
Anything compiled into a web bundle or an APK is public: it can be extracted
in minutes and then used by anyone, with no quota, at the project's expense.
This applies to `--dart-define`, to a constant, and to a "protected" asset
alike.

The only acceptable shape for a hosted tier is a server-side relay:

    app ──(photo, no credential)──► OpenPlate relay ──(token)──► provider

- the relay holds the provider token and never returns it;
- the relay enforces the per-day quota server-side (per IP / per install
  token), because the on-device counter can be reset at will;
- the relay applies the same privacy rules as a BYOK host: it is named in the
  consent dialog, the photo is metadata-stripped before it leaves the device,
  and nothing is logged beyond what quota needs;
- the app only ever learns the relay's URL (`relayUrl`, not a secret).

That relay does not exist, so the stubs deliberately have **no token
parameter** and the rung is not selectable. Do not add one. If you are
tempted to "just pass a key with `--dart-define` for now": that is the
mistake the security review (S1) found, and
`tools/check_no_secrets_in_build.sh` will fail CI on it.

## BYOK — bring your own key (FR7)

The BYOK rung sends photos to an OpenAI-compatible endpoint **you** choose,
using **your** API key, via `Authorization: Bearer <key>`.

**There is no build-time key (S1).** Earlier builds could be given a key with
a `--dart-define`; that compiled the key into the JavaScript bundle / APK,
where anyone could read it. That define no longer exists. Only the
non-secret *endpoint* and *model* may be baked in as defaults, and they merely
pre-fill the form — they never switch the AI on. CI scans the build output
(`tools/check_no_secrets_in_build.sh`: `sk-`, `sk-or-v1-`, `AIza`,
`Bearer <token>` shapes) and fails if a secret-shaped string is present.

### Where the key lives

| Platform         | Storage                                                                 | Lifetime                       |
|------------------|-------------------------------------------------------------------------|--------------------------------|
| iOS / macOS      | Keychain, `first_unlock_this_device` (not in backups / iCloud Keychain) | Until you remove it            |
| Android          | Keystore-wrapped `EncryptedSharedPreferences` (backup disabled)         | Until you remove it            |
| **Web**          | **Memory only**                                                         | **This unlocked session only** |

On web the key is held in memory, never in `localStorage`, `sessionStorage`
or IndexedDB (S4). It is gone when you lock the app (locking restarts the
app's state), reload, or close the tab; you paste it again next session. That
is the price of not leaving a credential in a store any script on the origin
could read. The web store's own data stays encrypted and persistent — only
the AI key (and the AI settings) are session-bound. The app refuses to build
the secure-storage key store on web.

### The key and the screen

The key **never leaves the device** except as the `Authorization` header on
your own request. It is:

- **Never** transmitted to any OpenPlate-owned server.
- **Never** logged in any form; `toString` of every holder is redacted.
- **Never displayed back.** The field is obscured (no suggestions, no
  autocorrect, no IME learning), paste-friendly (whitespace a paste drags
  along is filtered out), and cleared after saving. The only trace on screen
  is `key saved • ends with ••••abcd` — the last four characters, and only for
  keys of 12+ characters (shorter keys show just "key saved"; the start of the
  key, which identifies the provider, is never shown).
- **Never** serialized outside the platform keystore (or memory on web).

### The key is bound to its host

The key is stored together with the **host** it was entered for. It is only
ever used for that host: edit the endpoint to a different host and the saved
key is not sent there — saving is refused until the key for the new endpoint
is pasted again (and *Test connection* asks for it too). A key saved by an
older build has no recorded host and is treated the same way. The binding is
by host only, not scheme, port or path. Redirects are never followed (a
`Location` header would otherwise carry the key and the photo to a server
nobody chose); a 3xx is a failure.

> **Rotate any key that was ever compiled in.** If a key was ever passed as a
> build-time define, or was held in a browser's `localStorage` by an older
> build, treat it as exposed: revoke it at the provider and issue a new one.
> Current web builds also delete any such leftover entries on start (best
> effort), but that does not un-leak a key already shipped.

### Endpoint rules (N7)

- `https://` is required. Plain `http://` is accepted **only** for
  `localhost`, `127.0.0.1` and `::1` (a model running on this device).
- No `user:pass@`, no `?query`, no `#fragment` (that is where keys leak into
  logs).
- The chat URL is built with `Uri.resolve`, so a trailing slash on the base
  never produces `//chat/completions`.

### Test connection

*Test connection* sends one tiny request (`max_tokens: 1`, 20 s timeout) with
the endpoint, model and key currently typed in the form — saved or not — and
reports calmly: connected, key not accepted, slow down, no answer in time,
couldn't reach it, unexpected status. A test saves nothing.

Removing the key returns the app cleanly to the previous rung
(the one that was active before the key was entered). The
previous rung is remembered in `AiRungConfig.previousRung` so
the user gets back exactly what they had — not always
`noOp`.

### Rate limits (N8)

A 429 reads `retry-after` (seconds) and `x-ratelimit-reset` by magnitude —
a small number is seconds from now, ~10⁹ is a unix time in seconds, ~10¹¹ is
milliseconds — and also understands duration strings such as `6m0s`, `1.5s`
and `20ms`. Anything else is "reset unknown" and the calm copy says so.

## Photos and privacy (N1)

A photo is the most personal thing OpenPlate can send anywhere, so:

1. **Consent, once per host.** Before the first photo goes to a host, a dialog
   names the host verbatim, says what is sent (the photo, shrunk, with
   location and camera details removed, plus a short instruction), what is
   not (your name, history, anything else), and where to change your mind.
   *Not now* drops the photo — the closest-matches / manual path is right
   there. The answer is remembered **per host** and can be revoked per host in
   Settings → Your AI. The BYOK rung also refuses to run without it, so the
   rule holds even if some other screen reaches the rung. Consent is keyed by
   **host only** (not scheme, port or path): agreeing to `api.example.com`
   covers every path on it. If the agreement cannot be saved, the photo is not
   sent (fail closed) and you are asked again next time.
2. **Smaller.** The camera is asked for at most 1024 × 1024 at quality 80.
3. **No metadata.** The platform's downscaling is *not* trusted to remove EXIF
   (the Android plugin copies the original's EXIF — including GPS — onto the
   resized file). At the single egress point the app strips it itself: JPEG
   APP1 (EXIF / XMP), APP3–APP13 (IPTC) and comment segments; PNG `eXIf` /
   text / time chunks; WebP `EXIF` / `XMP ` chunks. A file whose metadata
   cannot be removed safely (HEIC), or that is malformed or unrecognised, is
   **not sent**.
4. **The real MIME type**, read from the file's magic bytes — not a
   hard-coded `image/jpeg`.
5. **Not kept.** Photo bytes are never held in a provider after the
   recognition call (N10); there is no "last photo".

## Network hygiene (N3)

Every HTTP client the app builds uses connect 10 s / send 30 s / receive 45 s
timeouts and reads responses as a stream, aborting (and cancelling the
request) past 2 MiB. At most 20 foods are kept from a model reply, and every
name and quantity hint is cleaned of control characters and capped at 100
characters — the reply is untrusted text that ends up in the UI and in
exports. Open Food Facts lookups ask only for the fields the parser reads
(`fields=`) and carry a descriptive `User-Agent` (app, version, project URL;
no personal contact; omitted on web, where browsers forbid setting it). The
project URL in it is currently a **placeholder** — there is no public
repository yet — so Open Food Facts cannot reach the maintainers through it
until it is replaced. A
transient OFF failure is **not** cached for the rest of the session — only a
match or a definitive "not found" is.

## Exports (N2)

CSV cells that begin with `=`, `+`, `-`, `@`, TAB or CR are prefixed with `'`
so a spreadsheet treats them as text, not a formula; product names from OFF
and model output are attacker-influenced. Numeric quantity columns are written
as plain numbers (a legitimate `-2` stays `-2`). Fields containing CR are
quoted and long fields are capped.

## Telemetry off (FR12)

No telemetry is emitted on any rung. The free provider is called
via the configured adapter without an analytics wrapper. The
BYOK provider is called without an analytics wrapper. The
quota counter, the BYOK key store, and the rung config are
never wrapped in an analytics call.

Story 4.5 pins this claim with a verification gate:
`melos run check:telemetry` walks the source tree and asserts no
unsanctioned path opens a socket. The gate is part of the standard
test suite and the release-gate CI. See
[`docs/telemetry-posture.md`](./telemetry-posture.md) for the
full user-facing posture.

## v2 local-model seam (FR8)

The `local` rung is reserved for v2. The v1 adapter
(`LocalAiRung`) throws `UnsupportedError` on `recognize`; the
seam is declared in the type system and provider wiring so a
future v2 implementation drops in behind the same port without
touching the core or the UI.

## Related docs

- `ARCHITECTURE-SPINE.md` — §AD-5 (AI tier ladder) and §AD-8
  (at-rest encryption honest-difference story).
- `_bmad-output/specs/spec-openplate/SPEC.md` — CAP-6 (AI tier
  ladder), FR6 / FR7 / FR8.
- `_bmad-output/implementation-artifacts/spec-3-2-…` — hosted-
  quota story spec.
- `_bmad-output/implementation-artifacts/spec-3-3-…` — BYOK
  story spec.