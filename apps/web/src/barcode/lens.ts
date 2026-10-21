/**
 * Choosing the rear lens. iPhones with several back cameras expose, besides the single lenses,
 * "virtual" multi-lens devices ("Back Triple Camera", "Back Dual Wide Camera", "Back Dual Camera")
 * that switch lens by themselves; on the Pro models that is what lets the phone focus on a barcode
 * held close (the plain wide lens cannot focus nearer than about 20 cm). The default
 * `facingMode: environment` stream is the single wide lens, so after permission is granted we look
 * for a virtual device and prefer it.
 *
 * Device labels are localised ("Caméra arrière triple"), so the match is on the lens words in a
 * few languages, never on the exact label, and single lenses (front, ultra wide, telephoto) are
 * excluded. Pure and unit-tested; nothing here touches the camera.
 */
export interface DeviceInfo {
  readonly kind: string;
  readonly deviceId: string;
  readonly label: string;
}

const EXCLUDED = /front|avant|vorder|frontal|anteriore|selfie|ultra|tele|télé/i;
const TRIPLE = /triple|dreifach|triplo/i;
const DUAL_WIDE = /(dual|double|doppel|doble|doppia)[\s-]*(wide|grand|weit|ancho|grandangolo)/i;
const DUAL = /dual|double|doppel|doble|doppia/i;

/** 3 = triple, 2 = dual wide, 1 = another dual; 0 = not a virtual multi-lens back camera. */
export function lensRank(label: string): number {
  if (EXCLUDED.test(label)) return 0;
  if (TRIPLE.test(label)) return 3;
  if (DUAL_WIDE.test(label)) return 2;
  if (DUAL.test(label)) return 1;
  return 0;
}

/**
 * The deviceId of the best virtual back camera, or `undefined` to keep the current stream (none
 * found, or it is already the one in use).
 */
export function pickBackCamera(
  devices: readonly DeviceInfo[],
  currentDeviceId?: string,
): string | undefined {
  let best: { id: string; rank: number } | undefined;
  for (const d of devices) {
    if (d.kind !== 'videoinput' || d.deviceId === '') continue;
    const rank = lensRank(d.label);
    if (rank > 0 && (best === undefined || rank > best.rank)) best = { id: d.deviceId, rank };
  }
  return best !== undefined && best.id !== currentDeviceId ? best.id : undefined;
}
