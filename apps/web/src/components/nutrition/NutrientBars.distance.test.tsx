// The opt-in distance line (docs/adr/0008, decision D1): plain text under the ENERGY bar only, off
// by default, hidden with numbers off, never coloured, and the only place the "to your daily guide"
// and "past your daily guide" wording appears.
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { dailyTargetsFor, type NutrientTotals } from '@anc/core';
import { renderInSession, unlockedBundle } from '../../app/testing';
import { KV_KEYS } from '../../storage';
import { NutrientBars } from './NutrientBars';

afterEach(cleanup);

const totals = (
  t: NutrientTotals['totals'],
  extra: Partial<NutrientTotals> = {},
): NutrientTotals => ({
  totals: t,
  entriesCounted: 2,
  entriesTotal: 2,
  gaps: {},
  uncoveredShare: {},
  unweighed: 0,
  uncounted: [],
  estimated: false,
  ...extra,
});

const PROFILE = { sex: 'female', ageBand: '30-49', activity: 'moderate' } as const;
const personal = dailyTargetsFor(PROFILE); // 2000 kcal, 49 g protein

async function bundleWith(options: { distance: boolean; numbersOff?: boolean }) {
  const bundle = await unlockedBundle();
  await bundle.kv.write(KV_KEYS.profile, JSON.stringify(PROFILE));
  if (options.distance) await bundle.kv.write(KV_KEYS.uiShowDistanceToGuide, 'on');
  if (options.numbersOff) await bundle.kv.write(KV_KEYS.uiShowNumbers, 'off');
  return bundle;
}

describe('the distance to the daily guide', () => {
  it('is off by default: no such line, even for a personal guide', async () => {
    await renderInSession(
      <NutrientBars
        nutrition={totals({ energyKcal: 1550, protein: 20 })}
        targets={personal}
        distance
      />,
      { bundle: await bundleWith({ distance: false }) },
    );
    expect(screen.queryByText(/your daily guide$/)).toBeNull();
    expect(screen.getByText('about 78% of your daily guide (2000 kcal)')).toBeVisible();
  });

  it('opted in: one plain line under the energy bar, "to" before the guide', async () => {
    const { container } = await renderInSession(
      <NutrientBars
        nutrition={totals({ energyKcal: 1550, protein: 20 })}
        targets={personal}
        distance
      />,
      { bundle: await bundleWith({ distance: true }) },
    );
    await waitFor(() =>
      expect(screen.getByText('about 450 kcal to your daily guide')).toBeVisible(),
    );
    // Only one such line, and it is under the energy row.
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('about 450 kcal to your daily guide');
    expect(rows[1]).not.toHaveTextContent('kcal to your daily guide');
    // Same neutral treatment: a plain paragraph with the same classes as the sentence beside it.
    const line = screen.getByText('about 450 kcal to your daily guide');
    expect(line.tagName).toBe('P');
    expect(line.getAttribute('role')).toBeNull();
    expect(line.querySelector('svg, img')).toBeNull();
    const list = screen.getByRole('list', { name: /Nutrient amounts/ });
    expect(list.innerHTML).not.toMatch(/red|amber|rose|orange|alert|warn|progressbar/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('past the guide the line says "past", with the distance, and nothing else changes', async () => {
    await renderInSession(
      <NutrientBars nutrition={totals({ energyKcal: 2120 })} targets={personal} distance />,
      { bundle: await bundleWith({ distance: true }) },
    );
    await waitFor(() =>
      expect(screen.getByText('about 120 kcal past your daily guide')).toBeVisible(),
    );
    expect(screen.getByText('about 106% of your daily guide (2000 kcal)')).toBeVisible();
  });

  it("is not drawn without the person's own guide (EU reference intakes), for a partial total, or when the caller does not ask", async () => {
    const bundle = await bundleWith({ distance: true });
    const { rerender } = await renderInSession(
      <NutrientBars nutrition={totals({ energyKcal: 1000 })} distance />,
      { bundle },
    );
    expect(screen.queryByText(/your daily guide$/)).toBeNull();
    rerender(
      <NutrientBars
        nutrition={totals(
          { energyKcal: 1000 },
          { gaps: { energyKcal: 1 }, uncoveredShare: { energyKcal: 0.5 } },
        )}
        targets={personal}
        distance
      />,
    );
    expect(screen.queryByText(/kcal (to|past) your daily guide/)).toBeNull();
    rerender(<NutrientBars nutrition={totals({ energyKcal: 1000 })} targets={personal} />);
    expect(screen.queryByText(/kcal (to|past) your daily guide/)).toBeNull();
  });

  it('within 10 kcal of the guide it says nothing, rather than "about 0 kcal"', async () => {
    for (const kcal of [1990, 1995, 2000, 2005, 2010]) {
      cleanup();
      await renderInSession(
        <NutrientBars nutrition={totals({ energyKcal: kcal })} targets={personal} distance />,
        { bundle: await bundleWith({ distance: true }) },
      );
      await waitFor(() =>
        expect(screen.getByText(/% of your daily guide \(2000 kcal\)/)).toBeVisible(),
      );
      expect(screen.queryByText(/kcal (to|past) your daily guide/), String(kcal)).toBeNull();
    }
    cleanup();
    await renderInSession(
      <NutrientBars nutrition={totals({ energyKcal: 1980 })} targets={personal} distance />,
      { bundle: await bundleWith({ distance: true }) },
    );
    await waitFor(() =>
      expect(screen.getByText('about 20 kcal to your daily guide')).toBeVisible(),
    );
  });
});
