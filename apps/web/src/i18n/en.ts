/**
 * English copy. A typed nested object plus a tiny `fill`/`useStrings` (see ./index.ts).
 * The full l10n system (locale switching, plurals, extraction) arrives in phase 7; until then
 * every user-visible sentence lives here so no JSX carries a string literal of its own.
 *
 * Sources: apps/client/lib/l10n/app_en.arb and packages/integrations/lib/src/l10n/coach_strings.dart.
 * Placeholders use `{name}` and are filled with `fill()`.
 */
export const en = {
  common: {
    close: 'Close',
    back: 'Back',
    logging: 'Logging…',
    log: 'Log',
    local: 'Local',
  },
  groups: {
    vegFruit: 'Veg & Fruit',
    protein: 'Protein',
    starch: 'Starch',
    dairy: 'Dairy',
    other: 'Other',
    passed: 'passed',
  },
  lineBar: {
    label: 'Lines at this station',
    passedSuffix: '· passed',
  },
  entries: {
    label: 'On the plate',
  },
  portion: {
    label: 'Portion',
    oneServing: '~1 serving',
  },
  capture: {
    title: 'Log a plate',
    nextStation: 'Next station: {meal}',
    snapshot: 'Snapshot',
    snapshotHint: 'One photo of the plate is plenty.',
    barcode: 'Barcode',
    barcodeHint: 'Packaged food',
    type: 'Type it',
    typeHint: 'Works offline',
  },
  barcodeMatch: {
    groupLabel: 'Food group',
  },
  recognized: {
    lookedLike: { one: 'Looks like 1 food', other: 'Looks like {count} foods' },
    tickHint: 'All are ticked. Untick anything that is not on the plate.',
    nothingMatched: 'Nothing matched',
    nothingOnPlate: 'Nothing on this plate',
    pickOrType: 'Pick a closest match or type the food manually.',
    quotaTitle: "the free quota is done — choose what you'd like to do.",
    quotaHint: 'You can still pick a closest match or type it manually.',
    failureTitle: "Search isn't available right now.",
    recognizedLabel: 'Recognized foods',
    closestMatches: 'Closest matches',
    confidence: '{percent}% sure',
    customFoodName: 'Custom food name',
    logCustomFood: 'Log custom food',
    typeNameFirst: 'Type a name first',
  },
  consent: {
    title: 'Send this photo to {host}?',
    whatIsSent:
      'What is sent: the photo, shrunk, with its location and camera details removed, a fixed instruction asking which foods are on the plate, and the model name you chose. AI Nutrition Coach does not run that service and never sees the photo.',
    alsoVisible:
      'Also visible to {host}: your internet address and your device or app type, as with any website.',
    alsoVisibleWeb:
      'Also visible to {host}: your internet address, your browser type and the address of this site, as with any website.',
    retention: "{host} may keep requests under its own terms: check your provider's data policy.",
    notSent: 'Not sent: your name, your history, or your other plates.',
    revokeHint: 'You can change this any time in Settings → Your AI.',
    askEveryHint: 'You are asked before every photo. Change this in Settings → Your AI.',
    allow: 'Allow {host}',
    allowOnce: 'Send this photo',
    decline: 'Not now',
    learnMore: 'What this app stores and sends',
  },
  erase: {
    title: 'Erase everything on this device?',
    body: 'Your plates, coach notes, saved AI key and exports still on this device will be deleted for good. Copies you shared or downloaded elsewhere are not affected.',
    confirm: 'Erase',
    keep: 'Keep my data',
  },
  offNotice: {
    title: 'Barcode lookups',
    body: 'Barcodes you scan are looked up on Open Food Facts (public, no account). Only the barcode is sent.',
    alsoWeb:
      'Open Food Facts also sees your internet address, your browser type and the address of this site (your browser adds it), as any website does.',
    ok: 'OK',
    offline: 'Don’t look up online',
    privacyLink: 'What this app stores and sends',
  },
  removePlate: {
    title: 'Remove this plate?',
    body: '{dish} will be removed from your history on this device, along with its coach note. This can’t be undone.',
    keep: 'Keep it',
    confirm: 'Remove',
  },
  update: {
    message:
      'A new version is ready. Reloading locks your data, so you will enter your passphrase again.',
    reload: 'Reload',
    later: 'Later',
  },
  lock: {
    action: 'Lock',
  },
  shell: {
    mainNav: 'Main',
    today: 'Today',
    week: 'Week',
    settings: 'Settings',
    logAPlate: 'Log a plate',
    logShort: 'Log',
    dock: 'Week and log',
    brand: 'AI Nutrition Coach',
    storage: 'Local',
    storageNote: 'All plates stored on this device. Nothing leaves home.',
    footmark: 'yours to run · open source',
    skip: 'Skip to content',
  },
  settings: {
    aiTier: 'AI tier',
    v2Tag: 'v2',
    v2Spoken: 'coming in version 2',
  },
} as const;

type Widen<T> = T extends string ? string : { -readonly [K in keyof T]: Widen<T[K]> };

/** The shape every locale must satisfy. */
export type Strings = Widen<typeof en>;
