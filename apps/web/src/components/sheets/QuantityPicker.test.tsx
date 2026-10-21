import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { databaseFood, type FoodMatch, type QuantityRange } from '@anc/core';
import { renderInSession, unlockedBundle } from '../../app/testing';
import { setCurrentLocale } from '../../i18n';
import { DEFAULT_LOCALE } from '../../i18n/locale';
import { KV_KEYS } from '../../storage';
import { BarcodeMatchSheet } from './BarcodeMatchSheet';
import { QuantityPicker, parseGrams } from './QuantityPicker';

afterEach(() => {
  cleanup();
  setCurrentLocale(DEFAULT_LOCALE);
});

const fist: QuantityRange = {
  low: 1,
  high: 1,
  unit: 'fist',
  displayLabel: '~1 fist',
  grams: 150,
  gramsEstimated: true,
};
const cup: QuantityRange = { low: 1, high: 1, unit: 'cup', displayLabel: '~1 cup' };
const YOGURT = databaseFood({
  sourceRef: 'seed:yogurt',
  displayName: 'Yogurt',
  source: 'seed',
  foodGroup: 'dairy',
  nutrientsPer100g: { energyKcal: 70, protein: 6, sugars: 4.5 },
});

function Harness({
  onChange,
  food,
  presets = [fist, cup],
}: {
  readonly onChange?: (q: QuantityRange) => void;
  readonly food?: typeof YOGURT;
  readonly presets?: readonly QuantityRange[];
}) {
  const [value, setValue] = useState<QuantityRange>(presets[0] as QuantityRange);
  return (
    <QuantityPicker
      presets={presets}
      value={value}
      food={food}
      onChange={(q) => {
        setValue(q);
        onChange?.(q);
      }}
    />
  );
}

describe('parseGrams', () => {
  it.each([
    ['150', 150],
    ['150.5', 150.5],
    ['150,5', 150.5],
    [' 80 ', 80],
    ['1', 1],
    ['5000', 5000],
    ['.5e', null],
    ['0', null],
    ['0,9', null],
    ['5001', null],
    ['-3', null],
    ['1,2,3', null],
    ['1e3', null],
    ['abc', null],
    ['12 g', null],
    ['', null],
  ])('%j -> %j', (text, expected) => {
    expect(parseGrams(text)).toBe(expected);
  });
});

describe('QuantityPicker', () => {
  it('has a visible Grams label, a decimal keypad and a target of at least 48px', () => {
    render(<Harness />);
    const field = screen.getByLabelText('Grams');
    expect(field).toHaveAttribute('inputmode', 'decimal');
    expect(field.parentElement).toHaveClass('min-h-14');
    expect(screen.getByText('Grams')).toBeVisible();
  });

  it('typing a weight selects it as a typed quantity and deselects the presets', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Grams'), '2');
    expect(onChange).toHaveBeenLastCalledWith({
      low: 2,
      high: 2,
      unit: 'g',
      displayLabel: '2 g',
      grams: 2,
      gramsEstimated: false,
    });
    for (const name of [/~1 fist/, /~1 cup/]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('accepts a comma as the decimal separator', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Grams'), '12,5');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ grams: 12.5 }));
  });

  it('refuses out-of-range weights with a calm line and keeps the previous quantity', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Grams'), '5001');
    // 500 was accepted on the way; 5001 is not.
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ grams: 500 }));
    expect(screen.getByRole('status')).toHaveTextContent('Type a weight from 1 to 5000 g.');
    expect(screen.getByLabelText('Grams')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('status').textContent).not.toMatch(/!/);
  });

  it('choosing a preset clears the field and selects it', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Grams'), '80');
    await userEvent.click(screen.getByRole('button', { name: /~1 cup/ }));
    expect(screen.getByLabelText('Grams')).toHaveValue('');
    expect(onChange).toHaveBeenLastCalledWith(cup);
    expect(screen.getByRole('button', { name: /~1 cup/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the gram equivalent on a preset that has one, and next to the field when chosen', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: '~1 fist · ≈150 g' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // A preset without grams is just its words.
    expect(screen.getByRole('button', { name: '~1 cup' })).toBeVisible();
    expect(screen.getAllByText('≈150 g')).toHaveLength(1);
  });

  it('previews what the weight holds when the food has nutrients', async () => {
    render(<Harness food={YOGURT} />);
    expect(screen.getByRole('status')).toHaveTextContent('≈ 105 kcal · 9 g protein · 6.8 g sugars');
    await userEvent.type(screen.getByLabelText('Grams'), '200');
    expect(screen.getByRole('status')).toHaveTextContent('≈ 140 kcal · 12 g protein · 9 g sugars');
  });

  it('shows no preview without nutrients, without a weight, or for an invalid weight', async () => {
    const { unmount } = render(<Harness />);
    expect(screen.queryByText(/kcal/)).toBeNull();
    unmount();
    render(<Harness food={YOGURT} presets={[cup]} />);
    expect(screen.queryByText(/kcal/)).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Harness food={YOGURT} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('numbers off', () => {
  it('hides the preview but keeps the grams field and the gram labels', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(KV_KEYS.uiShowNumbers, 'off');
    await renderInSession(<Harness food={YOGURT} />, { bundle });
    expect(screen.getByLabelText('Grams')).toBeVisible();
    expect(screen.getByRole('button', { name: '~1 fist · ≈150 g' })).toBeVisible();
    expect(screen.queryByText(/kcal/)).toBeNull();
    await userEvent.type(screen.getByLabelText('Grams'), '200');
    expect(screen.queryByText(/kcal/)).toBeNull();
  });
});

describe('in the barcode sheet', () => {
  it('logs a typed weight as a grams quantity on the food with its nutrients', async () => {
    const onLog = vi.fn();
    const match: FoodMatch = { food: YOGURT, confidence: 1, presets: [fist] };
    render(<BarcodeMatchSheet open onClose={() => undefined} match={match} onLog={onLog} />);
    await userEvent.type(screen.getByLabelText('Grams'), '125');
    expect(screen.getByText(/≈ 88 kcal/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Log' }));
    expect(onLog).toHaveBeenCalledTimes(1);
    const draft = onLog.mock.calls[0]?.[0] as {
      databaseFood: typeof YOGURT;
      quantity: QuantityRange;
    };
    expect(draft.quantity).toMatchObject({ unit: 'g', grams: 125, gramsEstimated: false });
    expect(draft.databaseFood.nutrientsPer100g).toEqual({
      energyKcal: 70,
      protein: 6,
      sugars: 4.5,
    });
  });

  it('logs a preset with its estimated weight', async () => {
    const onLog = vi.fn();
    const match: FoodMatch = { food: YOGURT, confidence: 1, presets: [fist, cup] };
    render(<BarcodeMatchSheet open onClose={() => undefined} match={match} onLog={onLog} />);
    await userEvent.click(screen.getByRole('button', { name: 'Log' }));
    expect(onLog.mock.calls[0]?.[0]).toMatchObject({
      quantity: { grams: 150, gramsEstimated: true },
    });
  });
});
