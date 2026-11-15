// Progress: weigh-ins, the weight trend and its words, the pace line, the history and the intake
// list. Descriptive wording only: no target, no verdict, no colour for better or worse.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { at, renderInSession, seedMeasuredPlate, unlockedBundle } from '../../app/testing';
import { KV_KEYS } from '../../storage';
import { ProgressScreen } from './ProgressScreen';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 20, 0) });
});
afterEach(() => {
  vi.useRealTimers();
  window.location.hash = '';
});

type Bundle = Awaited<ReturnType<typeof unlockedBundle>>;

const dayText = (offset: number): string => {
  const d = new Date(2026, 9, 14 + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function weigh(
  bundle: Bundle,
  offset: number,
  kg: number,
  kind: 'weight' | 'waist' = 'weight',
) {
  const d = new Date(2026, 9, 14 + offset, 8);
  const r = await bundle.measurements.record({
    kind,
    value: kg,
    measuredAtUtc: d.getTime(),
    day: dayText(offset),
  });
  if (r.kind !== 'measurement') throw new Error('could not seed a weigh-in');
}

async function open(bundle: Bundle) {
  const view = await renderInSession(<ProgressScreen />, { bundle });
  await screen.findByRole('heading', { level: 1, name: 'Trends' });
  return view;
}

describe('ProgressScreen: empty and sparse', () => {
  it('says so plainly when there is nothing, and offers the weigh-in', async () => {
    await open(await unlockedBundle());
    expect(screen.getByText(/No weigh-ins yet\. A few over a couple of weeks/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add a weigh-in' })).toBeVisible();
    expect(screen.queryByRole('img', { name: /chart/ })).not.toBeInTheDocument();
  });

  it('one weigh-in: the value, and that a trend needs a few more', async () => {
    const bundle = await unlockedBundle();
    await weigh(bundle, -2, 81.2);
    await open(bundle);
    expect(
      await screen.findByText('Weigh-in on Oct 12, 2026: 81.2 kg. A trend needs a few more.'),
    ).toBeVisible();
  });

  it('two weigh-ins less than a week apart: the trend, and that a change needs a week', async () => {
    const bundle = await unlockedBundle();
    await weigh(bundle, -3, 81.2);
    await weigh(bundle, -1, 81.0);
    await open(bundle);
    expect(
      await screen.findByText(
        /^Trend: 81\.2 kg\. A change needs weigh-ins that span at least a week\.$/,
      ),
    ).toBeVisible();
  });
});

describe('ProgressScreen: the trend in words', () => {
  it('a week of weigh-ins: lower than a week ago, never a verdict', async () => {
    const bundle = await unlockedBundle();
    await weigh(bundle, -13, 82);
    await weigh(bundle, -6, 81.5);
    await weigh(bundle, 0, 81.2);
    await open(bundle);
    const sentence = await screen.findByText(
      /^Trend: 81\.5 kg, about 0\.5 kg lower than a week ago\.$/,
    );
    expect(sentence).toBeVisible();
    for (const banned of [/great/i, /on track/i, /behind/i, /\bonly\b/i, /well done/i]) {
      expect(document.body.textContent).not.toMatch(banned);
    }
    // The chart is one image with a name, described by that sentence, and a table says the same.
    const chart = screen.getByRole('img', { name: 'Weight and trend chart' });
    expect(chart).toHaveAccessibleDescription(sentence.textContent ?? '');
    await userEvent.click(screen.getByText('Weigh-ins and trend as a table'));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(4); // header + 3 weigh-ins
    expect(within(table).getByText('Oct 14, 2026')).toBeVisible();
  });

  it('four weeks of weigh-ins: lower than four weeks ago, the pace, gaps are said', async () => {
    const bundle = await unlockedBundle();
    for (const [offset, kg] of [
      [-40, 84],
      [-28, 83],
      [-14, 82.4],
      [0, 82],
    ] as const) {
      await weigh(bundle, offset, kg);
    }
    await open(bundle);
    expect(await screen.findByText(/lower than four weeks ago\.$/)).toBeVisible();
    expect(
      screen.getByText(/^Over the last 28 days the trend moved about .* kg lower a week/),
    ).toBeVisible();
    expect(screen.getByText(/gaps between some weigh-ins/)).toBeVisible();
    // Ranges: the same weigh-ins on a longer range still show.
    await userEvent.click(screen.getByRole('radio', { name: '3 months' }));
    expect(screen.getByRole('img', { name: 'Weight and trend chart' })).toBeVisible();
  });

  it('the chart axis never exaggerates: its span is at least 4 kg for a 300 g change', async () => {
    const bundle = await unlockedBundle();
    await weigh(bundle, -10, 80.3);
    await weigh(bundle, -5, 80.1);
    await weigh(bundle, 0, 80.0);
    const { container } = await open(bundle);
    const labels = [...container.querySelectorAll('svg text')]
      .map((t) => Number(t.textContent))
      .filter((n) => Number.isFinite(n) && n > 20);
    expect(Math.max(...labels) - Math.min(...labels)).toBeGreaterThanOrEqual(4);
  });

  it('is calm and has no axe violations, with the table open', async () => {
    const bundle = await unlockedBundle();
    await weigh(bundle, -13, 82);
    await weigh(bundle, -6, 81.5);
    await weigh(bundle, 0, 81.2);
    await seedMeasuredPlate(bundle, at(12, 0, -1), [
      { name: 'Rice', group: 'starch', grams: 200, per100g: { energyKcal: 130, protein: 2.7 } },
    ]);
    const { container } = await renderInSession(<ProgressScreen />, { bundle });
    await screen.findByText(/Trend: /);
    await userEvent.click(screen.getByText('Weigh-ins and trend as a table'));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('ProgressScreen: the weigh-in sheet', () => {
  async function openSheet() {
    await userEvent.click(screen.getByRole('button', { name: 'Add a weigh-in' }));
    return screen.getByRole('dialog', { name: 'Weigh-in' });
  }

  it('saves a weight with a decimal comma for today, and says so', async () => {
    const bundle = await unlockedBundle();
    await open(bundle);
    const sheet = await openSheet();
    expect(within(sheet).getByText(/Same scale, in the morning, before eating\./)).toBeVisible();
    expect(
      within(sheet).getByRole('link', { name: /Beat, the UK eating disorder charity/ }),
    ).toBeVisible();
    await userEvent.type(within(sheet).getByLabelText('Weight in kg'), '81,2');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Weigh-in saved.')).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const listed = await bundle.measurements.list('weight');
    expect(listed.kind === 'measurement' && listed.value.map((m) => [m.day, m.value])).toEqual([
      [dayText(0), 81.2],
    ]);
  });

  it('a past day, a waist in the same sheet, and a second value for the day replaces with a plain note', async () => {
    const bundle = await unlockedBundle();
    await weigh(bundle, -3, 80);
    await open(bundle);
    const sheet = await openSheet();
    fireEvent.change(within(sheet).getByLabelText('Day'), { target: { value: dayText(-3) } });
    await userEvent.type(within(sheet).getByLabelText('Weight in kg'), '79.5');
    expect(
      within(sheet).getByText('You already have a weigh-in for this day. Saving replaces it.'),
    ).toBeVisible();
    await userEvent.type(within(sheet).getByLabelText('Waist in cm (optional)'), '90');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const weights = await bundle.measurements.list('weight');
    expect(weights.kind === 'measurement' && weights.value).toHaveLength(1);
    expect(weights.kind === 'measurement' && weights.value[0]?.value).toBe(79.5);
    const waists = await bundle.measurements.list('waist');
    expect(waists.kind === 'measurement' && waists.value[0]).toMatchObject({
      day: dayText(-3),
      value: 90,
    });
  });

  it('never the future, never a non-number, never an empty sheet', async () => {
    const bundle = await unlockedBundle();
    await open(bundle);
    const sheet = await openSheet();
    const save = () => userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await save();
    expect(within(sheet).getByText('Type a weight, a waist, or both.')).toBeVisible();
    await userEvent.type(within(sheet).getByLabelText('Weight in kg'), 'abc');
    await save();
    expect(within(sheet).getByText(/Please type a number, for example 70\./)).toBeVisible();
    await userEvent.clear(within(sheet).getByLabelText('Weight in kg'));
    await userEvent.type(within(sheet).getByLabelText('Weight in kg'), '500');
    await save();
    expect(within(sheet).getByText(/Please type a weight between 20 and 400 kg\./)).toBeVisible();
    await userEvent.clear(within(sheet).getByLabelText('Weight in kg'));
    await userEvent.type(within(sheet).getByLabelText('Weight in kg'), '80');
    fireEvent.change(within(sheet).getByLabelText('Day'), { target: { value: dayText(1) } });
    await save();
    expect(within(sheet).getByText('Please choose today or an earlier day.')).toBeVisible();
    const listed = await bundle.measurements.list('weight');
    expect(listed.kind === 'measurement' && listed.value).toHaveLength(0);
    expect(within(sheet).getByLabelText('Day')).toHaveAttribute('max', dayText(0));
  });

  it('follows the units of the profile: pounds in, pounds out, the same pounds back', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(KV_KEYS.profile, JSON.stringify({ units: 'imperial' }));
    await open(bundle);
    const sheet = await openSheet();
    expect(within(sheet).getByText(/a couple of pounds/)).toBeVisible();
    await userEvent.type(within(sheet).getByLabelText('Weight in lb'), '150');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Oct 14, 2026: 150 lb')).toBeVisible();
  });

  it('edits and removes any past entry from the history list', async () => {
    const bundle = await unlockedBundle();
    await weigh(bundle, -20, 82);
    await weigh(bundle, -1, 81);
    await open(bundle);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit the weigh-in of Sep 24, 2026' }),
    );
    const sheet = screen.getByRole('dialog', { name: 'Weigh-in' });
    expect(within(sheet).getByLabelText('Weight in kg')).toHaveValue('82');
    await userEvent.clear(within(sheet).getByLabelText('Weight in kg'));
    await userEvent.type(within(sheet).getByLabelText('Weight in kg'), '81.4');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      const listed = await bundle.measurements.list('weight');
      expect(listed.kind === 'measurement' && listed.value.map((m) => m.value)).toEqual([81, 81.4]);
    });
    await userEvent.click(
      screen.getByRole('button', { name: /Remove the weigh-in of .*Oct.*2026/ }),
    );
    // One calm question first; "Keep it" is the safe choice and nothing is removed by it.
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove this entry?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Keep it' }));
    const kept = await bundle.measurements.list('weight');
    expect(kept.kind === 'measurement' && kept.value).toHaveLength(2);
    await userEvent.click(
      screen.getByRole('button', { name: /Remove the weigh-in of .*Oct.*2026/ }),
    );
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
    );
    await waitFor(async () => {
      const listed = await bundle.measurements.list('weight');
      expect(listed.kind === 'measurement' && listed.value).toHaveLength(1);
    });
  });
});

describe('ProgressScreen: numbers off', () => {
  it('still takes a weigh-in, but echoes no figure and draws no chart', async () => {
    const bundle = await unlockedBundle();
    await weigh(bundle, -13, 82);
    await weigh(bundle, 0, 81.2);
    await bundle.kv.write(KV_KEYS.uiShowNumbers, 'off');
    await open(bundle);
    expect(
      screen.getByText(/Nutrition numbers are hidden, so the trend and the totals are too/),
    ).toBeVisible();
    expect(screen.queryByRole('img', { name: /chart/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Trend:/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/81\.2|82 kg|kg/);
    // The history is named by its dates; the entry can still be edited, and new ones still save.
    expect(screen.getAllByText(/^Weigh-in on /, { selector: 'span' })).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Add a weigh-in' }));
    const sheet = screen.getByRole('dialog', { name: 'Weigh-in' });
    await userEvent.type(within(sheet).getByLabelText('Weight in kg'), '80');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      const listed = await bundle.measurements.list('weight');
      expect(listed.kind === 'measurement' && listed.value[0]?.value).toBe(80);
    });
  });
});

describe('ProgressScreen: the pace line (docs/adr/0008)', () => {
  async function fastFall(bundle: Bundle) {
    for (let i = 30; i >= 0; i--) await weigh(bundle, -i, 90 - ((30 - i) * 1.5) / 7);
  }
  const LINE =
    'Your weight is going down faster than about 1 % a week. A slower pace is easier to keep and kinder to the body; consider a gentler pace in Profile, or talk to a doctor or a dietitian.';

  it('shows the fixed line with a link to Profile, hides for 14 days when dismissed, and comes back after', async () => {
    const bundle = await unlockedBundle();
    await fastFall(bundle);
    await open(bundle);
    expect(await screen.findByText(LINE)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Choose a pace in Profile' })).toHaveAttribute(
      'href',
      '#/settings/profile',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Hide this for 14 days' }));
    await waitFor(() => expect(screen.queryByText(LINE)).not.toBeInTheDocument());
    expect(await bundle.kv.read(KV_KEYS.uiPaceNoticeDismissedAtUtc)).toMatch(/^2026-10-14T/);
  });

  it('stays hidden 13 days after a dismissal and returns on the 14th', async () => {
    const bundle = await unlockedBundle();
    await fastFall(bundle);
    await bundle.kv.write(
      KV_KEYS.uiPaceNoticeDismissedAtUtc,
      new Date(2026, 9, 14 - 13, 20).toISOString(),
    );
    const view = await open(bundle);
    await screen.findByText(/^Trend: /);
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
    view.unmount();
    await bundle.kv.write(
      KV_KEYS.uiPaceNoticeDismissedAtUtc,
      new Date(2026, 9, 14 - 14, 20).toISOString(),
    );
    await open(bundle);
    expect(await screen.findByText(LINE)).toBeVisible();
  });

  it('is not shown for a gentle fall, and carries no colour class', async () => {
    const bundle = await unlockedBundle();
    for (let i = 30; i >= 0; i--) await weigh(bundle, -i, 90 - ((30 - i) * 0.3) / 7);
    await open(bundle);
    await screen.findByText(/^Trend: /);
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
  });
});

describe('ProgressScreen: the intake history', () => {
  it('lists each day against the guide; empty days are empty, not zero; partial totals read "at least"', async () => {
    const bundle = await unlockedBundle();
    await seedMeasuredPlate(bundle, at(12, 0, -1), [
      { name: 'Rice', group: 'starch', grams: 200, per100g: { energyKcal: 130, protein: 2.7 } },
    ]);
    await seedMeasuredPlate(bundle, at(12, 0, -2), [
      { name: 'Rice', group: 'starch', grams: 200, per100g: { energyKcal: 130, protein: 2.7 } },
      { name: 'Mystery stew', group: 'other' },
    ]);
    await open(bundle);
    await screen.findAllByRole('link', { name: /Show .* on Today/ });
    const rows = screen
      .getAllByRole('link', { name: /Show .* on Today/ })
      .map((a) => a.closest('li') as HTMLElement);
    // Today is empty (one row), two days hold plates, and the 25 empty days before them fold into one.
    expect(rows).toHaveLength(3);
    expect(within(rows[0] as HTMLElement).getByText('Nothing logged')).toBeVisible(); // today
    expect(within(rows[1] as HTMLElement).getByText('260 kcal')).toBeVisible();
    expect(within(rows[2] as HTMLElement).getByText(/^at least 260 kcal$/)).toBeVisible();
    // The tick is the guide; the bar is hidden from assistive tech and the value is text.
    expect(rows[1]?.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(document.querySelector('progress, [role="progressbar"]')).toBeNull();
  });

  it('is bounded: "All" reads at most 90 days and says so', async () => {
    const bundle = await unlockedBundle();
    await open(bundle);
    await userEvent.click(screen.getByRole('radio', { name: 'All' }));
    expect(await screen.findByText(/Showing the last 90 days\./)).toBeVisible();
    // Ninety empty days are one folded line, not ninety rows.
    expect(screen.queryAllByRole('link', { name: /Show .* on Today/ })).toHaveLength(0);
    expect(screen.getAllByText('Nothing logged')).toHaveLength(1);
  });
});

describe('ProgressScreen: a weight far from the last one is asked about once', () => {
  async function sheetOn(bundle: Bundle) {
    await open(bundle);
    await userEvent.click(screen.getByRole('button', { name: 'Add a weigh-in' }));
    return screen.getByRole('dialog', { name: 'Weigh-in' });
  }
  const QUESTION = 'That is quite different from your last weigh-in. Save it as typed?';
  const stored = async (bundle: Bundle) => {
    const listed = await bundle.measurements.list('weight');
    return listed.kind === 'measurement' ? listed.value.map((m) => m.value) : [];
  };

  it('asks before saving 182 after 82, without echoing a figure; "Change it" keeps nothing', async () => {
    const bundle = await unlockedBundle();
    await weigh(bundle, -3, 82);
    const sheet = await sheetOn(bundle);
    await userEvent.type(within(sheet).getByLabelText('Weight in kg'), '182');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    const question = await within(sheet).findByText(QUESTION);
    expect(question).toBeVisible();
    expect(question.textContent).not.toMatch(/\d/);
    expect(await stored(bundle)).toEqual([82]);
    expect(within(sheet).getByRole('button', { name: 'Change it' })).toHaveFocus();
    expect(await axe(sheet)).toHaveNoViolations();

    await userEvent.click(within(sheet).getByRole('button', { name: 'Change it' }));
    expect(within(sheet).queryByText(QUESTION)).not.toBeInTheDocument();
    expect(within(sheet).getByLabelText('Weight in kg')).toHaveFocus();
    await userEvent.clear(within(sheet).getByLabelText('Weight in kg'));
    await userEvent.type(within(sheet).getByLabelText('Weight in kg'), '81');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect(await stored(bundle)).toEqual([81, 82]));
  });

  it('saves it as typed when the person says so', async () => {
    const bundle = await unlockedBundle();
    await weigh(bundle, -3, 82);
    const sheet = await sheetOn(bundle);
    await userEvent.type(within(sheet).getByLabelText('Weight in kg'), '120');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await within(sheet).findByText(QUESTION);
    // The confirmation's own Save (the first of the two Save buttons in the sheet).
    await userEvent.click(within(sheet).getAllByRole('button', { name: 'Save' })[0] as HTMLElement);
    await waitFor(async () => expect(await stored(bundle)).toEqual([120, 82]));
  });

  it('asks nothing for a change within 10 % or 5 kg', async () => {
    const bundle = await unlockedBundle();
    await weigh(bundle, -3, 82);
    const sheet = await sheetOn(bundle);
    await userEvent.type(within(sheet).getByLabelText('Weight in kg'), '87');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect(await stored(bundle)).toEqual([87, 82]));
    expect(screen.queryByText(QUESTION)).not.toBeInTheDocument();
  });

  it('asks with numbers hidden too, and still shows no figure', async () => {
    const bundle = await unlockedBundle();
    await weigh(bundle, -3, 82);
    await bundle.kv.write(KV_KEYS.uiShowNumbers, 'off');
    const sheet = await sheetOn(bundle);
    await userEvent.type(within(sheet).getByLabelText('Weight in kg'), '182');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(await within(sheet).findByText(QUESTION)).toBeVisible();
    expect(sheet.textContent).not.toMatch(/182|82 kg/);
  });
});

describe('ProgressScreen: the weigh-in sheet, dates and removal', () => {
  it('says "choose a date" for an empty date, and still refuses a later one with its own message', async () => {
    const bundle = await unlockedBundle();
    await open(bundle);
    await userEvent.click(screen.getByRole('button', { name: 'Add a weigh-in' }));
    const sheet = screen.getByRole('dialog', { name: 'Weigh-in' });
    await userEvent.type(within(sheet).getByLabelText('Weight in kg'), '80');
    fireEvent.change(within(sheet).getByLabelText('Day'), { target: { value: '' } });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(within(sheet).getByText('Please choose a date.')).toBeVisible();
    expect(within(sheet).queryByText('Please choose today or an earlier day.')).toBeNull();
    const listed = await bundle.measurements.list('weight');
    expect(listed.kind === 'measurement' && listed.value).toHaveLength(0);
  });

  it('editing an entry and changing its date moves it: the original day is removed with it', async () => {
    const bundle = await unlockedBundle();
    await weigh(bundle, -20, 82);
    await weigh(bundle, -1, 81);
    await open(bundle);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit the weigh-in of Sep 24, 2026' }),
    );
    const sheet = screen.getByRole('dialog', { name: 'Weigh-in' });
    fireEvent.change(within(sheet).getByLabelText('Day'), { target: { value: dayText(-5) } });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      const listed = await bundle.measurements.list('weight');
      expect(listed.kind === 'measurement' && listed.value.map((m) => [m.day, m.value])).toEqual([
        [dayText(-1), 81],
        [dayText(-5), 82],
      ]);
    });
  });
});

describe('ProgressScreen: typing slips and gaps', () => {
  it('leaves a 182 and a 28 out of the trend and the axis, lists them marked and editable', async () => {
    const bundle = await unlockedBundle();
    await weigh(bundle, -14, 182);
    for (const offset of [-13, -12, -11, -8, -7, -6]) await weigh(bundle, offset, 82);
    await weigh(bundle, -9, 28);
    const { container } = await open(bundle);
    // The trend is about 82 kg, not dragged by either slip.
    expect(await screen.findByText(/^Trend: 82 kg/)).toBeVisible();
    // The axis stays around 82.
    const labels = [...container.querySelectorAll('svg text')]
      .map((t) => Number(t.textContent))
      .filter((n) => Number.isFinite(n) && n > 20);
    expect(Math.max(...labels)).toBeLessThan(100);
    expect(Math.min(...labels)).toBeGreaterThan(60);
    // The list keeps both, marked, each with its Edit action.
    const rows = screen
      .getAllByText(/\(not used for the trend\)/, { selector: 'span' })
      .map((el) => (el.textContent ?? '').replace(/\u00a0/g, ' '));
    expect(rows).toEqual([
      expect.stringContaining('28 kg (not used for the trend)'),
      expect.stringContaining('182 kg (not used for the trend)'),
    ]);
    expect(screen.getByRole('button', { name: 'Edit the weigh-in of Oct 5, 2026' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit the weigh-in of Sep 30, 2026' })).toBeVisible();
    expect(screen.getByText(/leaves them out in case of a typing slip/)).toBeVisible();
    // And so does the accessible table.
    await userEvent.click(screen.getByText('Weigh-ins and trend as a table'));
    const table = screen.getByRole('table');
    expect(within(table).getByText(/^182\s*kg \(not used for the trend\)$/)).toBeVisible();
  });

  it('after a gap, change and pace use the real days between the points', async () => {
    const bundle = await unlockedBundle();
    await weigh(bundle, -60, 80);
    await weigh(bundle, 0, 75);
    await open(bundle);
    expect(await screen.findByText(/about 5\.0 kg lower than 60 days ago\.$/)).toBeVisible();
    expect(screen.queryByText(/four weeks ago/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/^Over the last 60 days the trend moved about 0\.6 kg lower a week/),
    ).toBeVisible();
  });
});

describe('ProgressScreen: the pace line, more', () => {
  const LINE =
    'Your weight is going down faster than about 1 % a week. A slower pace is easier to keep and kinder to the body; consider a gentler pace in Profile, or talk to a doctor or a dietitian.';
  async function fall(bundle: Bundle, from: number, to: number) {
    for (let i = from; i >= to; i--) await weigh(bundle, -i, 90 - ((from - i) * 1.5) / 7);
  }

  it('stays visible with nutrition numbers off (it is a safeguard, not a figure)', async () => {
    const bundle = await unlockedBundle();
    await fall(bundle, 30, 0);
    await bundle.kv.write(KV_KEYS.uiShowNumbers, 'off');
    await open(bundle);
    expect(await screen.findByText(LINE)).toBeVisible();
    expect(screen.queryByText(/Trend:/)).not.toBeInTheDocument();
  });

  it('does not outlive its data: a latest weigh-in older than 14 days shows no line', async () => {
    const bundle = await unlockedBundle();
    await fall(bundle, 60, 30);
    await open(bundle);
    await screen.findByText(/^Trend: /);
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
  });

  it('is not shown on a diet start: only 14 days of history, however fast the water goes', async () => {
    const bundle = await unlockedBundle();
    for (let i = 14; i >= 0; i--) await weigh(bundle, -i, 100 - 2.5 * Math.min((14 - i) / 5, 1));
    await open(bundle);
    await screen.findByText(/^Trend: /);
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
  });
});
