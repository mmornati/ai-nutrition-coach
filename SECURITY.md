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

Out of scope: vulnerabilities in third-party services you connect yourself
(for example an AI provider), and issues that need a rooted or already
compromised device.
