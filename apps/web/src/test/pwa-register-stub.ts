// Vitest stand-in for the virtual module that vite-plugin-pwa provides at build time.
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}] as [boolean, (v: boolean) => void],
    offlineReady: [false, () => {}] as [boolean, (v: boolean) => void],
    updateServiceWorker: () => Promise.resolve(),
  };
}
