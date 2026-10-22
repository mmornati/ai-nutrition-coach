import { useState } from 'react';
import {
  ALL_HISTORY_SCOPE,
  visibleDayScope,
  weekScope,
  type ExportFormat,
  type ExportScope,
} from '@anc/core';
import { Button } from '../../components/primitives';
import { EraseLocalDataDialog } from '../../components/dialogs';
import { fill, useMessage, useStrings, type Message, type Strings } from '../../i18n';
import { IDLE_MINUTE_CHOICES } from '../../storage';
import { useDay } from '../../app/day-context';
import { forgetAcknowledgedBeforeStore } from '../../app/about-ack';
import { useSession } from '../../app/session';
import { useStoreSnapshot } from '../../app/store-context';
import type { RunExportResult } from '../../export';
import type { ExportDestination } from '../../export';
import { ChoiceGroup } from './ChoiceGroup';
import { formatLastExport } from './format';
import { Prose, Section, SettingsPage } from './SettingsPage';
import { useExportInfo, useExportServices } from './use-export';

type ScopeKind = 'visibleDay' | 'week' | 'allHistory';

type Outcome =
  | { readonly kind: 'exported'; readonly filename: string }
  | { readonly kind: 'text'; readonly text: Message };

function failureText(result: RunExportResult & { kind: 'failed' }, s: Strings['export']): string {
  const failure = result.failure;
  switch (failure.kind) {
    case 'storeClosed':
      return s.failedLocked;
    case 'exportReadFailed':
    case 'exportScopeFailure':
      return s.failedRead;
    case 'exportFormatFailure':
      return s.failedFormat;
    case 'deliveryFailed':
      return s.failedDelivery;
    case 'savedUnavailable':
      return s.failedSaved;
  }
}

/**
 * Settings, Your data. The honest protection line, the browser's durable-storage answer, export
 * (format, scope, one button, the plaintext note, the last-export line and one quiet suggestion),
 * the lock controls, and the confirmed erase.
 */
export function YourDataScreen({
  destination,
}: {
  /** Test seam: where the file goes. Production uses the browser download / share sheet. */
  readonly destination?: ExportDestination;
}) {
  const all = useStrings();
  const s = all.yourData;
  const e = all.export;
  const session = useSession();
  const day = useDay();
  const snapshot = useStoreSnapshot();
  const services = useExportServices(session, destination);
  const { info, refresh } = useExportInfo(session, services);

  const [format, setFormat] = useState<ExportFormat>('csv');
  const [scopeKind, setScopeKind] = useState<ScopeKind>('allHistory');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [eraseMessage, setEraseMessage] = useMessage();

  const scope = (): ExportScope => {
    switch (scopeKind) {
      case 'visibleDay':
        // The "Today" scope is the real today, whichever day was last looked at on Today.
        return visibleDayScope(day.today);
      case 'week':
        return weekScope(day.days[0]?.date ?? day.today);
      case 'allHistory':
        return ALL_HISTORY_SCOPE;
    }
  };

  const runExport = async () => {
    if (busy) return;
    setBusy(true);
    setOutcome(null);
    try {
      const result = await services.run({ format, scope: scope() });
      if (!session.live()) return;
      switch (result.kind) {
        case 'exported':
          setOutcome({ kind: 'exported', filename: result.filename });
          await refresh();
          break;
        case 'cancelled':
          setOutcome({ kind: 'text', text: (a) => a.export.cancelled });
          break;
        case 'failed':
          setOutcome({ kind: 'text', text: (a) => failureText(result, a.export) });
          break;
      }
    } catch {
      if (session.live()) setOutcome({ kind: 'text', text: (a) => a.export.failedDelivery });
    } finally {
      if (session.live()) setBusy(false);
    }
  };

  const erase = async () => {
    if (erasing) return;
    setErasing(true);
    // The device is going back to a first run, where the About notice is shown again. Forgotten
    // BEFORE the erase: its last step publishes the first-run state, which renders the notice from
    // this flag before any code after the `await` could run. If the erase fails nothing is lost:
    // the answer is also in the store, which the next unlock reads.
    forgetAcknowledgedBeforeStore();
    const result = await session.eraser.eraseAll();
    // On success the session is torn down by the store leaving `unlocked`: nothing below runs on
    // a mounted screen.
    if (result.kind === 'eraseLocalDataSuccess') return;
    if (!session.live()) return;
    setErasing(false);
    setConfirming(false);
    setEraseMessage((a) => a.erase.failed);
  };

  const persistence =
    snapshot.durable === 'persisted'
      ? all.durable.persisted
      : snapshot.durable === 'notPersisted'
        ? all.durable.notPersisted
        : null;

  const idleChoices = IDLE_MINUTE_CHOICES.map((minutes, i) => ({
    value: String(minutes),
    label: all.session.lockAfterOptions[i] ?? String(minutes),
  }));

  return (
    <SettingsPage title={s.title}>
      <Prose>{s.protection}</Prose>
      {persistence !== null && <Prose>{persistence}</Prose>}

      <Section title={s.exportHeading}>
        <div className="flex flex-col gap-4">
          <ChoiceGroup<ExportFormat>
            label={e.formatLabel}
            choices={[
              { value: 'csv', label: e.formatCsv },
              { value: 'json', label: e.formatJson },
            ]}
            value={format}
            onChange={setFormat}
          />
          <ChoiceGroup<ScopeKind>
            label={e.scopeLabel}
            choices={[
              { value: 'visibleDay', label: e.scopeVisibleDay },
              { value: 'week', label: e.scopeWeek },
              { value: 'allHistory', label: e.scopeAllHistory },
            ]}
            value={scopeKind}
            onChange={setScopeKind}
          />
          <Button
            variant="solid-porcelain"
            className="self-start"
            busy={busy}
            busyLabel={e.working}
            onClick={() => void runExport()}
          >
            {e.action}
          </Button>
          <p className="text-body-small text-porcelain-dim">
            {e.plaintextNote} {e.eraseLimitNote}
          </p>
          <p role="status" className="text-body text-porcelain empty:hidden">
            {outcome?.kind === 'exported' ? (
              <>
                {e.exportedLine}{' '}
                <span className="[overflow-wrap:anywhere]">{outcome.filename}</span>
              </>
            ) : (
              outcome?.text(all)
            )}
          </p>
          {info.loaded && (
            <p className="text-body-small text-porcelain-dim">
              {info.lastExportAt === undefined
                ? e.lastExportNever
                : fill(e.lastExport, { date: formatLastExport(info.lastExportAt) })}
            </p>
          )}
          {info.due && (
            <div className="flex flex-wrap items-center gap-x-3">
              <p className="text-body-small text-porcelain-dim min-w-0 flex-1 basis-64">
                {info.lastExportAt === undefined ? e.reminderNever : e.reminderStale}
              </p>
              <Button
                variant="outline-porcelain"
                onClick={() =>
                  void services.reminder.dismiss().then(() => (session.live() ? refresh() : null))
                }
              >
                {e.reminderNotNow}
              </Button>
            </div>
          )}
        </div>
      </Section>

      <Section title={s.lockHeading}>
        <ChoiceGroup
          label={all.session.lockAfterLabel}
          choices={idleChoices}
          value={String(snapshot.idleMinutes)}
          onChange={(minutes) => session.controller.setIdleMinutes(Number(minutes))}
        />
        <Button
          variant="outline-porcelain"
          className="self-start"
          onClick={() => void session.controller.lock()}
        >
          {all.lock.action}
        </Button>
      </Section>

      <Section title={s.eraseLabel}>
        <Prose>{s.eraseExplain}</Prose>
        <Button
          variant="outline-porcelain"
          className="self-start"
          busy={erasing}
          onClick={() => setConfirming(true)}
        >
          {s.eraseButton}
        </Button>
        <p role="status" className="text-body text-porcelain-dim empty:hidden">
          {eraseMessage}
        </p>
      </Section>

      <EraseLocalDataDialog
        open={confirming}
        busy={erasing}
        onKeep={() => setConfirming(false)}
        onErase={() => void erase()}
      />
    </SettingsPage>
  );
}
