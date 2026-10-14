import { useState } from 'react';
import { databaseFood, localTime, plateLog } from '@anc/core';
import type { FoodGroup, MealSlot, PlateLog } from '@anc/core';
import { CoachCard, DepthPanel } from './CoachCard';
import { LineLegend, LineMap } from './LineMap';
import type { LineMapStation } from './LineMap';
import { OpenStation, PlateRow } from './Stations';
import { StatusChip } from './StatusChip';
import { dayStrings } from './strings';
import { buildWeekDays, weekNoteParts } from './week';
import { DayList, NoStreaksLine, WeekNetwork, WeekNoteText } from './WeekNetwork';
import { WeekRoute } from './WeekRoute';

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

/** A week of plates: dairy is missing on Friday and Sunday, Thursday is empty. */
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
  plate(24, 12, 13, 0, [
    ['Beans', 'protein'],
    ['Carrot', 'vegFruit'],
    ['Bread', 'starch'],
  ]),
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
    { id: 'b', status: 'logged', groups: BREAKFAST.entries.map((e) => e.databaseFood.foodGroup) },
    { id: 'l', status: 'logged', groups: LUNCH.entries.map((e) => e.databaseFood.foodGroup) },
    resolved
      ? { id: 'd', status: 'logged', groups: dinner.entries.map((e) => e.databaseFood.foodGroup) }
      : { id: 'd', status: 'resolving', groups: [] },
    { id: 'o', status: 'open', groups: [] },
  ];
  const slotFor: Record<string, [MealSlot, PlateLog | null]> = {
    b: ['breakfast', BREAKFAST],
    l: ['lunch', LUNCH],
    d: ['dinner', resolved ? dinner : null],
    o: ['late', null],
  };

  const days = buildWeekDays(WEEK_PLATES, TODAY);
  const note = weekNoteParts(days);
  const g = dayStrings.gallery;

  return (
    <section aria-label={g.title} className="px-4 pb-12">
      <h2 className="font-display text-headline uppercase">{g.title}</h2>

      <Block title={g.lineMap}>
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setResolved(true)}
            className="font-display text-button border-porcelain min-h-12 border-2 px-[18px] uppercase"
          >
            {g.resolve}
          </button>
          <button
            type="button"
            onClick={() => {
              setResolved(false);
              setCoachGone(false);
              setCoachOpen(false);
              setHintGone(false);
            }}
            className="font-display text-button border-control min-h-12 border-2 px-[18px] uppercase"
          >
            {g.reset}
          </button>
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
        <p role="status" className="text-signal-muted mt-2 text-[14.5px]">
          {last}
        </p>
      </Block>

      <Block title={g.chips}>
        <div className="flex flex-wrap gap-3">
          <StatusChip />
          <StatusChip status="pending" />
          <StatusChip status="synced" />
          <StatusChip status="failed" />
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
        <h4 className="font-display text-section text-signal-muted uppercase">
          {dayStrings.networkTitle}
        </h4>
        <WeekNetwork days={days} />
        <WeekNoteText lead={note.lead} detail={note.detail} className="mt-4" />
        <h4 className="font-display text-section text-signal-muted mt-6 mb-2 uppercase">
          {dayStrings.dayByDay}
        </h4>
        <DayList days={days} />
      </Block>
    </section>
  );
}
