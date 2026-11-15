// The "Log a plate" flows, mounted once inside the unlocked session so any screen's LOG button
// (rail, dock) opens them:
//
//   capture sheet -> Snapshot -> "Snap a plate" (a tap opens the camera or file picker)
//                      -> consent dialog (when the photo would leave the device)
//                      -> the open meal says "Reading the plate…" on Today
//                      -> recognised match sheet (or the calm no-AI core: closest matches, type it)
//                 -> Barcode  -> camera view -> one-time Open Food Facts notice
//                      -> barcode match sheet, or "not found" and manual entry prefilled
//                 -> Type it  -> recent and often foods, ranked matches + portion presets + custom food
//                 -> Saved meals and recipes -> a saved meal (amounts editable) or a new recipe
//                 -> Describe -> words (or a short voice recording turned into text) -> the AI the
//                      person agreed to, or the food list on this device -> the same match sheet
//
// Browsers only open a camera/file picker from a tap, so nothing here starts one on mount.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  addCalendarDays,
  classifyForDate,
  dayBoardSlot,
  instantForSlot,
  isSameLocalDay,
  mealSlotForHour,
  startOfNextLocalDay,
  type FoodEntryDraft,
  type FoodMatch,
  type MealSlot,
  type RecognitionResult,
} from '@anc/core';
import {
  closestMatches,
  enrichRecognition,
  usePhotoFlow,
  type PhotoSource,
  type UsePhotoFlowDeps,
  type VoiceEnv,
} from '../../capture';
import type { UseBarcodeScannerOptions } from '../../barcode';
import { photoFlowConsentDeps, photoUploadHost } from '../../ai';
import { PhotoConsentDialog } from '../../components/dialogs';
import { CaptureSheet, RecognizedMatchSheet } from '../../components/sheets';
import { useDay } from '../../app/day-context';
import {
  LogContext,
  LogTargetContext,
  type LogState,
  type RecordHere,
} from '../../app/log-context';
import { hrefs, isPrivacyRoute, navigate, parseRoute, TODAY_HASH } from '../../app/router';
import { useSession } from '../../app/session';
import { formatDayMonth, weekdayName } from '../../components/day/format';
import { fill, joinPlain, strings } from '../../i18n';
import { slotName } from '../../i18n/sentences';
import { slotChoices } from '../plate/DaySlotFields';
import { ChoiceGroup } from '../settings/ChoiceGroup';
import { BarcodeSheet } from './BarcodeScan';
import { DescribeSheet, type DescribeResultPayload } from './Describe';
import { PhotoDeniedSheet, SnapSheet } from './PhotoSheets';
import { RecipeEditorSheet } from './RecipeEditor';
import { SavedSheet } from './SavedSheet';
import { TypeItSheet } from './TypeIt';

type Flow =
  | { readonly kind: 'closed' }
  | { readonly kind: 'capture' }
  | { readonly kind: 'snap' }
  | { readonly kind: 'barcode' }
  | { readonly kind: 'describe' }
  | {
      readonly kind: 'type';
      readonly prefill?: string;
      /** Foods already on the plate (a scanned food the person wants to add to). */
      readonly items?: readonly FoodEntryDraft[];
    }
  | { readonly kind: 'saved' }
  | { readonly kind: 'recipe' };

interface Consent {
  readonly host: string;
  /** The provider behind this server, when the host is this server (the instance-wide key). */
  readonly via?: string;
  readonly perPhoto: boolean;
  readonly resolve: (allowed: boolean) => void;
}

export function LogHost({
  scannerOptions,
  createCapture,
  voiceEnv,
  children,
}: {
  /** Injectable for tests (a fake decoder and camera). */
  readonly scannerOptions?: Partial<UseBarcodeScannerOptions>;
  /** Injectable for tests (a fake photo picker). */
  readonly createCapture?: UsePhotoFlowDeps['createCapture'];
  /** Injectable for tests (a fake microphone and recorder for Describe). */
  readonly voiceEnv?: VoiceEnv;
  readonly children: ReactNode;
}) {
  const session = useSession();
  const day = useDay();
  const [flow, setFlow] = useState<Flow>({ kind: 'closed' });
  const [consent, setConsent] = useState<Consent | null>(null);
  const consentRef = useRef<Consent | null>(null);
  // A photo run is on screen (resolving, ready or denied) until the person closes its result.
  const [photoOpen, setPhotoOpen] = useState(false);
  // A described meal (typed, dictated or spoken) goes to the same review sheet as a photo.
  const [described, setDescribed] = useState<{
    readonly result: RecognitionResult;
    readonly closestMatches: readonly FoodMatch[];
    readonly unmatched: readonly string[];
  } | null>(null);

  const askConsent = useCallback(
    (input: { host: string; perPhoto: boolean }) =>
      new Promise<boolean>((resolve) => {
        // On the instance rung the host is this server: name the provider it passes the photo to.
        const offer = session.ai.instance.getSnapshot().config;
        const via =
          session.ai.settings.getSnapshot().rung.kind === 'instance' && offer.enabled
            ? offer.label
            : undefined;
        const next: Consent = {
          // The consent key of the instance rung is not a host name: the dialog names this server.
          ...input,
          host: via === undefined ? input.host : session.ai.instance.getSnapshot().host,
          ...(via === undefined ? {} : { via }),
          resolve,
        };
        consentRef.current = next;
        setConsent(next);
      }),
    [session],
  );
  const answerConsent = (allowed: boolean) => {
    consentRef.current?.resolve(allowed);
    consentRef.current = null;
    setConsent(null);
  };
  // A lock while the dialog is up is a "no": the photo is dropped, nothing is sent.
  useEffect(
    () => () => {
      consentRef.current?.resolve(false);
      consentRef.current = null;
    },
    [],
  );

  const recentMatches = useCallback(async (): Promise<readonly FoodMatch[]> => {
    const today = day.today;
    const recent = await session.store.readRange({
      from: addCalendarDays(today, -7),
      to: startOfNextLocalDay(today),
    });
    if (recent.kind !== 'platesRead') return [];
    return recent.plates.flatMap((plate) =>
      plate.entries.map((e) => ({
        food: e.databaseFood,
        confidence: 0.3,
        presets: [e.quantity],
      })),
    );
  }, [session, day.today]);

  const photo = usePhotoFlow({
    getRung: () => session.ai.rung,
    ...photoFlowConsentDeps(session.ai.settings, session.ai.instance.getSnapshot),
    askConsent,
    permit: session.ai.permit,
    catalog: session.catalog,
    recentMatches,
    ...(createCapture ? { createCapture } : {}),
  });

  // Nothing can be sent while No AI is chosen or the endpoint is not set: say so before the photo.
  const aiSettings = useSyncExternalStore(
    session.ai.settings.subscribe,
    session.ai.settings.getSnapshot,
  );
  const instance = useSyncExternalStore(
    session.ai.instance.subscribe,
    session.ai.instance.getSnapshot,
  );
  const aiSetupHref =
    photoUploadHost(aiSettings, instance) === null ? hrefs.section('ai') : undefined;
  // The AI this server offers, when the person has not turned it on: the setup notes say so.
  const instanceLabel =
    instance.config.enabled && aiSettings.rung.kind !== 'instance'
      ? instance.config.label
      : undefined;

  const close = useCallback(() => setFlow({ kind: 'closed' }), []);

  // Where a new plate lands: the day selected in the week strip, and the meal chosen in the log
  // sheet (the clock's meal on today, else the first meal of that day with nothing in it). A plate
  // is never put in the future (see `slotChoices`).
  const [slotWanted, setSlotWanted] = useState<MealSlot | null>(null);
  const targetDay = day.selected;
  const now = session.clock();
  const viewingToday = isSameLocalDay(targetDay, day.today);
  const defaultSlot: MealSlot = viewingToday
    ? mealSlotForHour(new Date(now).getHours())
    : ((['breakfast', 'lunch', 'dinner'] as const).find(
        (s) => dayBoardSlot(classifyForDate(day.plates, targetDay), s).plates.length === 0,
      ) ?? 'dinner');
  const { slots: slotOptions, slot: targetSlot } = slotChoices({
    day: targetDay,
    now,
    wanted: slotWanted ?? defaultSlot,
  });
  const latestTarget = useRef({ day: targetDay, slot: targetSlot });
  useEffect(() => {
    latestTarget.current = { day: targetDay, slot: targetSlot };
  });
  const recordAt = useCallback(
    (drafts: readonly FoodEntryDraft[], target: { day: number; slot: MealSlot }) =>
      session.recordPlate(
        drafts,
        instantForSlot({ day: target.day, slot: target.slot, now: session.clock() }),
      ),
    [session],
  );
  const recordHere = useCallback<RecordHere>(
    (drafts) => recordAt(drafts, latestTarget.current),
    [recordAt],
  );
  // The target of a photo is fixed when the photo is taken, not read again when the result is
  // logged: the person may move around the week while the plate is being recognised.
  const [photoTarget, setPhotoTarget] = useState<{
    readonly day: number;
    readonly slot: MealSlot;
  } | null>(null);

  // The privacy page is a link inside several dialogs. Following it leaves the dialog behind, so
  // it closes (an unanswered consent question is a "no": the photo is dropped, nothing is sent).
  useEffect(() => {
    const onHash = () => {
      if (!isPrivacyRoute(parseRoute(window.location.hash))) return;
      consentRef.current?.resolve(false);
      consentRef.current = null;
      setConsent(null);
      setFlow({ kind: 'closed' });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  /** A plate was recorded: close everything, show Today, offer the quick repeat. */
  const logged = useCallback(
    (landedOn: number = latestTarget.current.day) => {
      setFlow({ kind: 'closed' });
      setPhotoOpen(false);
      setPhotoTarget(null);
      // Stay on the day the plate went to (it may not be today).
      day.select(landedOn);
      day.markLogged();
      setDescribed(null);
      navigate(TODAY_HASH);
    },
    [day],
  );

  const startPhoto = (source: PhotoSource) => {
    setFlow({ kind: 'closed' });
    setPhotoTarget({ ...latestTarget.current });
    setPhotoOpen(true);
    navigate(TODAY_HASH);
    photo.start(source);
  };

  const typeInstead = (prefill?: string) => {
    setPhotoOpen(false);
    setFlow(prefill ? { kind: 'type', prefill } : { kind: 'type' });
  };

  const commit = async (drafts: readonly FoodEntryDraft[]) => {
    const result = await recordHere(drafts);
    if (result.kind !== 'recordPlateSuccess') throw new Error('not recorded');
    logged();
  };
  const commitPhoto = async (drafts: readonly FoodEntryDraft[]) => {
    const target = photoTarget ?? latestTarget.current;
    const result = await recordAt(drafts, target);
    if (result.kind !== 'recordPlateSuccess') throw new Error('not recorded');
    logged(target.day);
  };

  const showDescribed = useCallback(
    async (payload: DescribeResultPayload) => {
      if (payload.kind === 'local') {
        setDescribed({
          result: payload.result,
          closestMatches: payload.closestMatches,
          unmatched: payload.unmatched,
        });
      } else {
        // The AI names the foods and guesses grams; a confident catalogue match lends nutrients.
        const result = await enrichRecognition(payload.result, session.catalog);
        const closest = await closestMatches(result, session.catalog, recentMatches);
        setDescribed({ result, closestMatches: closest, unmatched: [] });
      }
      setFlow({ kind: 'closed' });
    },
    [session, recentMatches, setDescribed],
  );

  const state = photoOpen ? photo.state : null;
  const value = useMemo<LogState>(
    () => ({
      open: () => {
        setSlotWanted(null);
        setFlow({ kind: 'capture' });
      },
      resolving: state?.kind === 'resolving',
      resolvingTarget: state?.kind === 'resolving' ? photoTarget : null,
    }),
    [state?.kind, photoTarget],
  );

  return (
    <LogContext.Provider value={value}>
      <LogTargetContext.Provider value={recordHere}>
        {children}
        <CaptureSheet
          open={flow.kind === 'capture'}
          onClose={close}
          onSnapshot={() => setFlow({ kind: 'snap' })}
          onBarcode={() => setFlow({ kind: 'barcode' })}
          onType={() => setFlow({ kind: 'type' })}
          onSaved={() => setFlow({ kind: 'saved' })}
          onDescribe={() => setFlow({ kind: 'describe' })}
          nextMeal={slotName(mealSlotForHour(new Date().getHours()))}
          target={{
            label: viewingToday
              ? strings().capture.forToday
              : fill(strings().capture.forDay, {
                  day: `${weekdayName(targetDay)} ${formatDayMonth(targetDay)}`,
                }),
            choice: (
              <ChoiceGroup
                label={strings().capture.mealLabel}
                choices={slotOptions.map((s) => ({ value: s, label: slotName(s) }))}
                value={targetSlot}
                onChange={setSlotWanted}
              />
            ),
          }}
        />
        <SnapSheet
          open={flow.kind === 'snap'}
          onClose={close}
          onSource={startPhoto}
          onTypeInstead={() => typeInstead()}
          aiSetupHref={aiSetupHref}
          instanceOffered={instanceLabel !== undefined}
        />
        <BarcodeSheet
          open={flow.kind === 'barcode'}
          {...(scannerOptions ? { scannerOptions } : {})}
          onClose={close}
          onTypeInstead={typeInstead}
          onLogged={logged}
          onAddAnother={(draft) => setFlow({ kind: 'type', items: [draft] })}
        />
        <DescribeSheet
          open={flow.kind === 'describe'}
          onClose={close}
          onResult={(payload) => void showDescribed(payload)}
          onTypeInstead={typeInstead}
          {...(voiceEnv ? { voiceEnv } : {})}
        />
        <TypeItSheet
          open={flow.kind === 'type'}
          prefill={flow.kind === 'type' ? flow.prefill : undefined}
          initialItems={flow.kind === 'type' ? flow.items : undefined}
          onClose={close}
          onLogged={logged}
        />
        <SavedSheet
          open={flow.kind === 'saved'}
          onClose={close}
          onLogged={logged}
          onFindRecipe={(name) => setFlow({ kind: 'type', prefill: name })}
          onNewRecipe={() => setFlow({ kind: 'recipe' })}
        />
        <RecipeEditorSheet
          open={flow.kind === 'recipe'}
          onClose={() => setFlow({ kind: 'saved' })}
          onSaved={(recipe) => {
            day.setNotice((a) => fill(a.relog.recipe.saved, { name: recipe.name }));
            setFlow({ kind: 'saved' });
          }}
        />
        <PhotoConsentDialog
          open={consent !== null}
          host={consent?.host ?? ''}
          via={consent?.via}
          perPhoto={consent?.perPhoto ?? false}
          privacyHref={hrefs.privacy}
          onAllow={() => answerConsent(true)}
          onDecline={() => answerConsent(false)}
        />
        <PhotoDeniedSheet
          open={state?.kind === 'denied'}
          onClose={() => setPhotoOpen(false)}
          onTypeInstead={() => typeInstead()}
        />
        {state?.kind === 'ready' && (
          <RecognizedMatchSheet
            open
            onClose={() => setPhotoOpen(false)}
            result={state.result}
            closestMatches={state.closestMatches}
            onLog={commitPhoto}
            aiSetupHref={hrefs.section('ai')}
            instanceOffered={instanceLabel !== undefined}
          />
        )}
        {described !== null && (
          <RecognizedMatchSheet
            open
            onClose={() => setDescribed(null)}
            result={described.result}
            closestMatches={described.closestMatches}
            onLog={commit}
            source="description"
            errorMessage={
              described.unmatched.length === 0
                ? undefined
                : fill(strings().recognized.describedUnmatched, {
                    names: joinPlain(described.unmatched),
                  })
            }
          />
        )}
      </LogTargetContext.Provider>
    </LogContext.Provider>
  );
}
