import { useState, useSyncExternalStore } from 'react';
import { SupportLine, useShowNumbers } from '../../components/nutrition';
import { useStrings } from '../../i18n';
import { useSession } from '../../app/session';
import { SettingsPage } from './SettingsPage';
import { SwitchRow } from './SwitchRow';

/**
 * Settings, Nutrition: one switch for whether nutrient values, bars and gram previews are drawn
 * (on by default). Turning it off hides numbers only; meals, weights and the rest stay logged.
 * The choice is kept in the encrypted store. A write that fails leaves the switch where it was.
 */
export function NutritionScreen() {
  const s = useStrings().nutritionSettings;
  const { numbers, distance, live } = useSession();
  const shown = useShowNumbers();
  const distanceOn = useSyncExternalStore(distance.subscribe, distance.current);
  const [failed, setFailed] = useState(false);

  const change = async (next: boolean) => {
    try {
      await numbers.set(next);
      if (live()) setFailed(false);
    } catch {
      if (live()) setFailed(true);
    }
  };

  const changeDistance = async (next: boolean) => {
    try {
      await distance.set(next);
      if (live()) setFailed(false);
    } catch {
      if (live()) setFailed(true);
    }
  };

  return (
    <SettingsPage title={s.title}>
      <div>
        <SwitchRow
          title={s.switchTitle}
          help={s.switchHelp}
          checked={shown}
          onChange={(next) => void change(next)}
        />
        <SwitchRow
          title={s.distanceTitle}
          help={s.distanceHelp}
          checked={distanceOn}
          onChange={(next) => void changeDistance(next)}
        />
        <p role="status" className="text-body-small text-ink-soft empty:hidden">
          {failed ? s.saveFailed : ''}
        </p>
      </div>
      <SupportLine />
    </SettingsPage>
  );
}
