import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener?.('change', cb);
  return () => mql.removeEventListener?.('change', cb);
}

const snapshot = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY).matches
    : false;

/** True when the user asked for reduced motion. False where matchMedia is missing (jsdom). */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/**
 * Width of an element, tracked with ResizeObserver. Returns `fallback` where layout is not
 * available (jsdom reports 0), so SVG diagrams still render something sensible.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);
  const measure = useCallback(() => {
    const w = ref.current?.clientWidth ?? 0;
    if (w > 0) setWidth(w);
  }, [ref]);
  useEffect(() => {
    measure();
    if (typeof ResizeObserver === 'undefined' || !ref.current) return;
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref, measure]);
  return width;
}
