import type { FoodGroup, MealSlot } from '@anc/core';

/** The four lines, in map order. `other` has no line. */
export type LineGroup = Exclude<FoodGroup, 'other'>;

/** Lower-case spoken names, usable mid-sentence. */
const LINE_NAMES: Readonly<Record<LineGroup, string>> = {
  vegFruit: 'veg and fruit',
  protein: 'protein',
  starch: 'starch',
  dairy: 'dairy',
};

const SLOT_NAMES: Readonly<Record<MealSlot, string>> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  late: 'Late',
};

export const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "a", "a and b", "a, b and c". */
export const joinNames = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

export const dayStrings = {
  lineName: (g: LineGroup): string => LINE_NAMES[g],
  /** Legend text (shown). */
  lineLegend: {
    vegFruit: 'Veg & fruit',
    protein: 'Protein',
    starch: 'Starch',
    dairy: 'Dairy',
  } as Readonly<Record<LineGroup, string>>,
  slotName: (s: MealSlot): string => SLOT_NAMES[s],

  // Stations
  openQuietPlace: 'An open, quiet place.',
  reading: 'Reading the plate…',
  allStopped: 'All four lines stopped here',
  noneStopped: 'No lines stopped here',
  /** "Dairy passed through without a stop". */
  passedThrough: (names: readonly string[]): string =>
    `${capitalise(joinNames(names))} passed through without a stop`,
  /** Accessible name of a station's detail button: groups by name, never a count. */
  stationLabel: (args: {
    meal: string;
    time: string;
    present: readonly string[];
    passed: readonly string[];
  }): string => {
    const { meal, time, present, passed } = args;
    const stops = present.length > 0 ? `${joinNames(present)} stopped` : 'no lines stopped';
    const through = passed.length > 0 ? `. ${capitalise(joinNames(passed))} passed through` : '';
    return `Open ${meal}, ${time}: ${stops}${through}`;
  },
  openStationLabel: (meal: string): string => `${meal}: open, nothing logged yet`,
  removePlate: 'Remove this plate',
  removePlateFor: (meal: string, time: string): string => `Remove this plate (${meal}, ${time})`,
  mapDescription: 'Day map',

  // Coach
  coachGroup: 'Coach question',
  sure: 'Sure',
  askLater: 'Ask later',
  depthGroup: 'More from the coach',
  close: 'Close',
  dismissHint: (hint: string): string => `${hint}. Tap to dismiss.`,

  // Status chip
  chip: {
    onDevice: 'On this device',
    pending: 'Pending',
    synced: 'Synced',
    retryLater: 'Retry later',
  },
  chipAnnouncement: (label: string): string => `Status: ${label}`,

  // Week
  noStreaks: 'No streaks, no countdowns, no guilt.',
  routeLabel: 'This week: choose a day',
  today: 'Today',
  stateAllFour: 'all four lines',
  stateNone: 'nothing logged',
  stateSome: (n: number): string => `${n} of 4 lines`,
  todayWord: 'today',
  networkTitle: 'This week’s network',
  dayByDay: 'Day by day',
  plates: (n: number): string => (n === 0 ? 'No plates' : n === 1 ? '1 plate' : `${n} plates`),
  networkIntro: 'Week network.',
  dayNothing: 'nothing logged',
  dayQuiet: (names: readonly string[]): string => `${joinNames(names)} quiet`,
  dayAll: 'all four lines',

  // Week note
  noteAllRan: 'All four lines ran this week.',
  noteNone: 'No plates logged yet this week.',
  noteSome: (names: readonly string[]): string => `${capitalise(joinNames(names))} ran this week.`,
  noteQuietDays: (name: string, days: readonly string[]): string =>
    `${capitalise(name)} was quiet on ${joinNames(days)}.`,
  noteQuietAll: (name: string): string => `${capitalise(name)} stayed quiet all week.`,

  // Gallery
  gallery: {
    title: 'Day and week',
    lineMap: 'Line map',
    resolve: 'Resolve the plate',
    reset: 'Reset',
    chips: 'Status chips',
    coach: 'Coach card and depth panel',
    week: 'Week route, network and list',
    openHint: 'Greens would round out dinner. Want a 10-second idea?',
    coachQuestion: 'Two colours of veg and a lentil protein. Want to know why lentils count twice?',
    followUp:
      'Lentils are a legume: they bring plant protein and fibre, so this plate stops on both the green and the red line.',
    lastDelete: 'Delete requested for plate',
  },
} as const;
