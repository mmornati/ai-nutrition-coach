# Security policy

AI Nutrition Coach is built so that a user's data stays on their own device, and the
security of that promise matters more to us than any feature. Thank you for
helping keep it true.

## Supported versions

AI Nutrition Coach has not had a stable release yet. Until `1.0`, only the latest
commit on `main` and the most recent tagged release receive security fixes.

| Version                    | Supported |
| -------------------------- | --------- |
| `main` (latest)            | yes       |
| most recent tagged release | yes       |
| anything older             | no        |

## Reporting a vulnerability

Please report privately, not in a public issue or pull request.

Use GitHub's private vulnerability reporting: open the repository's
**Security** tab, choose **Report a vulnerability** (a GitHub Security
Advisory), and describe the problem. Include what you found, how to
reproduce it, and which version or commit you tested. If the report involves
a leaked secret, do not paste the live value; describe where it is.

We do not accept reports by personal email, and there is no bounty program.

## What to expect

These are targets from volunteer maintainers, not contractual promises:

- Acknowledgement within 5 working days.
- An initial assessment (accepted, needs more detail, or not a vulnerability)
  within 14 days.
- A fix or mitigation plan for confirmed issues, shared with you in the
  advisory, with a target of 90 days from the report at most. We will tell you
  if we need longer.
- Credit in the advisory and release notes if you want it.

Please give us the chance to ship a fix before disclosing publicly.

## Scope

In scope: the web app (`apps/web`), the domain core (`packages/core`), the
self-host image and scripts (`infra/`, `bin/`, `scripts/`), and the CI
workflows. Of particular interest: anything that sends user data off the
device without consent, weakens the on-device encryption, exposes a
bring-your-own-key AI key, or lets a build ship a secret.

## The instance-wide AI key (optional)

A self-hoster can keep one AI key on the server (`AI_PROXY_*`, `docs/self-host.md`). The design and what it does and
does not protect:

- **Protected:** the key never reaches the browser, the web bundle, the image or the logs. It exists only in the
  container's environment and in one `0600` file under `/tmp` rendered at start; the start refuses if that file is not
  private or if the key appears in any other rendered file. nginx forwards no browser header (no `Authorization`,
  `Cookie`, `Origin`, `Referer`, `X-Forwarded-For`), logs no header, body or query string, and replaces every provider
  error text (a refused or empty-balance key, an account) with a generic body, so nothing a provider says about the key or
  the account is shown. The bundle scan
  (`tools/check_no_secrets_in_build.sh`) and gitleaks run unchanged. A report that shows the key reaching any of these is in scope.
- **Not protected, by design:** anyone who can reach the instance can spend the key, within the rate limit. The limit is
  per client address as nginx sees it, so behind a reverse proxy it is effectively one cap for the whole instance. The
  server forces the model and caps the reply (output); the input is bounded to the app's shapes (at most 8 messages, 24 KB
  of text, one inline image, no remote URL) and the body to 2 MiB, but it cannot tell a photo question from any other
  question. Requests must be same-origin JSON (`Content-Type`, `Sec-Fetch-Site`, `Origin` are checked), so another
  website cannot spend the key through a visitor's browser. The
  mitigation is the operator's: put the instance behind a sign-in or an allow-list (the repository ships Traefik
  overlays for both) and set a spend limit at the provider. The key is also readable by anyone who can read the
  container's environment on the host (`docker inspect`), like any `.env` secret.
- **Voice to text (optional, off by default, `AI_PROXY_TRANSCRIPTION=1`):** the one extra route,
  `POST /ai/v1/audio/transcriptions`, takes a short voice recording (at most 1 MiB) for *Describe a meal*. Same-origin
  and multipart only; the key is added server-side; nothing the browser sent is forwarded but the multipart
  `Content-Type`; provider headers and error text are removed. njs validates the multipart structure and forces the model
  by **refusing** any body that does not carry exactly the configured model, one audio file and at most a language code
  (it does not rewrite binary audio), so a visitor cannot pick a dearer model or add a prompt. Rate limits are its own
  (6 a minute per address, 20 for the instance). Not protected, as above: anyone who can reach the instance can spend the
  key through it within those limits; the audio goes to the provider and is not stored by this software. Transcription
  only: no speaker is identified (`docs/adults-only.md`). A multipart POST needs no CORS preflight, so unlike the JSON chat route this one relies on the `Sec-Fetch-Site` / `Origin` checks (sent by every modern browser on a cross-origin POST) as its cross-site defence, with the rate limits behind them. The app's `Permissions-Policy` allows the microphone for its own
  origin only, and only a tap starts it.
- **A privacy trade-off, disclosed in the app:** a photo sent this way passes through the operator's server before it
  reaches the provider. The consent dialog says so, and the server relays it without storing it.

## The backup relay and shared instances (optional)

`apps/relay` stores a person's encrypted copy; it never receives a passphrase, a recovery key or plaintext. What it protects
and what it does not:

- **Protected:** what is stored is a handle, a salt, keyed hashes of two proofs (passphrase, recovery key), two wraps of the vault
  key and sealed envelopes. Changing the passphrase, adding or removing the recovery key and deleting a copy need a device token
  **and** a proof, so a stolen token alone cannot change or delete anything. Wrong proofs are limited in separate buckets
  (`login`, `proof`, `recovery`), and guessing one secret does not spend the budget of another. Exactly what is limited: the
  front-door passphrase login has a cap of `SYNC_RATE_HANDLE_DAY` (20) wrong tries per handle per 24 h, so someone who knows a
  handle can keep a brand-new device from logging in for up to a day (devices already signed in are unaffected). Proofs shown
  by a device token (`proof`, and the recovery key shown with a token) are counted per device token, not per handle: a thief
  with one stolen token can use up only that token's own allowance, never the owner's other devices, and cannot mint more
  tokens without a secret. The recovery key (160 random bits) has no daily per-handle cap, only a per-client lockout and a
  delay, so strangers cannot lock the owner out of recovery. Revoking devices needs no proof, so the owner can always sign a
  stolen token out from another device. Tokens are hashed, revocable and
  expire after `SYNC_TOKEN_MAX_IDLE_DAYS` (180). The previous envelope is kept `SYNC_KEEP_PREVIOUS_HOURS` (24) so a token cannot
  overwrite both versions at once. Invites made with the admin CLI are single use and stored hashed.
- **Not protected, by design:** a stolen device token can read the copy's ciphertext (not open it, the vault key is separate),
  write a new version (the previous one is kept), list and sign out devices. Whoever runs the server can try offline guesses
  against a stolen copy: the app refuses common and short passphrases, but cannot stop a weak personal one. A modified app served
  by the operator could exfiltrate keys. A recovery key written down insecurely opens the copy.
- **Known limits, out of scope for now:** a vault is not bound to the sign-in (SSO) identity; one profile per browser; no admin
  web page (the CLI only runs inside the container).
- **Per-person AI limits:** `AI_PROXY_USER_HEADER` is believed only from `AI_NUTRITION_COACH_TRUSTED_PROXIES` and is removed
  before the request goes upstream; if the app is reachable without the trusted proxy the header is ignored, but your
  forward-auth must overwrite it (Authentik does). Counters live in memory (a restart resets the day) and never hold the user value in clear.

Out of scope: vulnerabilities in third-party services you connect yourself
(for example an AI provider), and issues that need a rooted or already
compromised device.
