import { useEffect, useRef, useState } from 'react';
import type { Profile } from '@anc/core';
import { Button, TextField } from '../../components/primitives';
import { ConfirmDialog } from '../../components/dialogs';
import {
  fill,
  plural,
  useLocale,
  useMessage,
  useStrings,
  type Message,
  type Strings,
} from '../../i18n';
import { forgetAcknowledgedBeforeStore } from '../../app/about-ack';
import { useServerHandoff } from '../../app/server-handoff';
import { useSession } from '../../app/session';
import {
  checkServerRestore,
  findFailureText,
  joinServerCopy,
  openServerCopy,
  previewJoin,
  type JoinPreview,
  type OpenedServerCopy,
  type ProfileDifference,
} from '../../sync';
import { Prose, Section } from './SettingsPage';

const PROFILE_OPTIONS = {
  sex: 'sexOptions',
  activity: 'activityOptions',
  goal: 'goalOptions',
  diet: 'dietOptions',
} as const;

/** A profile value as the Profile screen words it. */
function profileValue(
  field: ProfileDifference['field'],
  value: string | null,
  all: Strings,
): string {
  if (value === null) return all.server.profileUnset;
  if (field === 'sex' || field === 'activity' || field === 'goal' || field === 'diet') {
    const options = all.profile[PROFILE_OPTIONS[field]] as Readonly<Record<string, string>>;
    return options[value] ?? value;
  }
  return value;
}

const FIELD_LABEL: Readonly<Record<ProfileDifference['field'], (all: Strings) => string>> = {
  ageBand: (a) => a.profile.ageBand,
  sex: (a) => a.profile.sex,
  activity: (a) => a.profile.activity,
  goal: (a) => a.profile.goal,
  diet: (a) => a.profile.diet,
  allergies: (a) => a.profile.allergiesLabel,
};

interface Found {
  readonly copy: OpenedServerCopy;
  readonly preview: JoinPreview;
}

/**
 * Settings, Your data (Case B): a device that already has data joins a copy that exists. Handle
 * and passphrase together; the copy is downloaded and decrypted, then a DRY-RUN merge is shown
 * (this server, this device, together) before anything is written. Combine is the primary
 * action and deletes nothing. A profile that differs by content is asked about once. "Start
 * fresh" is an advanced option behind "Other options", with a backup button first.
 */
export function ServerJoinSection({
  onDone,
  onSaveBackup,
}: {
  readonly onDone: (message: Message) => void;
  /** Moves to the encrypted-backup field (the "save a backup first" step). */
  readonly onSaveBackup: () => void;
}) {
  const all = useStrings();
  const s = all.server;
  const { locale } = useLocale();
  const session = useSession();
  const handoff = useServerHandoff();
  const [handle, setHandle] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [profileChoice, setProfileChoice] = useState<'device' | 'server' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useMessage();
  const foundRef = useRef<Found | null>(null);
  useEffect(() => {
    foundRef.current = found;
  }, [found]);
  // The passphrase the copy was found with is only needed by "Start fresh" (it becomes this device's
  // passphrase). It is kept out of React state, and dropped as soon as Combine is chosen, on Cancel
  // and when this section goes away.
  const keptPassphrase = useRef<string | null>(null);

  // The opened copy holds the vault key: wipe it when this section goes away.
  useEffect(
    () => () => {
      foundRef.current?.copy.vaultKey.fill(0);
      keptPassphrase.current = null;
    },
    [],
  );

  const forget = () => {
    keptPassphrase.current = null;
    found?.copy.vaultKey.fill(0);
    setFound(null);
    setProfileChoice(null);
    setConfirming(false);
  };

  const find = async () => {
    if (busy) return;
    setMessage(null);
    if (handle.trim() === '') {
      setMessage((a) => a.server.missingHandle);
      return;
    }
    if (passphrase === '') {
      setMessage((a) => a.server.missingPassphrase);
      return;
    }
    setBusy(true);
    let next: Message | null = null;
    try {
      const opened = await openServerCopy({
        client: session.syncClient,
        kdf: session.syncKdf,
        handle,
        passphrase,
      });
      if (!session.live()) {
        if (opened.kind === 'opened') opened.copy.vaultKey.fill(0);
        return;
      }
      if (opened.kind === 'failed') {
        const failure = opened.failure;
        next = (a) => findFailureText(failure, a.server);
      } else {
        const read = await session.vault.readSnapshot();
        const preview =
          read.kind === 'vault'
            ? previewJoin(read.value, opened.copy.snapshot, session.clock())
            : null;
        if (preview === null) {
          opened.copy.vaultKey.fill(0);
          next = (a) => a.server.storeProblem;
        } else if (preview.kind === 'refused') {
          opened.copy.vaultKey.fill(0);
          const reason = preview.reason;
          next = (a) =>
            reason === 'schemaTooNew'
              ? a.server.newerVersion
              : reason === 'clockAhead'
                ? a.server.clockAhead
                : a.server.damaged;
        } else {
          keptPassphrase.current = passphrase;
          setFound({ copy: opened.copy, preview: preview.preview });
          setProfileChoice(null);
        }
      }
    } catch {
      next = (a) => a.server.unavailable;
    } finally {
      setPassphrase('');
      if (session.live()) setBusy(false);
    }
    if (session.live()) setMessage(next);
  };

  const combine = async () => {
    if (busy || found === null) return;
    if (found.preview.profile !== null && profileChoice === null) {
      setMessage((a) => a.server.profileChoose);
      return;
    }
    // Combining does not need the passphrase: do not keep it any longer.
    keptPassphrase.current = null;
    setBusy(true);
    setMessage(null);
    let next: Message | null;
    try {
      const joined = await joinServerCopy({
        vault: session.vault,
        kv: session.kv,
        copy: found.copy,
        choice: { profile: found.preview.profile === null ? null : profileChoice },
      });
      if (!session.live()) return;
      if (joined.kind === 'failed') {
        const reason = joined.reason;
        next = (a) =>
          reason === 'schemaTooNew'
            ? a.server.newerVersion
            : reason === 'clockAhead'
              ? a.server.clockAhead
              : a.server.storeProblem;
      } else if (await session.sync.connect(joined.connection, joined.dirty)) {
        // Combining is followed by one push of the merged result, now rather than after the wait.
        const outcome = joined.dirty ? await session.sync.syncNow() : { kind: 'backedUp' as const };
        if (!session.live()) return;
        forget();
        onDone((a) => (outcome.kind === 'backedUp' ? a.server.combined : a.server.combinedPending));
        return;
      } else {
        next = (a) => a.server.unavailable;
      }
    } catch {
      next = (a) => a.server.unavailable;
    } finally {
      if (session.live()) setBusy(false);
    }
    if (session.live()) setMessage(next);
  };

  const startFresh = async () => {
    if (found === null || handoff === null) return;
    const kept = keptPassphrase.current;
    if (kept === null) {
      // Combine was tried first and the passphrase was dropped: ask for the copy again.
      forget();
      setMessage((a) => a.server.freshAgain);
      return;
    }
    // Everything that can refuse the restore is checked BEFORE the erase: a failure after it would
    // leave this device empty.
    const refused = checkServerRestore(found.copy, kept, session.clock());
    if (refused !== null) {
      setConfirming(false);
      setMessage((a) => (refused.kind === 'clockAhead' ? a.server.clockAhead : a.server.freshWeak));
      return;
    }
    setBusy(true);
    setMessage(null);
    // The erase tears this session down; the Gate restores the copy into the store that follows.
    handoff.begin(found.copy, kept);
    forgetAcknowledgedBeforeStore();
    try {
      const erased = await session.eraser.eraseAll();
      if (erased.kind === 'eraseLocalDataSuccess') return;
      handoff.cancel();
      if (session.live()) setMessage((a) => a.server.storeProblem);
    } catch {
      handoff.cancel();
      if (session.live()) setMessage((a) => a.server.storeProblem);
    } finally {
      if (session.live()) {
        setBusy(false);
        setConfirming(false);
      }
    }
  };

  const preview = found?.preview ?? null;

  return (
    <Section title={s.joinHeading}>
      <Prose>{s.joinExplain}</Prose>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void find();
        }}
      >
        <TextField
          label={s.handleLabel}
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
        />
        <TextField
          label={s.joinPassphraseLabel}
          type="password"
          autoComplete="current-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        <Button
          type="submit"
          variant="secondary"
          className="self-start"
          busy={busy && found === null}
          busyLabel={s.joinWorking}
        >
          {s.joinAction}
        </Button>
      </form>

      {found !== null && preview !== null && (
        <div className="flex flex-col gap-3">
          <h3 className="font-display text-lead">{s.previewHeading}</h3>
          <ul className="text-body flex list-none flex-col gap-1 p-0">
            <li>{plural(s.previewServer, preview.server.count, locale)}</li>
            <li>
              {plural(s.previewDevice, preview.device.count, locale)}
              {preview.alreadyOnServer > 0 &&
                ` (${fill(s.previewShared, { count: preview.alreadyOnServer })})`}
            </li>
            <li>{plural(s.previewTogether, preview.combined, locale)}</li>
          </ul>

          {preview.profile !== null && (
            <fieldset className="flex flex-col gap-2">
              <legend className="font-display text-label text-ink-soft mb-1">
                {s.profileLegend}
              </legend>
              <p className="text-body-small text-ink-soft">{s.profileExplain}</p>
              <ul className="text-body-small flex list-none flex-col gap-0.5 p-0">
                {preview.profile.map((d) => (
                  <li key={d.field}>
                    {fill(s.profileLine, {
                      field: FIELD_LABEL[d.field](all),
                      device: profileValue(d.field, d.device, all),
                      server: profileValue(d.field, d.server, all),
                    })}
                  </li>
                ))}
              </ul>
              {(['device', 'server'] as const).map((side) => (
                <label key={side} className="text-body flex min-h-12 items-center gap-3">
                  <input
                    type="radio"
                    name="server-join-profile"
                    className="size-5"
                    checked={profileChoice === side}
                    onChange={() => setProfileChoice(side)}
                  />
                  {side === 'device' ? s.profileFromDevice : s.profileFromServer}
                </label>
              ))}
            </fieldset>
          )}

          <Prose>{s.combineHelp}</Prose>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="primary"
              busy={busy}
              busyLabel={s.combineWorking}
              onClick={() => void combine()}
            >
              {s.combineAction}
            </Button>
            <Button variant="secondary" onClick={forget}>
              {s.cancelAction}
            </Button>
          </div>

          {handoff !== null && (
            <details className="flex flex-col gap-3">
              <summary className="font-display text-label text-ink-soft min-h-12 cursor-pointer py-3">
                {s.otherOptions}
              </summary>
              <div className="flex flex-col gap-3 pt-1">
                <h4 className="font-display text-lead">{s.freshHeading}</h4>
                <Prose>{s.freshExplain}</Prose>
                <p className="text-body">
                  {preview.onlyOnDevice > 0
                    ? plural(s.freshRemoves, preview.onlyOnDevice, locale)
                    : s.freshNothing}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button variant="secondary" onClick={onSaveBackup}>
                    {s.freshBackupFirst}
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirming(true)}>
                    {s.freshAction}
                  </Button>
                </div>
              </div>
            </details>
          )}
        </div>
      )}

      <p role="status" className="text-body text-ink empty:hidden">
        {message}
      </p>

      <ConfirmDialog
        open={confirming}
        busy={busy}
        title={s.freshConfirmTitle}
        body={
          <>
            <p>
              {preview !== null && preview.onlyOnDevice > 0
                ? plural(s.freshRemoves, preview.onlyOnDevice, locale)
                : s.freshNothing}
            </p>
            <p className="mt-2">{s.freshExplain}</p>
          </>
        }
        confirmLabel={s.freshConfirm}
        dismissLabel={s.freshKeep}
        onDismiss={() => setConfirming(false)}
        onConfirm={() => void startFresh()}
      />
    </Section>
  );
}

/** For tests that need the profile type. */
export type { Profile };
