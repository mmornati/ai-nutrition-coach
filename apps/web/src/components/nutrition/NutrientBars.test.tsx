import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import type { NutrientTotals } from '@anc/core';
import { setCurrentLocale } from '../../i18n';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { DEFAULT_LOCALE } from '../../i18n/locale';
import { NutrientBars, barFill } from './NutrientBars';
import { NutritionSection } from './NutritionSection';

afterEach(() => {
  cleanup();
  setCurrentLocale(DEFAULT_LOCALE);
});

const totals = (
  t: NutrientTotals['totals'],
  extra: Partial<NutrientTotals> = {},
): NutrientTotals => ({
  totals: t,
  entriesCounted: 2,
  entriesTotal: 2,
  estimated: false,
  ...extra,
});

const ALL = {
  salt: 3,
  fibre: 12,
  saturatedFat: 5,
  fat: 20,
  sugars: 22,
  carbohydrate: 120,
  protein: 54,
  energyKcal: 1100,
};

describe('NutrientBars', () => {
  it('lists the eight nutrients in order, each with its value, unit and reference in text', () => {
    render(<NutrientBars nutrition={totals(ALL)} />);
    const rows = within(screen.getByRole('list', { name: /Nutrient amounts/ })).getAllByRole(
      'listitem',
    );
    expect(rows.map((r) => r.querySelector('span')?.textContent)).toEqual([
      'Energy',
      'Protein',
      'Carbohydrate',
      'of which sugars',
      'Fat',
      'of which saturates',
      'Fibre',
      'Salt',
    ]);
    expect(rows[0]).toHaveTextContent('1100 kcal');
    expect(rows[0]).toHaveTextContent('about 55% of the 2000 kcal reference');
    expect(rows[1]).toHaveTextContent('54 g');
    expect(rows[1]).toHaveTextContent('about 108% of the 50 g reference');
    expect(rows[7]).toHaveTextContent('3 g');
  });

  it('shows only the nutrients that have data', () => {
    render(<NutrientBars nutrition={totals({ protein: 10 })} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByText('Energy')).toBeNull();
  });

  it('draws nothing at all when no nutrient is known', () => {
    const { container } = render(<NutrientBars nutrition={totals({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('marks estimated totals with a tilde', () => {
    render(<NutrientBars nutrition={totals({ protein: 10.4 }, { estimated: true })} />);
    expect(screen.getByText('~10 g')).toBeVisible();
  });

  it('keeps one decimal under 10 and none from 10', () => {
    render(<NutrientBars nutrition={totals({ salt: 5.43, protein: 12.6 })} />);
    expect(screen.getByText('5.4 g')).toBeVisible();
    expect(screen.getByText('13 g')).toBeVisible();
  });

  it('the bar looks the same at 50% and at 300% of the reference: width is the only difference', () => {
    const { container: half } = render(<NutrientBars nutrition={totals({ protein: 25 })} />);
    const { container: triple } = render(<NutrientBars nutrition={totals({ protein: 150 })} />);
    const fills = [half, triple].map((c) => c.querySelector<HTMLElement>('[aria-hidden] > div'));
    expect(fills[0]?.className).toBe(fills[1]?.className);
    expect(fills[0]?.style.width).toBe('50%');
    expect(fills[1]?.style.width).toBe('100%');
    // Nothing in the row's markup changes class with the amount either.
    const classes = (c: HTMLElement) =>
      [...c.querySelectorAll('li, li *')].map((e) => e.getAttribute('class'));
    expect(classes(half)).toEqual(classes(triple));
  });

  it('past the reference it says the number, with no warning words, colours or roles', () => {
    const { container } = render(
      <NutrientBars nutrition={totals({ sugars: 270, carbohydrate: 300 })} />,
    );
    expect(screen.getByText('about 300% of the 90 g reference')).toBeVisible();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\b(over|exceed|too much|remaining|left|warning|limit)\b|!/i);
    expect(container.innerHTML).not.toMatch(
      /red|amber|rose|orange|line-protein|line-starch|alert/i,
    );
    expect(container.querySelector('[role="progressbar"], progress, svg')).toBeNull();
  });

  it('the graphic is hidden from assistive tech and the sentence carries the meaning', () => {
    const { container } = render(<NutrientBars nutrition={totals({ protein: 25 })} />);
    const graphic = container.querySelector('[aria-hidden="true"]');
    expect(graphic).not.toBeNull();
    expect(container.querySelector('li')).toHaveTextContent(
      /Protein.*25 g.*about 50% of the 50 g reference/,
    );
  });

  it('barFill clamps at the track end', () => {
    expect(barFill(0, 50)).toBe(0);
    expect(barFill(25, 50)).toBe(0.5);
    expect(barFill(50, 50)).toBe(1);
    expect(barFill(500, 50)).toBe(1);
  });

  it('says how many foods had data when some had none', () => {
    render(
      <NutrientBars nutrition={totals({ protein: 10 }, { entriesCounted: 3, entriesTotal: 4 })} />,
    );
    expect(screen.getByText('Based on 3 foods with nutrition data; 1 without.')).toBeVisible();
  });

  it('uses the singular for one food and says nothing when every food counted', () => {
    const { rerender } = render(
      <NutrientBars nutrition={totals({ protein: 10 }, { entriesCounted: 1, entriesTotal: 3 })} />,
    );
    expect(screen.getByText('Based on 1 food with nutrition data; 2 without.')).toBeVisible();
    rerender(<NutrientBars nutrition={totals({ protein: 10 })} />);
    expect(screen.queryByText(/Based on/)).toBeNull();
  });

  it('explains reference intakes in a calm disclosure', () => {
    render(<NutrientBars nutrition={totals({ protein: 10 })} />);
    const summary = screen.getByText('What are reference intakes?');
    expect(summary.tagName).toBe('SUMMARY');
    expect(summary.closest('details')).toHaveTextContent(/1169\/2011/);
    expect(summary.closest('details')).toHaveTextContent(/Fibre has no EU value/);
  });

  it('speaks French with French typography', () => {
    render(
      <LocaleProvider initial="fr">
        <NutrientBars
          nutrition={totals(
            { energyKcal: 500, sugars: 12.5 },
            { estimated: true, entriesCounted: 1, entriesTotal: 2 },
          )}
        />
      </LocaleProvider>,
    );
    expect(screen.getByText('Énergie')).toBeVisible();
    expect(screen.getByText('dont sucres')).toBeVisible();
    // The default matcher folds U+202F into a plain space: compare the raw text.
    const raw = (text: string) =>
      screen.getByText((_, el) => el?.children.length === 0 && el.textContent === text);
    expect(raw('~500 kcal')).toBeVisible();
    expect(raw('~13 g')).toBeVisible();
    expect(raw('environ 25 % de la référence de 2000 kcal')).toBeVisible();
    expect(raw('Que sont les apports de référence ?')).toBeVisible();
    expect(screen.getByText(/Calculé sur 1 aliment/)).toBeVisible();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <NutrientBars nutrition={totals(ALL, { entriesCounted: 1, entriesTotal: 2 })} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('NutritionSection', () => {
  it('shows a titled section when there is data', () => {
    render(<NutritionSection title="Nutrition" nutrition={totals({ protein: 10 })} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Nutrition' })).toBeVisible();
  });

  it('is absent when no entry has data', () => {
    const { container } = render(<NutritionSection title="Nutrition" nutrition={totals({})} />);
    expect(container).toBeEmptyDOMElement();
  });
});
