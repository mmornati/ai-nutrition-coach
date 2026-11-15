// A small, offline strength check for the passphrase of the SERVER COPY (and, offered but never
// enforced, the one that unlocks this device). No dependency, no network.
//
// Why it matters more here: whoever runs the server holds the salt and a wrapped key, so they could
// try guesses on their own hardware, offline, for as long as they like. The Argon2id cost slows each
// guess; only a passphrase that is not on a guessing list stops them.
//
// What it checks, and what it does not:
//   - length: at least 16 characters, or 4 words of 3 letters or more, or 12 characters in one
//     piece (no spaces: a spaced phrase of fewer than 4 real words is easy to guess, so it needs 16);
//   - the few hundred commonest passwords and the words they are built from (`COMMON`, below: a
//     small list written for this app from widely published "most used passwords" rankings, no
//     third-party file embedded), also with digits or symbols added at the end and common
//     letter-for-digit swaps, or two or three of them glued together;
//   - keyboard walks and counting runs (qwerty, azerty, 123456, abcdef), one character or one short
//     unit repeated;
//   - the handle, and the name of this app, inside the passphrase.
// It cannot know a name, a date of birth or a lyric: it is a floor, not a promise.

export type ServerPassphraseIssue =
  | 'tooShort'
  | 'tooRepetitive'
  | 'common'
  | 'pattern'
  | 'repeated'
  | 'containsHandle'
  | 'containsApp';

const COMMON = new Set(
  (
    'password passw0rd passwort motdepasse mdp secret letmein welcome admin administrator login ' +
    'qwerty qwertz azerty azertyuiop qwertyuiop asdfgh asdfghjkl zxcvbn zxcvbnm abc abcd abcdef ' +
    'iloveyou jetaime teamo ilovecats monkey dragon master shadow sunshine princess football ' +
    'baseball soccer hockey basketball tennis golf cricket rugby batman superman spiderman ' +
    'starwars pokemon naruto hello hallo bonjour salut coucou trustno1 whatever freedom ' +
    'computer internet google facebook youtube twitter instagram iphone android samsung apple ' +
    'microsoft windows linux ubuntu michael jennifer jessica jordan ashley nicole daniel ' +
    'thomas robert charlie andrew joshua matthew anthony hunter killer ranger tigger buster ' +
    'cookie flower summer winter spring autumn purple orange yellow silver golden black white ' +
    'green blue pink love lover sexy hottie baby angel heaven money cash lucky happy ' +
    'smile cheese pepper ginger butter banana cherry chocolate coffee pizza hamburger ' +
    'nutella marseille paris lyon france soleil chouchou doudou loulou bisou cheval chat ' +
    'chien lapin papillon liberte camille nicolas julien david laurent sebastien thierry ' +
    'maxime alexandre romain lucas hugo louis chloe emma lea manon ines sarah ' +
    'mustang corvette porsche ferrari mercedes bmw audi toyota honda yamaha harley ' +
    'metallica nirvana beatles madonna eminem shakira rihanna ' +
    'test testing test123 guest root toor default changeme change111 temp temporary ' +
    'user username pass pass123 passe motdepasse1 azerty123 qwerty123 abc123 a1b2c3 ' +
    '111111 000000 121212 123123 123321 654321 666666 696969 987654321 123456789 1234567890 ' +
    '1q2w3e 1q2w3e4r 1qaz2wsx qazwsx zaq12wsx q1w2e3 q1w2e3r4 ' +
    'master123 admin123 root123 welcome1 letmein1 monkey1 dragon1 football1 ' +
    'superman1 batman1 sunshine1 princess1 iloveyou1 trustno1 starwars1 ' +
    'internet1 computer1 cheese1 summer1 winter1 spring1 autumn1 ' +
    'mypassword myname mypass myself family friend friends home house school student teacher ' +
    'work office job boss company business hello123 welcome123 ' +
    'nutrition coach health healthy diet food eating recipe kitchen ' +
    'azerty1 aaaaaa aaaaaaa bbbbbb zzzzzz xxxxxx qqqqqq wwwwww ' +
    'london newyork berlin madrid rome tokyo canada brazil germany spain italy ' +
    'pass1234 word1234 changeit letmein123 password1 password12 password123 password1234 ' +
    'qwerty12 qwerty1 qwerty1234 azerty12 azerty1234 iloveyou2 iloveyou12 ' +
    'abcdefgh abcdefghi abcdefghij abcdefghijkl'
  ).split(' '),
);

const LEET: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};

const ROWS = [
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
  'azertyuiop',
  'qsdfghjklm',
  'wxcvbn',
  '1234567890',
  '0123456789',
  'abcdefghijklmnopqrstuvwxyz',
];

/** The longest run of the text that walks along a keyboard row or counts up or down. */
function longestWalk(text: string): number {
  let best = 0;
  for (const row of ROWS) {
    for (const line of [row, [...row].reverse().join('')]) {
      for (let i = 0; i < text.length; i++) {
        let n = 0;
        const at = line.indexOf(text[i] ?? '');
        if (at < 0) continue;
        while (i + n < text.length && line[at + n] === text[i + n]) n++;
        if (n > best) best = n;
      }
    }
  }
  return best;
}

/** Splits into at most `max` pieces that are all in the list; true when the whole text is covered. */
function builtFromCommon(text: string, max: number): boolean {
  if (text === '' || max === 0) return text === '';
  for (let end = text.length; end >= 3; end--) {
    if (COMMON.has(text.slice(0, end)) && builtFromCommon(text.slice(end), max - 1)) return true;
  }
  return false;
}

/** The words of a phrase that count towards the four-word floor: three characters or more. */
const words = (passphrase: string): number =>
  passphrase.split(/\s+/).filter((w) => [...w].length >= 3).length;

/**
 * `null` when the passphrase is acceptable for the server copy. `context.handle`: the handle typed
 * beside it. The order is the order the person is told in: the most useful complaint first.
 */
export function checkServerPassphrase(
  passphrase: string,
  context: { readonly handle?: string } = {},
): ServerPassphraseIssue | null {
  const text = passphrase.normalize('NFC');
  const chars = [...text];
  const phrase = /\s/.test(text.trim());
  const longEnough = chars.length >= 16 || (chars.length >= 12 && !phrase) || words(text) >= 4;
  if (!longEnough) return 'tooShort';
  if (new Set(chars).size < 4) return 'tooRepetitive';

  const lower = text.toLowerCase();
  const squashed = lower.replace(/[\s\p{P}\p{S}]/gu, '');
  const bare = [...lower].filter((c) => /[\p{L}\p{N}@$!]/u.test(c)).join('');

  if (/^(.{1,4}?)\1{2,}$/su.test(squashed) || (squashed.length > 0 && maxShare(squashed) >= 0.5)) {
    return 'repeated';
  }
  const handle = context.handle?.trim().toLowerCase() ?? '';
  if (
    handle.length >= 3 &&
    (squashed.includes(handle.replace(/[^\p{L}\p{N}]/gu, '')) || lower.includes(handle))
  ) {
    return 'containsHandle';
  }
  if (/nutrition|nutritioncoach/.test(squashed)) return 'containsApp';

  // Trailing digits and symbols are what people add to a common word: look at what is left, also
  // with the usual letter-for-digit swaps undone.
  const unleet = (t: string): string => [...t].map((c) => LEET[c] ?? c).join('');
  for (const form of [bare, squashed]) {
    const core = form.replace(/[0-9@$!]+$/u, '');
    for (const candidate of [form, core, unleet(form), unleet(core)]) {
      const stripped = candidate.replace(/[0-9]+$/u, '');
      if (
        COMMON.has(candidate) ||
        (stripped.length >= 3 && (COMMON.has(stripped) || builtFromCommon(stripped, 3))) ||
        builtFromCommon(candidate, 3)
      ) {
        return 'common';
      }
    }
  }
  const walk = longestWalk(squashed);
  if (walk >= 6 || walk * 2 >= squashed.length) return 'pattern';
  return null;
}

function maxShare(text: string): number {
  const counts = new Map<string, number>();
  for (const c of text) counts.set(c, (counts.get(c) ?? 0) + 1);
  return Math.max(...counts.values()) / [...text].length;
}

/**
 * The same check for the passphrase that unlocks THIS device: only ever a hint (nothing is
 * refused). `null` when there is nothing to say.
 */
export const hintForLocalPassphrase = (passphrase: string): ServerPassphraseIssue | null =>
  passphrase === '' ? null : checkServerPassphrase(passphrase);
