// One calm line per way finding, joining, creating or backing up can end. Shared by the places that
// do it (Your data and the first-run screen). The copy says what happened and that nothing was
// changed where that is true; it never says whether a handle exists unless it is "already taken".

import type { Locale } from '../../i18n/locale';
import { perLocale } from '../../i18n/locale';
import { fill, plural, type Strings } from '../../i18n';
import type { PlateSummary } from './join';
import type { CreateVaultFailure } from './create';
import type { OpenServerCopyFailure } from './server-copy';
import type { SyncStatus } from './sync-service';

export function findFailureText(failure: OpenServerCopyFailure, s: Strings['server']): string {
  switch (failure) {
    case 'invalidHandle':
      return s.invalidHandle;
    case 'noMatch':
      return s.noMatch;
    case 'rateLimited':
      return s.rateLimited;
    case 'offline':
      return s.offline;
    case 'unavailable':
      return s.unavailable;
    case 'schemaTooNew':
      return s.newerVersion;
    case 'damaged':
      return s.damaged;
    case 'tooLarge':
      return s.tooLarge;
  }
}

export function createFailureText(failure: CreateVaultFailure, all: Strings): string {
  const s = all.server;
  if (typeof failure === 'object') {
    return failure.passphrase === 'tooShort' ? all.session.tooShort : all.session.tooRepetitive;
  }
  switch (failure) {
    case 'invalidHandle':
      return s.invalidHandle;
    case 'handleTaken':
      return s.handleTaken;
    case 'signupClosed':
      return s.signupClosed;
    case 'inviteInvalid':
      return s.inviteInvalid;
    case 'serverFull':
      return s.serverFull;
    case 'rateLimited':
      return s.rateLimited;
    case 'offline':
      return s.offline;
    case 'tooLarge':
      return s.createTooLarge;
    case 'storeProblem':
      return s.storeProblem;
    case 'unavailable':
      return s.unavailable;
  }
}

const monthYear = perLocale(
  (tag) => new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' }),
);
const clockTime = perLocale(
  (tag) => new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit' }),
);

const sameDay = (a: number, b: number): boolean => {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
};

/** "from March 2026 to today", "in October 2026", or `null` when there is no plate. */
export function plateRangeText(
  summary: PlateSummary,
  now: number,
  locale: Locale,
  s: Strings['server'],
): string | null {
  if (summary.first === null || summary.last === null) return null;
  const from = monthYear(locale).format(new Date(summary.first));
  const lastIsToday = sameDay(summary.last, now);
  const to = lastIsToday ? s.rangeToday : monthYear(locale).format(new Date(summary.last));
  if (from === to) return fill(s.rangeIn, { when: from });
  return fill(s.rangeFromTo, { from, to });
}

/** "Found your data: 412 plates, from March 2026 to today." */
export function foundText(
  summary: PlateSummary,
  now: number,
  locale: Locale,
  s: Strings['server'],
): string {
  const range = plateRangeText(summary, now, locale, s);
  if (summary.count === 0 || range === null) return s.restoreFoundEmpty;
  return fill(s.restoreFound, {
    plates: plural(s.restorePlates, summary.count, locale),
    range,
  });
}

/** What the connected section says about the backup, from the service's status. */
export function statusText(
  status: Extract<SyncStatus, { connected: true }>,
  s: Strings['server'],
  locale: Locale,
): string {
  switch (status.phase) {
    case 'backedUp':
      return status.backedUpAt === null
        ? s.statusBackedUp
        : `${s.statusBackedUp} ${fill(s.statusLast, {
            time: clockTime(locale).format(new Date(status.backedUpAt)),
          })}`;
    case 'pending':
      return s.statusPending;
    case 'syncing':
      return s.statusSyncing;
    case 'offline':
      return s.statusOffline;
    case 'failed':
      return s.statusFailed;
    case 'needsUpdate':
      return s.statusNeedsUpdate;
    case 'rolledBack':
      return s.statusRolledBack;
    case 'signedOut':
      return s.statusSignedOut;
    case 'tooLarge':
      return s.statusTooLarge;
    case 'paused':
      return s.statusPaused;
  }
}
