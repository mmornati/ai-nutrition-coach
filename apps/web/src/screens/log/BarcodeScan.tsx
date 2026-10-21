import { useCallback, useEffect, useRef, useState } from 'react';
import type { FoodEntryDraft } from '@anc/core';
import { CameraView, useBarcodeScanner, type UseBarcodeScannerOptions } from '../../barcode';
import type { OffLookupChoice } from '../../catalog';
import { OffLookupNotice } from '../../components/dialogs';
import { BarcodeMatchSheet, Sheet } from '../../components/sheets';
import { useStrings } from '../../i18n';
import { useSession } from '../../app/session';
import { hrefs } from '../../app/router';

type Answer = Exclude<OffLookupChoice, 'unasked'>;

/**
 * The camera view and its results. Mounted only while the sheet is open, so the camera is asked
 * for when the person taps Barcode and released the moment the sheet closes (or the page is
 * backgrounded, or the store locks).
 *
 * Open Food Facts: the first time a barcode is about to leave the device the one-time notice is
 * asked; nothing is sent until the answer is OK (the catalog itself refuses otherwise).
 */
export function BarcodeScan({
  scannerOptions,
  onTypeInstead,
  onLogged,
}: {
  /** Injectable for tests (a fake decoder and camera). */
  readonly scannerOptions?: Partial<UseBarcodeScannerOptions>;
  readonly onTypeInstead: (code?: string) => void;
  readonly onLogged: () => void;
}) {
  const { catalog, privacy, recordPlate } = useSession();
  const [noticeOpen, setNoticeOpen] = useState(false);
  const pending = useRef<((answer: Answer) => void) | null>(null);

  const askOffNotice = useCallback(
    () =>
      new Promise<Answer>((resolve) => {
        pending.current = resolve;
        setNoticeOpen(true);
      }),
    [],
  );
  const answer = (value: Answer) => {
    pending.current?.(value);
    pending.current = null;
    setNoticeOpen(false);
  };
  // Closing the sheet while the notice is up means "don't look up online".
  useEffect(
    () => () => {
      pending.current?.('offlineOnly');
      pending.current = null;
    },
    [],
  );

  const { state, videoRef, extras, dismissResult, toggleTorch, submitCode } = useBarcodeScanner({
    catalog,
    prefs: privacy,
    askOffNotice,
    ...scannerOptions,
  });
  const [failed, setFailed] = useState(false);
  const s = useStrings().common;

  const match = state.kind === 'scanning' && state.lookup.kind === 'match' ? state.lookup : null;

  const log = async (draft: FoodEntryDraft) => {
    const result = await recordPlate([draft]);
    if (result.kind !== 'recordPlateSuccess') {
      setFailed(true);
      throw new Error('not recorded');
    }
    setFailed(false);
    onLogged();
  };

  return (
    <>
      <CameraView
        state={state}
        videoRef={videoRef}
        onTypeInstead={onTypeInstead}
        onScanAgain={dismissResult}
        extras={extras}
        onToggleTorch={toggleTorch}
        onManualCode={submitCode}
      />
      <OffLookupNotice
        open={noticeOpen}
        privacyHref={hrefs.privacy}
        onAllow={() => answer('allowed')}
        onOfflineOnly={() => answer('offlineOnly')}
      />
      {match && (
        <BarcodeMatchSheet
          open
          match={match.match}
          onClose={dismissResult}
          onLog={log}
          errorMessage={failed ? s.logFailed : undefined}
        />
      )}
    </>
  );
}

/** The "Scan a barcode" sheet. */
export function BarcodeSheet({
  open,
  scannerOptions,
  onClose,
  onTypeInstead,
  onLogged,
}: {
  readonly open: boolean;
  readonly scannerOptions?: Partial<UseBarcodeScannerOptions>;
  readonly onClose: () => void;
  readonly onTypeInstead: (code?: string) => void;
  readonly onLogged: () => void;
}) {
  const s = useStrings().barcode;
  return (
    <Sheet open={open} onClose={onClose} title={s.title}>
      <BarcodeScan
        {...(scannerOptions ? { scannerOptions } : {})}
        onTypeInstead={onTypeInstead}
        onLogged={onLogged}
      />
    </Sheet>
  );
}
