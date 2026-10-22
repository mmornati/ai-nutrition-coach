import './day.css';
import { useStrings } from '../../i18n';
import { Button } from '../primitives';

export interface CoachCardProps {
  readonly question: string;
  /** Short condensed line above the question. */
  readonly title?: string;
  /** "Written by AI": shown under the question when an AI wrote it. */
  readonly aiMark?: string;
  readonly onSure: () => void;
  /** The parent removes the card after this; the card never re-asks. */
  readonly onAskLater: () => void;
  readonly className?: string;
}

/** A sewn label: white, an ink edge and a dashed stitch, one question and two plain choices. */
export function CoachCard({
  question,
  title,
  aiMark,
  onSure,
  onAskLater,
  className = '',
}: CoachCardProps) {
  const s = useStrings().coach;
  return (
    <div
      role="group"
      aria-label={s.group}
      className={`day-enter stitched bg-raised text-ink border-ink rounded-cloth relative z-10 mt-3 border-2 px-4.5 pt-4 pb-4 ${className}`}
    >
      {title ? <p className="font-display mb-1 text-ui font-extrabold">{title}</p> : null}
      <p className="text-body">{question}</p>
      {aiMark ? <p className="text-thread mt-1 text-aside">{aiMark}</p> : null}
      <div className="relative mt-3.5 flex flex-wrap gap-2">
        <Button variant="primary" onClick={onSure}>
          {s.sure}
        </Button>
        <Button variant="secondary" onClick={onAskLater}>
          {s.askLater}
        </Button>
      </div>
    </div>
  );
}

export interface DepthPanelProps {
  /** The follow-up text. Null or empty renders an empty panel with Close only. */
  readonly followUp?: string | null | undefined;
  /** "Written by AI": shown under the follow-up when an AI wrote it. */
  readonly aiMark?: string | undefined;
  /** Records `depthAnswer` in the parent. */
  readonly onClose: () => void;
  readonly className?: string;
}

/** What opens on Sure: the follow-up and Close. No "unavailable" message when empty. */
export function DepthPanel({ followUp, aiMark, onClose, className = '' }: DepthPanelProps) {
  const s = useStrings().coach;
  return (
    <div
      role="group"
      aria-label={s.depthGroup}
      className={`day-enter stitched bg-raised text-ink border-ink rounded-cloth relative z-10 mt-3 border-2 px-4.5 pt-4 pb-4 ${className}`}
    >
      {followUp ? <p className="text-body">{followUp}</p> : null}
      {followUp && aiMark ? <p className="text-thread mt-1 text-aside">{aiMark}</p> : null}
      <div className={followUp ? 'relative mt-3.5' : 'relative'}>
        <Button variant="primary" onClick={onClose}>
          {s.close}
        </Button>
      </div>
    </div>
  );
}
