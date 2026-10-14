import { Button } from '../components/primitives/Button';

/**
 * A calm, factual camera message with ONE way forward (type it instead). No error tone, no retry
 * button, no countdown: asking again would be a nag.
 */
export function CameraNotice({
  title,
  body,
  actionLabel,
  onAction,
}: {
  readonly title: string;
  readonly body: string;
  readonly actionLabel: string;
  readonly onAction: () => void;
}) {
  return (
    <section role="status" className="flex flex-col items-start gap-3">
      <h2 className="font-display text-lead">{title}</h2>
      <p className="text-body text-porcelain-dim">{body}</p>
      <Button fullWidth onClick={onAction}>
        {actionLabel}
      </Button>
    </section>
  );
}
