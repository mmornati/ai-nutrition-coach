import { describe, expect, it } from 'vitest';
import { exportReminderDue } from '../src/index';
import { DAY_MS, utc } from './helpers';

const now = utc(2026, 10, 2, 12);
const daysAgo = (d: number): number => now - d * DAY_MS;

describe('exportReminderDue', () => {
  it('never suggests when there is nothing to lose', () => {
    expect(exportReminderDue({ now, hasData: false })).toBe(false);
  });

  it('suggests when there is data and no export ever', () => {
    expect(exportReminderDue({ now, hasData: true })).toBe(true);
  });

  it('is quiet for 14 days after an export, then speaks once', () => {
    expect(exportReminderDue({ now, hasData: true, lastExportAt: daysAgo(14) })).toBe(false);
    expect(exportReminderDue({ now, hasData: true, lastExportAt: daysAgo(15) })).toBe(true);
  });

  it('a dismissal quiets it for another 14 days', () => {
    expect(
      exportReminderDue({ now, hasData: true, lastExportAt: daysAgo(40), dismissedAt: daysAgo(3) }),
    ).toBe(false);
    expect(
      exportReminderDue({
        now,
        hasData: true,
        lastExportAt: daysAgo(40),
        dismissedAt: daysAgo(15),
      }),
    ).toBe(true);
    expect(exportReminderDue({ now, hasData: true, dismissedAt: daysAgo(1) })).toBe(false);
  });

  it('a dismissal older than the last export does not count', () => {
    expect(
      exportReminderDue({
        now,
        hasData: true,
        lastExportAt: daysAgo(20),
        dismissedAt: daysAgo(30),
      }),
    ).toBe(true);
  });
});
