import type { EpochMs } from '@anc/core';

/**
 * Parsing of "when does my rate limit reset" headers. Providers disagree on the shape of
 * `x-ratelimit-reset` / `retry-after`: a delta in seconds (`30`, `1.5`), a unix time in seconds,
 * a unix time in ms, or a duration string (`6m0s`, `1.5s`, `20ms`, `1h2m3s`). Numbers are told
 * apart by magnitude: >= 1e11 is epoch milliseconds, >= 1e9 is epoch seconds (September 2001),
 * anything smaller is a delta in seconds. Anything unparsable is `undefined` and the caller
 * renders the calm "resets tomorrow" copy.
 *
 * The value comes from a server we do not control, so it is clamped: a reset more than seven
 * days away is unknown, never an exception.
 */
export const MAX_RATE_LIMIT_RESET_MS = 7 * 24 * 60 * 60 * 1000;

/** The widest instant a `Date` can hold, in epoch ms. */
const MAX_EPOCH_MS = 8e15;

const UNSIGNED_NUMBER = /^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/;
const DURATION_PART = /(\d+(?:\.\d+)?)(ms|h|m|s|d)/g;
const UNIT_MS: Readonly<Record<string, number>> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** The instant the limit resets, or `undefined` when `raw` is absent or unusable. */
export function parseRateLimitReset(
  raw: string | null | undefined,
  now: EpochMs = Date.now(),
): EpochMs | undefined {
  const text = raw?.trim().toLowerCase();
  if (text === undefined || text === '') return undefined;

  if (UNSIGNED_NUMBER.test(text)) {
    const number = Number(text);
    if (!Number.isFinite(number)) return undefined;
    let at: EpochMs | undefined;
    if (number >= 1e11) at = number > MAX_EPOCH_MS ? undefined : Math.round(number);
    else if (number >= 1e9) at = Math.round(number * 1000);
    else at = number * 1000 > MAX_RATE_LIMIT_RESET_MS ? undefined : now + Math.round(number * 1000);
    return withinLimit(at, now);
  }

  const duration = parseDurationString(text);
  return duration === undefined ? undefined : withinLimit(now + duration, now);
}

function withinLimit(at: EpochMs | undefined, now: EpochMs): EpochMs | undefined {
  return at === undefined || at > now + MAX_RATE_LIMIT_RESET_MS ? undefined : at;
}

/** `6m0s` -> 360000; `1.5s`; `20ms`; `1h2m3s`. `undefined` unless the WHOLE string is parts. */
export function parseDurationString(text: string): number | undefined {
  let consumed = 0;
  let ms = 0;
  for (const m of text.matchAll(DURATION_PART)) {
    if (m.index !== consumed) return undefined;
    consumed = m.index + m[0].length;
    ms += Number(m[1]) * (UNIT_MS[m[2] as string] as number);
  }
  if (consumed === 0 || consumed !== text.length) return undefined;
  if (!Number.isFinite(ms) || ms > MAX_RATE_LIMIT_RESET_MS) return undefined;
  return Math.round(ms);
}
