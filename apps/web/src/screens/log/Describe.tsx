import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { FoodMatch, RecognitionResult } from '@anc/core';
import { MAX_DESCRIPTION_LENGTH, type DescribeState, type VoiceOutcome } from '../../ai';
import { hrefs } from '../../app/router';
import { useSession } from '../../app/session';
import {
  VoiceRecorder,
  browserVoiceEnv,
  describeLocally,
  searchTermOf,
  splitDescription,
  voiceRecordingSupported,
  type VoiceEnv,
} from '../../capture';
import { Button, MicIcon, TextArea } from '../../components/primitives';
import { AiSetupLink, Sheet } from '../../components/sheets';
import { fill, useLocale, useMessage, useStrings } from '../../i18n';
import { DescribeConsentCard } from './DescribeConsentCard';
import './describe.css';

/** What a description produced, for the review sheet. */
export type DescribeResultPayload =
  /** The AI read it: the caller adds catalogue nutrients and the closest matches. */
  | { readonly kind: 'ai'; readonly result: RecognitionResult }
  /** Matched on this device: already against the catalogue. */
  | {
      readonly kind: 'local';
      readonly result: RecognitionResult;
      readonly closestMatches: readonly FoodMatch[];
      readonly unmatched: readonly string[];
    };

type ConsentFor = 'parse' | 'record';
type Mic = 'idle' | 'starting' | 'recording' | 'transcribing';

/** Appends a transcript to what is already written, within the 500 characters. */
function withTranscript(current: string, heard: string): string {
  const joined = current.trim() === '' ? heard : `${current.trim()} ${heard}`;
  return Array.from(joined).slice(0, MAX_DESCRIPTION_LENGTH).join('');
}

/**
 * Describe a meal. A multi-line field ("two eggs, toast with butter, a coffee with milk"), up to 500
 * characters; the keyboard's own microphone (dictation) works in it for free. A Talk button records
 * up to 30 seconds and turns it into text for review (only when this destination can; the
 * transcript lands in the field, never straight in the log).
 *
 * "Find these foods" does one of two things:
 *  - with an AI the person agreed to (its own consent, asked right here, per destination): the
 *    words go to it and come back as the same foods list a photo gives;
 *  - without one (No AI, or "Not now"): the words are split and looked up in the food list on this
 *    device. Nothing is sent, and it works offline.
 * Either way the result opens the review sheet; "Type it instead" is always there.
 */
export function Describe({
  initialText = '',
  onResult,
  onTypeInstead,
  onClose,
  voiceEnv,
}: {
  readonly initialText?: string;
  readonly onResult: (result: DescribeResultPayload) => void;
  readonly onTypeInstead: (prefill?: string) => void;
  readonly onClose: () => void;
  /** Injectable for tests (a fake microphone and recorder). */
  readonly voiceEnv?: VoiceEnv;
}) {
  const all = useStrings();
  const d = all.describe;
  const { locale } = useLocale();
  const { ai, catalog } = useSession();
  const state: DescribeState = useSyncExternalStore(ai.describe.subscribe, ai.describe.getSnapshot);
  const [text, setText] = useState(initialText);
  const [working, setWorking] = useState(false);
  const [consentFor, setConsentFor] = useState<ConsentFor | null>(null);
  const [matchHereOffered, setMatchHereOffered] = useState(false);
  const [mic, setMic] = useState<Mic>('idle');
  const [note, setNote] = useMessage();
  const recorder = useRef<VoiceRecorder | null>(null);
  const abort = useRef(new AbortController());
  const env = voiceEnv ?? browserVoiceEnv();
  const canRecord = state.voice && voiceRecordingSupported(env);

  useEffect(() => {
    const controller = abort.current;
    return () => {
      controller.abort();
      recorder.current?.cancel();
    };
  }, []);
  // Leaving the page (a tab switch, a lock, the app going to the background) ends a recording and
  // DROPS the audio: nothing is uploaded from a recording the person walked away from.
  useEffect(() => {
    const drop = (): void => {
      const active = recorder.current;
      if (active === null) return;
      active.cancel();
      recorder.current = null;
      setMic('idle');
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') drop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', drop);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', drop);
    };
  }, []);
  const status = state.status;

  const destination = status.kind === 'noAi' ? null : status.destination;
  // The AI went away (settings changed elsewhere): the card goes with it, never leaving a sheet
  // with nothing to answer.
  const consentOpen = consentFor !== null && destination !== null;
  const viaServer = destination !== null && destination.label !== null;

  const runLocal = async (): Promise<void> => {
    setWorking(true);
    setMatchHereOffered(false);
    const local = await describeLocally(text, catalog);
    if (abort.current.signal.aborted) return;
    setWorking(false);
    onResult({
      kind: 'local',
      result: local.result,
      closestMatches: local.closestMatches,
      unmatched: local.unmatched,
    });
  };

  const runAi = async (): Promise<void> => {
    setWorking(true);
    setMatchHereOffered(false);
    setNote(null);
    const out = await ai.describe.describe(text, { locale, signal: abort.current.signal });
    if (abort.current.signal.aborted) return;
    setWorking(false);
    switch (out.kind) {
      case 'recognized':
        onResult({ kind: 'ai', result: out.result });
        return;
      case 'noMatch':
        setNote((a) => a.describe.nothingFound);
        return;
      case 'empty':
        setNote((a) => a.describe.empty);
        return;
      case 'consentRequired':
        setConsentFor('parse');
        return;
      case 'busy':
        setNote((a) => a.describe.busy);
        setMatchHereOffered(true);
        return;
      case 'unavailable':
      case 'failure':
        setNote((a) => a.describe.failed);
        setMatchHereOffered(true);
        return;
    }
  };

  const find = (): void => {
    if (working || mic === 'recording' || mic === 'transcribing') return;
    if (text.trim() === '') {
      setNote((a) => a.describe.empty);
      return;
    }
    setNote(null);
    if (status.kind === 'ready') void runAi();
    else if (status.kind === 'needsConsent') setConsentFor('parse');
    else void runLocal();
  };

  const allow = async (): Promise<void> => {
    const pending = consentFor;
    try {
      await ai.describe.grant();
    } catch {
      setConsentFor(null);
      setNote((a) => a.ai.yourAi.coachingSaveFailed);
      return;
    }
    setConsentFor(null);
    if (pending === 'parse') void runAi();
    else setNote((a) => a.describe.recordHint);
  };

  const decline = (): void => {
    const pending = consentFor;
    setConsentFor(null);
    if (pending === 'parse') {
      setNote((a) => a.describe.declined);
      void runLocal();
    }
  };

  const showVoiceProblem = (out: VoiceOutcome): void => {
    switch (out.kind) {
      case 'empty':
        setNote((a) => a.describe.heardNothing);
        return;
      case 'busy':
        setNote((a) => a.describe.voiceBusy);
        return;
      case 'keyRejected':
        setNote((a) => a.describe.voiceKey);
        return;
      case 'unsupported':
        setNote((a) => a.describe.voiceUnsupported);
        return;
      case 'tooLarge':
        setNote((a) => a.describe.voiceTooLong);
        return;
      case 'consentRequired':
        setConsentFor('record');
        return;
      default:
        setNote((a) => a.describe.voiceFailed);
    }
  };

  const transcribe = async (blob: Blob): Promise<void> => {
    setMic('transcribing');
    setNote(null);
    const out = await ai.describe.transcribe(blob, { locale, signal: abort.current.signal });
    if (abort.current.signal.aborted) return;
    setMic('idle');
    if (out.kind === 'text') {
      setText((current) => withTranscript(current, out.text));
      setNote((a) => a.describe.transcribed);
      return;
    }
    showVoiceProblem(out);
  };

  const onAudio = (audio: Awaited<ReturnType<VoiceRecorder['stop']>>): void => {
    recorder.current = null;
    if (abort.current.signal.aborted) return;
    if (audio.kind === 'empty') {
      setMic('idle');
      setNote((a) => a.describe.heardNothing);
      return;
    }
    void transcribe(audio.blob);
  };

  const toggleMic = async (): Promise<void> => {
    if (mic === 'recording') {
      const active = recorder.current;
      if (active === null) return;
      onAudio(await active.stop());
      return;
    }
    if (mic !== 'idle' || working) return;
    if (status.kind === 'needsConsent') {
      setConsentFor('record');
      return;
    }
    setNote(null);
    setMic('starting');
    const next = new VoiceRecorder(env);
    recorder.current = next;
    const started = await next.start(onAudio);
    if (abort.current.signal.aborted) {
      next.cancel();
      return;
    }
    if (started.kind === 'recording') {
      setMic('recording');
      return;
    }
    recorder.current = null;
    setMic('idle');
    setNote(
      started.kind === 'denied' ? (a) => a.describe.micDenied : (a) => a.describe.micUnavailable,
    );
  };

  const live = mic === 'recording' ? d.listening : mic === 'transcribing' ? d.transcribing : note;
  const busy = working || mic === 'starting' || mic === 'transcribing';
  const piece = splitDescription(text)[0];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-ink-soft">{d.intro}</p>
      <TextArea
        label={d.fieldLabel}
        value={text}
        placeholder={d.placeholder}
        maxLength={MAX_DESCRIPTION_LENGTH}
        autoComplete="off"
        autoCapitalize="sentences"
        spellCheck
        onChange={(e) => {
          setText(e.target.value);
          setNote(null);
          setMatchHereOffered(false);
        }}
        message={`${fill(d.limit, { max: MAX_DESCRIPTION_LENGTH })} ${d.dictation}`}
      />

      {canRecord && (
        <div role="group" aria-label={d.recordingLabel} className="flex flex-col gap-2">
          <Button
            variant={mic === 'recording' ? 'primary' : 'secondary'}
            fullWidth
            className="min-h-14"
            aria-pressed={mic === 'recording'}
            aria-disabled={mic === 'starting' || mic === 'transcribing' ? true : undefined}
            icon={<MicIcon size={22} />}
            onClick={() => void toggleMic()}
          >
            {d.talk}
          </Button>
          {mic === 'recording' ? (
            <div aria-hidden="true" className="bg-seam h-0.5 w-full">
              <div className="describe-record-line" />
            </div>
          ) : (
            <p className="text-body-small text-ink-soft">{d.recordHint}</p>
          )}
        </div>
      )}

      {/* Always mounted: a live region is announced reliably only when its text changes. */}
      <p role="status" className="text-body-small text-ink-soft empty:hidden">
        {live}
      </p>

      {consentOpen && destination !== null && (
        <DescribeConsentCard
          destination={destination}
          onAllow={() => void allow()}
          onDecline={decline}
          onLearnMore={onClose}
        />
      )}

      {!consentOpen && (
        <>
          <div className="flex flex-col gap-1">
            <p role="note" className="text-body-small text-ink-soft">
              {status.kind === 'noAi'
                ? d.noAiNote
                : status.kind === 'needsConsent'
                  ? d.askFirstNote
                  : viaServer
                    ? fill(d.aiNoteInstance, {
                        host: destination?.host ?? '',
                        label: destination?.label ?? '',
                      })
                    : fill(d.aiNoteByok, { host: destination?.host ?? '' })}
            </p>
            {status.kind === 'noAi' && (
              <AiSetupLink href={hrefs.section('ai')} onNavigate={onClose} />
            )}
          </div>
          <Button
            fullWidth
            busy={busy && mic !== 'transcribing'}
            busyLabel={d.finding}
            onClick={find}
          >
            {d.find}
          </Button>
          {matchHereOffered && (
            <Button variant="secondary" fullWidth onClick={() => void runLocal()}>
              {d.matchHere}
            </Button>
          )}
          <Button
            variant="secondary"
            fullWidth
            onClick={() => onTypeInstead(piece === undefined ? undefined : searchTermOf(piece))}
          >
            {d.typeInstead}
          </Button>
        </>
      )}
    </div>
  );
}

/** The Describe sheet: a bottom sheet on a phone, a centred dialog on desktop. */
export function DescribeSheet({
  open,
  onClose,
  onResult,
  onTypeInstead,
  voiceEnv,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onResult: (result: DescribeResultPayload) => void;
  readonly onTypeInstead: (prefill?: string) => void;
  readonly voiceEnv?: VoiceEnv;
}) {
  const s = useStrings().describe;
  return (
    <Sheet open={open} onClose={onClose} title={s.title}>
      {open && (
        <Describe
          onResult={onResult}
          onTypeInstead={onTypeInstead}
          onClose={onClose}
          {...(voiceEnv ? { voiceEnv } : {})}
        />
      )}
    </Sheet>
  );
}
