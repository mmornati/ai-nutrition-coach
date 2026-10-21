import type { ReactNode } from 'react';
import { CameraNotice, PhotoCapture, type PhotoSource } from '../../capture';
import { AiSetupLink, Sheet } from '../../components/sheets';
import { Button } from '../../components/primitives';
import { useStrings } from '../../i18n';

/**
 * "Snap a plate": the two ways to hand over a photo. Each button is a tap, which is what lets the
 * browser open its camera or file picker (a picker can never open by itself).
 */
export function SnapSheet({
  open,
  onClose,
  onSource,
  onTypeInstead,
  aiSetupHref,
  instanceOffered = false,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSource: (source: PhotoSource) => void;
  readonly onTypeInstead: () => void;
  /** Set when no AI is connected: a calm note and a link to Settings → Your AI. */
  readonly aiSetupHref?: string | undefined;
  /** This server offers AI that the person has not turned on: the note says so. */
  readonly instanceOffered?: boolean;
}) {
  const s = useStrings().capture;
  return (
    <Sheet open={open} onClose={onClose} title={s.snapTitle}>
      <PhotoCapture onSource={onSource} />
      {aiSetupHref !== undefined && (
        <div className="flex flex-col gap-1">
          <p role="note" className="text-body-small text-porcelain-dim">
            {instanceOffered ? s.noAiNoteInstance : s.noAiNote}
          </p>
          <AiSetupLink href={aiSetupHref} onNavigate={onClose} />
        </div>
      )}
      <Button variant="outline-porcelain" fullWidth onClick={onTypeInstead}>
        {s.typeManually}
      </Button>
    </Sheet>
  );
}

/** The photo was cancelled, denied or unreadable: one calm path, type it instead. */
export function PhotoDeniedSheet({
  open,
  onClose,
  onTypeInstead,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onTypeInstead: () => void;
}): ReactNode {
  const all = useStrings();
  return (
    <Sheet open={open} onClose={onClose} title={all.capture.snapTitle}>
      <CameraNotice
        title={all.camera.deniedTitle}
        body={all.camera.deniedBody}
        actionLabel={all.capture.typeManually}
        onAction={onTypeInstead}
      />
    </Sheet>
  );
}
