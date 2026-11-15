import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountInfo } from '@anc/core';
import { Button, Checkbox, TextField } from '../../components/primitives';
import { fill, useLocale, useMessage, useStrings, type Message } from '../../i18n';
import { useSession } from '../../app/session';
import {
  accountFailureText,
  changeServerPassphrase,
  deleteServerCopy,
  loadAccount,
  newPassphraseIssue,
  readConnection,
  removeServerRecoveryKey,
  restorePreviousVersion,
  revokeServerDevices,
  setServerRecoveryKey,
  strengthText,
  type AccountResult,
  type RelayConnection,
} from '../../sync';
import { Prose, Section } from './SettingsPage';

/** The connection of this device and what the server says about the copy; read again after a change. */
function useAccount() {
  const session = useSession();
  const [connection, setConnection] = useState<RelayConnection | null>(null);
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    const c = await readConnection(session.kv).catch(() => null);
    if (c === null) return { c, result: null };
    const result = await loadAccount({
      client: session.syncClient,
      kdf: session.syncKdf,
      connection: c,
    });
    return { c, result };
  }, [session]);
  const apply = useCallback(
    (loaded: Awaited<ReturnType<typeof load>>) => {
      if (!session.live()) return;
      setConnection(loaded.c);
      if (loaded.result === null) return;
      setFailed(loaded.result.kind === 'failed');
      if (loaded.result.kind === 'ok') setInfo(loaded.result.value);
    },
    [session],
  );
  const reload = useCallback(async () => apply(await load()), [apply, load]);
  useEffect(() => {
    void load().then(apply);
  }, [load, apply]);
  const deps =
    connection === null ? null : { client: session.syncClient, kdf: session.syncKdf, connection };
  return { deps, info, failed, reload };
}

/** The recovery key, once: written down by the person before the panel goes away. */
export function RecoveryKeyPanel({
  recoveryKey,
  onDone,
}: {
  readonly recoveryKey: string;
  readonly onDone: () => void;
}) {
  const s = useStrings().server;
  const [saved, setSaved] = useState(false);
  return (
    <Section title={s.recShowHeading}>
      <Prose>{s.recShowExplain}</Prose>
      <p
        className="text-lead border-control rounded-cloth bg-raised border-2 p-4 font-mono tracking-wider break-words select-all"
        data-recovery-key=""
      >
        {recoveryKey}
      </p>
      <Checkbox checked={saved} onChange={(e) => setSaved(e.target.checked)}>
        {s.recSaved}
      </Checkbox>
      <Button variant="primary" className="self-start" disabled={!saved} onClick={onDone}>
        {s.recDone}
      </Button>
    </Section>
  );
}

function useAction(session: ReturnType<typeof useSession>) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useMessage();
  const run = async <T,>(
    work: () => Promise<AccountResult<T>>,
    onOk: (value: T) => Message | null | Promise<Message | null>,
  ): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setMessage(null);
    let next: Message | null;
    let done = false;
    try {
      const result = await work();
      if (!session.live()) return false;
      if (result.kind === 'ok') {
        next = await onOk(result.value);
        done = true;
      } else {
        const failure = result.failure;
        next = (a) => accountFailureText(failure, a);
      }
    } catch {
      next = (a) => a.server.unavailable;
    } finally {
      if (session.live()) setBusy(false);
    }
    if (session.live()) setMessage(next);
    return done;
  };
  return { busy, message, setMessage, run };
}

/** Devices connected to this copy: label, when added, when last used; sign one out or all the others. */
export function ServerDevicesSection() {
  const all = useStrings();
  const s = all.server;
  const { locale } = useLocale();
  const session = useSession();
  const { deps, info, failed, reload } = useAccount();
  const { busy, message, run } = useAction(session);
  if (failed && info === null)
    return <p className="text-body text-ink-soft">{s.devicesLoadFailed}</p>;
  if (info === null || deps === null) return null;
  const when = (ms: number) =>
    new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <Section title={s.devicesHeading}>
      <Prose>{s.devicesExplain}</Prose>
      <ul className="flex list-none flex-col gap-3 p-0" data-devices="">
        {info.devices.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-body">
              <strong>{d.label === '' ? s.deviceUnnamed : d.label}</strong>
              {d.current && ` (${s.deviceThis})`}
              <br />
              <span className="text-body-small text-ink-soft">
                {fill(s.deviceLine, { created: when(d.createdAt), seen: when(d.lastSeenAt) })}
              </span>
            </span>
            {!d.current && (
              <Button
                variant="secondary"
                aria-disabled={busy || undefined}
                onClick={() =>
                  void run(
                    () => revokeServerDevices(deps, { id: d.id }),
                    async () => {
                      await reload();
                      return (a) => a.server.deviceSignedOut;
                    },
                  )
                }
              >
                {s.deviceSignOut}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {info.devices.length > 1 && (
        <Button
          variant="secondary"
          className="self-start"
          aria-disabled={busy || undefined}
          onClick={() =>
            void run(
              () => revokeServerDevices(deps, { others: true }),
              async () => {
                await reload();
                return (a) => a.server.devicesSignedOut;
              },
            )
          }
        >
          {s.deviceSignOutOthers}
        </Button>
      )}
      <p role="status" className="text-body text-ink empty:hidden">
        {message}
      </p>
    </Section>
  );
}

/** Changes the passphrase OF THE SERVER COPY (not the one that unlocks this device). */
export function ServerPassphraseSection() {
  const all = useStrings();
  const s = all.server;
  const session = useSession();
  const { deps } = useAccount();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const { busy, message, setMessage, run } = useAction(session);
  if (deps === null) return null;
  const submit = async () => {
    if (next !== confirm) {
      setMessage((a) => a.session.mismatch);
      return;
    }
    const issue = newPassphraseIssue(next, deps.connection.handle);
    if (issue !== null) {
      setMessage((a) => strengthText(issue, a));
      return;
    }
    const ok = await run(
      () => changeServerPassphrase({ ...deps, current, next }),
      () => (a) => a.server.changeDone,
    );
    setCurrent('');
    setNext('');
    setConfirm('');
    void ok;
  };
  return (
    <Section title={s.changeHeading}>
      <Prose>{s.changeWhich}</Prose>
      <Prose>{s.strengthWhy}</Prose>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField
          label={s.changeCurrent}
          type="password"
          autoComplete="current-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <TextField
          label={s.changeNew}
          type="password"
          autoComplete="new-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <TextField
          label={s.confirmLabel}
          type="password"
          autoComplete="new-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Button
          type="submit"
          variant="secondary"
          className="self-start"
          busy={busy}
          busyLabel={s.changeWorking}
        >
          {s.changeAction}
        </Button>
      </form>
      <p role="status" className="text-body text-ink empty:hidden">
        {message}
      </p>
    </Section>
  );
}

/** Add, rotate or remove the recovery key. The key itself is shown once, then kept nowhere. */
export function ServerRecoverySection() {
  const all = useStrings();
  const s = all.server;
  const session = useSession();
  const { deps, info, reload } = useAccount();
  const [passphrase, setPassphrase] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  const { busy, message, run } = useAction(session);
  if (deps === null || info === null) return null;
  if (shown !== null) return <RecoveryKeyPanel recoveryKey={shown} onDone={() => setShown(null)} />;
  const make = async () => {
    await run(
      () => setServerRecoveryKey({ ...deps, passphrase }),
      async (value) => {
        setShown(value.recoveryKey);
        await reload();
        return null;
      },
    );
    setPassphrase('');
  };
  const remove = async () => {
    await run(
      () => removeServerRecoveryKey({ ...deps, passphrase }),
      async () => {
        await reload();
        return (a) => a.server.recRemoved;
      },
    );
    setPassphrase('');
  };
  return (
    <Section title={s.recHeading}>
      <Prose>{info.hasRecovery ? s.recExplainHave : s.recExplainNone}</Prose>
      {info.hasRecovery && <Prose>{s.recRotateNote}</Prose>}
      <TextField
        label={s.changeCurrent}
        type="password"
        autoComplete="current-password"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
      />
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          busy={busy}
          busyLabel={s.recWorking}
          onClick={() => void make()}
        >
          {info.hasRecovery ? s.recRotate : s.recCreate}
        </Button>
        {info.hasRecovery && (
          <Button
            variant="secondary"
            aria-disabled={busy || undefined}
            onClick={() => void remove()}
          >
            {s.recRemove}
          </Button>
        )}
      </div>
      <p role="status" className="text-body text-ink empty:hidden">
        {message}
      </p>
    </Section>
  );
}

/** Brings back the version the server kept before the latest one, when there is one. */
export function ServerPreviousSection() {
  const s = useStrings().server;
  const session = useSession();
  const { deps, info } = useAccount();
  const { busy, message, run } = useAction(session);
  if (deps === null || info === null || info.previousVersion === null) return null;
  return (
    <Section title={s.previousHeading}>
      <Prose>{s.previousExplain}</Prose>
      <Button
        variant="secondary"
        className="self-start"
        busy={busy}
        busyLabel={s.recWorking}
        onClick={() =>
          void run(
            () => restorePreviousVersion({ ...deps, vault: session.vault }),
            () => {
              session.sync.noteWrite();
              return (a) => a.server.previousDone;
            },
          )
        }
      >
        {s.previousAction}
      </Button>
      <p role="status" className="text-body text-ink empty:hidden">
        {message}
      </p>
    </Section>
  );
}

/** Deletes the copy on the server: the handle typed, and the passphrase proved. */
export function ServerDeleteSection({ onDone }: { readonly onDone: (message: Message) => void }) {
  const s = useStrings().server;
  const session = useSession();
  const { deps } = useAccount();
  const [typed, setTyped] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const { busy, message, setMessage, run } = useAction(session);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);
  if (deps === null) return null;
  const submit = async () => {
    if (typed.trim().toLowerCase() !== deps.connection.handle) {
      setMessage((a) => a.server.deleteMismatch);
      return;
    }
    const done = await run(
      () => deleteServerCopy({ ...deps, passphrase }),
      () => null,
    );
    setPassphrase('');
    if (done && session.live()) {
      // The copy is gone: this device forgets the connection and goes back to "not backed up".
      await session.sync.disconnect();
      onDone((a) => a.server.deleteDone);
    }
  };
  return (
    <Section title={s.deleteHeading}>
      <Prose>{s.deleteExplain}</Prose>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField
          label={fill(s.deleteTypeLabel, { handle: deps.connection.handle })}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <TextField
          label={s.changeCurrent}
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
          busy={busy}
          busyLabel={s.recWorking}
        >
          {s.deleteAction}
        </Button>
      </form>
      <p role="status" className="text-body text-ink empty:hidden">
        {message}
      </p>
    </Section>
  );
}
