import { UpdatePrompt } from './UpdatePrompt';

export function App() {
  return (
    <>
      <main className="min-h-dvh">
        <header className="flex items-end justify-between gap-3 border-b-4 border-porcelain px-5 pt-7 pb-3">
          <h1 className="font-display text-display lg:text-display-desktop uppercase">Today</h1>
        </header>
      </main>
      <UpdatePrompt />
    </>
  );
}
