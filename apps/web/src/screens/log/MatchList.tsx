import type { FoodMatch } from '@anc/core';
import { fill, useLocale, useStrings } from '../../i18n';
import { GroupMarker } from '../../components/primitives';
import { foodName } from '../../catalog';

/** The ranked matches of a food search: one row per food, the chosen one marked. */
export function MatchList({
  matches,
  selected,
  onSelect,
}: {
  readonly matches: readonly FoodMatch[];
  readonly selected: FoodMatch | null;
  readonly onSelect: (match: FoodMatch) => void;
}) {
  const s = useStrings();
  const c = s.catalog;
  const { locale } = useLocale();
  return (
    <ul aria-label={c.results} className="border-ink border-t-2">
      {matches.map((match) => {
        const isSelected = selected === match;
        return (
          <li key={match.food.sourceRef} className="border-seam border-b">
            <button
              type="button"
              aria-pressed={isSelected}
              aria-label={fill(c.matchLabel, {
                name: foodName(match.food, locale),
                group: s.groups[match.food.foodGroup],
                presets: match.presets.length,
              })}
              onClick={() => onSelect(match)}
              className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 bg-transparent py-2 text-left"
            >
              <span className="min-w-0">
                <span className="block text-lead">{foodName(match.food, locale)}</span>
                <GroupMarker group={match.food.foodGroup} className="mt-1" />
              </span>
              <span
                aria-hidden="true"
                className={`size-3 shrink-0 rounded-full border-2 ${isSelected ? 'bg-ink border-ink' : 'border-control-raised'}`}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
