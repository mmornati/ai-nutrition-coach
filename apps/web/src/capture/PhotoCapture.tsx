import { useStrings } from '../i18n';
import { Button } from '../components/primitives/Button';
import type { PhotoSource } from './photo-capture';

/**
 * The photo-capture input wrapper: "Take a photo" (the camera on a phone) and "Choose a photo"
 * (the file picker). Each button is a user gesture, which is what lets the browser open a picker
 * (so the picker cannot open by itself on mount, unlike the Flutter screen).
 *
 * This component carries no photo: it only reports which source the person chose. The bytes come
 * back through `usePhotoFlow` into a local variable of the flow and are kept nowhere.
 */
export function PhotoCapture({
  onSource,
  busy = false,
}: {
  readonly onSource: (source: PhotoSource) => void;
  readonly busy?: boolean;
}) {
  const s = useStrings().capture;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-porcelain-dim">{s.aimHint}</p>
      <Button fullWidth busy={busy} onClick={() => onSource('camera')}>
        {s.takePhoto}
      </Button>
      <Button fullWidth variant="outline-porcelain" busy={busy} onClick={() => onSource('files')}>
        {s.choosePhoto}
      </Button>
    </div>
  );
}
