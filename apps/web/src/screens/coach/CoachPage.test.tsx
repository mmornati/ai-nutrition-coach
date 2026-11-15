// The coach page without any AI (lot 6, item 4): the step, the latest notes, the week in short and
// the daily guide with a link to Profile; one line about the AI, never a dead end. With an AI and the
// person's yes the conversation sits below the same sections.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { serializeStep } from '@anc/core';
import { chatReply, FakeFetch } from '../../ai/testing';
import {
  at,
  renderInSession,
  seedMeasuredPlate,
  seedPlate,
  unlockedBundle,
} from '../../app/testing';
import { configureByokCoaching } from '../../coaching/testing';
import { strings } from '../../i18n';
import { KV_KEYS } from '../../storage';
import { AskCoachScreen } from './AskCoachScreen';

const s = strings();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 20, 0) });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.location.hash = '';
});

describe('the coach page with no AI', () => {
  it('is a real page: step, latest notes, the week, the guide and one line about the AI', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(KV_KEYS.coachStep, serializeStep({ id: 'vegAtLunch', at: at(9, 0, -2) }));
    await bundle.kv.write(
      KV_KEYS.profile,
      JSON.stringify({ ageBand: '30-49', sex: 'female', activity: 'moderate', goal: 'maintain' }),
    );
    for (const offset of [-1, -2, -3]) {
      await seedMeasuredPlate(bundle, at(12, 0, offset), [
        {
          name: 'Salad',
          group: 'vegFruit',
          grams: 200,
          per100g: { energyKcal: 20, protein: 1, fibre: 3, salt: 0.1 },
        },
        {
          name: 'Beans',
          group: 'protein',
          grams: 100,
          per100g: { energyKcal: 90, protein: 8, fibre: 6, salt: 0.1 },
        },
      ]);
    }
    await seedPlate(bundle, at(12, 0), [['Pasta', 'starch']]);
    const last = await bundle.store.readRange({});
    if (last.kind !== 'platesRead') throw new Error('read');
    const pasta = last.plates.find((p) => p.entries[0]?.databaseFood.displayName === 'Pasta')!;
    await bundle.notes.append({
      id: 0,
      plateLogId: pasta.id,
      anchor: 'postResolve',
      questionKey: 'post.resolve.vegLight',
      text: s.coachQuestions['post.resolve.vegLight'],
      generatedAt: at(12, 1),
    });
    const { container } = await renderInSession(<AskCoachScreen />, { bundle });
    await screen.findByRole('heading', { level: 1, name: 'The coach' });

    expect(screen.getByText('This week: a portion of vegetables at lunch')).toBeVisible();
    const notes = screen.getByRole('region', { name: 'Latest notes' });
    await waitFor(() =>
      expect(within(notes).getByText(/No veg or fruit so far today/)).toBeVisible(),
    );
    expect(screen.getByRole('heading', { level: 2, name: 'The week, in short' })).toBeVisible();
    const guide = screen.getByRole('region', { name: 'Your daily guide' });
    expect(
      within(guide).getByText(/kcal and .* g of protein a day, worked out from your profile/),
    ).toBeVisible();
    expect(within(guide).getByRole('link', { name: 'Open Profile' })).toHaveAttribute(
      'href',
      '#/settings/profile',
    );
    // One quiet line about the AI, with the link; nothing greyed out, no conversation.
    expect(
      screen.getByText('No AI is set up, so the coach writes its built-in notes.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Choose one in Your AI' })).toHaveAttribute(
      'href',
      '#/settings/ai',
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('with numbers off the guide shows no figure', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(KV_KEYS.uiShowNumbers, 'off');
    await renderInSession(<AskCoachScreen />, { bundle });
    await screen.findByText(/Nutrition numbers are hidden, so the guide is too/);
    expect(screen.queryByText(/kcal/)).toBeNull();
  });

  it('with an AI and a yes the conversation sits below the same page', async () => {
    const fake = new FakeFetch();
    fake.jsonBody = chatReply('Lentils came up twice this week.');
    const bundle = await unlockedBundle();
    await configureByokCoaching(bundle);
    await renderInSession(<AskCoachScreen />, { bundle, session: { fetch: fake.fetch } });
    await screen.findByRole('textbox', { name: 'Your question' });
    expect(screen.getByRole('heading', { level: 2, name: 'Your step' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Ask the coach' })).toBeVisible();
    expect(screen.queryByText(/No AI is set up/)).toBeNull();
  });
});
