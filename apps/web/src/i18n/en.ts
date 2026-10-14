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
    logFailed: 'That did not save just now. Nothing was lost; you can try again.',
  },
  groups: {
    vegFruit: 'Veg & fruit',
    protein: 'Protein',
    starch: 'Starch',
    dairy: 'Dairy',
    other: 'Other',
  },
  slots: {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    late: 'Late',
  },
  lineBar: {
    label: 'Lines at this station',
    groupPassed: '{name} · passed',
  },
  entries: {
    label: 'On the plate',
  },
  portion: {
    label: 'Portion',
    oneServing: '~1 serving',
    labelFor: '{label}: {name}',
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
    confidenceLikely: 'likely',
    confidenceMaybe: 'maybe',
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
    storage: 'On this device',
    storageNote: 'All plates stored on this device. Nothing leaves home.',
    footmark: 'yours to run · open source',
    skip: 'Skip to content',
  },
  day: {
    mapDescription: 'Day map',
    openQuietPlace: 'An open, quiet place.',
    reading: 'Reading the plate…',
    allStopped: 'All four lines stopped here',
    noneStopped: 'No lines stopped here',
    passedThrough: '{names} passed through without a stop',
    /** Accessible name of a station's detail button: groups by name, never a count. */
    stationLabel: 'Open {meal}, {time}: {stops}',
    stationLabelPassed: 'Open {meal}, {time}: {stops}. {passed}',
    stationStopped: '{names} stopped',
    stationNoneStopped: 'no lines stopped',
    stationPassed: '{names} passed through',
    removePlateFor: 'Remove this plate ({meal}, {time})',
    dismissHint: '{hint}. Tap to dismiss.',
  },
  coach: {
    group: 'Coach question',
    sure: 'Sure',
    askLater: 'Ask later',
    depthGroup: 'More from the coach',
    close: 'Close',
  },
  chip: {
    onDevice: 'On this device',
    pending: 'Pending',
    synced: 'Synced',
    retryLater: 'Retry later',
    /** Page-level sync announcements (aggregate, never per plate). */
    allSynced: 'All plates synced',
    waiting: { one: '1 plate waiting to sync', other: '{count} plates waiting to sync' },
    retryLaterPlates: { one: '1 plate will retry later', other: '{count} plates will retry later' },
  },
  week: {
    noStreaks: 'No streaks, no countdowns, no guilt.',
    routeLabel: 'This week: choose a day',
    today: 'Today',
    stateAllFour: 'all four lines',
    stateNone: 'nothing logged',
    stateLoggedNoLine: 'logged — no food group line',
    stateSome: '{count} of 4 lines',
    plates: { zero: 'No plates', one: '1 plate', other: '{count} plates' },
    networkIntro: 'Week network.',
    networkDescription: '{intro} {days}',
    daySentence: '{day}: {state}.',
    routeStop: '{day}, {state}',
    routeStopToday: '{day}, {state}, today',
    noteJoin: '{lead} {detail}',
    sentences: '{first} {second}',
    dayNothing: 'nothing logged',
    dayLoggedNoLine: 'logged — no food group line',
    dayAll: 'all four lines',
    dayQuiet: '{names} quiet',
    dayDetail: '{stopped}; {quiet}',
    dayDescription: '{day}: {state}',
    noteAllRan: 'All four lines ran this week.',
    noteNone: 'No plates logged yet this week.',
    noteSome: '{names} ran this week.',
    noteQuietDays: '{name} was quiet on {days}.',
    noteQuietAll: '{name} stayed quiet all week.',
  },
  settings: {
    aiTier: 'AI tier',
    v2Tag: 'v2',
    v2Spoken: 'coming in version 2',
  },
  export: {
    title: 'Export',
    formatLabel: 'Format',
    formatCsv: 'Spreadsheet (CSV)',
    formatJson: 'Data file (JSON)',
    scopeLabel: 'What to export',
    scopeVisibleDay: 'This day',
    scopeWeek: 'This week',
    scopeAllHistory: 'Everything',
    action: 'Export',
    working: 'Preparing your file…',
    done: 'Your file is ready.',
    cancelled: 'Nothing was exported.',
    lastExport: 'Last export: {date}',
    lastExportNever: 'Last export: never',
    plainFilesNotice:
      'Exports are plain, unencrypted files. Erasing your data cannot delete a file you have already downloaded or shared.',
    reminder: 'It has been a while since you saved a copy of your plates.',
    reminderAction: 'Export',
    reminderNotNow: 'Not now',
    failedLocked: 'Unlock first, then export.',
    failedRead: 'Your plates could not be read just now. Nothing was lost; you can try again.',
    failedFormat: 'That file format is not available.',
    failedDelivery: 'The file could not be saved just now. You can try again.',
  },
  sync: {
    onThisDevice: 'Saved on this device',
    noTransport: 'Your plates stay on this device. Nothing is sent anywhere.',
  },
} as const;

type Widen<T> = T extends string ? string : { -readonly [K in keyof T]: Widen<T[K]> };

/** The shape every locale must satisfy. */
export type Strings = Widen<typeof en>;
