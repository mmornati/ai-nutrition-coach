import { mealSlotForHour, type MealSlot } from '@anc/core';
import { UpdatePrompt } from './UpdatePrompt';

export function App() {
  const slot: MealSlot = mealSlotForHour(new Date().getHours());
  return (
    <>
      <main className="min-h-dvh" data-meal-slot={slot}>
        <header className="flex items-end justify-between gap-3 border-b-4 border-porcelain px-5 pt-7 pb-3">
          <h1 className="font-display text-display lg:text-display-desktop uppercase">Today</h1>
        </header>
      </main>
      <UpdatePrompt />
    </>
  );
}
