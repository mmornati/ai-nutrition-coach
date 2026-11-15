// "This store was just created here" (first run on the web, through the create-passphrase screen,
// not a restore or a join): the first-run welcome is shown once for it. Kept for the page's
// lifetime, like the About answer given before the store exists, and never written to browser
// storage; what survives a reload is the welcome's own step in the encrypted store.

let fresh = false;

export const isFreshStore = (): boolean => fresh;
export const markFreshStore = (): void => {
  fresh = true;
};
/** The welcome ended, or the device went back to a first run. */
export const clearFreshStore = (): void => {
  fresh = false;
};
