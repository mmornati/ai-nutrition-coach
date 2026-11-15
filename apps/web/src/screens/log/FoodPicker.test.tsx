// The search + amount step shared by Type it and the plate editor, and the pieces around it.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import type { FoodEntryDraft, Nutrients } from '@anc/core';
import { EMPTY_CUSTOM_FOOD, type CustomFoodInput } from '../../catalog';
import { draft, renderInSession, unlockedBundle } from '../../app/testing';
import { CustomFoodForm, NutritionFields } from './CustomFoodForm';
import { FoodPicker } from './FoodPicker';
import { PlateDraftList } from './TypeIt';

afterEach(() => vi.useRealTimers());

const noop = () => undefined;

describe('FoodPicker', () => {
  it('reports a draft once a food is chosen, folds the list, and has no axe violation', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    const seen: (FoodEntryDraft | null)[] = [];
    const { container } = await renderInSession(
      <FoodPicker
        resetKey={0}
        onDraftChange={(d) => {
          seen.push(d);
        }}
      />,
      { bundle },
    );
    await user.type(await screen.findByLabelText('Food search'), 'apple');
    await user.click(await screen.findByRole('button', { name: /^Apple/ }));
    await waitFor(() => expect(seen.at(-1)?.databaseFood.displayName).toBe('Apple'));
    expect(screen.getByRole('list', { name: 'Matches' }).children).toHaveLength(1);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows energy per 100 g in each result when numbers are on', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await renderInSession(<FoodPicker resetKey={0} onDraftChange={noop} />, { bundle });
    await user.type(await screen.findByLabelText('Food search'), 'salmon');
    const row = await screen.findByRole('button', { name: /^Salmon/ });
    expect(within(row).getByText(/kcal per 100 g$/)).toBeVisible();
    // The accessible name carries the same words (the visible text is part of the name).
    expect(row).toHaveAccessibleName(/kcal per 100 g/);
  });

  it('says "1 portion suggested", not "1 portions", in the accessible name', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await renderInSession(<FoodPicker resetKey={0} onDraftChange={noop} />, { bundle });
    await user.type(await screen.findByLabelText('Food search'), 'apple');
    const names = (await screen.findAllByRole('button', { pressed: false })).map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(names.some((n) => /\b1 portion suggested/.test(n ?? ''))).toBe(
      names.some((n) => /\b1 portion/.test(n ?? '')),
    );
    expect(names.join('|')).not.toMatch(/\b1 portions/);
  });
});

type StateTuple = readonly [CustomFoodInput, Dispatch<SetStateAction<CustomFoodInput>>];

describe('CustomFoodForm', () => {
  /** A controlled form, so typing and the basis choice really change what is shown. */
  function Controlled({ children }: { readonly children: (state: StateTuple) => ReactNode }) {
    const state = useState<CustomFoodInput>({ ...EMPTY_CUSTOM_FOOD, name: 'Stew' });
    return children(state);
  }

  it('offers the optional weight and nutrition, and has no axe violation', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Controlled>
        {([value, setValue]) => (
          <CustomFoodForm value={value} onChange={setValue} issue={{ kind: 'needsGrams' }} />
        )}
      </Controlled>,
    );
    // The reason sits in the folded part, so the form opens it by itself.
    expect(screen.getByLabelText('Weight eaten (g)')).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'per serving' }));
    expect(screen.getByLabelText('Serving weight (g)')).toBeVisible();
    expect(screen.getByText('Add the weight so these values can count.')).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('opens the folded part when the reason Log is off is inside it, and links the field to it', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CustomFoodForm
        value={{ ...EMPTY_CUSTOM_FOOD, name: 'Stew' }}
        onChange={noop}
        issue={null}
      />,
    );
    // Nothing to say yet: the weight and nutrition stay folded, and the toggle still works.
    expect(screen.getByLabelText('Weight eaten (g)')).not.toBeVisible();
    await user.click(screen.getByText('Weight and nutrition (optional)'));
    expect(screen.getByLabelText('Weight eaten (g)')).toBeVisible();
    await user.click(screen.getByText('Weight and nutrition (optional)'));
    expect(screen.getByLabelText('Weight eaten (g)')).not.toBeVisible();
    rerender(
      <CustomFoodForm
        value={{ ...EMPTY_CUSTOM_FOOD, name: 'Stew', values: { protein: 'lots' } }}
        onChange={noop}
        issue={{ kind: 'value', field: 'protein' }}
      />,
    );
    const field = screen.getByLabelText('Protein (g)');
    expect(field).toBeVisible();
    const message = screen.getByText('Type a number, or leave the field empty.');
    expect(message).toBeVisible();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAttribute('aria-describedby', message.id);
    // A field that is fine does not point at the message.
    expect(screen.getByLabelText('Fibre (g)')).not.toHaveAttribute('aria-describedby');
  });

  it('NutritionFields on its own has no axe violation', async () => {
    const { container } = render(
      <NutritionFields value={EMPTY_CUSTOM_FOOD} onChange={() => undefined} issue={null} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('PlateDraftList totals and focus', () => {
  it('a tiny uncovered food does not turn the plate total into "at least"; a large one does', async () => {
    const bundle = await unlockedBundle();
    const food = (name: string, grams: number, per100: Nutrients): FoodEntryDraft => ({
      databaseFood: { ...draft(name, 'other').databaseFood, nutrientsPer100g: per100 },
      quantity: { low: 1, high: 1, unit: 'g', displayLabel: `${grams} g`, grams },
    });
    const rice = food('Rice', 300, { energyKcal: 130 });
    await renderInSession(
      <PlateDraftList items={[rice, food('Herbs', 2, {})]} onRemove={() => undefined} />,
      { bundle },
    );
    // The herbs know no energy but weigh almost nothing: the total stands.
    expect(await screen.findByText('Plate total: 390 kcal')).toBeVisible();
  });

  it('a large food without energy does mark the plate total "at least"', async () => {
    const bundle = await unlockedBundle();
    const food = (name: string, grams: number, per100: Nutrients): FoodEntryDraft => ({
      databaseFood: { ...draft(name, 'other').databaseFood, nutrientsPer100g: per100 },
      quantity: { low: 1, high: 1, unit: 'g', displayLabel: `${grams} g`, grams },
    });
    await renderInSession(
      <PlateDraftList
        items={[food('Rice', 300, { energyKcal: 130 }), food('Stew', 300, {})]}
        onRemove={() => undefined}
      />,
      { bundle },
    );
    expect(await screen.findByText('Plate total: at least 390 kcal')).toBeVisible();
  });

  it('moves focus to the next food (then the previous, then the search) after a removal', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    function Host() {
      const [items, setItems] = useState<readonly FoodEntryDraft[]>([
        draft('Rice', 'starch'),
        draft('Beans', 'protein'),
        draft('Kale', 'vegFruit'),
      ]);
      return (
        <>
          <input aria-label="search" />
          <PlateDraftList
            items={items}
            onRemove={(i) => setItems((l) => l.filter((_, k) => k !== i))}
            onEmptied={() => screen.getByLabelText('search').focus()}
          />
        </>
      );
    }
    await renderInSession(<Host />, { bundle });
    await user.click(await screen.findByRole('button', { name: 'Remove Beans' }));
    expect(screen.getByRole('button', { name: 'Remove Kale' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Remove Kale' }));
    expect(screen.getByRole('button', { name: 'Remove Rice' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Remove Rice' }));
    expect(screen.getByLabelText('search')).toHaveFocus();
  });
});

describe('PlateDraftList (continued)', () => {
  it('lists foods with energy and a total that says "at least" while one has no data', async () => {
    const bundle = await unlockedBundle();
    const withData: FoodEntryDraft = {
      databaseFood: {
        ...draft('Rice', 'starch').databaseFood,
        nutrientsPer100g: { energyKcal: 130 },
      },
      quantity: { low: 1, high: 1, unit: 'g', displayLabel: '200 g', grams: 200 },
    };
    const { container } = await renderInSession(
      <PlateDraftList items={[withData, draft('Mystery', 'other')]} onRemove={() => undefined} />,
      { bundle },
    );
    expect(await screen.findByText('Plate total: at least 260 kcal')).toBeVisible();
    expect(screen.getByText('Not counted in totals')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Remove Rice' })).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });
});
