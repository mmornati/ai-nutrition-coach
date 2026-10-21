# AI Nutrition Coach — AI Tiers

This document describes the v1 AI tier ladder: the rungs the
`AiRung` port exposes, how they are configured, and how the
photo-recognition path behaves when each rung is active. It is the
canonical reference for FR6 (free quota honesty), FR7 (BYOK key
on-device), and FR8 (local-model v2 seam).

> Source of truth: the architecture spine (`ARCHITECTURE-SPINE.md`
> §AD-5 — AI tier ladder), kept in the PWA (ADR 0004), and the story specs in
> `_bmad-output/implementation-artifacts/spec-3-1-…`,
> `spec-3-2-…`, and `spec-3-3-…`. This doc is the user-facing
> translation; the specs are the contract. The code is
> `apps/web/src/ai` (adapters) and `packages/core` (the `AiRung` port).

## The rungs

Exactly one rung is active at any time. The active rung is the user's
choice in **Settings → Your AI** (reached from the gear on the Day Board)
and is read through the AI settings controller. It is **runtime state**: a change takes
effect on the next photo, with no restart, and is remembered across
restarts (see "Where settings live" below).

| Rung            | `AiRungKind`     | Status in this build                                   |
|-----------------|------------------|--------------------------------------------------------|
| Offline (no AI) | `noOp`           | Default; always available                              |
| Free model      | `hostedQuota`    | **Not built** (known accepted gap) — needs a server-side relay |
| Your key        | `byok`           | Active; your key, your endpoint                        |
| This server's AI | `instance`      | **Built** (Phase 4), only where the server's operator turned it on |
| Local model     | `local`          | v2 seam — not implemented                              |

The Your AI screen lists *No AI*, *My own key* and the two unavailable rungs, which read "Not available yet";
*Provided by this server* is listed, after *No AI*, only while the server offers it. A persisted value naming an
unavailable rung is normalised to *No AI* when it is loaded.

The v2 `local` rung exists in the type system and the rung registry; it
cannot be selected and returns a typed failure, so the seam is declared
without crashing the core.

### Instance-wide key (Phase 4): "Provided by this server"

Built. Whoever hosts the app can keep **one** OpenAI-compatible endpoint, key and model on the server
(`AI_PROXY_*` in `infra/server.env`; see [`docs/self-host.md`](./self-host.md#offer-ai-to-everyone-on-your-instance)
for setup, cost and abuse). The rung kind is `instance`.

- **The key never reaches the browser.** nginx answers `POST /ai/v1/chat/completions` on the app's own origin, adds the
  `Authorization` header itself and forwards nothing the browser sent. The browser's request carries only
  `Content-Type`: the existing OpenAI-compatible provider is used with `sendKey: false`
  (`apps/web/src/ai/openai-compatible-provider.ts`), which is pinned by tests.
- **What the browser can read** is `GET /ai/config.json`: `{ "enabled": true, "model": "…", "label": "…" }`, or
  `{ "enabled": false }`. It is read when the AI services are built (after the unlock; never blocking it) and again when
  Your AI opens or a photo needs it (`apps/web/src/ai/instance-config.ts`), parsed strictly, never cached, never precached.
- **Availability.** The choice appears in Your AI only while the server says it is on. On a **new** install (nothing stored
  yet) it becomes the starting choice; a person who already chose anything, No AI included, keeps their choice. If the
  server later switches it off, a saved choice of it does not silently become No AI: the next photo says the server does
  not offer AI right now, with the way to Your AI, and nothing is sent.
- **Consent is unchanged in shape and honest in content.** The upload host is this page's own host; the dialog says the
  photo goes to *this server* and is passed on to the provider named in the label, that the provider receives it from the
  server and not from the person's device, and that the server's software does not store it. "Ask before every photo upload"
  stays on by default. The one-shot permit and the consent gate apply exactly as for BYOK.
- **Failures are calm and about the server.** `429` is "The AI on this server is busy. Try again in a moment." (no
  countdown, even if a `Retry-After` is present); `404` is "This server does not offer AI right now."; a `5xx`, or a key
  the provider refused (the proxy answers `502`), is "The AI on this server did not answer. Try again in a moment." None says
  the person's own key was rejected: they have none. The no-AI core (closest matches, type it) is always right there.
- **Where the no-AI messages point.** When the server offers AI but the person is on No AI, the Snap sheet and the
  "No AI connected" sheet say so and link to Your AI.
- **Text, for the coach.** `AiServices.chat.completeChat(messages, options)` sends one plain chat completion through the
  same proxy (the instance rung's `completeChat`, `apps/web/src/ai/instance-ai-rung.ts`), returning
  `text | busy | unavailable | failure`; it is `unavailable` unless the rung is the instance rung and the server offers AI. It adds
  nothing to the messages and asks no consent: whoever builds on it explains what it sends. The server forces the model
  and caps `max_tokens`.

### Where settings live

The rung, the BYOK endpoint and model, and the per-host photo consents
(`AiSettings`) are not secrets, but they say which third parties you trust,
so they are stored like one:

- A row of the `kv` table inside the **encrypted web store** (`ai.settings`),
  readable only after the passphrase unlock and erased with the store. It is
  never in `localStorage` or `sessionStorage`, which any script on the origin
  can read.

## Free model — quota honesty (FR6)

> **Status: not built.** The hosted tier is a known accepted gap: there is no
> adapter that makes a request, and the rung cannot be selected. Everything
> below describes the intended behaviour once a relay exists — see "Hosted
> tiers need a relay".

The hosted-quota rung calls the configured free provider
(Cloudflare Workers AI by default — OQ-2) within a per-day
quota. The intended quota is **50** calls per
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
Anything compiled into a web bundle is public: it can be extracted
in minutes and then used by anyone, with no quota, at the project's expense.
This applies to a build variable (`VITE_*`), to a constant, and to a
"protected" asset alike.

The only acceptable shape for a hosted tier is a server-side relay:

    app ──(photo, no credential)──► AI Nutrition Coach relay ──(token)──► provider

- the relay holds the provider token and never returns it;
- the relay enforces the per-day quota server-side (per IP / per install
  token), because the on-device counter can be reset at will;
- the relay applies the same privacy rules as a BYOK host: it is named in the
  consent dialog, the photo is metadata-stripped before it leaves the device,
  and nothing is logged beyond what quota needs;
- the app only ever learns the relay's URL (`relayUrl`, not a secret).

That relay does not exist, so there is deliberately **no token
parameter** anywhere and the rung is not selectable. Do not add one. If you are
tempted to "just pass a key in a build variable for now": that is the
mistake the security review (S1) found, and
`tools/check_no_secrets_in_build.sh` will fail CI on it.

## BYOK — bring your own key (FR7)

The BYOK rung sends photos to an OpenAI-compatible endpoint **you** choose,
using **your** API key, via `Authorization: Bearer <key>`.

**There is no build-time key (S1).** An earlier client could be given a key at
build time; that compiled the key into the bundle, where anyone could read it.
That mechanism no longer exists, and the scan below fails if its name
reappears. Only the non-secret *endpoint* and *model* may be baked in as
defaults, and they merely pre-fill the form — they never switch the AI on. CI scans the build output
(`tools/check_no_secrets_in_build.sh`: `sk-`, `sk-or-v1-`, `AIza`,
`Bearer <token>` shapes) and fails if a secret-shaped string is present.

### Where the key lives

The key is stored **inside the encrypted web store** (a row of the `kv` table,
`ai.byokKey`: the same passphrase-derived ChaCha20-Poly1305 database as your
plates, ADR 0005), together with your AI settings and per-host photo consents.
It is readable only after you unlock the app, it survives locking and reloads
(you do not paste it again), and *Erase all local data* deletes it with
everything else. It is **never** in `localStorage` or `sessionStorage`, which any
script on the origin can read. Honest limits: someone who copies your browser's
storage and guesses your passphrase offline gets the key along with the rest of
your data (pick a long passphrase), and a malicious script running in your
unlocked page could read it (the strict CSP is the control). Because settings are
read from the open store, the app re-reads them after every unlock.

### The key and the screen

The key **never leaves the device** except as the `Authorization` header on
your own request. It is:

- **Never** transmitted to any AI Nutrition Coach-owned server.
- **Never** logged in any form (the log-hygiene gate fails on a log that could carry it).
- **Never displayed back.** The field is obscured (no suggestions, no
  autocorrect, no IME learning), paste-friendly (whitespace a paste drags
  along is filtered out), and cleared after saving. The only trace on screen
  is `key saved • ends with ••••abcd` — the last four characters, and only for
  keys of 12+ characters (shorter keys show just "key saved"; the start of the
  key, which identifies the provider, is never shown).
- **Never** serialized outside the encrypted store.

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
> build-time define, or was held in a browser's `localStorage` by an earlier
> client on this origin, treat it as exposed: revoke it at the provider and
> issue a new one. This build does not touch those leftovers (it only ever uses
> its own `anc.pwa.*` names), and removing them does not un-leak a key already
> shipped.

### Endpoint rules (N7)

- `https://` is required. Plain `http://` is accepted **only** for
  `localhost`, `127.0.0.1` and `::1` (a model running on this device).
- No `user:pass@`, no `?query`, no `#fragment` (that is where keys leak into
  logs).
- The chat URL is resolved with the `URL` API, so a trailing slash on the base
  never produces `//chat/completions`.

### Test connection

*Test connection* sends one tiny request (`max_tokens: 1`, 20 s timeout) with
the endpoint, model and key currently typed in the form — saved or not — and
reports calmly: connected, key not accepted, slow down, no answer in time,
couldn't reach it, unexpected status. A test saves nothing.

Removing the key returns the app cleanly to the previous rung
(the one that was active before the key was entered). The
previous rung is remembered in the rung config (`previousRung`) so
the user gets back exactly what they had — not always
`noOp`.

### Rate limits (N8)

A 429 reads `retry-after` (seconds) and `x-ratelimit-reset` by magnitude —
a small number is seconds from now, ~10⁹ is a unix time in seconds, ~10¹¹ is
milliseconds — and also understands duration strings such as `6m0s`, `1.5s`
and `20ms`. Anything else is "reset unknown" and the calm copy says so.

## Photos and privacy (N1)

A photo is the most personal thing AI Nutrition Coach can send anywhere, so:

1. **Consent, for every photo by default.** *Settings → Your AI* has a switch,
   **Ask before every photo upload**, **on by default** (also for settings saved by
   an older build). While it is on, every photo asks first, and a yes is a
   **one-shot permit for that photo only** (`PhotoUploadPermit`, spent by
   `ConsentGatedAiRung`, revoked when the photo is done): nothing is remembered and
   no host is added to the list. Turn it off and the older behaviour applies: you
   agree once per host, the answer is remembered **per host** and can be revoked per
   host in the same screen. Either way the dialog names the host verbatim and says
   exactly what is sent and seen:
   - *Sent:* the photo (shrunk, with its location and camera details removed), a
     fixed instruction asking which foods are on the plate and in which language to
     answer (English or French, the app language), and the model name you chose.
   - *Also visible to the host*, as on any request: your internet address and your
     device or app type (on the web: your browser type and the address of the site
     you are using, via the `Origin` header).
   - *Retention:* the host may keep requests under its own terms; check your
     provider's data policy (OpenRouter: Settings → Privacy; OpenAI: data controls).
     AI Nutrition Coach cannot see or change that.
   - *Not sent:* your name, your history, your other plates.
   A link opens the in-app privacy page (never an external URL). *Not now* drops
   the photo — the closest-matches / manual path is right there. The BYOK rung also
   refuses to run without the permit (or, in per-host mode, the agreement), so the
   rule holds even if some other screen reaches the rung. Consent is keyed by
   **host only** (not scheme, port or path): agreeing to `api.example.com`
   covers every path on it. If the agreement cannot be saved, the photo is not
   sent (fail closed) and you are asked again next time.

   **Children.** AI Nutrition Coach is designed for adults (a one-time notice says so) and
   most AI providers' terms require users to be 13 or 18+. If a child uses a device
   that has an AI key, leave **Ask before every photo upload** on, or better give the
   child their own device or browser profile with *No AI*. Barcode lookups send a barcode
   only.
2. **Smaller.** The photo is downscaled in the browser to at most 1024 × 1024 at quality 80.
3. **No metadata.** The browser's re-encoding is *not* trusted to remove EXIF
   (a photo that is passed through unchanged keeps its GPS). At the single egress
   point the app strips it itself: JPEG
   APP1 (EXIF / XMP), APP3–APP13 (IPTC) and comment segments; PNG `eXIf` /
   text / time chunks; WebP `EXIF` / `XMP ` chunks. A file whose metadata
   cannot be removed safely (HEIC), or that is malformed or unrecognised, is
   **not sent**.
4. **The real MIME type**, read from the file's magic bytes — not a
   hard-coded `image/jpeg`.
5. **Not kept.** Photo bytes are never held in a provider after the
   recognition call (N10); there is no "last photo".

### What the request contains (pinned by tests)

`apps/web/src/ai/openai-compatible-provider.test.ts` fails if the photo request ever gains a
field: the body is exactly `{model, messages, max_tokens, temperature}` with one user
message of two parts (the fixed prompt, the image data URL); the headers the app sets are only
`Authorization` and `Content-Type`. The browser adds its own `User-Agent` and an `Origin` header,
which the consent dialog and the privacy page say; no date, id or name is in it.
The one thing that follows the person is the **language**: the fixed instruction is one of two
templates, English or French (`RECOGNITION_PROMPTS`, chosen from the app language when the request
is built), which ask for each food's `name` and `quantityHint` in that language. The `group` values
stay the English identifiers the reply is checked against.

The same fixed instruction also asks for three numeric fields per food, added with the nutrition
numbers of ADR 0006 (the provider header requires a new field to be argued here):

- `grams`: the model's guess of the food's weight on the plate. It is stored as an estimate
  (`gramsEstimated`) and shown with "≈".
- `per100g`: the model's guess of the food's nutrients per 100 g. It is validated with
  `sanitizeNutrients` and stored with `extra.nutrientsEstimated`, so totals that count it read
  as estimated ("~"). A confident CIQUAL or seed match for the same food replaces these values
  before the person sees them; the model's numbers are used only when no catalogue food agrees.
- `confidence`: 0 to 1, shown only as the words "likely" or "maybe", never as a number.

These are answers requested from the model, not extra data sent about the person: the request
body and headers are unchanged. No free text from the person goes into
either template, and there is no locale field. The consent dialog and the privacy page say so. The
connection test sends a one-token `ping`. Nothing is
sent about the person: no name, no history, no other plates, no coach notes.

## Network hygiene (N3)

Every request the app makes goes through one capped fetch: connect 10 s / send 30 s /
receive 45 s budgets (the browser exposes one wait for the headers, so the longest
applies), the response read as a stream and aborted past 2 MiB, no redirects followed,
no cookies, referrer or cache. At most 20 foods are kept from a model reply, and every
name and quantity hint is cleaned of control characters and capped at 100
characters — the reply is untrusted text that ends up in the UI and in
exports. Open Food Facts lookups ask only for the fields the parser reads
(`fields=`); browsers forbid setting a `User-Agent`, so none is sent. The project
URL (the default is the project repository,
`https://github.com/mmornati/ai-nutrition-coach`; override it for a fork) is a
build-time setting checked by `node tools/check_project_url.mjs`, which fails
for a release build only if the URL is empty or `.invalid` (see the release
checklist); the React app has no identity string yet, so nothing consumes it. A
transient OFF failure is **not** cached for the rest of the session — only a
match or a definitive "not found" is.

## Exports (N2)

CSV cells that begin with `=`, `+`, `-`, `@`, TAB or CR are prefixed with `'`
so a spreadsheet treats them as text, not a formula; product names from OFF
and model output are attacker-influenced. Numeric quantity columns are written
as plain numbers (a legitimate `-2` stays `-2`). Fields containing CR are
quoted and long fields are capped.

## Telemetry off (FR12)

No telemetry is emitted on any rung. The BYOK provider is called without an
analytics wrapper. The BYOK key store and the rung config are never wrapped in
an analytics call.

Story 4.5 pins this claim with a verification gate:
`pnpm check:telemetry` walks the TypeScript AST of every shipped file and asserts no
unsanctioned path opens a connection. The gate is part of the standard
test suite and the release-gate CI. See
[`docs/telemetry-posture.md`](./telemetry-posture.md) for the
full user-facing posture.

## v2 local-model seam (FR8)

The `local` rung is reserved for v2. It is declared in the type system and the
rung registry and cannot be selected, so a future implementation drops in
behind the same port without touching the core or the UI.

## Coaching (AI coach notes, Ask the coach, the weekly paragraph)

The coach works without any AI: its built-in notes and weekly review are rules on the device. With an AI rung chosen
(this server's AI, or your own key) and **a separate yes**, three optional features use a text chat on top of them.
Photos and meal data are different things, so this is its own switch in *Settings, Your AI, AI coaching*
("Let the AI write coach notes and answer questions"). It is **off by default**, it is recorded for one destination
only (your endpoint host, or for this server's AI the host, provider label and model together, like the photo
consent), and when the destination changes the stored yes is **cleared** (going back to the old destination asks
again). No coaching call is made without it (checked at call time; revoking forgets it in memory first, so it takes
effect at once even if the write fails). The Ask the coach conversation is also cleared whenever the destination or
the yes changes. The photo consent never counts for it and it never counts for
photos. With **No AI** nothing is sent.

| Feature | When it runs | Exactly what is sent |
| --- | --- | --- |
| Coach note | After a plate is logged, only if the template coach had a note | Per food on the plate: name, food group, weight, nutrients; the plate's and the day so far's nutrient totals against the daily guide; the names (deduplicated, at most 12) of what you ate earlier that day; the number of plates; the meal slot (breakfast / lunch / dinner / late); the optional profile; the template coach's pattern name as a hint |
| Ask the coach | Each question you type (max 500 characters, 6 per conversation) | The last seven days as one JSON document sent as a labelled data message (per day: its date without a time, number of plates, food groups, food names, nutrient totals; the top foods), the daily guide, the optional profile, your typed questions and the earlier answers of the conversation (the last two answered questions at most) |
| Weekly paragraph | Only when you tap "Ask the coach about this week" | The number of days logged, the daily averages, the days each food group appeared, the daily guide, the keys of the rule-based remarks, the optional profile |

The optional profile is the goal, diet, allergies, age band, sex and activity, whichever you filled in. **Never sent**:
photos, your passphrase, your key (it goes only in the request header to your own endpoint, never to this server's
proxy), database ids, birth dates, or any time of day. Ask the coach sends the dates of the days (year-month-day) and the
meal slot of a note is a name, not a time. With *nutrition numbers turned off*, weights, nutrients and the guide are left out
altogether and the system prompt forbids amounts. Food names are cleaned (one line, 60 characters) and the system
prompt tells the model that everything in the document is data, not instructions.

**Prompts** live in one module, `packages/core/src/coach/ai-prompts.ts` (English and French, matching the interface
language), with tests that pin the safety rules and the output contract. They say: a calm friend who asks rather than
scolds; no exclamation marks, streaks, scores, points, "remaining" or "over budget"; no good or bad foods; not medical
advice (never diagnose, treat or cure, no medication or doses; for a symptom or a worry about eating or the body, say
that talking to a doctor or a support service can help); respect diet and allergies; no links.

**Every AI text is validated** (and normalised first: NFKC, invisible characters removed, so a fullwidth "！" or a zero-width
character cannot slip through; French output gets the narrow no-break space before `? ; :` and inside « ») (`validateCoachText`) before it is shown: not empty; at most 280 characters for a note
(160 for its follow-up), 800 for a chat answer, 600 for the weekly paragraph; no link or web address; no exclamation
mark; none of the pressure vocabulary of the No-Dark-Patterns Standard (EN and FR); no medical-claim words (diagnose,
cure, treatment, prescribe, and the French equivalents); no harmful advice (skipping meals or breakfast, fasting,
losing weight, a calorie deficit or cutting calories, purging, laxatives, a daily energy figure under 1200 kcal, and
the French equivalents, for example "sauter le dîner", "jeûne", "perdre du poids"); no link or bare domain; at most one question (two in a chat answer); and, while
numbers are off, no amount (digits followed by g, kcal or %). A note must be the JSON object
`{ "note": string, "followUp": string }`. Anything else is dropped.

**Fallbacks.** The log never waits for the AI: the template note is stored first and returned, then the AI call runs in
the background with an 8 second limit. On busy, offline, timeout, invalid JSON or any validator failure, the template
note stays and nothing is said. An AI note is stored as an ordinary coach-note row (`questionKey` `post.resolve.ai`,
the validated text in `text`; its optional follow-up is a `depthFollowUp` row, `depth.followUp.ai`), so there is no
schema change; the card (which watches the plate's notes) shows it in place of the template note, marked "Written by
AI", and falls back to the template note if numbers were turned off since. It is not swapped in if the template note
was already dismissed or its follow-up opened. A late answer after a lock writes nothing.

**Safety routing is local.** In Ask the coach, a question about an eating worry or a health symptom (EN/FR keywords:
binge, purge, starving, vomiting, "je me fais vomir", "crise de boulimie", chest pain, "malaise", ...) is answered on
the device and is never sent. Four routes, in this order: thoughts of self-harm (calm words and the crisis lines below),
a possibly urgent symptom (chest pain, trouble breathing, a swelling throat, an allergic reaction, fainting: "call your
local emergency number now"), an eating worry (the existing support line), any other symptom (see a doctor or a
pharmacist). Keywords are matched on accent-folded text in English and French; such a question is also never part of the context of later
questions. The conversation is kept in memory for the unlocked session only: not stored, not exported, gone on a lock.

**Size.** Requests stay inside the instance proxy's budget (at most 8 messages and 24 KB of text): the oldest turns of a
chat go first, then the foods listed per day.

## Describe a meal (typed, dictated or spoken)

*Log, Describe*: a multi-line field ("two eggs, toast with butter, a coffee with milk", at most 500 characters), and,
where it can work, a **Talk** button that records up to 30 seconds. It works with every rung, and without an AI.

- **No AI (or "Not now"):** the words are split on commas, new lines and "and" / "et", a leading amount is dropped, and
  each piece is looked up in the food list **on the device**. Nothing is sent; it works offline. The review sheet opens
  with the best match of each piece ticked and the other matches unticked.
- **With an AI:** the words go to the person's AI and come back as **the same list of foods a photo gives** (name,
  weight guess, per-100 g guess, group, confidence). Everything after that is the photo pipeline: a confident catalogue
  match replaces the AI's nutrient guess, the review sheet shows grams you can edit, and the plate is logged.
- **Voice:** the microphone is asked for only when the Talk button is tapped, for at most 30 seconds (`audio/webm` Opus,
  or `audio/mp4` on Safari, about 32 kbit/s); it is released the moment the recording ends. The audio is held in memory
  until the request returns and is **never stored**. It is sent to a Whisper-compatible `/audio/transcriptions`: your own
  endpoint (the voice model is set in Your AI, default `whisper-1`) or this server's proxy
  (`AI_PROXY_TRANSCRIPTION=1`, [self-host](./self-host.md#voice-to-text-describe-a-meal-by-voice)). The transcript lands
  in the text field for review; it is never logged by itself. A destination that has no such endpoint answers `404`: the
  button is hidden for it until the settings change. **Transcription only:** no speaker is identified or fingerprinted
  ([`docs/adults-only.md`](./adults-only.md)). The browser's own keyboard dictation (iOS, Android) also works in the field
  with nothing sent by this app.

**Consent.** A description is the person's own words about what they ate, and a recording is their voice: neither is a
photo and neither is coaching, so it has **its own yes** (*Settings, Your AI, Describing a meal with AI*; it is also asked
inline, in the Describe sheet, the first time). It is off by default, recorded for **one destination** (your endpoint's host,
or for this server's AI the host, provider label and model together), cleared when the destination changes, read at call
time (a revoke takes effect on the next call), and independent of the photo and coaching consents. It is stored in its own
row (`ai.describeConsent`), which goes with "Erase all local data". The disclosure says: the text you write or dictate,
or a short voice recording turned into text, plus a fixed instruction; the destination's host (and for this server the
provider behind it); not your name, history, other plates or photos; this app does not store the recording.

**What is sent (pinned by tests).** Text: a chat completion with exactly two messages, the fixed instruction (English or
French, the app language; it tells the model to treat the text as data) and the text (cleaned, at most 500 characters),
with the same `max_tokens` / `temperature` shape as a photo. It fits the instance proxy's input budget (at most 8 messages,
24 KB). Voice: a multipart body of exactly `model`, `language` (the app language) and `file`; headers are `Authorization`
(your own key, bound to its host) or none (this server). Nothing else: no date, id, name, history or profile.

## Related docs

- `ARCHITECTURE-SPINE.md` — §AD-5 (AI tier ladder) and §AD-8
  (at-rest encryption honest-difference story).
- `_bmad-output/specs/spec-openplate/SPEC.md` — CAP-6 (AI tier
  ladder), FR6 / FR7 / FR8.
- `_bmad-output/implementation-artifacts/spec-3-2-…` — hosted-
  quota story spec.
- `_bmad-output/implementation-artifacts/spec-3-3-…` — BYOK
  story spec.