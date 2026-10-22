import { useSyncExternalStore } from 'react';
import { Button } from '../../components/primitives';
import { useStrings } from '../../i18n';
import {
  installPrompt,
  readInstallContext,
  type InstallContext,
  type InstallPlatform,
  type InstallPromptSource,
} from '../../pwa/install';
import { Prose, Section, SettingsPage } from './SettingsPage';

const ORDER: readonly InstallPlatform[] = ['ios', 'android', 'desktop'];

/**
 * Settings, Install on your phone. The steps for the detected platform come first, then the other
 * two; what installing changes; the one backup line. A single Install button appears only where
 * the browser offered `beforeinstallprompt`, and opens the browser's own dialog only on a tap.
 */
export function InstallScreen({
  context,
  prompt = installPrompt,
}: {
  /** Test seam; defaults to the running browser. */
  readonly context?: InstallContext;
  readonly prompt?: InstallPromptSource;
}) {
  const s = useStrings().install;
  const { platform, standalone } = context ?? readInstallContext();
  const canPrompt = useSyncExternalStore(prompt.subscribe, prompt.getSnapshot, () => false);

  const steps: Record<InstallPlatform, { title: string; text: string }> = {
    ios: { title: s.iosTitle, text: s.iosSteps },
    android: { title: s.androidTitle, text: s.androidSteps },
    desktop: { title: s.desktopTitle, text: s.desktopSteps },
  };
  // The detected platform first; the rest keep their order.
  const ordered = [platform, ...ORDER.filter((p) => p !== platform)];

  return (
    <SettingsPage title={s.title}>
      <Prose>{s.intro}</Prose>
      {standalone ? (
        <Prose>{s.already}</Prose>
      ) : (
        <>
          {canPrompt && (
            <Button variant="primary" className="self-start" onClick={() => void prompt.prompt()}>
              {s.button}
            </Button>
          )}
          {ordered.map((p) => (
            <Section key={p} title={steps[p].title}>
              <Prose>{steps[p].text}</Prose>
            </Section>
          ))}
        </>
      )}
      <Section title={s.changesTitle}>
        <Prose>{s.changesOffline}</Prose>
        <Prose>{s.changesIcon}</Prose>
        <Prose>{s.changesStorage}</Prose>
        <Prose>{s.backupNote}</Prose>
      </Section>
    </SettingsPage>
  );
}
