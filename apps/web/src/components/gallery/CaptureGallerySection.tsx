import { createRef, useState } from 'react';
import { CameraView } from '../../barcode/CameraView';
import type { ScannerState } from '../../barcode/scanner-controller';
import { PhotoCapture } from '../../capture/PhotoCapture';

/** Gallery-only copy: the dev page is not shipped, so it stays out of the i18n catalogue. */
const g = {
  title: 'Capture',
  photo: 'Photo capture',
  camera: 'Camera states',
  last: 'Last action',
  none: 'Nothing yet',
} as const;

const STATES: readonly { readonly label: string; readonly state: ScannerState }[] = [
  { label: 'Checking', state: { kind: 'checking' } },
  { label: 'Scanning', state: { kind: 'scanning', lookup: { kind: 'idle' } } },
  {
    label: 'Looking up',
    state: { kind: 'scanning', lookup: { kind: 'lookingUp', code: '3017620422003' } },
  },
  {
    label: 'Not found',
    state: { kind: 'scanning', lookup: { kind: 'notFound', code: '0000000000000' } },
  },
  {
    label: 'Search failure',
    state: { kind: 'scanning', lookup: { kind: 'failure', code: '3017620422003' } },
  },
  { label: 'Camera denied', state: { kind: 'denied' } },
  { label: 'Camera unavailable', state: { kind: 'unavailable' } },
  { label: 'Not supported', state: { kind: 'unsupported' } },
];

/** Phase 5 capture components in their calm states, with synthetic data (no camera is opened). */
export function CaptureGallerySection() {
  const [last, setLast] = useState<string>(g.none);
  return (
    <section className="border-seam border-b-2 px-5 py-6 lg:px-7">
      <h2 className="font-display text-section text-thread mb-4">{g.title}</h2>
      <div className="flex flex-col gap-6">
        <p className="text-small text-thread" role="status">
          {g.last}: {last}
        </p>
        <div>
          <h3 className="font-display text-label text-thread mb-2">{g.photo}</h3>
          <PhotoCapture onSource={(source) => setLast(`photo from ${source}`)} />
        </div>
        <div>
          <h3 className="font-display text-label text-thread mb-2">{g.camera}</h3>
          <div className="flex flex-col gap-6">
            {STATES.map(({ label, state }) => (
              <div key={label} className="border-seam border-2 p-3">
                <h4 className="font-display text-label mb-2">{label}</h4>
                <CameraView
                  state={state}
                  videoRef={createRef()}
                  onTypeInstead={(code) => setLast(`type it${code ? ` with ${code}` : ''}`)}
                  onScanAgain={() => setLast('scan again')}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
