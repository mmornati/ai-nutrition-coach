// The weight chart's legibility and weight: labels of at least 12 px at 336 px wide, none outside
// the drawing, the last tick label ending at the edge, and a long history drawn and listed in a
// bounded number of nodes.
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { dayNumberOf, weightTrend, type TrendPoint } from '@anc/core';
import { renderInSession, unlockedBundle } from '../../app/testing';
import { CHART, LONG_RANGE_DAYS, TABLE_ROWS, thinWeekly, weekTicks } from './chart-model';
import { TrendChart } from './TrendChart';

afterEach(cleanup);

const TODAY = dayNumberOf('2026-10-14');
const dayText = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);

/** One weigh-in a day for `count` days ending today. */
const daily = (count: number): readonly TrendPoint[] =>
  weightTrend(
    Array.from({ length: count }, (_, i) => ({
      day: dayText(TODAY - (count - 1 - i)),
      value: 82 + Math.sin(i / 9),
    })),
  );

async function draw(points: readonly TrendPoint[], range: 'fourWeeks' | 'all' = 'fourWeeks') {
  return renderInSession(
    <TrendChart points={points} units="metric" range={range} todayNumber={TODAY} summaryId="s" />,
    { bundle: await unlockedBundle() },
  );
}

/** A generous width for a label: 0.62 em a character, as wide as most sans-serif digits and letters. */
const labelWidth = (text: string, fontSize: number): number => text.length * fontSize * 0.62;

describe('TrendChart legibility at 336 px', () => {
  it('draws on a 336-wide canvas, so a label is as large on a 336 px phone as it is written', async () => {
    const { container } = await draw(daily(30));
    const svg = container.querySelector('svg') as SVGElement;
    const [, , width] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
    expect(width).toBe(336);
    for (const text of container.querySelectorAll('svg text')) {
      const size = Number(text.getAttribute('font-size'));
      // Rendered size at 336 px wide = font size * (336 / viewBox width).
      expect(size * (336 / (width as number))).toBeGreaterThanOrEqual(12);
    }
  });

  for (const range of ['fourWeeks', 'all'] as const) {
    it(`puts no label outside the viewBox (${range}), and the last tick label ends at the edge`, async () => {
      const { container } = await draw(daily(range === 'all' ? 400 : 30), range);
      const height = CHART.height;
      const labels = [...container.querySelectorAll('svg text')];
      expect(labels.length).toBeGreaterThan(4);
      for (const text of labels) {
        const x = Number(text.getAttribute('x'));
        const y = Number(text.getAttribute('y'));
        const size = Number(text.getAttribute('font-size'));
        const anchor = text.getAttribute('text-anchor');
        const w = labelWidth(text.textContent ?? '', size);
        const left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
        const right = anchor === 'end' ? x : anchor === 'middle' ? x + w / 2 : x + w;
        expect(left).toBeGreaterThanOrEqual(0);
        expect(right).toBeLessThanOrEqual(CHART.width);
        expect(y - size).toBeGreaterThanOrEqual(0);
        expect(y + size * 0.25).toBeLessThanOrEqual(height);
      }
      // The x labels are the ones below the plot; the last of them is anchored to the end.
      const xLabels = labels.filter(
        (t) => Number(t.getAttribute('y')) > CHART.height - CHART.bottom,
      );
      expect(xLabels.at(-1)?.getAttribute('text-anchor')).toBe('end');
      // No two x labels meet.
      const spans = xLabels.map((t) => {
        const x = Number(t.getAttribute('x'));
        const w = labelWidth(t.textContent ?? '', Number(t.getAttribute('font-size')));
        const a = t.getAttribute('text-anchor');
        return a === 'end' ? [x - w, x] : [x - w / 2, x + w / 2];
      });
      for (let i = 1; i < spans.length; i++) {
        expect((spans[i] as number[])[0]).toBeGreaterThan((spans[i - 1] as number[])[1] as number);
      }
    });
  }

  it('has at most five week ticks', () => {
    expect(weekTicks(TODAY - 28, TODAY).length).toBeLessThanOrEqual(5);
    expect(weekTicks(TODAY - 365, TODAY).length).toBeLessThanOrEqual(5);
  });
});

describe('TrendChart on a long history', () => {
  it('thins to one point a week and always keeps the latest weigh-in', () => {
    const points = daily(1800);
    const thin = thinWeekly(points);
    expect(thin.length).toBeLessThanOrEqual(Math.ceil(1800 / 7) + 1);
    expect(thin.at(-1)?.day).toBe(points.at(-1)?.day);
    expect(thinWeekly([])).toEqual([]);
  });

  it('draws one dot a week over five years and caps the table with "show all"', async () => {
    const points = daily(1800);
    expect(points.length * 1).toBeGreaterThan(LONG_RANGE_DAYS);
    const { container } = await draw(points, 'all');
    expect(container.querySelectorAll('svg circle').length).toBeLessThanOrEqual(260);
    expect(container.querySelectorAll('svg path').length).toBeLessThanOrEqual(260);

    await userEvent.click(screen.getByText('Weigh-ins and trend as a table'));
    const table = screen.getByRole('table');
    // The header row and the first rows only.
    expect(within(table).getAllByRole('row')).toHaveLength(TABLE_ROWS + 1);
    expect(
      screen.getByText(`The table lists the latest ${TABLE_ROWS} weigh-ins of this range.`),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Show all 1800' }));
    expect(within(table).getAllByRole('row')).toHaveLength(1801);
    expect(screen.getByRole('button', { name: 'Show fewer' })).toBeVisible();
  });

  it('keeps a short range whole: every dot, and the table without a cap', async () => {
    const { container } = await draw(daily(30));
    expect(container.querySelectorAll('svg circle')).toHaveLength(30);
    expect(screen.queryByRole('button', { name: /^Show all/ })).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = await draw(daily(30));
    expect(await axe(container)).toHaveNoViolations();
  });
});
