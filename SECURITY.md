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
  `Cookie`, `Origin`, `Referer`, `X-Forwarded-For`), logs no header, body or query string, and replaces a provider's
  `401`/`403` with a plain `502` so a provider message that quotes the key is not shown. The bundle scan
  (`tools/check_no_secrets_in_build.sh`) and gitleaks run unchanged. A report that shows the key reaching any of these is in scope.
- **Not protected, by design:** anyone who can reach the instance can spend the key, within the rate limit. The limit is
  per client address as nginx sees it, so behind a reverse proxy it is effectively one cap for the whole instance. The
  server forces the model and caps the reply size, but cannot tell a photo question from any other question. The
  mitigation is the operator's: put the instance behind a sign-in or an allow-list (the repository ships Traefik
  overlays for both) and set a spend limit at the provider. The key is also readable by anyone who can read the
  container's environment on the host (`docker inspect`), like any `.env` secret.
- **A privacy trade-off, disclosed in the app:** a photo sent this way passes through the operator's server before it
  reaches the provider. The consent dialog says so, and the server relays it without storing it.

Out of scope: vulnerabilities in third-party services you connect yourself
(for example an AI provider), and issues that need a rooted or already
compromised device.
