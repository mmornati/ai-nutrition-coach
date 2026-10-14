import { useEffect, useState } from 'react';
import { useStrings } from '../../i18n';
import { useSessionOptional, type Session } from '../../app/session';
import type { OffLookupChoice } from '../../catalog';
import { Prose, Section, SettingsPage } from './SettingsPage';
import { SwitchRow } from './SwitchRow';

/**
 * The one switch this page owns: may a scanned barcode be looked up on Open Food Facts? It reads
 * and writes the encrypted store, so it exists only while unlocked. A write that fails leaves the
 * switch where it was and says so.
 */
function OffSwitch({ session }: { readonly session: Session }) {
  const s = useStrings().privacy;
  const { privacy, live } = session;
  // `null` until the stored answer has been read.
  const [choice, setChoice] = useState<OffLookupChoice | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    void privacy.offLookupChoice().then((read) => {
      if (current && live()) setChoice(read);
    });
    return () => {
      current = false;
    };
  }, [privacy, live]);

  const change = async (allowed: boolean) => {
    const next: OffLookupChoice = allowed ? 'allowed' : 'offlineOnly';
    try {
      await privacy.setOffLookupChoice(next);
      if (!live()) return;
      setChoice(next);
      setFailed(false);
    } catch {
      // Could not keep it (the store is locked): the switch stays where it was.
      if (live()) setFailed(true);
    }
  };

  const help =
    choice === 'allowed'
      ? s.offToggleOn
      : choice === 'offlineOnly'
        ? s.offToggleOff
        : s.offToggleUnasked;
  return (
    <div>
      <SwitchRow
        title={s.offToggle}
        help={help}
        checked={choice === 'allowed'}
        disabled={choice === null}
        onChange={(next) => void change(next)}
      />
      <p role="status" className="text-body-small text-porcelain-dim empty:hidden">
        {failed ? s.saveFailed : ''}
      </p>
    </div>
  );
}

/**
 * "What this app stores and sends": a plain list a person can read before they have unlocked
 * anything (it is reachable at #/privacy with no session). Stored and where, what leaves the
 * device and when, what the serving host sees, what is never collected, how to delete and export,
 * the shared-device note, and (unlocked only) the Open Food Facts switch.
 */
export function PrivacyScreen() {
  const s = useStrings().privacy;
  const session = useSessionOptional();
  return (
    <SettingsPage title={s.title}>
      <Prose>{s.intro}</Prose>
      <Section title={s.storedHeading}>
        <Prose>{s.storedBody}</Prose>
      </Section>
      <Section title={s.leavesHeading}>
        <Prose>{s.leavesBarcode}</Prose>
        <Prose>{s.leavesPhoto}</Prose>
        {session !== null && <OffSwitch session={session} />}
      </Section>
      <Section title={s.serverHeading}>
        <Prose>{s.serverBody}</Prose>
      </Section>
      <Section title={s.neverHeading}>
        <Prose>{s.neverBody}</Prose>
      </Section>
      <Section title={s.deleteHeading}>
        <Prose>{s.deleteBody}</Prose>
      </Section>
      <Section title={s.exportHeading}>
        <Prose>{s.exportBody}</Prose>
      </Section>
      <Section title={s.sharedHeading}>
        <Prose>{s.sharedBody}</Prose>
      </Section>
    </SettingsPage>
  );
}
