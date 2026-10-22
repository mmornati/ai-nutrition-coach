import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { fill, useStrings } from '../i18n';
import { Button } from '../components/primitives/Button';
import { TextField } from '../components/primitives/TextField';
import { TorchIcon } from '../components/primitives/icons';
import { CameraNotice } from '../capture/CameraNotice';
import { NO_EXTRAS, type ScannerExtras, type ScannerState } from './scanner-controller';
import { offAddProductUrl, parseRetailCode } from './retail-code';
import { GUIDE_HEIGHT, GUIDE_WIDTH } from './roi';

/** Digits, with the spaces and dashes people copy from the pack. */
const DIGITS_PATTERN = '[0-9 \\-]*';

/**
 * The camera surface of the barcode screen, in its calm states:
 *
 *   scanning      live preview with a guide box, a quiet "hold about 20 cm away" hint, a torch
 *                 toggle where the camera has one, and always a way to type the digits; no
 *                 countdown, no urgency (after a quiet while the typing path is simply made clearer)
 *   denied        "Camera denied, type it instead"
 *   unavailable   "Camera unavailable, type it instead"
 *   unsupported   "Scanning isn't available in this browser, type it instead"
 *
 * each with ONE tap-to-type path and no retry button. Under the preview: the lookup line
 * ("Looking up ...", "Not found, type it manually" with the scanned code carried to manual entry,
 * or "Search isn't available right now"). A match is shown by the screen as a match sheet; the
 * screen calls `onScanAgain` when it is closed.
 *
 * The `<video>` is always mounted so the controller can attach the stream the moment the camera is
 * granted; it is hidden in every state but scanning.
 */
export function CameraView({
  state,
  videoRef,
  onTypeInstead,
  onScanAgain,
  extras = NO_EXTRAS,
  onToggleTorch,
  onManualCode,
}: {
  readonly state: ScannerState;
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  /** `code` is the barcode to prefill when the person came from a not-found result. */
  readonly onTypeInstead: (code?: string) => void;
  readonly onScanAgain: () => void;
  readonly extras?: ScannerExtras;
  readonly onToggleTorch?: () => void;
  /** A typed barcode that passed the length and check-digit test: same lookup as a camera decode. */
  readonly onManualCode?: (code: string) => void;
}) {
  const all = useStrings();
  const s = all.barcode;
  const cam = all.camera;
  const scanning = state.kind === 'scanning';
  const lookup = scanning ? state.lookup : null;
  const offUrl = lookup?.kind === 'notFound' ? offAddProductUrl(lookup.code) : null;
  const [typing, setTyping] = useState(false);
  const [digits, setDigits] = useState('');
  const [problem, setProblem] = useState<string | undefined>();

  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    // Opening the field puts the cursor in it (an effect, not autoFocus: it is the person's tap).
    if (typing) form.current?.querySelector('input')?.focus();
  }, [typing]);

  const submitDigits = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseRetailCode(digits);
    if (parsed.ok) {
      setProblem(undefined);
      setDigits('');
      setTyping(false);
      onManualCode?.(parsed.code);
    } else {
      setProblem(parsed.reason === 'checksum' ? s.digitsChecksum : s.digitsLength);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="relative" hidden={!scanning}>
        <video
          ref={videoRef}
          aria-label={s.cameraPreview}
          className="aspect-[4/3] w-full bg-black object-cover"
          muted
          playsInline
          autoPlay
        />
        {/* The guide box: the same fraction of the visible preview that the decoder reads at full
            resolution (roi.ts). Static on purpose: nothing animates, so reduced motion needs no
            special case. */}
        <div
          aria-hidden="true"
          data-testid="scan-guide"
          className="border-ink/70 pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-2"
          style={{ width: `${GUIDE_WIDTH * 100}%`, height: `${GUIDE_HEIGHT * 100}%` }}
        />
        {extras.torchAvailable && (
          <button
            type="button"
            aria-label={s.torch}
            aria-pressed={extras.torchOn}
            onClick={onToggleTorch}
            className={
              'border-ink absolute top-3 right-3 grid size-12 cursor-pointer place-items-center border-2 ' +
              (extras.torchOn ? 'bg-ink text-cloth' : 'bg-cloth/85 text-ink')
            }
          >
            <TorchIcon />
          </button>
        )}
        <p className="text-small bg-cloth/85 text-ink-soft absolute bottom-3 left-1/2 w-[calc(100%-1.5rem)] -translate-x-1/2 px-3 py-1 text-center">
          {s.holdDistance}
        </p>
      </div>

      {state.kind === 'checking' && (
        <p role="status" className="text-body text-ink-soft">
          {s.checkingCamera}
        </p>
      )}
      {state.kind === 'denied' && (
        <CameraNotice
          title={cam.deniedTitle}
          body={cam.deniedBody}
          actionLabel={s.typeManually}
          onAction={() => onTypeInstead()}
        />
      )}
      {state.kind === 'unavailable' && (
        <CameraNotice
          title={cam.unavailableTitle}
          body={cam.unavailableBody}
          actionLabel={s.typeManually}
          onAction={() => onTypeInstead()}
        />
      )}
      {state.kind === 'unsupported' && (
        <CameraNotice
          title={s.unsupportedTitle}
          body={s.unsupportedBody}
          actionLabel={s.typeManually}
          onAction={() => onTypeInstead()}
        />
      )}

      {/* Always mounted while scanning: a live region announces reliably only when its text changes. */}
      {scanning && (
        <div role="status" className="flex flex-col gap-3">
          {(lookup?.kind === 'idle' || lookup?.kind === 'match') && (
            <p className="text-body text-ink-soft">{s.aimHint}</p>
          )}
          {lookup?.kind === 'lookingUp' && (
            <p className="text-body text-ink-soft">{fill(s.lookingUp, { code: lookup.code })}</p>
          )}
          {lookup?.kind === 'notFound' && (
            <>
              <p className="text-lead">{s.notFoundTypeIt}</p>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    onScanAgain();
                  }}
                >
                  {s.scanAgain}
                </Button>
                <Button className="flex-1" onClick={() => onTypeInstead(lookup.code)}>
                  {s.typeManually}
                </Button>
              </div>
              {offUrl !== null && (
                <div className="flex flex-col gap-1">
                  <a
                    href={offUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${s.offAddLink} ${s.offAddNewTab}`}
                    className="text-ink inline-flex min-h-12 items-center underline underline-offset-4"
                  >
                    {s.offAddLink}
                  </a>
                  <p className="text-body-small text-ink-soft">{s.offAddNote}</p>
                </div>
              )}
            </>
          )}
          {lookup?.kind === 'failure' && (
            <>
              <p className="text-body text-ink-soft">{s.searchUnavailable}</p>
              <Button variant="secondary" fullWidth onClick={() => onTypeInstead(lookup.code)}>
                {s.typeManually}
              </Button>
            </>
          )}
        </div>
      )}

      {scanning && (
        <div className="flex flex-col gap-3">
          {extras.slow && !typing && <p className="text-body text-ink-soft">{s.slowHint}</p>}
          {typing ? (
            <form ref={form} onSubmit={submitDigits} className="flex flex-col gap-3" noValidate>
              <TextField
                label={s.barcodeDigits}
                inputMode="numeric"
                pattern={DIGITS_PATTERN}
                autoComplete="off"
                value={digits}
                onChange={(e) => {
                  setDigits(e.target.value);
                  setProblem(undefined);
                }}
                message={problem}
              />
              <Button type="submit" fullWidth>
                {s.lookUpBarcode}
              </Button>
            </form>
          ) : (
            <Button
              variant={extras.slow ? 'primary' : 'secondary'}
              fullWidth
              onClick={() => setTyping(true)}
            >
              {s.typeBarcode}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
