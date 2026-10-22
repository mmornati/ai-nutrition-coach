import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EpochMs } from '@anc/core';
import {
  createCsvExporter,
  createExportHistory,
  createExportReminder,
  createJsonExporter,
  createRunExport,
  createWebExportDestination,
} from '../../export';
import type { ExportDestination } from '../../export';
import type { Session } from '../../app/session';

/** The export pieces for one unlocked session, built over its store and its encrypted key/value table. */
export function useExportServices(session: Session, destination?: ExportDestination) {
  const { store, kv, clock, profile, saved } = session;
  return useMemo(() => {
    const history = createExportHistory(kv);
    return {
      history,
      reminder: createExportReminder({ history, clock }),
      run: createRunExport({
        exporters: { csv: createCsvExporter(store), json: createJsonExporter(store) },
        destination: destination ?? createWebExportDestination(),
        history,
        clock,
        readProfile: () => profile.read(),
        readSaved: async () => {
          const [meals, recipes] = await Promise.all([saved.listMeals(), saved.listRecipes()]);
          // A list that cannot be read is an error, never an empty list.
          if (meals.kind !== 'saved' || recipes.kind !== 'saved') throw new Error('saved');
          return { meals: meals.value, recipes: recipes.value };
        },
      }),
    };
  }, [store, kv, clock, profile, saved, destination]);
}

export interface ExportInfo {
  /** `undefined` until read, or when never exported. */
  readonly lastExportAt: EpochMs | undefined;
  readonly loaded: boolean;
  readonly due: boolean;
}

/**
 * "Last export" and whether the one quiet suggestion is due. Reads never throw; unknown reads as
 * "never". `hasData` is one read of the whole history (the suggestion only speaks when there is
 * something to lose).
 */
export function useExportInfo(session: Session, services: ReturnType<typeof useExportServices>) {
  const { store, live } = session;
  const [info, setInfo] = useState<ExportInfo>({
    lastExportAt: undefined,
    loaded: false,
    due: false,
  });
  const read = useCallback(async (): Promise<ExportInfo> => {
    let hasData: boolean;
    try {
      const plates = await store.readRange();
      hasData = plates.kind === 'platesRead' && plates.plates.length > 0;
    } catch {
      hasData = false;
    }
    const [lastExportAt, due] = await Promise.all([
      services.history.lastExportAt(),
      services.reminder.isDue({ hasData }),
    ]);
    return { lastExportAt, loaded: true, due };
  }, [store, services]);
  const refresh = useCallback(async () => {
    const next = await read();
    if (live()) setInfo(next);
  }, [read, live]);
  useEffect(() => {
    let current = true;
    void read().then((next) => {
      if (current && live()) setInfo(next);
    });
    return () => {
      current = false;
    };
  }, [read, live]);
  return { info, refresh };
}
