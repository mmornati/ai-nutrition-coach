import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useLocale } from '../i18n';
import type { AiSettings } from './ai-settings';
import type { FieldMessage } from './copy';
import { connectionResultMessage, saveResultMessage } from './copy';
import type { AiServices } from './create-ai-services';
import type { KeyStatus } from './your-ai';

const AiServicesContext = createContext<AiServices | null>(null);

/** Provides the session's AI services. Rebuild them (and this provider) on every unlock. */
export function AiProvider(props: { services: AiServices; children: ReactNode }): ReactNode {
  return (
    <AiServicesContext.Provider value={props.services}>{props.children}</AiServicesContext.Provider>
  );
}

export function useAiServices(): AiServices {
  const services = useContext(AiServicesContext);
  if (services === null) throw new Error('useAiServices needs an <AiProvider>');
  return services;
}

/** The live AI settings; re-renders on every published change. */
export function useAiSettings(): AiSettings {
  const { settings } = useAiServices();
  return useSyncExternalStore(settings.subscribe, settings.getSnapshot);
}

export interface YourAiState {
  readonly settings: AiSettings;
  readonly keyStatus: KeyStatus;
  readonly busy: boolean;
  readonly testing: boolean;
  /** The latest outcome as calm copy, placed on the field it belongs to. */
  readonly message: FieldMessage | null;
  selectNoAi(): Promise<void>;
  save(form: { endpointUrl: string; model: string; newKey: string }): Promise<boolean>;
  removeKey(): Promise<void>;
  test(form: { endpointUrl: string; model: string; typedKey: string }): Promise<void>;
  revokeConsent(host: string): Promise<void>;
  setAskBeforeEveryPhoto(value: boolean): Promise<void>;
  clearMessage(): void;
}

const NO_KEY: KeyStatus = { hasKey: false, keyEnding: null };

/**
 * The state and actions of the Your AI screen. The screen keeps the key field's text itself and
 * clears it after every save; the key never passes through this state.
 */
export function useYourAi(): YourAiState {
  const { yourAi, settings: controller } = useAiServices();
  const settings = useAiSettings();
  const [keyStatus, setKeyStatus] = useState<KeyStatus>(NO_KEY);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  // A thunk, not the worded message: it is evaluated per locale below, so it follows a switch.
  const [held, setHeld] = useState<{ readonly of: () => FieldMessage } | null>(null);
  const { locale } = useLocale();

  const refresh = useCallback(async (): Promise<void> => {
    setKeyStatus(await yourAi.keyStatus());
  }, [yourAi]);

  useEffect(() => {
    let live = true;
    void yourAi.keyStatus().then((status) => {
      if (live) setKeyStatus(status);
    });
    return () => {
      live = false;
    };
  }, [yourAi]);

  return useMemo(
    () => ({
      settings,
      keyStatus,
      busy,
      testing,
      message: held === null ? null : held.of(),
      selectNoAi: async () => {
        setHeld(null);
        await yourAi.selectNoAi();
      },
      save: async (form) => {
        if (busy) return false;
        setBusy(true);
        setHeld(null);
        try {
          const result = await yourAi.saveByok(form);
          setHeld({ of: () => saveResultMessage(result) });
          await refresh();
          return result.kind === 'saved';
        } finally {
          setBusy(false);
        }
      },
      removeKey: async () => {
        if (busy) return;
        setBusy(true);
        try {
          await yourAi.removeByok();
          await refresh();
        } finally {
          setBusy(false);
        }
      },
      test: async (form) => {
        if (testing) return;
        setTesting(true);
        setHeld(null);
        try {
          const result = await yourAi.testConnection(form);
          setHeld({ of: () => connectionResultMessage(result) });
        } finally {
          setTesting(false);
        }
      },
      revokeConsent: (host) => controller.revokePhotoConsent(host),
      setAskBeforeEveryPhoto: (value) => controller.setAskBeforeEveryPhoto(value),
      clearMessage: () => setHeld(null),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `locale`: `held.of()` words the message via `strings()`.
    [settings, keyStatus, busy, testing, held, locale, yourAi, controller, refresh],
  );
}
