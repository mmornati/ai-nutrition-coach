import type { FoodMatch } from '@anc/core';
import { fill, plural, useLocale, useStrings } from '../../i18n';
import { GroupMarker } from '../../components/primitives';
import { formatWhole, useShowNumbers } from '../../components/nutrition';
import { foodName } from '../../catalog';

/** Energy per 100 g, in the person's words, or `null` when unknown or numbers are off. */
function kcalLine(
  match: FoodMatch,
  show: boolean,
  template: string,
  locale: Parameters<typeof formatWhole>[1],
) {
  const per100 = match.food.nutrientsPer100g?.energyKcal;
  return show && per100 !== undefined
    ? fill(template, { value: formatWhole(per100, locale) })
    : null;
}

/**
 * The ranked matches of a food search: one row per food, the chosen one marked. With numbers on,
 * each row says its energy per 100 g. `onlySelected` collapses the list to the chosen food.
 */
export function MatchList({
  matches,
  selected,
  onSelect,
  onlySelected = false,
}: {
  readonly matches: readonly FoodMatch[];
  readonly selected: FoodMatch | null;
  readonly onSelect: (match: FoodMatch) => void;
  readonly onlySelected?: boolean;
}) {
  const s = useStrings();
  const c = s.catalog;
  const { locale } = useLocale();
  const showNumbers = useShowNumbers();
  const shown = onlySelected && selected !== null ? [selected] : matches;
  return (
    <ul aria-label={c.results} className="border-ink border-t-2">
      {shown.map((match) => {
        const isSelected = selected === match;
        const kcal = kcalLine(match, showNumbers, c.matchKcal, locale);
        const label = fill(plural(c.matchLabel, match.presets.length, locale), {
          name: foodName(match.food, locale),
          group: s.groups[match.food.foodGroup],
          // Placed right after the group, in the order the row shows them (axe: the visible text
          // must be part of the name).
          kcal: kcal === null ? '' : `, ${kcal}`,
          presets: match.presets.length,
        });
        return (
          <li key={match.food.sourceRef} className="border-seam border-b">
            <button
              type="button"
              aria-pressed={isSelected}
              aria-label={label}
              onClick={() => onSelect(match)}
              className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 bg-transparent py-2 text-left"
            >
              <span className="min-w-0">
                <span className="block text-lead">{foodName(match.food, locale)}</span>
                {/* A space so the visible text reads "Spinach Veg & fruit", not "SpinachVeg & fruit",
                  which axe's label-content-name-mismatch cannot find in the button's name. It
                  starts a line after the block, so it is not drawn. */}{' '}
                <GroupMarker group={match.food.foodGroup} className="mt-1" />
                {/* The same space again, so "Veg & fruit 33 kcal per 100 g" reads as one phrase. */}
                {kcal !== null && (
                  <>
                    {' '}
                    <span className="text-body-small text-ink-soft mt-1 block">{kcal}</span>
                  </>
                )}
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
