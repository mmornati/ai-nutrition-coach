#!/usr/bin/env node
// Adults-only + no-under-13 gates, ported from tools/check_adults_only.dart and
// tools/check_no_under_13_profiles.dart (FR-13 / FR-14 / NFR-4, docs/adults-only.md).
//
// v1 ships adults-only paths. This reads every shipped file (apps/web/src, packages/core/src,
// apps/web/index.html and the service workers) from the TypeScript AST and rejects
//
//   * biometric APIs / identifiers: LocalAuthentication, FaceID, TouchID, face_detection,
//     voice_print, biometric_auth, face_recognition, speaker_recognition, faceApi, rekognition;
//   * under-13 / minor profile machinery: childProfile, under13, minorAccount, teenAccount,
//     parentAccount, ageGate, birthDate (and their PascalCase forms);
//   * biometric packages in any package.json.
//
// COMMENTS are never looked at (the AST has none), so documenting the ban is fine. Identifiers,
// string literals, template text, JSX text and module specifiers are matched word-wise and
// case-insensitively (`ageGate`, `AgeGate`, `age_gate`, `"age gate"` all match; `messageGate` does
// not). The only allowed marker is `ManagedOversightSeam` (packages/core, v2 seam: a type, no
// behaviour); no file is exempt, so the seam file is scanned like any other.
//
//   node tools/check_adults_only.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { declaredDependencies, lineOf, packageJsonFiles, parse, shippedFiles, ts, walkNodes } from './gates/shared.mjs';

export const BANNED_BIOMETRIC = [
  'LocalAuthentication', 'FaceID', 'TouchID', 'face_detection', 'voice_print', 'biometric_auth', 'face_recognition',
  'speaker_recognition', 'faceApi', 'rekognition',
];
export const BANNED_UNDER_13 = [
  'under13', 'childProfile', 'minorAccount', 'teenAccount', 'ageGate', 'birthDate', 'parentAccount',
];
/** Package-name fragments of biometric / face / voice libraries. */
export const BANNED_PACKAGE_FRAGMENTS = [
  'local-auth', 'local_auth', 'face-api', 'face-detection', 'face-recognition', 'voice-print', 'voiceprint',
  'biometric', 'rekognition', 'speech-recognition', 'speaker-recognition',
];
/** The one allowed marker: the v2 seam type (no behaviour). Its name is not a banned word. */
export const SEAM_MARKER = 'ManagedOversightSeam';

/** Lower-case words of an identifier or string: `messageGate` -> [message, gate], `under13` -> [under, 13]. */
export function words(text) {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

const bannedTerms = (list, group) => list.map((term) => ({ term, group, words: words(term) }));
const TERMS = [...bannedTerms(BANNED_BIOMETRIC, 'biometric'), ...bannedTerms(BANNED_UNDER_13, 'under-13 profile')];

function hasSequence(haystack, needle) {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** The banned terms a piece of text mentions. */
export function bannedIn(text) {
  const w = words(text.replaceAll(SEAM_MARKER, ''));
  return TERMS.filter((t) => hasSequence(w, t.words));
}

/** Findings `{path, line, group, message}` in one source file. */
export function scanSource(path, text) {
  const sf = path.endsWith('.html') ? undefined : parse(path, text);
  const findings = [];
  if (!sf) {
    // index.html: drop comments, then read the text.
    const stripped = text.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
    stripped.split('\n').forEach((line, i) => {
      for (const t of bannedIn(line)) findings.push({ path, line: i + 1, group: t.group, message: `banned ${t.group} reference: ${t.term}` });
    });
    return findings;
  }
  const check = (node, value) => {
    for (const t of bannedIn(value)) {
      findings.push({ path, line: lineOf(sf, node), group: t.group, message: `banned ${t.group} reference: ${t.term}` });
    }
  };
  walkNodes(sf, (n) => {
    if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) check(n, n.text);
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) check(n, n.text);
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) check(n, n.text);
    else if (ts.isJsxText(n)) check(n, n.text);
  });
  return findings;
}

/** Findings across the checkout at `root`. */
export function scanRepo(root) {
  const out = [];
  const files = [...shippedFiles(root)];
  if (readableIndex(root)) files.push('apps/web/index.html');
  for (const path of files) out.push(...scanSource(path, readFileSync(join(root, path), 'utf8')));
  for (const file of packageJsonFiles(root)) {
    for (const dep of declaredDependencies(readFileSync(join(root, file), 'utf8'))) {
      const hit = BANNED_PACKAGE_FRAGMENTS.find((f) => dep.toLowerCase().includes(f));
      if (hit) out.push({ path: file, line: 1, group: 'biometric', message: `banned biometric package: ${dep}` });
    }
  }
  return out;
}

function readableIndex(root) {
  try {
    readFileSync(join(root, 'apps/web/index.html'));
    return true;
  } catch {
    return false;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const findings = scanRepo(process.cwd());
  if (findings.length === 0) {
    console.log('check:adults-only: OK - no biometric API or package, no under-13 / teen / parent / child profile machinery.');
  } else {
    console.error('check:adults-only: FAIL');
    for (const f of findings) console.error(`  ${f.path}:${f.line}: ${f.message}`);
    process.exitCode = 1;
  }
}
