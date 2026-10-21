import { DayProvider } from './day-context';
import { parseRoute, useHash } from './router';
import { AskCoachScreen } from '../screens/coach/AskCoachScreen';
import { PlateScreen } from '../screens/plate/PlateScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { TodayScreen } from '../screens/today/TodayScreen';
import { WeekScreen } from '../screens/week/WeekScreen';
import { LogHost } from '../screens/log/LogHost';
import type { UseBarcodeScannerOptions } from '../barcode';
import type { UsePhotoFlowDeps } from '../capture';

export interface UnlockedAppProps {
  /** Test seams: a fake camera/decoder and a fake photo picker. */
  readonly scannerOptions?: Partial<UseBarcodeScannerOptions>;
  readonly createCapture?: UsePhotoFlowDeps['createCapture'];
}

function Routes() {
  const route = parseRoute(useHash());
  switch (route.name) {
    case 'week':
      return <WeekScreen />;
    case 'coach':
      return <AskCoachScreen />;
    case 'plate':
      return <PlateScreen plateId={route.id} />;
    case 'settings':
      return <SettingsScreen section={route.section} />;
    case 'today':
      return <TodayScreen />;
  }
}

/** Everything behind the unlock: the day's data, the log flows and the routed screens. */
export function UnlockedApp({ scannerOptions, createCapture }: UnlockedAppProps) {
  return (
    <DayProvider>
      <LogHost
        {...(scannerOptions ? { scannerOptions } : {})}
        {...(createCapture ? { createCapture } : {})}
      >
        <Routes />
      </LogHost>
    </DayProvider>
  );
}
