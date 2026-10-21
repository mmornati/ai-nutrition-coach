import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { databaseFood, gramsQuantity, type FoodMatch, type QuantityRange } from '@anc/core';
import { renderInSession, unlockedBundle } from '../../app/testing';
import { setCurrentLocale } from '../../i18n';
import { DEFAULT_LOCALE } from '../../i18n/locale';
import { KV_KEYS } from '../../storage';
import { BarcodeMatchSheet } from './BarcodeMatchSheet';
import { gramHint } from './PortionPresets';
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
  onValidityChange,
  food,
  presets = [fist, cup],
}: {
  readonly onChange?: (q: QuantityRange) => void;
  readonly onValidityChange?: (valid: boolean) => void;
  readonly food?: typeof YOGURT;
  readonly presets?: readonly QuantityRange[];
}) {
  const [value, setValue] = useState<QuantityRange>(presets[0] as QuantityRange);
  return (
    <QuantityPicker
      presets={presets}
      value={value}
      food={food}
      {...(onValidityChange ? { onValidityChange } : {})}
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
    ['0,9', 0.9],
    ['0.1', 0.1],
    ['0,05', 0.1],
    ['12.34', 12.3],
    ['0.04', null],
    ['5000.04', 5000],
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

  it('text that is not a weight reports itself invalid and never emits a stale quantity', async () => {
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    render(<Harness onChange={onChange} onValidityChange={onValidityChange} />);
    await userEvent.type(screen.getByLabelText('Grams'), '5001');
    // 500 was a weight on the way; 5001 is not, and says so without emitting 500 again.
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ grams: 500 }));
    expect(onChange).toHaveBeenCalledTimes(3); // 5, 50, 500
    expect(screen.getByRole('status')).toHaveTextContent('Type a weight from 0.1 to 5000 g.');
    expect(screen.getByLabelText('Grams')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('status').textContent).not.toMatch(/!/);
    // Fixing the text makes it loggable again.
    await userEvent.type(screen.getByLabelText('Grams'), '{Backspace}');
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ grams: 500 }));
  });

  it('clearing the field goes back to the preset chosen before, not to 1 g', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /~1 cup/ }));
    await userEvent.type(screen.getByLabelText('Grams'), '150');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ grams: 150 }));
    await userEvent.clear(screen.getByLabelText('Grams'));
    expect(onChange).toHaveBeenLastCalledWith(cup);
    expect(screen.getByRole('button', { name: /~1 cup/ })).toHaveAttribute('aria-pressed', 'true');
    // Backspacing character by character ends at the same place.
    await userEvent.type(screen.getByLabelText('Grams'), '15{Backspace}{Backspace}');
    expect(onChange).toHaveBeenLastCalledWith(cup);
  });

  it('clearing with no preset chosen yet goes back to the first preset', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Grams'), '9');
    await userEvent.clear(screen.getByLabelText('Grams'));
    expect(onChange).toHaveBeenLastCalledWith(fist);
  });

  it('typing the exact weight of a preset does not highlight the preset', async () => {
    const hundred = gramsQuantity(100, { displayLabel: '100 g' });
    render(<Harness presets={[fist, hundred]} />);
    expect(screen.getByRole('button', { name: '100 g' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.type(screen.getByLabelText('Grams'), '100');
    expect(screen.getByRole('button', { name: '100 g' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Grams')).toHaveValue('100');
    // Picking the preset is not typing: it highlights and empties the field.
    await userEvent.click(screen.getByRole('button', { name: '100 g' }));
    expect(screen.getByRole('button', { name: '100 g' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Grams')).toHaveValue('');
  });

  it('shows a gram hint only when it adds something, with ≈ only for a guess', () => {
    const exact = gramsQuantity(150, { displayLabel: '1 portion' });
    const hundred = gramsQuantity(100, { displayLabel: '100 g' });
    render(<Harness presets={[fist, exact, hundred]} />);
    expect(screen.getByRole('button', { name: '~1 fist · ≈150 g' })).toBeVisible();
    expect(screen.getByRole('button', { name: '1 portion · 150 g' })).toBeVisible();
    // Already the weight: no "100 g · ≈100 g".
    expect(screen.getByRole('button', { name: '100 g' })).toBeVisible();
  });

  it('a weight label is not repeated when the label and the formatter space it differently', () => {
    // French formats "100\u202Fg" while catalogue labels may carry a plain or no-break space.
    for (const label of ['100 g', '100\u00A0g', '100\u202Fg']) {
      expect(gramHint(gramsQuantity(100, { displayLabel: label }), 'fr')).toBe('');
    }
    expect(gramHint(gramsQuantity(150, { displayLabel: '1 portion' }), 'fr')).toMatch(/^ · 150/);
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

describe('Log stays off while the weight is not a weight', () => {
  it('in the barcode sheet', async () => {
    const onLog = vi.fn();
    const match: FoodMatch = { food: YOGURT, confidence: 1, presets: [fist, cup] };
    render(<BarcodeMatchSheet open onClose={() => undefined} match={match} onLog={onLog} />);
    const log = screen.getByRole('button', { name: 'Log' });
    await userEvent.type(screen.getByLabelText('Grams'), '5001');
    expect(log).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Grams'));
    expect(log).toBeEnabled();
    // Cleared: the first preset, not 1 g.
    await userEvent.click(log);
    expect(onLog.mock.calls[0]?.[0]).toMatchObject({ quantity: { grams: 150, unit: 'fist' } });
  });
});
