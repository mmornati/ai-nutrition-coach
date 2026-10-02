# `_bmad-output/` — planning and implementation artifacts

This folder is **not product documentation**. It holds what the BMad
planning/implementation workflow produced while OpenPlate was built: briefs,
the PRD / architecture / ADRs, epic and story specs, sprint and loop status,
and the security and quality review (`review/`). It is kept in the tree as the
project's decision history and is the source the user-facing docs in `../docs/`
were translated from.

- Treat it as **history, not a promise.** Where it disagrees with the code, the
  tests or `../docs/`, those win. Claims about security and privacy are made in
  `../README.md` (the trust table, each row with a proof test) and `../docs/`,
  never here.
- `review/security-and-quality-review-2026-10-01.md` is the review and its
  remediation plan; its "Status" section lists what is done and what remains.
- Nothing in here is built, shipped or read by the app.

## `.opencode/`

`../.opencode/commands/*.md` are slash-command stubs for the OpenCode tool. Each
points at an installed skill (`@skills/<name>`); the skills themselves are
installer-managed and gitignored (`../.gitignore`, "Installed skills ..."), so
those references resolve only after the BMad installer has been run locally.
They are not broken, just regenerable, and nothing in the build depends on
them. They could be moved out of the public tree later without affecting the
product.
