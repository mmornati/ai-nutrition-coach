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
          <PlateRow
            plate={lunch}
            slot="lunch"
            hasTransport={false}
            onOpen={() => {}}
            onRequestDelete={() => {}}
          />
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
  it('draws four stripes in order and hides the weave from assistive tech', () => {
    const { container } = render(map([logged]));
    expect(screen.getByTestId('day-towel').tagName).toBe('OL');
    const weave = container.querySelector('[data-station="l"]');
    expect(weave).toHaveAttribute('aria-hidden', 'true');
    const lines = Array.from(container.querySelectorAll('[data-line]')).map((l) =>
      l.getAttribute('data-line'),
    );
    expect(lines).toEqual(['vegFruit', 'protein', 'starch', 'dairy']);
  });

  it('derives the dyed stripes from a plate when given one', () => {
    const { container } = render(map([{ id: 'l', status: 'logged', plate: lunch }]));
    const stops = Array.from(container.querySelectorAll('[data-stop]')).map((c) =>
      c.getAttribute('data-stop'),
    );
    expect(stops).toEqual(['l:vegFruit', 'l:protein', 'l:starch']);
  });

  it('dyes only the groups on the plate; the others stay bare cotton', () => {
    const { container } = render(map([logged]));
    const stops = Array.from(container.querySelectorAll('[data-stop]')).map((c) =>
      c.getAttribute('data-stop'),
    );
    expect(stops).toEqual(['l:vegFruit', 'l:protein', 'l:starch']);
    expect(container.querySelector('[data-line="dairy"]')).toHaveClass('weave-bare');
    expect(container.querySelector('[data-line="dairy"]')).not.toHaveAttribute('data-stop');
  });

  it('draws open and resolving meals as empty dashed bands with no dyed stripes', () => {
    const { container } = render(
      map([
        { id: 'o', status: 'open', groups: [] },
        { id: 'r', status: 'resolving', groups: [] },
      ]),
    );
    expect(container.querySelectorAll('[data-stop]')).toHaveLength(0);
    for (const id of ['o', 'r']) {
      const band = container.querySelector(`[data-station="${id}"]`);
      expect(band).toHaveClass('border-dashed');
      expect(band?.querySelector('[data-line]')).toBeNull();
    }
    expect(container.querySelector('[data-station="r"]')).toHaveClass('weave-resolving');
    expect(container.querySelector('[data-station="o"]')).not.toHaveClass('weave-resolving');
  });

  it('shows a static "Reading the plate…" line while resolving, with no spinner', () => {
    render(map([{ id: 'r', status: 'resolving', groups: [] }]));
    expect(screen.getByText('Reading the plate…')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('names the groups on the plate and the ones without, never a count', () => {
    render(map([logged]));
    const btn = screen.getByRole('button', { name: /Open Lunch/ });
    const name = btn.getAttribute('aria-label') ?? '';
    expect(name).toMatch(/veg & fruit, protein and starch on the plate/);
    expect(name).toMatch(/Without dairy/);
    expect(name).not.toMatch(/\d+ of 4|\bscore\b/i);
  });

  it('weaves in a meal that goes from resolving to logged, 60ms per stripe', () => {
    const { container, rerender } = render(map([{ id: 'l', status: 'resolving', groups: [] }]));
    expect(container.querySelector('[data-station="l"]')).not.toHaveClass('weave-in');
    rerender(map([logged]));
    expect(container.querySelector('[data-station="l"]')).toHaveClass('weave-in');
    const delays = Array.from(container.querySelectorAll<HTMLElement>('[data-stop]')).map(
      (c) => c.style.animationDelay,
    );
    expect(delays).toEqual(['0ms', '60ms', '120ms']);
  });

  it('does not animate a meal that was already logged', () => {
    const { container, rerender } = render(map([logged]));
    rerender(map([logged, { id: 'o', status: 'open', groups: [] }]));
    expect(container.querySelector('[data-station="l"]')).not.toHaveClass('weave-in');
  });

  it('shows the final state immediately under prefers-reduced-motion', () => {
    stubReducedMotion(true);
    const { container, rerender } = render(map([{ id: 'l', status: 'resolving', groups: [] }]));
    rerender(map([logged]));
    expect(container.querySelector('[data-station="l"]')).not.toHaveClass('weave-in');
    for (const c of container.querySelectorAll<HTMLElement>('[data-stop]')) {
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
