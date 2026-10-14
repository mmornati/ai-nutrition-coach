#!/usr/bin/env node
// The project-URL build rule (privacy audit PV11), ported from the earlier release-posture gate.
//
// The project URL is a BUILD-TIME setting (AI_NUTRITION_COACH_PROJECT_URL; default: the project
// repository). It identifies the project to Open Food Facts and goes into the app identity string
// only. Whatever the flavour, a URL that is set must be a plain https URL (no whitespace, quotes
// or shell characters). A RELEASE build (AI_NUTRITION_COACH_BUILD=selfhost|release, which the image
// build sets from AI_NUTRITION_COACH_RELEASE=1) additionally refuses an empty or `.invalid` host,
// so a placeholder cannot ship (docs/release-checklist.md).
//
//   node tools/check_project_url.mjs            reads the environment
//
// Exit 0 ok, 1 refused.
import { fileURLToPath } from 'node:url';

export const DEFAULT_PROJECT_URL = 'https://github.com/mmornati/ai-nutrition-coach';
export const RELEASE_FLAVOURS = ['selfhost', 'release'];
// Same shape as bin/ai-nutrition-coach's check: https, a host, optional port and a plain path.
const PROJECT_URL = /^https:\/\/[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]+)?(\/[A-Za-z0-9._~%/-]*)?$/;

/** The failures for this environment (empty = fine). */
export function checkProjectUrl(env) {
  const given = env['AI_NUTRITION_COACH_PROJECT_URL'] ?? '';
  if (given !== '' && !PROJECT_URL.test(given)) {
    return [
      'AI_NUTRITION_COACH_PROJECT_URL must be a plain https:// URL (no whitespace, quotes or shell characters)',
    ];
  }
  const build = env['AI_NUTRITION_COACH_BUILD'] ?? '';
  if (!RELEASE_FLAVOURS.includes(build)) return [];
  const url = given !== '' ? given : DEFAULT_PROJECT_URL;
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = '';
  }
  if (host === '' || host === 'invalid' || host.endsWith('.invalid')) {
    return [
      `AI_NUTRITION_COACH_BUILD=${build} but the project URL is "${url}" (empty or unresolvable): set AI_NUTRITION_COACH_PROJECT_URL to the real project page`,
    ];
  }
  return [];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const failures = checkProjectUrl(process.env);
  if (failures.length === 0) {
    console.log('check:project-url: OK');
  } else {
    console.error('check:project-url: FAIL');
    for (const f of failures) console.error(`  ${f}`);
    process.exitCode = 1;
  }
}
