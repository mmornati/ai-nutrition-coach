// The editor side of safer matching: each auto-matched line shows the pasted line next to the matched
// name ("200 g de riz → Riz blanc, cru"), and a line the matcher would not pick lists up to three
// suggestions, one tap each, that become ingredients with the line's weight. The reading itself is
// replaced here by a fixed result; the matcher is tested on the real catalogue in capture/.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { databaseFood, type FoodEntryDraft } from '@anc/core';
import { gramsQuantity } from '@anc/core';
import { strings } from '../../i18n';
import { renderInSession, unlockedBundle } from '../../app/testing';
import { TodayScreen } from '../today/TodayScreen';

const s = strings();
const t = s.relog.recipe;

const draft = (name: string, grams: number, estimated = false): FoodEntryDraft => ({
  databaseFood: databaseFood({
    sourceRef: `ciqual:${name}`,
    displayName: name,
    source: 'ciqual',
    nutrientsPer100g: { energyKcal: 120 },
  }),
  quantity: gramsQuantity(grams, { estimated, displayLabel: `${grams} g` }),
});

vi.mock('../../capture', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../capture')>();
  const soup = (name: string) => ({
    draft: {
      databaseFood: {
        sourceRef: `ciqual:${name}`,
        displayName: name,
        source: 'ciqual' as const,
        foodGroup: 'other' as const,
        nutrientsPer100g: { energyKcal: 60 },
      },
      quantity: {
        low: 300,
        high: 300,
        unit: 'g',
        displayLabel: '300 g',
        grams: 300,
        gramsEstimated: false,
      },
    },
    from: '300 g de soupe miso',
  });
  return {
    ...original,
    recipeFromText: vi.fn(async () => ({
      name: 'Bol',
      servings: 2,
      ingredients: [
        { draft: draft('Riz blanc, cru', 200), from: '200 g de riz' },
        { draft: draft('Lait', 500, true), from: '1/2 l de lait' },
      ],
      notAdded: [
        {
          raw: '300 g de soupe miso',
          suggestions: [soup('Soupe de légumes'), soup('Soupe de poisson')],
        },
        { raw: '1 pincée de xyzzy', suggestions: [] },
      ],
      anyEstimated: true,
    })),
  };
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 12, 10) });
});
afterEach(() => {
  vi.useRealTimers();
  window.location.hash = '';
});

async function openPasted() {
  const user = userEvent.setup();
  const bundle = await unlockedBundle();
  await renderInSession(<TodayScreen />, { bundle });
  await screen.findByText('Breakfast');
  await user.click(screen.getAllByRole('button', { name: s.shell.logAPlate })[0] as HTMLElement);
  const capture = await screen.findByRole('dialog', { name: s.capture.title });
  await user.click(within(capture).getByRole('button', { name: 'Saved meals and recipes' }));
  const saved = await screen.findByRole('dialog', { name: 'Saved meals and recipes' });
  await user.click(within(saved).getByRole('button', { name: 'New recipe' }));
  const editor = await screen.findByRole('dialog', { name: 'New recipe' });
  await user.click(within(editor).getByRole('button', { name: t.pasteOpen }));
  fireEvent.change(within(editor).getByLabelText(t.pasteLabel), { target: { value: 'anything' } });
  await user.click(within(editor).getByRole('button', { name: t.pasteRead }));
  await waitFor(() => expect(within(editor).getByLabelText(t.name)).toHaveValue('Bol'));
  return { user, editor };
}

describe('matched names stay visible next to the pasted line', () => {
  it('shows "<line> → <matched name>" for every auto-matched ingredient', async () => {
    const { editor } = await openPasted();
    const items = within(editor)
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '');
    expect(items.some((x) => x.includes('200 g de riz →') && x.includes('Riz blanc, cru'))).toBe(
      true,
    );
    expect(items.some((x) => x.includes('1/2 l de lait →') && x.includes('Lait'))).toBe(true);
    expect(await axe(editor)).toHaveNoViolations();
  });
});

describe('a line the matcher would not pick', () => {
  it('lists the line with its suggestions, one tap to use one, which keeps the line’s weight', async () => {
    const { user, editor } = await openPasted();
    const box = within(editor).getByRole('heading', { name: t.notAddedTitle })
      .parentElement as HTMLElement;
    expect(within(box).getByText('300 g de soupe miso')).toBeVisible();
    expect(within(box).getByText(t.suggestions)).toBeVisible();
    // A line with no candidate has none.
    expect(within(box).getByText('1 pincée de xyzzy')).toBeVisible();
    expect(within(box).getAllByRole('button')).toHaveLength(2);
    expect(await axe(editor)).toHaveNoViolations();

    await user.click(
      within(box).getByRole('button', {
        name: 'Use Soupe de poisson for “300 g de soupe miso”',
      }),
    );
    // It is now an ingredient (300 g, as the line said), with its line shown, and the line has left the list.
    const items = within(editor)
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '');
    expect(
      items.some(
        (x) =>
          x.includes('300 g de soupe miso →') &&
          x.includes('Soupe de poisson') &&
          x.includes('300 g'),
      ),
    ).toBe(true);
    expect(within(editor).queryByText(t.suggestions)).toBeNull();
    expect(within(editor).getByText('1 pincée de xyzzy')).toBeVisible();
  });
});
