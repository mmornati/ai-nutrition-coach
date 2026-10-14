import type { RefObject } from 'react';
import { fill, useStrings } from '../i18n';
import { Button } from '../components/primitives/Button';
import { CameraNotice } from '../capture/CameraNotice';
import type { ScannerState } from './scanner-controller';

/**
 * The camera surface of the barcode screen, in its calm states:
 *
 *   scanning      live preview, a quiet "Move closer or steady" hint, no countdown, no urgency
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
}: {
  readonly state: ScannerState;
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  /** `code` is the barcode to prefill when the person came from a not-found result. */
  readonly onTypeInstead: (code?: string) => void;
  readonly onScanAgain: () => void;
}) {
  const s = useStrings().barcode;
  const scanning = state.kind === 'scanning';
  const lookup = scanning ? state.lookup : null;

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
        <p className="text-small bg-enamel/85 text-porcelain-dim absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1">
          {s.moveCloser}
        </p>
      </div>

      {state.kind === 'checking' && (
        <p role="status" className="text-body text-porcelain-dim">
          {s.checkingCamera}
        </p>
      )}
      {state.kind === 'denied' && (
        <CameraNotice
          title={s.deniedTitle}
          body={s.deniedBody}
          actionLabel={s.typeManually}
          onAction={() => onTypeInstead()}
        />
      )}
      {state.kind === 'unavailable' && (
        <CameraNotice
          title={s.unavailableTitle}
          body={s.unavailableBody}
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
            <p className="text-body text-porcelain-dim">{s.aimHint}</p>
          )}
          {lookup?.kind === 'lookingUp' && (
            <p className="text-body text-porcelain-dim">
              {fill(s.lookingUp, { code: lookup.code })}
            </p>
          )}
          {lookup?.kind === 'notFound' && (
            <>
              <p className="text-lead">{s.notFoundTypeIt}</p>
              <div className="flex gap-3">
                <Button
                  variant="outline-porcelain"
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
            </>
          )}
          {lookup?.kind === 'failure' && (
            <>
              <p className="text-body text-porcelain-dim">{s.searchUnavailable}</p>
              <Button
                variant="outline-porcelain"
                fullWidth
                onClick={() => onTypeInstead(lookup.code)}
              >
                {s.typeManually}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
