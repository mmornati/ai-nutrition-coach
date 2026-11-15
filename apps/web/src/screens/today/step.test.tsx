// One next step, remembered (lot 6, item 3): offered under a coach note ("Try it this week"), kept
// in the synced key/value store, shown quietly on Today ("This week: ...") with "Done with this" and
// "Drop it", and reviewed in the week from the logged meals. No counts, no streaks.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { parseStep, serializeStep } from '@anc/core';
import { at, renderInSession, seedPlate, unlockedBundle } from '../../app/testing';
import { KV_KEYS, type StoreBundle } from '../../storage';
import { strings } from '../../i18n';
import { TodayScreen } from './TodayScreen';
import { WeekReview } from '../week/WeekReview';

const s = strings();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 12, 10) });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.location.hash = '';
});

async function seed(): Promise<StoreBundle> {
  const bundle = await unlockedBundle();
  await seedPlate(bundle, at(12, 5), [['Pasta', 'starch']]);
  const note = await bundle.notes.append({
    id: 0,
    plateLogId: 1,
    anchor: 'postResolve',
    questionKey: 'post.resolve.vegLight',
    text: s.coachQuestions['post.resolve.vegLight'],
    generatedAt: at(12, 6),
  });
  if (note.kind !== 'coachNoteAppended') throw new Error('seed');
  return bundle;
}

describe('Try it this week', () => {
  it('accepts the step under the note, keeps it, and shows it quietly on Today', async () => {
    const user = userEvent.setup();
    const bundle = await seed();
    const { container } = await renderInSession(<TodayScreen />, { bundle });
    const card = await screen.findByRole('group', { name: s.coach.group });
    await user.click(within(card).getByRole('button', { name: 'Try it this week' }));

    // The note is done with; the step takes its place as one quiet line.
    await screen.findByText('This week: a portion of vegetables at lunch');
    expect(screen.queryByRole('group', { name: s.coach.group })).toBeNull();
    expect(screen.getByRole('button', { name: 'Done with this' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Drop it' })).toBeVisible();
    // Kept in the key/value store, as exactly the object the core validates.
    const stored = parseStep(await bundle.kv.read(KV_KEYS.coachStep));
    expect(stored).toMatchObject({ id: 'vegAtLunch' });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('is offered only while no step is active (at most one at a time)', async () => {
    const bundle = await seed();
    await bundle.kv.write(KV_KEYS.coachStep, serializeStep({ id: 'waterForDrinks', at: at(8) }));
    await renderInSession(<TodayScreen />, { bundle });
    const card = await screen.findByRole('group', { name: s.coach.group });
    expect(within(card).queryByRole('button', { name: 'Try it this week' })).toBeNull();
    expect(screen.getByText('This week: water instead of sugary drinks')).toBeVisible();
  });

  it('"Done with this" and "Drop it" both just remove it, with no trace of a count', async () => {
    const user = userEvent.setup();
    for (const name of ['Done with this', 'Drop it']) {
      const bundle = await unlockedBundle();
      await bundle.kv.write(KV_KEYS.coachStep, serializeStep({ id: 'vegAtLunch', at: at(8) }));
      const view = await renderInSession(<TodayScreen />, { bundle });
      await screen.findByText(/This week: a portion of vegetables at lunch/);
      await user.click(screen.getByRole('button', { name }));
      await waitFor(() => expect(screen.queryByText(/This week:/)).toBeNull());
      expect(await bundle.kv.read(KV_KEYS.coachStep)).toBeNull();
      view.unmount();
    }
  });

  it('a gentle line about eating enough is never turned into a task', async () => {
    const bundle = await unlockedBundle();
    await seedPlate(bundle, at(19, 0), [['Pasta', 'starch']]);
    await bundle.notes.append({
      id: 0,
      plateLogId: 1,
      anchor: 'postResolve',
      questionKey: 'post.resolve.energyLowDay?pct=55&est=0',
      text: 'x',
      generatedAt: at(19, 1),
    });
    vi.setSystemTime(new Date(2026, 9, 14, 19, 10));
    await renderInSession(<TodayScreen />, { bundle });
    const card = await screen.findByRole('group', { name: s.coach.group });
    expect(within(card).getByText(/Eating enough matters too/)).toBeVisible();
    expect(within(card).queryByRole('button', { name: 'Try it this week' })).toBeNull();
  });
});

describe('the week looks back at the step from the logged meals', () => {
  it('says descriptively how many lunches had vegetables, then offers to keep, change or drop it', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await bundle.kv.write(KV_KEYS.coachStep, serializeStep({ id: 'vegAtLunch', at: at(9, 0, -6) }));
    for (const offset of [-5, -4, -3, -2]) {
      await seedPlate(bundle, at(12, 0, offset), [['Salad', 'vegFruit']]);
    }
    for (const offset of [-1, 0]) {
      await seedPlate(bundle, at(12, 30, offset), [['Rice', 'starch']]);
    }
    await renderInSession(<WeekReview />, { bundle });
    await screen.findByText(
      'You chose vegetables at lunch. They were on 4 of the 6 lunches logged.',
    );
    // No count of days, no streak, no score.
    expect(screen.queryByText(/streak|score|points/i)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Keep it another week' }));
    const kept = parseStep(await bundle.kv.read(KV_KEYS.coachStep));
    expect(kept?.at).toBeGreaterThan(at(9, 0, -6));
    await user.click(screen.getByRole('button', { name: 'Change it' }));
    await waitFor(() => expect(screen.queryByText(/You chose/)).toBeNull());
    expect(await bundle.kv.read(KV_KEYS.coachStep)).toBeNull();
  });

  it('a step the log cannot show says so instead of guessing', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(
      KV_KEYS.coachStep,
      serializeStep({ id: 'smallerPortion', at: at(9, 0, -3), food: 'Pizza' }),
    );
    await seedPlate(bundle, at(12, 0, -1), [['Rice', 'starch']]);
    await renderInSession(<WeekReview />, { bundle });
    await screen.findByText(
      /You chose a smaller portion of pizza\. The log cannot show that one, so only you can tell how it went\./,
    );
  });
});
