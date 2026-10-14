import { useCallback, useEffect, useRef, useState } from 'react';
import { createFilePhotoCapture, type PhotoCapture, type PhotoSource } from './photo-capture';
import { runPhotoFlow, type PhotoFlowDeps, type PhotoFlowState } from './photo-flow';

export type UsePhotoFlowDeps = Omit<
  PhotoFlowDeps,
  'capture' | 'onState' | 'isCancelled' | 'isSuperseded'
> & {
  /** Injectable for tests. */
  readonly createCapture?: (source: PhotoSource) => PhotoCapture;
};

/**
 * Drives {@link runPhotoFlow} for a screen. `start(source)` must be called from a click (the
 * browser only opens a picker from a gesture). Only the LATEST capture's result is published: a
 * retake while the first photo is still being recognised discards the first (FR13 I/O matrix).
 * The state holds the recognition result and the closest matches, never the photo.
 */
export function usePhotoFlow(deps: UsePhotoFlowDeps): {
  readonly state: PhotoFlowState | null;
  readonly start: (source: PhotoSource) => void;
} {
  const [state, setState] = useState<PhotoFlowState | null>(null);
  const latest = useRef(0);
  const mounted = useRef(true);
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      latest.current += 1;
    };
  }, []);

  const start = useCallback((source: PhotoSource) => {
    const run = ++latest.current;
    const { createCapture = createFilePhotoCapture, ...rest } = depsRef.current;
    void runPhotoFlow({
      ...rest,
      capture: createCapture(source),
      onState: setState,
      isCancelled: () => !mounted.current || latest.current !== run,
      isSuperseded: () => mounted.current && latest.current !== run,
    });
  }, []);

  return { state, start };
}
