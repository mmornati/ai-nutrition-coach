# Security policy

OpenPlate is built so that a user's data stays on their own device, and the
security of that promise matters more to us than any feature. Thank you for
helping keep it true.

## Supported versions

OpenPlate has not had a stable release yet. Until `1.0`, only the latest
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

In scope: the app (`apps/client`), the shared packages (`packages/`), the
self-host image and scripts (`infra/`, `bin/`, `scripts/`), and the CI
workflows. Of particular interest: anything that sends user data off the
device without consent, weakens the on-device encryption, exposes a
bring-your-own-key AI key, or lets a build ship a secret.

Out of scope: vulnerabilities in third-party services you connect yourself
(for example an AI provider), and issues that need a rooted or already
compromised device.
