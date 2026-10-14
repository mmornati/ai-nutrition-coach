import './day.css';
import { useStrings } from '../../i18n';
import { Button } from '../primitives';

export interface CoachCardProps {
  readonly question: string;
  /** Short condensed line above the question. */
  readonly title?: string;
  readonly onSure: () => void;
  /** The parent removes the card after this; the card never re-asks. */
  readonly onAskLater: () => void;
  readonly className?: string;
}

/** The one inverted surface: a porcelain card with one question and two plain choices. */
export function CoachCard({ question, title, onSure, onAskLater, className = '' }: CoachCardProps) {
  const s = useStrings().coach;
  return (
    <div
      role="group"
      aria-label={s.group}
      className={`day-enter bg-porcelain text-enamel relative z-10 mt-3 px-3.5 pt-3.5 pb-3 ${className}`}
    >
      {title ? (
        <p className="font-display mb-1 text-[15px] font-bold tracking-[0.12em] uppercase">
          {title}
        </p>
      ) : null}
      <p className="text-body">{question}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="solid-enamel" onClick={onSure}>
          {s.sure}
        </Button>
        <Button variant="ghost-enamel" onClick={onAskLater}>
          {s.askLater}
        </Button>
      </div>
    </div>
  );
}

export interface DepthPanelProps {
  /** The follow-up text. Null or empty renders an empty panel with Close only. */
  readonly followUp?: string | null | undefined;
  /** Records `depthAnswer` in the parent. */
  readonly onClose: () => void;
  readonly className?: string;
}

/** What opens on Sure: the follow-up and Close. No "unavailable" message when empty. */
export function DepthPanel({ followUp, onClose, className = '' }: DepthPanelProps) {
  const s = useStrings().coach;
  return (
    <div
      role="group"
      aria-label={s.depthGroup}
      className={`day-enter bg-porcelain text-enamel relative z-10 mt-3 px-3.5 pt-3.5 pb-3 ${className}`}
    >
      {followUp ? <p className="text-body">{followUp}</p> : null}
      <div className={followUp ? 'mt-3' : ''}>
        <Button variant="solid-enamel" onClick={onClose}>
          {s.close}
        </Button>
      </div>
    </div>
  );
}
