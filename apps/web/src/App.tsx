import { lazy, Suspense, useSyncExternalStore } from 'react';
import { mealSlotForHour, type MealSlot } from '@anc/core';
import { Header } from './components/shell/Header';
import { UpdatePrompt } from './components/shell/UpdatePrompt';

// The dev gallery is not part of a release. Both operands are replaced with constants at build
// time, so the whole conditional (the dynamic import, its chunk and the '#/gallery' route) is
// dropped unless the dev server or a `VITE_GALLERY=1` build (the e2e server) asks for it.
// tools/check_no_gallery_in_build.sh fails `pnpm verify` if any of it leaks into dist/.
const gallery =
  import.meta.env.DEV || import.meta.env.VITE_GALLERY === '1'
    ? {
        route: '#/gallery',
        Page: lazy(async () => ({ default: (await import('./components/gallery')).Gallery })),
      }
    : null;

function subscribeToHash(notify: () => void): () => void {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
}
const readHash = () => window.location.hash;

export function App() {
  const hash = useSyncExternalStore(subscribeToHash, readHash, () => '');
  const slot: MealSlot = mealSlotForHour(new Date().getHours());

  // Dev gallery: every component with synthetic data. The real routes arrive in later phases.
  if (gallery && hash === gallery.route) {
    return (
      <Suspense fallback={null}>
        <gallery.Page />
      </Suspense>
    );
  }

  return (
    <>
      <main className="min-h-dvh" data-meal-slot={slot}>
        <Header title="Today" />
      </main>
      <UpdatePrompt />
    </>
  );
}
