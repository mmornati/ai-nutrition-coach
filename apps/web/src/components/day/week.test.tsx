import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { localTime } from '@anc/core';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import {
  buildWeekDays,
  dayKind,
  dayRouteLabel,
  describeDay,
  weekNote,
  weekNoteParts,
} from './week';
import type { WeekDayData } from './week';
import { DayList, WeekNetwork, WeekNoteText, weekNetworkDescription } from './WeekNetwork';
import { WeekRoute } from './WeekRoute';
import { strings } from '../../i18n';
import { platesCount } from '../../i18n/sentences';
import { makePlate } from './testing';
import type { LineGroup } from '../primitives';

const ALL: LineGroup[] = ['vegFruit', 'protein', 'starch', 'dairy'];
const NO_DAIRY: LineGroup[] = ['vegFruit', 'protein', 'starch'];
// 2026-10-13 is a Tuesday; the week runs Wed 7 .. Tue 13.
const TODAY = localTime(2026, 10, 13, 20, 0);

function day(offset: number, groups: LineGroup[], n = groups.length ? 2 : 0): WeekDayData {
  return {
    date: localTime(2026, 10, 13 + offset),
    groups,
    plateCount: n,
    isToday: offset === 0,
  };
}

/** Wed..Tue: dairy missing Fri and Sun, today complete. */
const WEEK: WeekDayData[] = [
  day(-6, ALL),
  day(-5, ALL),
  day(-4, NO_DAIRY),
  day(-3, ALL),
  day(-2, NO_DAIRY),
  day(-1, ALL),
  day(0, ALL),
];

describe('weekNote', () => {
  it('names the lines that ran and where one went quiet, without counts', () => {
    const note = weekNote(WEEK);
    expect(note).toBe('All four lines ran this week. Dairy was quiet on Friday and Sunday.');
    expect(note).not.toMatch(/\d/);
  });

  it('says nothing more when every line ran every day', () => {
    const all = WEEK.map((d) => ({ ...d, groups: ALL }));
    expect(weekNoteParts(all)).toMatchObject({ lead: 'All four lines ran this week.', detail: '' });
  });

  it('handles a line that never ran', () => {
    const none = WEEK.map((d) => ({ ...d, groups: NO_DAIRY }));
    expect(weekNote(none)).toBe(
      'Veg & fruit, protein and starch ran this week. Dairy stayed quiet all week.',
    );
  });

  it('ignores days with nothing logged and never calls today quiet', () => {
    const week = [
      day(-6, ALL),
      day(-5, [], 0),
      day(-4, ALL),
      day(-3, ALL),
      day(-2, ALL),
      day(-1, ALL),
      day(0, NO_DAIRY),
    ];
    expect(weekNote(week)).toBe('All four lines ran this week.');
  });

  it('an empty week gets a plain sentence', () => {
    expect(weekNote(WEEK.map((d) => ({ ...d, groups: [], plateCount: 0 })))).toBe(
      'No plates logged yet this week.',
    );
  });

  it('names at most two quiet lines', () => {
    const week = [
      day(-6, ['vegFruit', 'protein', 'starch', 'dairy']),
      day(-5, ['vegFruit']),
      day(-4, ['vegFruit']),
      day(-3, ['vegFruit', 'protein']),
      day(-2, ['vegFruit', 'dairy']),
      day(-1, ['vegFruit', 'starch']),
      day(0, ALL),
    ];
    const sentences = weekNoteParts(week).detail.split('. ').filter(Boolean);
    expect(sentences).toHaveLength(2);
  });
});

describe('buildWeekDays', () => {
  it('buckets plates into seven days ending today', () => {
    const days = buildWeekDays(
      [
        makePlate(1, 8, 0, ALL, 13),
        makePlate(2, 9, 0, ['protein'], 11),
        makePlate(3, 9, 0, ['dairy'], 11),
      ],
      TODAY,
    );
    expect(days).toHaveLength(7);
    expect(days[6]).toMatchObject({ isToday: true, plateCount: 1 });
    expect(days[4]).toMatchObject({ plateCount: 2, groups: ['protein', 'dairy'] });
    expect(days[0]).toMatchObject({ plateCount: 0, groups: [] });
  });
});

describe('logged, no line stopped', () => {
  // A day with only an "other" plate: logged (>= 1 plate), but no food group line.
  const LOGGED_NONE = day(-4, [], 1);
  const EMPTY = day(-4, [], 0);
  const WEEK_MIXED = [day(-6, ALL), day(-5, [], 0), LOGGED_NONE, ...WEEK.slice(3)];

  it('buildWeekDays keeps an other-only day as logged with no lines', () => {
    const days = buildWeekDays([makePlate(1, 9, 0, ['other'], 11)], TODAY);
    expect(days[4]).toMatchObject({ plateCount: 1, groups: [] });
    expect(dayKind(days[4]!)).toBe('loggedNoLine');
    expect(dayKind(days[0]!)).toBe('empty');
  });

  it('is worded distinctly from an empty day, calmly', () => {
    expect(dayRouteLabel(LOGGED_NONE)).toBe('Friday, logged — no food group line');
    expect(dayRouteLabel(EMPTY)).toBe('Friday, nothing logged');
    expect(describeDay(LOGGED_NONE)).toBe('logged — no food group line');
    expect(describeDay(EMPTY)).toBe('nothing logged');
  });

  it('the route draws it unlike an empty day, and announces it distinctly', () => {
    const week = WEEK_MIXED;
    render(<WeekRoute days={week} selected={TODAY} onSelectDay={() => {}} />);
    const logged = screen.getByRole('button', { name: /^Friday/ });
    const empty = screen.getByRole('button', { name: /^Thursday/ });
    expect(logged).toHaveAccessibleName('Friday, logged — no food group line');
    expect(empty).toHaveAccessibleName('Thursday, nothing logged');
    expect(
      logged.querySelector('[data-day-kind="loggedNoLine"] [data-logged-core]'),
    ).not.toBeNull();
    expect(empty.querySelector('[data-day-kind="empty"]')).not.toBeNull();
    expect(empty.querySelector('[data-logged-core]')).toBeNull();
  });

  it('the network marks it with a spine an empty day lacks, and describes it', () => {
    const week = WEEK_MIXED;
    const { container } = render(<WeekNetwork days={week} />);
    expect(container.querySelectorAll('[data-logged-no-line]')).toHaveLength(1);
    const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(label).toContain('Friday: logged — no food group line.');
    expect(label).toContain('Thursday: nothing logged.');
  });

  it('the day list tells them apart in words', () => {
    render(<DayList days={[day(-6, [], 0), day(-5, [], 1), ...WEEK.slice(2)]} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('nothing logged');
    expect(items[1]).toHaveTextContent('logged — no food group line');
    expect(items[1]).toHaveTextContent('1 plate');
  });
});

describe('WeekRoute', () => {
  const route = (selected = TODAY, onSelectDay = vi.fn()) => {
    render(<WeekRoute days={WEEK} selected={selected} onSelectDay={onSelectDay} />);
    return onSelectDay;
  };

  it('renders seven stop buttons named "<Weekday>, <state>"', () => {
    route();
    const nav = screen.getByRole('navigation', { name: strings().week.routeLabel });
    const buttons = within(nav).getAllByRole('button');
    expect(buttons).toHaveLength(7);
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Wednesday, all four lines',
      'Thursday, all four lines',
      'Friday, 3 of 4 lines',
      'Saturday, all four lines',
      'Sunday, 3 of 4 lines',
      'Monday, all four lines',
      'Tuesday, all four lines, today',
    ]);
  });

  it('says "nothing logged" for an empty day', () => {
    expect(dayRouteLabel(day(-3, [], 0))).toBe('Saturday, nothing logged');
  });

  it('single-letter day labels except Today', () => {
    route();
    const nav = screen.getByRole('navigation');
    const visible = within(nav)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(visible).toEqual(['W', 'T', 'F', 'S', 'S', 'M', 'Today']);
  });

  it('marks only the selected day aria-current="true" and selecting calls back', async () => {
    const onSelect = route(localTime(2026, 10, 11));
    const current = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-current') === 'true');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(/^Sunday/);
    // One pattern: nothing uses aria-current="date" and today is named, not aria-current.
    expect(document.querySelector('[aria-current="date"]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Friday/ }));
    expect(onSelect).toHaveBeenCalledWith(WEEK[2]?.date);
  });

  it('today keeps "today" in its name whether or not it is the selection', () => {
    route(WEEK[2]?.date);
    const today = screen.getByRole('button', { name: /^Tuesday/ });
    expect(today).toHaveAccessibleName('Tuesday, all four lines, today');
    expect(today).not.toHaveAttribute('aria-current');
    route(TODAY);
    expect(screen.getAllByRole('button', { name: /^Tuesday/ }).at(-1)).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('draws an empty day dashed, unlike partial (hollow) and logged-without-line', () => {
    const mixed = [day(-6, ALL), day(-5, [], 0), day(-4, [], 1), ...WEEK.slice(3)];
    render(<WeekRoute days={mixed} selected={TODAY} onSelectDay={() => {}} />);
    const dot = (name: RegExp) => screen.getByRole('button', { name }).firstElementChild;
    expect(dot(/^Thursday/)).toHaveClass('border-dashed');
    expect(dot(/^Friday/)).not.toHaveClass('border-dashed');
    expect(dot(/^Wednesday/)?.className).not.toContain('border-dashed');
  });

  it('full days are filled and partial days hollow; today is amber', () => {
    route();
    const dot = (name: RegExp) => screen.getByRole('button', { name }).firstElementChild;
    expect(dot(/^Wednesday/)).toHaveClass('bg-porcelain');
    expect(dot(/^Friday/)).toHaveClass('bg-enamel-raised');
    expect(dot(/^Tuesday/)).toHaveClass('bg-line-starch');
  });

  it('has no axe violations', async () => {
    const { container } = render(<WeekRoute days={WEEK} selected={TODAY} onSelectDay={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('WeekNetwork', () => {
  it('is an image with a full text description naming lines, never a count', () => {
    render(<WeekNetwork days={WEEK} />);
    const img = screen.getByRole('img');
    const label = img.getAttribute('aria-label') ?? '';
    expect(label).toBe(weekNetworkDescription(WEEK));
    expect(label).toContain('Friday: veg & fruit, protein, starch; dairy quiet.');
    expect(label).toContain('Today: all four lines.');
    expect(label).not.toMatch(/\d/);
  });

  it('draws a filled stop where the line served and a dashed hollow where not', () => {
    const { container } = render(<WeekNetwork days={WEEK} />);
    const circles = Array.from(container.querySelectorAll('circle'));
    expect(circles).toHaveLength(28);
    const hollow = circles.filter((c) => c.getAttribute('class')?.includes('stroke-dasharray'));
    expect(hollow).toHaveLength(2);
    expect(container.querySelectorAll('rect')).toHaveLength(1); // today column ring
  });

  it('has no axe violations', async () => {
    const { container } = render(<WeekNetwork days={WEEK} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('DayList and note', () => {
  it('lists each day with its groups in words and the plate count', () => {
    render(<DayList days={WEEK} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(7);
    expect(items[2]).toHaveTextContent('Friday: veg & fruit, protein, starch; dairy quiet');
    expect(items[2]).toHaveTextContent('2 plates');
    expect(items[6]).toHaveTextContent('Today');
    expect(items[6]).toHaveTextContent('Today: all four lines');
  });

  it('with onSelectDay every day is a button that selects it', async () => {
    const onSelectDay = vi.fn();
    render(<DayList days={WEEK} onSelectDay={onSelectDay} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(7);
    expect(buttons[6]).toHaveAttribute('aria-current', 'date');
    await userEvent.click(buttons[2] as HTMLElement);
    expect(onSelectDay).toHaveBeenCalledExactlyOnceWith(WEEK[2]?.date);
  });

  it('pluralises plates', () => {
    expect(platesCount(0)).toBe('No plates');
    expect(platesCount(1)).toBe('1 plate');
  });

  it('keeps the negative guarantee string', () => {
    expect(strings().week.noStreaks).toBe('No streaks, no countdowns, no guilt.');
  });

  it('has no axe violations', async () => {
    const note = weekNoteParts(WEEK);
    const { container } = render(
      <>
        <DayList days={WEEK} />
        <WeekNoteText lead={note.lead} detail={note.detail} />
      </>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
