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
  mealSlotForHour,
  startOfNextLocalDay,
  type FoodEntryDraft,
  type FoodMatch,
} from '@anc/core';
import { usePhotoFlow, type PhotoSource, type UsePhotoFlowDeps } from '../../capture';
import type { UseBarcodeScannerOptions } from '../../barcode';
import { photoFlowConsentDeps, photoUploadHost } from '../../ai';
import { PhotoConsentDialog } from '../../components/dialogs';
import { CaptureSheet, RecognizedMatchSheet } from '../../components/sheets';
import { useDay } from '../../app/day-context';
import { LogContext, type LogState } from '../../app/log-context';
import { hrefs, isPrivacyRoute, navigate, parseRoute, TODAY_HASH } from '../../app/router';
import { useSession } from '../../app/session';
import { fill } from '../../i18n';
import { slotName } from '../../i18n/sentences';
import { BarcodeSheet } from './BarcodeScan';
import { PhotoDeniedSheet, SnapSheet } from './PhotoSheets';
import { RecipeEditorSheet } from './RecipeEditor';
import { SavedSheet } from './SavedSheet';
import { TypeItSheet } from './TypeIt';

type Flow =
  | { readonly kind: 'closed' }
  | { readonly kind: 'capture' }
  | { readonly kind: 'snap' }
  | { readonly kind: 'barcode' }
  | { readonly kind: 'type'; readonly prefill?: string }
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
  children,
}: {
  /** Injectable for tests (a fake decoder and camera). */
  readonly scannerOptions?: Partial<UseBarcodeScannerOptions>;
  /** Injectable for tests (a fake photo picker). */
  readonly createCapture?: UsePhotoFlowDeps['createCapture'];
  readonly children: ReactNode;
}) {
  const session = useSession();
  const day = useDay();
  const [flow, setFlow] = useState<Flow>({ kind: 'closed' });
  const [consent, setConsent] = useState<Consent | null>(null);
  const consentRef = useRef<Consent | null>(null);
  // A photo run is on screen (resolving, ready or denied) until the person closes its result.
  const [photoOpen, setPhotoOpen] = useState(false);

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
  const logged = useCallback(() => {
    setFlow({ kind: 'closed' });
    setPhotoOpen(false);
    day.select(day.today);
    day.markLogged();
    navigate(TODAY_HASH);
  }, [day]);

  const startPhoto = (source: PhotoSource) => {
    setFlow({ kind: 'closed' });
    setPhotoOpen(true);
    day.select(day.today);
    navigate(TODAY_HASH);
    photo.start(source);
  };

  const typeInstead = (prefill?: string) => {
    setPhotoOpen(false);
    setFlow(prefill ? { kind: 'type', prefill } : { kind: 'type' });
  };

  const commit = async (drafts: readonly FoodEntryDraft[]) => {
    const result = await session.recordPlate(drafts);
    if (result.kind !== 'recordPlateSuccess') throw new Error('not recorded');
    logged();
  };

  const state = photoOpen ? photo.state : null;
  const value = useMemo<LogState>(
    () => ({
      open: () => setFlow({ kind: 'capture' }),
      resolving: state?.kind === 'resolving',
    }),
    [state?.kind],
  );

  return (
    <LogContext.Provider value={value}>
      {children}
      <CaptureSheet
        open={flow.kind === 'capture'}
        onClose={close}
        onSnapshot={() => setFlow({ kind: 'snap' })}
        onBarcode={() => setFlow({ kind: 'barcode' })}
        onType={() => setFlow({ kind: 'type' })}
        onSaved={() => setFlow({ kind: 'saved' })}
        nextMeal={slotName(mealSlotForHour(new Date().getHours()))}
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
      />
      <TypeItSheet
        open={flow.kind === 'type'}
        prefill={flow.kind === 'type' ? flow.prefill : undefined}
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
          onLog={commit}
          aiSetupHref={hrefs.section('ai')}
          instanceOffered={instanceLabel !== undefined}
        />
      )}
    </LogContext.Provider>
  );
}
