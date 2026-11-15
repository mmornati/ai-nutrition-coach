import { useRef, useState, useSyncExternalStore } from 'react';
import { GOALS } from '@anc/core';
import { Button } from '../../components/primitives';
import { SupportLine } from '../../components/nutrition';
import { fill, useStrings } from '../../i18n';
import { photoUploadHost } from '../../ai';
import { hrefs } from '../../app/router';
import { useSession } from '../../app/session';
import { GateFrame } from '../gate/GateFrame';
import { ProfileBodySection } from '../settings/ProfileBodySection';
import { GuideSummary } from '../settings/ProfileGuideSection';
import { PaceChoice, ProfileAboutFields, useProfileEditor } from '../settings/profile-editor';
import { SECTIONS } from '../settings/sections';

export const WELCOME_STEPS = 4;

export interface WelcomeScreenProps {
  /** The step to open on (1 to 4): a resumed welcome continues where it was. */
  readonly step: number;
  /** The person moved to another step (it is remembered, so a reload resumes there). */
  readonly onStep: (step: number) => void;
  /**
   * "Not now": set the welcome aside from any step. `leaving` is set when the person follows the
   * link to Your AI: that link does the navigating, so the welcome does not send them to Today.
   */
  readonly onSkip: (leaving?: 'ai') => void;
  /** The last step's primary action; `logFirst` says whether the log sheet should open next. */
  readonly onFinish: (logFirst: boolean) => void;
}

/** Whether a photo or a described meal can work: an AI is set up, or this server offers one. */
function useAiState(): { readonly state: 'ready' | 'offered' | 'none'; readonly label: string } {
  const { ai } = useSession();
  const settings = useSyncExternalStore(ai.settings.subscribe, ai.settings.getSnapshot);
  const instance = useSyncExternalStore(ai.instance.subscribe, ai.instance.getSnapshot);
  if (photoUploadHost(settings, instance) !== null) return { state: 'ready', label: '' };
  if (instance.config.enabled) return { state: 'offered', label: instance.config.label };
  return { state: 'none', label: '' };
}

/**
 * The first-run welcome: at most four steps, each skippable with one tap, nothing mandatory.
 * 1 what this is and where the data lives; 2 what the person is here for (the goal, with the support
 * line); 3 only what the daily guide needs, with the guide shown live and how to change it later;
 * 4 the four ways to log a plate and the honest state of the AI. The answers are written by the same
 * editor and the same validation as Settings, Profile, so the rules exist once.
 */
export function WelcomeScreen({ step, onStep, onSkip, onFinish }: WelcomeScreenProps) {
  const all = useStrings();
  const w = all.welcome;
  const p = all.profile;
  const editor = useProfileEditor();
  // Step 3 settles what is typed before it is left; an invalid answer stays, with its message.
  const settle = useRef<(() => Promise<boolean>) | null>(null);
  const ai = useAiState();
  const [current, setCurrent] = useState(Math.min(Math.max(step, 1), WELCOME_STEPS));
  const go = (next: number): void => {
    setCurrent(next);
    onStep(next);
  };
  const title = [w.introTitle, w.goalTitle, w.aboutTitle, w.firstTitle][current - 1] as string;
  const goal = editor.profile?.goal;

  return (
    <GateFrame key={current} title={title} diagram={current === 1 ? true : 'hem'}>
      <p className="text-body-small text-ink-soft">
        {fill(w.stepOf, { step: current, total: WELCOME_STEPS })}
      </p>

      {current === 1 && (
        <>
          <p className="text-lead font-medium">{w.introLead}</p>
          <ul className="flex flex-col gap-3 text-body">
            <li>{w.introLine1}</li>
            <li>{w.introLine2}</li>
            <li>{w.introLine3}</li>
          </ul>
          <p className="text-body text-ink-soft">{w.introData}</p>
        </>
      )}

      {current === 2 && (
        <>
          <p className="text-body text-ink-soft">{w.goalHelp}</p>
          {editor.group('goal', p.goal, GOALS, (v) => p.goalOptions[v])}
          {goal !== undefined && (
            <p className="text-body-small text-ink-soft">{p.goalEffect[goal]}</p>
          )}
          <SupportLine />
        </>
      )}

      {current === 3 && (
        <>
          <p className="text-body text-ink-soft">{w.aboutHelp}</p>
          <ProfileAboutFields editor={editor} />
          <ProfileBodySection
            profile={editor.profile}
            onProfile={editor.withField}
            compact
            commitRef={settle}
            title={p.bodyTitle}
          />
          <PaceChoice editor={editor} />
          <section className="flex flex-col gap-2.5">
            <h2 className="font-display text-section text-thread">{w.guideTitle}</h2>
            <GuideSummary profile={editor.profile} />
          </section>
          <p role="status" className="text-body-small text-ink-soft empty:hidden">
            {editor.status}
          </p>
        </>
      )}

      {current === 4 && (
        <>
          <p className="text-body text-ink-soft">{w.firstHelp}</p>
          <ul className="flex flex-col gap-3 text-body">
            <li>{w.firstSnapshot}</li>
            <li>{w.firstBarcode}</li>
            <li>{w.firstType}</li>
            <li>{w.firstDescribe}</li>
          </ul>
          <p className="text-body-small text-ink-soft">
            {ai.state === 'ready'
              ? w.aiReady
              : ai.state === 'offered'
                ? fill(w.aiOffered, { label: ai.label })
                : w.aiNone}
            {ai.state !== 'ready' && (
              <>
                {' '}
                <a
                  href={hrefs.section(SECTIONS.ai)}
                  onClick={() => onSkip('ai')}
                  className="text-ink inline-flex min-h-12 items-center underline underline-offset-4"
                >
                  {w.aiLink}
                </a>
              </>
            )}
          </p>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {current < WELCOME_STEPS ? (
          <Button
            onClick={() => {
              if (current !== 3 || settle.current === null) return go(current + 1);
              void settle.current().then((settled) => {
                if (settled) go(current + 1);
              });
            }}
          >
            {w.next}
          </Button>
        ) : (
          <Button onClick={() => onFinish(true)}>{w.start}</Button>
        )}
        {current > 1 && (
          <Button variant="secondary" onClick={() => go(current - 1)}>
            {w.back}
          </Button>
        )}
        <Button variant="secondary" onClick={() => onSkip()}>
          {w.notNow}
        </Button>
      </div>
    </GateFrame>
  );
}
