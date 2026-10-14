import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { afterEach, describe, expect, it } from 'vitest';
import { LineMap, type LineMapStation } from './LineMap';
import { OpenStation, PlateRow } from './Stations';
import { clearMatchMedia, makePlate, stubReducedMotion } from './testing';

const lunch = makePlate(2, 12, 55, ['vegFruit', 'protein', 'starch']);

function map(stations: LineMapStation[]) {
  return (
    <LineMap
      stations={stations}
      renderStation={(s) =>
        s.status === 'logged' ? (
          <PlateRow plate={lunch} slot="lunch" onOpen={() => {}} onRequestDelete={() => {}} />
        ) : (
          <OpenStation slot="dinner" resolving={s.status === 'resolving'} />
        )
      }
    />
  );
}

const logged: LineMapStation = {
  id: 'l',
  status: 'logged',
  groups: ['vegFruit', 'protein', 'starch'],
};

afterEach(clearMatchMedia);

describe('LineMap', () => {
  it('draws four lines in order and hides the diagram from assistive tech', () => {
    const { container } = render(map([logged]));
    const svg = screen.getByTestId('line-map-svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    const lines = Array.from(container.querySelectorAll('[data-line]')).map((l) =>
      l.getAttribute('data-line'),
    );
    expect(lines).toEqual(['vegFruit', 'protein', 'starch', 'dairy']);
  });

  it('derives the stopped lines from a plate when given one', () => {
    const { container } = render(map([{ id: 'l', status: 'logged', plate: lunch }]));
    const stops = Array.from(container.querySelectorAll('[data-stop]')).map((c) =>
      c.getAttribute('data-stop'),
    );
    expect(stops).toEqual(['l:vegFruit', 'l:protein', 'l:starch']);
  });

  it('puts a stop dot only on the lines that stop; the others pass through', () => {
    const { container } = render(map([logged]));
    const stops = Array.from(container.querySelectorAll('[data-stop]')).map((c) =>
      c.getAttribute('data-stop'),
    );
    expect(stops).toEqual(['l:vegFruit', 'l:protein', 'l:starch']);
    expect(container.querySelector('[data-line="dairy"]')).toBeInTheDocument();
  });

  it('draws open and resolving stations as dashed rings with no stop dots', () => {
    const { container } = render(
      map([
        { id: 'o', status: 'open', groups: [] },
        { id: 'r', status: 'resolving', groups: [] },
      ]),
    );
    expect(container.querySelectorAll('[data-stop]')).toHaveLength(0);
    for (const id of ['o', 'r']) {
      const rect = container.querySelector(`[data-station="${id}"]`);
      expect(rect?.getAttribute('class')).toContain('stroke-dasharray');
    }
  });

  it('shows a static "Reading the plate…" line while resolving, with no spinner', () => {
    render(map([{ id: 'r', status: 'resolving', groups: [] }]));
    expect(screen.getByText('Reading the plate…')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('names the groups present and the groups passed through, never a count', () => {
    render(map([logged]));
    const btn = screen.getByRole('button', { name: /Open Lunch/ });
    const name = btn.getAttribute('aria-label') ?? '';
    expect(name).toMatch(/veg & fruit, protein and starch stopped/);
    expect(name).toMatch(/Dairy passed through/);
    expect(name).not.toMatch(/\d+ of 4|\bscore\b/i);
  });

  it('stagger-draws a station that goes from resolving to logged, 60ms per dot', () => {
    const { container, rerender } = render(map([{ id: 'l', status: 'resolving', groups: [] }]));
    expect(screen.getByTestId('line-map-svg')).not.toHaveClass('day-arrive');
    rerender(map([logged]));
    expect(screen.getByTestId('line-map-svg')).toHaveClass('day-arrive');
    expect(container.querySelector('[data-station="l"]')).toHaveClass('day-ring-draw');
    const delays = Array.from(container.querySelectorAll<SVGElement>('[data-stop]')).map(
      (c) => c.style.animationDelay,
    );
    expect(delays).toEqual(['200ms', '260ms', '320ms']);
  });

  it('does not animate a station that was already logged', () => {
    const { rerender } = render(map([logged]));
    rerender(map([logged, { id: 'o', status: 'open', groups: [] }]));
    expect(screen.getByTestId('line-map-svg')).not.toHaveClass('day-arrive');
  });

  it('shows the final state immediately under prefers-reduced-motion', () => {
    stubReducedMotion(true);
    const { container, rerender } = render(map([{ id: 'l', status: 'resolving', groups: [] }]));
    rerender(map([logged]));
    expect(screen.getByTestId('line-map-svg')).not.toHaveClass('day-arrive');
    expect(container.querySelector('[data-station="l"]')).not.toHaveClass('day-ring-draw');
    for (const c of container.querySelectorAll<SVGElement>('[data-stop]')) {
      expect(c.style.animationDelay).toBe('');
    }
    expect(container.querySelectorAll('[data-stop]')).toHaveLength(3);
  });

  it('has no axe violations', async () => {
    const { container } = render(
      map([
        logged,
        { id: 'r', status: 'resolving', groups: [] },
        { id: 'o', status: 'open', groups: [] },
      ]),
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
