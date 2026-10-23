// Self-test of tools/check_reviewers.mjs (the named-reviewer gate).
import { afterEach, describe, expect, it } from 'vitest';
import { checkReviewers, ownersOf, recordsOwner } from '../check_reviewers.mjs';
import { REPO, cleanup, makeTree, runCli } from './fixture.mjs';

afterEach(cleanup);

const tree = (codeowners, reviewers) =>
  makeTree({
    ...(codeowners === undefined ? {} : { '.github/CODEOWNERS': codeowners }),
    ...(reviewers === undefined ? {} : { 'REVIEWERS.md': reviewers }),
  });

describe('reviewers gate: this repository', () => {
  it('passes', () => {
    expect(checkReviewers(REPO)).toEqual([]);
  });
  it('passes as a CLI', () => {
    const r = runCli('check_reviewers.mjs', REPO);
    expect(r.code).toBe(0);
    expect(r.out).toContain('check:reviewers: OK');
  });
});

describe('reviewers gate: owners', () => {
  it('reads handles from non-comment lines only, once each', () => {
    expect(ownersOf('# @ignored\n*  @alice\n/docs/  @alice @org/team\n  # @also-ignored\n')).toEqual(['@alice', '@org/team']);
  });
  it('does not take an e-mail owner for a handle', () => {
    expect(ownersOf('*  docs@example.org\n')).toEqual([]);
  });
  it('matches a whole handle only', () => {
    expect(recordsOwner('- **Lead** — @alice\n', '@alice')).toBe(true);
    expect(recordsOwner('@alice', '@alice')).toBe(true);
    expect(recordsOwner('- @alicex\n', '@alice')).toBe(false);
    expect(recordsOwner('- x@alice\n', '@alice')).toBe(false);
    expect(recordsOwner('- @org/team, lead\n', '@org/team')).toBe(true);
    expect(recordsOwner('- @orgXteam\n', '@org.team')).toBe(false);
  });
});

describe('reviewers gate: fails on', () => {
  it('a missing REVIEWERS.md or CODEOWNERS', () => {
    expect(checkReviewers(tree('* @alice\n', undefined))).toEqual(['REVIEWERS.md is missing (Story 5.3 / FR-15)']);
    expect(checkReviewers(tree(undefined, '@alice\n'))).toEqual(['.github/CODEOWNERS is missing (Story 5.3 / FR-15)']);
  });
  it('a CODEOWNERS that names no owner', () => {
    expect(checkReviewers(tree('# @alice\n*  docs@example.org\n', '@alice\n'))).toEqual(['.github/CODEOWNERS names no owner']);
  });
  it('an owner not recorded in REVIEWERS.md, and exits non-zero', () => {
    const root = tree('*  @alice\n/docs/  @bob\n', '- @alice\n');
    expect(checkReviewers(root)).toEqual(['.github/CODEOWNERS owner @bob is not recorded in REVIEWERS.md']);
    const r = runCli('check_reviewers.mjs', root);
    expect(r.code).toBe(1);
    expect(r.out).toContain('@bob');
  });
});

describe('reviewers gate: passes on', () => {
  it('a fork that replaced the handle in both files', () => {
    expect(checkReviewers(tree('*  @someone-else\n', 'Lead — @someone-else\n'))).toEqual([]);
  });
});
