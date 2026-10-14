import { lazy, Suspense, useSyncExternalStore } from 'react';
import { mealSlotForHour, type MealSlot } from '@anc/core';
import { Header } from './components/shell/Header';
import { UpdatePrompt } from './components/shell/UpdatePrompt';

const Gallery = lazy(async () => ({ default: (await import('./components/gallery')).Gallery }));

function subscribeToHash(notify: () => void): () => void {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
}
const readHash = () => window.location.hash;

export function App() {
  const hash = useSyncExternalStore(subscribeToHash, readHash, () => '');
  const slot: MealSlot = mealSlotForHour(new Date().getHours());

  // Dev gallery: every component with synthetic data. The real routes arrive in later phases.
  if (hash === '#/gallery') {
    return (
      <Suspense fallback={null}>
        <Gallery />
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
