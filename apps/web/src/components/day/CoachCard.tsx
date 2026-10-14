import './day.css';
import { dayStrings } from './strings';

const ACTION =
  'font-display text-button inline-flex min-h-12 items-center justify-center border-2 px-[18px] uppercase';

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
  return (
    <div
      role="group"
      aria-label={dayStrings.coachGroup}
      className={`day-enter bg-porcelain text-enamel relative z-10 mt-3 px-3.5 pt-3.5 pb-3 ${className}`}
    >
      {title ? (
        <p className="font-display mb-1 text-[15px] font-bold tracking-[0.12em] uppercase">
          {title}
        </p>
      ) : null}
      <p className="text-body">{question}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSure}
          className={`${ACTION} bg-enamel text-porcelain border-enamel`}
        >
          {dayStrings.sure}
        </button>
        <button
          type="button"
          onClick={onAskLater}
          className={`${ACTION} text-enamel border-enamel bg-transparent`}
        >
          {dayStrings.askLater}
        </button>
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
  return (
    <div
      role="group"
      aria-label={dayStrings.depthGroup}
      className={`day-enter bg-porcelain text-enamel relative z-10 mt-3 px-3.5 pt-3.5 pb-3 ${className}`}
    >
      {followUp ? <p className="text-body">{followUp}</p> : null}
      <div className={followUp ? 'mt-3' : ''}>
        <button
          type="button"
          onClick={onClose}
          className={`${ACTION} bg-enamel text-porcelain border-enamel`}
        >
          {dayStrings.close}
        </button>
      </div>
    </div>
  );
}
