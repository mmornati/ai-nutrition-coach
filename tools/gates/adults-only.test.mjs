// Self-test of tools/check_adults_only.mjs (adults-only + no under-13 profile machinery).
import { afterEach, describe, expect, it } from 'vitest';
import { bannedIn, scanRepo, scanSource, words } from '../check_adults_only.mjs';
import { REPO, cleanup, makeTree, runCli } from './fixture.mjs';

afterEach(cleanup);
const scan = (code, path = 'apps/web/src/x.ts') => scanSource(path, code);

describe('adults-only gate: this repository', () => {
  it('passes', () => {
    expect(scanRepo(REPO)).toEqual([]);
  });
});

describe('adults-only gate: fails on', () => {
  it.each([
    'LocalAuthentication', 'FaceID', 'TouchID', 'face_detection', 'voice_print', 'biometric_auth', 'face_recognition',
    'speaker_recognition', 'faceApi', 'rekognition',
    'childProfile', 'under13', 'minorAccount', 'teenAccount', 'parentAccount', 'ageGate', 'birthDate',
  ])('the identifier %s', (name) => {
    expect(scan(`export const ${name} = 1;`)).toHaveLength(1);
  });
  it.each(['ChildProfile', 'MinorAccount', 'TeenAccount', 'ParentAccount', 'AgeGate', 'BirthDate', 'isUnder13', 'user_birth_date', 'age_gate'])(
    'the other spelling %s',
    (name) => expect(scan(`export interface ${name} { x: 1 }`)).toHaveLength(1),
  );
  it('a string literal, template text, JSX text and a module specifier', () => {
    expect(scan("const a = 'enter your birth date';")).toHaveLength(1);
    expect(scan('const a = `age gate ${x}`;')).toHaveLength(1);
    expect(scan('export const A = () => <p>Sign in with FaceID</p>;', 'apps/web/src/a.tsx')).toHaveLength(1);
    expect(scan("import { x } from 'expo-local-authentication/face_detection';").length).toBeGreaterThan(0);
  });
  it.each([
    ['a plural (the last banned word is a prefix of the source word)', 'const childProfiles = [];'],
    ['a plural of minorAccount', 'const minorAccounts = 1;'],
    ['a suffixed ageGate', 'const myAgeGated = true;'],
    ['birthDates', 'const birthDates = [];'],
    ['a snake_case plural', 'const parent_accounts = 1;'],
    ['a lower-case run-together term', 'const birthdate = 1; '],
    ['a run-together plural', 'const childprofiles = 1;'],
    ['a regular-expression literal', 'const r = /birthDate/;'],
    ['a regular expression naming a spaced term', 'const r = /age gate/i;'],
    ['a constant concatenation', "const k = 'age' + 'Gate';"],
    ['a template with a constant', 'const k = `${"child"}Profile`;'],
    ['a unicode-escaped identifier', 'const \\u0061geGate = 1;'],
    ['a biometric prefix', 'const faceDetectionResult = [];'],
  ])('%s', (_n, code) => {
    expect(scan(code).length).toBeGreaterThan(0);
  });
  it('a property key and a type', () => {
    expect(scan('const o = { childProfile: 1 };')).toHaveLength(1);
    expect(scan('type T = { under13: boolean };')).toHaveLength(1);
  });
  it('index.html text', () => {
    expect(scan('<p>Face ID sign in</p>', 'apps/web/index.html')).toHaveLength(1);
    expect(scan('<!-- age gate -->\n<p>hello</p>', 'apps/web/index.html')).toEqual([]);
  });
  it('a biometric package in a package.json (checkout)', () => {
    const root = makeTree({ 'package.json': '{}', 'apps/web/package.json': '{"dependencies":{"react-native-biometrics":"1.0.0"}}' });
    expect(scanRepo(root).map((f) => f.message).join()).toContain('react-native-biometrics');
  });
});

describe('adults-only gate: passes on', () => {
  it('comments (the ban may be documented)', () => {
    expect(scan('// no FaceID, no ageGate, no birthDate\n/* childProfile under13 */\nexport const a = 1;')).toEqual([]);
  });
  it('the ManagedOversightSeam marker, and look-alike words', () => {
    expect(scan("export interface ManagedOversightSeam { readonly kind: 'managedOversightSeam' }")).toEqual([]);
    expect(scan('const messageGate = 1; const storageGate = 2; const parent = 3; const birth = 4;')).toEqual([]);
    expect(scan('const faceCount = 1; const touch = 2;')).toEqual([]);
    expect(scan('const messageGates = 1; const storagegate = 2; const childhood = 3; const parented = 4; const minorChange = 5;')).toEqual([]);
  });
  it('word matching', () => {
    expect(words('FaceID')).toEqual(['face', 'id']);
    expect(words('under13')).toEqual(['under', '13']);
    expect(bannedIn('messageGate')).toEqual([]);
    expect(bannedIn('AgeGate').map((t) => t.term)).toEqual(['ageGate']);
  });
});

describe('adults-only gate: a checkout', () => {
  it('fails the CLI (exit 1) on a violation in shipped code; ignores tests and comments; passes clean (exit 0)', () => {
    const clean = makeTree({
      'apps/web/src/a.ts': '// no ageGate\nexport const a = 1;',
      'apps/web/src/a.test.ts': 'const ageGate = 1;',
      'packages/core/src/m.ts': 'export interface ManagedOversightSeam { readonly kind: string }',
    });
    expect(runCli('check_adults_only.mjs', clean).code).toBe(0);
    const dirty = makeTree({ 'packages/core/src/a.ts': 'export const ageGate = 1;' });
    const r = runCli('check_adults_only.mjs', dirty);
    expect(r.code).toBe(1);
    expect(r.out).toContain('packages/core/src/a.ts:1');
  });
});
