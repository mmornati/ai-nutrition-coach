import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  MAX_RECIPE_TEXT_LENGTH,
  prefillFromAi,
  recipeFromText,
  type RecipePrefill,
} from '../../capture';
import { hrefs } from '../../app/router';
import { useSession } from '../../app/session';
import { Button, TextArea } from '../../components/primitives';
import { AiSetupLink } from '../../components/sheets';
import { fill, useLocale, useMessage, useStrings, type Message } from '../../i18n';
import { DescribeConsentCard } from './DescribeConsentCard';

/**
 * Paste a recipe. A multi-line field (up to 8,000 characters) for an ingredients list or the whole
 * text of a recipe page; nothing is fetched from the web.
 *
 * "Read this recipe" does one of two things, exactly as Describe does:
 *  - with an AI the person agreed to (the Describe agreement, asked right here, per destination):
 *    the text goes to it and comes back as a name, servings and weighed ingredients, which are then
 *    matched in the food list on this device (no nutrient of the AI is used);
 *  - without one (No AI, "Not now", or an AI that could not read it): the text is read on this
 *    device. Nothing is sent, and it works offline.
 * Either way the result only fills in the recipe editor for review; nothing is saved.
 */
export function RecipePaste({
  onResult,
  onClose,
  onLeave,
}: {
  readonly onResult: (prefill: RecipePrefill, note: Message) => void;
  readonly onClose: () => void;
  /** Called when a link inside leaves for another page (the host sheet closes). */
  readonly onLeave: () => void;
}) {
  const all = useStrings();
  const t = all.relog.recipe;
  const { locale } = useLocale();
  const { ai, catalog } = useSession();
  const state = useSyncExternalStore(ai.describe.subscribe, ai.describe.getSnapshot);
  const [text, setText] = useState('');
  const [working, setWorking] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [note, setNote] = useMessage();
  const abort = useRef(new AbortController());
  useEffect(() => {
    const controller = abort.current;
    return () => controller.abort();
  }, []);

  const status = state.status;
  const destination = status.kind === 'noAi' ? null : status.destination;
  const viaServer = destination !== null && destination.label !== null;
  const asking = consentOpen && destination !== null;

  const finish = (prefill: RecipePrefill, why: Message | null): void => {
    if (prefill.ingredients.length === 0 && prefill.notAdded.length === 0) {
      setNote(why ?? ((a) => a.relog.recipe.pasteNothing));
      return;
    }
    onResult(prefill, why ?? ((a) => a.relog.recipe.pasteDone));
  };

  const runLocal = async (why: Message | null): Promise<void> => {
    setWorking(true);
    const prefill = await recipeFromText(text, catalog, locale);
    if (abort.current.signal.aborted) return;
    setWorking(false);
    finish(prefill, why);
  };

  const runAi = async (): Promise<void> => {
    setWorking(true);
    setNote(null);
    const out = await ai.describe.readRecipe(text, { locale, signal: abort.current.signal });
    if (abort.current.signal.aborted) return;
    switch (out.kind) {
      case 'recipe': {
        const prefill = await prefillFromAi(out.recipe, catalog, locale);
        if (abort.current.signal.aborted) return;
        setWorking(false);
        finish(prefill, null);
        return;
      }
      case 'empty':
        setWorking(false);
        setNote((a) => a.relog.recipe.pasteEmpty);
        return;
      case 'consentRequired':
        setWorking(false);
        setConsentOpen(true);
        return;
      case 'busy':
        await runLocal((a) => a.relog.recipe.pasteBusy);
        return;
      case 'unavailable':
      case 'failure':
        await runLocal((a) => a.relog.recipe.pasteAiFailed);
        return;
    }
  };

  const read = (): void => {
    if (working) return;
    if (text.trim() === '') {
      setNote((a) => a.relog.recipe.pasteEmpty);
      return;
    }
    setNote(null);
    if (status.kind === 'ready') void runAi();
    else if (status.kind === 'needsConsent') setConsentOpen(true);
    else void runLocal(null);
  };

  const allow = async (): Promise<void> => {
    try {
      await ai.describe.grant();
    } catch {
      setConsentOpen(false);
      setNote((a) => a.ai.yourAi.coachingSaveFailed);
      return;
    }
    setConsentOpen(false);
    void runAi();
  };

  const decline = (): void => {
    setConsentOpen(false);
    void runLocal((a) => a.relog.recipe.pasteDeclined);
  };

  return (
    <section
      aria-labelledby="recipe-paste-title"
      className="border-ink flex flex-col gap-4 border-2 p-4"
    >
      <h3 id="recipe-paste-title" className="font-display text-lead">
        {t.pasteTitle}
      </h3>
      <p className="text-body text-ink-soft">{t.pasteIntro}</p>
      <TextArea
        label={t.pasteLabel}
        value={text}
        rows={8}
        maxLength={MAX_RECIPE_TEXT_LENGTH}
        autoComplete="off"
        autoCapitalize="sentences"
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          setNote(null);
        }}
        message={fill(t.pasteLimit, {
          max: new Intl.NumberFormat(locale).format(MAX_RECIPE_TEXT_LENGTH),
        })}
      />

      {/* Always mounted: a live region is announced reliably only when its text changes. */}
      <p role="status" className="text-body-small text-ink-soft empty:hidden">
        {note}
      </p>

      {asking && destination !== null && (
        <DescribeConsentCard
          destination={destination}
          onAllow={() => void allow()}
          onDecline={decline}
          onLearnMore={onLeave}
        />
      )}

      {!asking && (
        <>
          <div className="flex flex-col gap-1">
            <p role="note" className="text-body-small text-ink-soft">
              {status.kind === 'noAi'
                ? t.pasteNoAiNote
                : status.kind === 'needsConsent'
                  ? t.pasteAskFirstNote
                  : viaServer
                    ? fill(t.pasteAiNoteInstance, {
                        host: destination?.host ?? '',
                        label: destination?.label ?? '',
                      })
                    : fill(t.pasteAiNoteByok, { host: destination?.host ?? '' })}
            </p>
            {status.kind === 'noAi' && (
              <AiSetupLink href={hrefs.section('ai')} onNavigate={onLeave} />
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              {t.pasteClose}
            </Button>
            <Button className="flex-1" busy={working} busyLabel={t.pasteReading} onClick={read}>
              {t.pasteRead}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
