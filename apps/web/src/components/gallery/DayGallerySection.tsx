import { useState } from 'react';
import { databaseFood, localTime, plateLog } from '@anc/core';
import type { FoodGroup, MealSlot, PlateLog } from '@anc/core';
import { Button } from '../primitives';
import {
  CoachCard,
  DayList,
  DepthPanel,
  LineLegend,
  LineMap,
  NoStreaksLine,
  OpenStation,
  PlateRow,
  StatusChip,
  WeekNetwork,
  WeekNoteText,
  WeekRoute,
  buildWeekDays,
  weekNoteParts,
} from '../day';
import type { LineMapStation } from '../day';

/** Gallery-only copy: the dev page is not shipped, so it stays out of the i18n catalogue. */
const g = {
  title: 'Day and week',
  lineMap: 'Line map',
  resolve: 'Resolve the plate',
  reset: 'Reset',
  chips: 'Status chips',
  coach: 'Coach card and depth panel',
  week: 'Week route, network and list',
  networkTitle: 'This week’s network',
  dayByDay: 'Day by day',
  openHint: 'Greens would round out dinner. Want a 10-second idea?',
  coachQuestion: 'Two colours of veg and a lentil protein. Want to know why lentils count twice?',
  followUp:
    'Lentils are a legume: they bring plant protein and fibre, so this plate stops on both the green and the red line.',
  lastDelete: 'Delete requested for plate',
} as const;

const TODAY = localTime(2026, 10, 13, 20, 0);

function plate(
  id: number,
  day: number,
  hour: number,
  minute: number,
  foods: [string, FoodGroup][],
) {
  const at = localTime(2026, 10, day, hour, minute);
  return plateLog({
    id,
    loggedAtUtc: at,
    entries: foods.map(([name, group], i) => ({
      id: id * 10 + i,
      plateLogId: id,
      databaseFood: databaseFood({
        sourceRef: `seed:${name}`,
        displayName: name,
        source: 'seed',
        foodGroup: group,
      }),
      quantity: { low: 1, high: 2, unit: 'fist', displayLabel: '~1 fist' },
    })),
  });
}

const BREAKFAST = plate(1, 13, 7, 40, [
  ['Oats with berries', 'starch'],
  ['Berries', 'vegFruit'],
  ['Greek yogurt', 'dairy'],
]);
const LUNCH = plate(2, 13, 12, 55, [
  ['Lentil salad', 'protein'],
  ['Tomato', 'vegFruit'],
  ['Sourdough slice', 'starch'],
]);

/** A week of plates: dairy is missing on Friday and Sunday, Thursday is empty, Monday is logged with no line. */
const WEEK_PLATES: PlateLog[] = [
  plate(20, 7, 12, 0, [
    ['Eggs', 'protein'],
    ['Spinach', 'vegFruit'],
    ['Toast', 'starch'],
    ['Milk', 'dairy'],
  ]),
  plate(21, 9, 19, 0, [
    ['Chicken', 'protein'],
    ['Salad', 'vegFruit'],
    ['Rice', 'starch'],
    ['Yogurt', 'dairy'],
  ]),
  plate(22, 10, 13, 0, [
    ['Tofu', 'protein'],
    ['Peppers', 'vegFruit'],
    ['Noodles', 'starch'],
  ]),
  plate(23, 11, 13, 0, [
    ['Fish', 'protein'],
    ['Greens', 'vegFruit'],
    ['Potato', 'starch'],
    ['Cheese', 'dairy'],
  ]),
  // Logged, but only an "other" food: no line stopped (the solid-core dot, the thin bar).
  plate(24, 12, 13, 0, [['Chocolate bar', 'other']]),
  BREAKFAST,
  LUNCH,
];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h3 className="font-display text-section text-signal-muted mb-3 uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** Every day-map and week component in realistic states, for the component gallery. */
export function DayGallerySection() {
  const [resolved, setResolved] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachGone, setCoachGone] = useState(false);
  const [hintGone, setHintGone] = useState(false);
  const [selected, setSelected] = useState(TODAY);
  const [last, setLast] = useState<string>('');

  const dinner = plate(3, 13, 19, 30, [
    ['Salmon', 'protein'],
    ['Green beans', 'vegFruit'],
    ['Rice', 'starch'],
  ]);
  const stations: LineMapStation[] = [
    { id: 'b', status: 'logged', plate: BREAKFAST },
    { id: 'l', status: 'logged', plate: LUNCH },
    resolved ? { id: 'd', status: 'logged', plate: dinner } : { id: 'd', status: 'resolving' },
    { id: 'o', status: 'open' },
  ];
  const slotFor: Record<string, [MealSlot, PlateLog | null]> = {
    b: ['breakfast', BREAKFAST],
    l: ['lunch', LUNCH],
    d: ['dinner', resolved ? dinner : null],
    o: ['late', null],
  };

  const days = buildWeekDays(WEEK_PLATES, TODAY);
  const note = weekNoteParts(days);

  return (
    <section aria-label={g.title} className="px-4 pb-12">
      <h2 className="font-display text-headline uppercase">{g.title}</h2>

      <Block title={g.lineMap}>
        <div className="mb-3 flex gap-2">
          <Button variant="outline-porcelain" onClick={() => setResolved(true)}>
            {g.resolve}
          </Button>
          <Button
            variant="outline-porcelain"
            onClick={() => {
              setResolved(false);
              setCoachGone(false);
              setCoachOpen(false);
              setHintGone(false);
            }}
          >
            {g.reset}
          </Button>
        </div>
        <LineLegend />
        <LineMap
          stations={stations}
          renderStation={(s) => {
            const [slot, p] = slotFor[s.id] as [MealSlot, PlateLog | null];
            if (s.status === 'logged' && p) {
              return (
                <PlateRow
                  plate={p}
                  slot={slot}
                  hasTransport
                  syncStatus={s.id === 'b' ? 'synced' : s.id === 'l' ? 'pending' : null}
                  onOpen={(id) => setLast(`open ${id}`)}
                  onRequestDelete={(id) => setLast(`${g.lastDelete} ${id}`)}
                >
                  {s.id === 'd' && !coachGone ? (
                    coachOpen ? (
                      <DepthPanel followUp={g.followUp} onClose={() => setCoachGone(true)} />
                    ) : (
                      <CoachCard
                        question={g.coachQuestion}
                        onSure={() => setCoachOpen(true)}
                        onAskLater={() => setCoachGone(true)}
                      />
                    )
                  ) : null}
                </PlateRow>
              );
            }
            return (
              <OpenStation
                slot={slot}
                resolving={s.status === 'resolving'}
                hint={s.id === 'o' && !hintGone ? g.openHint : null}
                onDismissHint={() => setHintGone(true)}
              />
            );
          }}
        />
        <p role="status" className="text-signal-muted mt-2 text-meta">
          {last}
        </p>
      </Block>

      <Block title={g.chips}>
        <div className="flex flex-wrap gap-3">
          <StatusChip hasTransport={false} />
          <StatusChip hasTransport status="pending" />
          <StatusChip hasTransport status="synced" />
          <StatusChip hasTransport status="failed" />
        </div>
      </Block>

      <Block title={g.coach}>
        <div className="max-w-md">
          <CoachCard
            title="Why lentils count twice"
            question={g.coachQuestion}
            onSure={() => {}}
            onAskLater={() => {}}
          />
          <DepthPanel followUp={g.followUp} onClose={() => {}} />
          <DepthPanel onClose={() => {}} />
        </div>
      </Block>

      <Block title={g.week}>
        <div className="bg-enamel-raised border-rule mb-6 border-t-2 pb-1">
          <WeekRoute days={days} selected={selected} onSelectDay={setSelected} />
        </div>
        <NoStreaksLine className="mb-4" />
        <h4 className="font-display text-section text-signal-muted uppercase">{g.networkTitle}</h4>
        <WeekNetwork days={days} />
        <WeekNoteText lead={note.lead} detail={note.detail} className="mt-4" />
        <h4 className="font-display text-section text-signal-muted mt-6 mb-2 uppercase">
          {g.dayByDay}
        </h4>
        <DayList days={days} />
      </Block>
    </section>
  );
}
