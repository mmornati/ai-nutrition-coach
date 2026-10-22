import { useStrings } from '../../i18n';
import { Button } from '../../components/primitives';
import { hrefs } from '../../app/router';
import { GateFrame } from '../gate/GateFrame';

/**
 * The one-time notice (privacy audit PV1): adults only, photo recognition off by default, plates
 * stay on this device. One button, no pre-ticked box, no countdown.
 */
export function AboutNotice({ onDismiss }: { readonly onDismiss: () => void }) {
  const s = useStrings().about;
  return (
    <GateFrame title={s.title}>
      <p className="text-body">{s.adults}</p>
      <p className="text-body">{s.ai}</p>
      <p className="text-body">{s.local}</p>
      <a
        href={hrefs.privacy}
        className="text-ink inline-flex min-h-12 items-center self-start underline underline-offset-4"
      >
        {s.privacyLink}
      </a>
      <Button fullWidth onClick={onDismiss}>
        {s.ok}
      </Button>
    </GateFrame>
  );
}
