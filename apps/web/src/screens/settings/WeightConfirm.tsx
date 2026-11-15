import { useEffect, useRef } from 'react';
import { Button } from '../../components/primitives';
import { useStrings } from '../../i18n';

/**
 * One calm question when a typed weight is far from the last weigh-in (a typing slip is the likely
 * reason): "Save it as typed?" with Save and Change it. It never repeats a figure, so it also works
 * with nutrition numbers hidden. Focus goes to "Change it" when it appears, the safer of the two.
 */
export function WeightConfirm({
  onSave,
  onChange,
  busy = false,
}: {
  readonly onSave: () => void;
  readonly onChange: () => void;
  readonly busy?: boolean;
}) {
  const s = useStrings().weighIn;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('[data-change]')?.focus();
  }, []);
  return (
    <div ref={box} className="border-ink flex flex-col items-start gap-2 border-l-2 pl-3">
      <p role="status" className="text-body-small text-ink">
        {s.confirmDifferent}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" busy={busy} onClick={onSave}>
          {s.confirmSave}
        </Button>
        <Button variant="secondary" data-change onClick={onChange}>
          {s.confirmChange}
        </Button>
      </div>
    </div>
  );
}
