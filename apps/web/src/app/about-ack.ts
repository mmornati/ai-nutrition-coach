// The "About this app" answer given BEFORE the encrypted store exists (first run on the web).
// It is kept for the page's lifetime only; once the store is open the post-unlock gate writes the
// acknowledgement into it, so the notice never appears twice. Never written to browser storage.

let acknowledgedBeforeStore = false;

export const wasAcknowledgedBeforeStore = (): boolean => acknowledgedBeforeStore;
export const rememberAcknowledgedBeforeStore = (): void => {
  acknowledgedBeforeStore = true;
};
/** After an erase the device is back to a first run: the notice is shown again. */
export const forgetAcknowledgedBeforeStore = (): void => {
  acknowledgedBeforeStore = false;
};
