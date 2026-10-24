#!/usr/bin/env node
// Named-reviewer gate (FR-15 / NFR-3 / AD-7), ported from the earlier ndp-review workflow.
//
// Asserts, at HEAD:
//   1. REVIEWERS.md and .github/CODEOWNERS exist;
//   2. CODEOWNERS names at least one owner;
//   3. every owner CODEOWNERS names is recorded in REVIEWERS.md.
//
// Generic on purpose: forking the repo and replacing the owner handle in both files needs no change
// here. An owner is a whitespace-delimited @handle on a non-comment line; e-mail owners such as
// a@b.example are not matched.
//
//   node tools/check_reviewers.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REVIEWERS = 'REVIEWERS.md';
export const CODEOWNERS = '.github/CODEOWNERS';

/** The distinct @handles a CODEOWNERS text names, in order of appearance. */
export function ownersOf(codeowners) {
  const owners = new Set();
  for (const line of codeowners.split('\n')) {
    if (/^\s*#/.test(line)) continue;
    for (const m of line.matchAll(/(?:^|\s)(@[A-Za-z0-9_./-]+)/g)) owners.add(m[1]);
  }
  return [...owners];
}

/** `true` if `reviewers` names `owner` as a whole handle (`@a` does not match `@ab` or `x@a`). */
export function recordsOwner(reviewers, owner) {
  const esc = owner.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_./@-])${esc}([^A-Za-z0-9_./-]|$)`, 'm').test(reviewers);
}

/** Failures of the gate for the checkout at `root` (empty = fine). */
export function checkReviewers(root) {
  const failures = [];
  for (const f of [REVIEWERS, CODEOWNERS]) {
    if (!existsSync(join(root, f))) failures.push(`${f} is missing (Story 5.3 / FR-15)`);
  }
  if (failures.length > 0) return failures;
  const owners = ownersOf(readFileSync(join(root, CODEOWNERS), 'utf8'));
  if (owners.length === 0) return [`${CODEOWNERS} names no owner`];
  const reviewers = readFileSync(join(root, REVIEWERS), 'utf8');
  for (const o of owners) {
    if (!recordsOwner(reviewers, o)) failures.push(`${CODEOWNERS} owner ${o} is not recorded in ${REVIEWERS}`);
  }
  return failures;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const failures = checkReviewers(process.cwd());
  if (failures.length === 0) {
    console.log('check:reviewers: OK (REVIEWERS.md + CODEOWNERS at HEAD)');
  } else {
    console.error('check:reviewers: FAIL');
    for (const f of failures) console.error(`  ${f}`);
    process.exitCode = 1;
  }
}
