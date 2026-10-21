import { useState } from 'react';
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
  const { numbers, live } = useSession();
  const shown = useShowNumbers();
  const [failed, setFailed] = useState(false);

  const change = async (next: boolean) => {
    try {
      await numbers.set(next);
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
        <p role="status" className="text-body-small text-porcelain-dim empty:hidden">
          {failed ? s.saveFailed : ''}
        </p>
      </div>
      <SupportLine />
    </SettingsPage>
  );
}
