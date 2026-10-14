/**
 * English copy. A typed nested object plus a tiny `fill`/`useStrings` (see ./index.ts).
 * The full l10n system (locale switching, plurals, extraction) arrives in phase 7; until then
 * every user-visible sentence lives here so no JSX carries a string literal of its own.
 *
 * Sources: the earlier client's message catalogue and coach strings.
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
  /** Shared by the photo capture and the barcode scanner: one calm camera-problem copy. */
  camera: {
    deniedTitle: 'Camera denied — type it instead',
    deniedBody: 'You can still log a plate from the manual entry screen.',
    unavailableTitle: 'Camera unavailable — type it instead',
    unavailableBody: "We couldn't start the camera. Manual entry still works.",
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
    // Phase 5: photo capture (the earlier client).
    snapTitle: 'Snap a plate',
    takePhoto: 'Take a photo',
    choosePhoto: 'Choose a photo',
    aimHint: 'Aim at your plate, then tap the shutter.',
    reading: 'Reading your plate…',
    retake: 'Retake',
    typeManually: 'Type it manually',
    noFoodsMatched: 'No foods matched — pick one below.',
    foundFoods: { one: 'Found 1 food on this plate.', other: 'Found {count} foods on this plate.' },
    nothingOnPlate: 'Nothing on this plate — pick one below.',
    searchUnavailablePick: "Search isn't available right now. Pick a closest match below.",
  },
  barcode: {
    title: 'Scan a barcode',
    checkingCamera: 'Checking camera permission…',
    startingCamera: 'Starting the camera…',
    moveCloser: 'Move closer or steady',
    aimHint: 'Aim at a packaged barcode to log it.',
    lookingUp: 'Looking up {code}…',
    cameraPreview: 'Camera preview',
    notFoundTypeIt: 'Not found — type it manually',
    notFoundTitle: 'Not found',
    notFoundBody: "This barcode isn't in the catalog yet. Type it manually?",
    scanAgain: 'Scan again',
    typeManually: 'Type it manually',
    searchUnavailable: "Search isn't available right now.",
    unsupportedTitle: "Scanning isn't available in this browser — type it instead",
    unsupportedBody:
      "This browser can't read barcodes on your device, and AI Nutrition Coach never sends camera images elsewhere. Manual entry still works.",
  },
  catalog: {
    title: 'Add a food',
    searchLabel: 'Food search',
    typeHint: 'Type a food name. We will rank the matches for you.',
    customHint: 'Type the food name to add it manually.',
    searchUnavailable: "Search isn't available right now.",
    pickQuantity: 'Pick a quantity',
    typeNameFirst: 'Type a name first',
    customFoodName: 'Custom food name',
    logCustomFood: 'Log custom food',
    matchLabel: '{name}, {group}, {presets} presets',
    results: 'Matches',
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
  ai: {
    /** AiRungStrings (the earlier client). The quota lines belong to the deferred hosted tier. */
    rung: {
      freeModelRemaining: 'free model — {N} calls left today',
      freeModelResetAt: 'free model — resets at {time}',
      offlineNoAi: 'offline (no AI)',
      noticeShort: "the free quota is done — choose what you'd like to do.",
      noticeLong:
        'The free quota is done for today. The photo still logs to the no-AI core either way — pick what feels right.',
      keepLogging: 'keep logging without AI',
      bringYourOwnKey: 'bring your own key',
      waitForReset: 'wait for the quota to reset',
      quotaStatusHeading: 'When the free quota runs out',
      manualFallbackHint: 'You can still pick a closest match or type it manually.',
    },
    /** ByokStrings (the earlier client). */
    byok: {
      title: 'Your AI',
      label: 'your key',
      placeholder: 'paste your OpenAI-compatible key — stored encrypted on this device',
      save: 'Save',
      remove: 'Remove key',
      statusActive: 'your key — 1 model',
      statusMissing: 'your key — none',
      statusRejected: 'your key — rejected',
      statusQuotaExhausted: 'your key — quota done',
      previousRungHint: 'removing this key returns to {previousRungLabel}',
    },
    /** YourAiStrings (the earlier client). The photo consent dialog copy is `consent` above. */
    yourAi: {
      title: 'Your AI',
      intro:
        'AI Nutrition Coach works fully without AI. If you like, you can let a service you choose suggest foods from a photo — with your own key, your call.',
      rungHeading: 'Recognising a photo',
      rungNoneLabel: 'No AI',
      rungNoneHelp: 'Photos stay on this device. You pick a match or type it.',
      rungByokLabel: 'My own key',
      rungByokHelp: 'Photos go to the service you set below, using your key.',
      rungHostedLabel: 'Free hosted model',
      rungLocalLabel: 'Model on this device',
      rungUnavailable: 'Not available yet',
      byokHeading: 'Your service',
      endpointLabel: 'Endpoint',
      endpointHint: 'https://openrouter.ai/api/v1',
      endpointHelp:
        'Starts with https://. A model running on this device may use http://localhost.',
      endpointEmpty: 'Add the address of your service.',
      endpointNotAUrl: "That doesn't look like a web address.",
      endpointNotHttps: 'Use https:// — plain http:// works only for localhost.',
      endpointHasCredentials: 'Leave the username and password out of the address.',
      endpointHasQuery: 'Leave anything after "?" or "#" out of the address.',
      modelLabel: 'Model',
      modelHint: 'e.g. google/gemini-2.0-flash-exp:free',
      modelEmpty: 'Add the model name your service offers.',
      keyLabel: 'API key',
      keyHint: 'Paste your key',
      keyHelp:
        'Kept encrypted on this device. It is sent only to the endpoint above and is never shown again.',
      keyHelpWeb:
        'Kept encrypted in this browser, with your data — it can be read only after you unlock. It is sent only to the endpoint above and is never shown again.',
      keySavedTemplate: 'key saved • ends with ••••{last4}',
      keySavedPlain: 'key saved',
      keyNone: 'no key saved',
      keyReplaceHint: 'Paste a new key to replace it.',
      save: 'Save',
      removeKey: 'Remove key',
      saved: 'Saved.',
      keyRemoved: 'Key removed.',
      keyInvalid: 'That key has spaces or line breaks in it — paste it again.',
      testConnection: 'Test connection',
      testing: 'Checking…',
      testOk: 'Connected — the endpoint, model and key work.',
      testKeyRejected: "The service didn't accept this key.",
      testRateLimited: 'The service asks to slow down. Try again a little later.',
      testTimeout: "The service didn't answer in time.",
      testNetwork: "Couldn't reach the service.",
      testUnexpected: 'The service answered with an unexpected status ({status}).',
      testNotConfigured: 'Add an endpoint, a model and a key first.',
      testTooLarge: 'The service sent back far more than expected, so it was stopped.',
      testKeyOtherHost:
        'The saved key was entered for a different service. Paste the key for this one to test it.',
      keyOtherHost:
        'The saved key was entered for {host}, so it is not sent anywhere else. Paste the key for this endpoint to save it.',
      privacyHeading: 'Photos and consent',
      consentNone: "You haven't allowed any service to receive photos.",
      consentExplainer:
        'Before a photo is sent you are asked first. Photos are shrunk and stripped of location and camera details first.',
      consentRevoke: 'Revoke',
      consentRevokeFor: 'Revoke {host}',
      consentHosts: 'Services that may receive photos',
      docsHint: 'What this app stores and sends',
      askEveryPhotoLabel: 'Ask before every photo upload',
      askEveryPhotoHelp:
        'On: each photo needs its own yes. Off: you say yes once per service and photos then go without asking, until you revoke it below.',
    },
    /** Messages carried by a failed recognition (ported from the earlier rung and provider). */
    failure: {
      keyMissing: 'your own key is missing — open Settings → Your AI to enter it',
      keyRejected: 'your own key was rejected by the service — check it in Settings → Your AI',
      consentRequired: 'photo upload has not been agreed yet — see Settings → Your AI',
      endpointNotSet: 'The BYOK endpoint or model is not set — open Settings → Your AI.',
      endpointInvalid: 'The BYOK endpoint is not valid — open Settings → Your AI.',
      photoNotSendable: 'This photo format cannot be sent without its metadata.',
      responseTooLarge: 'the provider response was too large',
      timedOut: 'the request to {host} timed out',
      httpStatus: 'http {status} from {host}',
      couldNotConnect: 'could not connect to {host}',
      unreachable: 'the provider could not be reached',
      unavailableRung: 'Not available yet',
      /** Browsers report a CORS or Content-Security-Policy block exactly like an offline host. */
      blockedByBrowser:
        'If the service is up, the browser may have blocked the call: the service has to allow requests from this page (CORS), and this site’s Content-Security-Policy has to list its address. If you host this app yourself, add the address to AI_NUTRITION_COACH_CONNECT_SRC_EXTRA (see the self-hosting notes).',
    },
  },
  erase: {
    title: 'Erase everything on this device?',
    body: 'Your plates, coach notes, saved AI key and exports still on this device will be deleted for good. Copies you shared or downloaded elsewhere are not affected.',
    confirm: 'Erase',
    keep: 'Keep my data',
    failed:
      "Some data could not be erased. Please try again, or clear the app's storage in your device settings.",
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
    title: 'This week',
    dayByDay: 'Day by day',
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
    noteNoneRan: 'No line ran this week.',
    noteSome: '{names} ran this week.',
    noteQuietDays: '{name} was quiet on {days}.',
    noteQuietAll: '{name} stayed quiet all week.',
    noteQuietMany: '{names} were quiet this week.',
  },
  /** AboutNoticeScreen (app_en.arb): the one-time notice before the first passphrase screen. */
  about: {
    title: 'About this app',
    adults: 'AI Nutrition Coach is designed for adults.',
    ai: 'Photo recognition is off by default. If you turn it on, a photo is sent to a service you choose, and only after you say yes.',
    local: 'Your plates stay on this device, encrypted. There are no accounts and no analytics.',
    ok: 'Got it',
    privacyLink: 'What this app stores and sends',
  },
  /** WebSessionStrings (the earlier client): create passphrase, unlock, lock. */
  session: {
    label: 'Unlock your store',
    placeholder: 'Passphrase',
    unlock: 'Unlock',
    wrongPassphrase: 'That passphrase does not open this store.',
    unavailable:
      "This browser can't open the protected store. It needs a secure (https or localhost) page with site storage allowed. Check that, then try again.",
    unavailableInsecure:
      'AI Nutrition Coach needs a secure page (https:// or localhost) to protect your data. This address is plain http://, so the browser does not allow encryption here. Open the https:// address of this app instead; your data is not affected.',
    throttled: 'Please wait a moment before trying again.',
    inOtherTab:
      'AI Nutrition Coach is open in another tab. Lock or close it there, then try again here.',
    newerVersion:
      'This data was opened by a newer version of AI Nutrition Coach. Nothing is lost: reload the page to update, then unlock again.',
    forgot: 'Forgot your passphrase?',
    forgotBody:
      'It cannot be recovered: your history is encrypted with a key made from your passphrase, and nobody else has a copy. You can erase it and start over.',
    forgotAction: 'Erase and start over',
    createTitle: 'Protect your history',
    createExplain:
      'Choose a passphrase. It encrypts everything AI Nutrition Coach saves in this browser, and you enter it each time you open the app.',
    createWarning:
      'If you forget it, your data cannot be recovered — not by us, not by anyone. There is no reset link.',
    createPassphraseLabel: 'Passphrase',
    createConfirmLabel: 'Confirm passphrase',
    createAction: 'Create and unlock',
    tooShort: 'Use at least 10 characters.',
    tooRepetitive: 'Use a few different characters.',
    mismatch: "The two passphrases don't match.",
    lockAction: 'Lock',
    lockAfterLabel: 'Lock automatically after',
    lockAfterOptions: ['5 minutes', '15 minutes', '30 minutes', '1 hour'],
  },
  /** The browser cannot use its storage right now. Phase 4 state; the title and button are new. */
  storeUnavailable: {
    title: "Your store can't open right now",
    retry: 'Try again',
  },
  /** KeyLostStrings (the earlier client): the only way forward is the confirmed erase. */
  keyLost: {
    /** `enWebStoreUnreadableStrings`: the web store is incomplete or unreadable (the one the PWA shows). */
    unreadable: {
      title: "Your saved history can't be found",
      body: 'The protected store in this browser is incomplete or unreadable — for example after clearing site data. Reloading sometimes fixes it. If it does not, you can erase what is left and start over.',
      action: 'Erase local data and start over',
    },
    /** `enKeyLostStrings`. */
    lost: {
      title: "Your history can't be opened",
      body: 'This device no longer has the key that protects your saved history, so it cannot be read. This can happen after restoring from a backup or resetting the device. You can erase the unreadable data and start over.',
      action: 'Erase local data and start over',
    },
    /** `enStoreOpenFailedStrings`. */
    openFailed: {
      title: "Your history can't be opened right now",
      body: 'The protected store on this device could not be opened. Closing and reopening AI Nutrition Coach sometimes fixes this. If it keeps happening, you can erase the unreadable data and start over — this removes everything saved on this device.',
      action: 'Erase local data and start over',
    },
  },
  /** The durable-storage answer, shown once and quietly on Today after create or unlock. */
  durable: {
    persisted: 'Storage: protected from automatic clean-up.',
    notPersisted: 'Storage: the browser may clear this data if space runs low — export regularly.',
  },
  /** Today (the earlier client, app_en.arb). */
  today: {
    today: 'Today',
    yesterday: 'Yesterday',
    historyCannotLoad: "History can't load right now.",
    logAnother: 'Log another plate',
    logAnotherLink: '+ log another plate',
    plateRemoved: 'Plate removed.',
    plateRemoveFailed: 'Couldn’t remove it. Try again.',
    networkHeading: 'This week’s network',
    seeWeekNetwork: "See the week's network",
  },
  /** The Plate screen. */
  plate: {
    removeAction: 'Remove this plate',
  },
  /** The coach question key store (the earlier client): 3 anchors x 6 patterns, verbatim. */
  coachQuestions: {
    'post.resolve.vegLight': 'A handful of greens would round this plate out.',
    'post.resolve.proteinHeavy': 'A small bowl of greens or roasted veg would lighten this up.',
    'post.resolve.starchHeavy': 'Some veg on the side would balance this nicely.',
    'post.resolve.dairyLight': 'If you have a bit of dairy around, it would round this off.',
    'post.resolve.vegRich': 'A protein on the side would complete this plate.',
    'post.resolve.balanced': 'Nice plate — anything you would change next time?',
    'openPlate.vegLight': 'Greens would round this plate out.',
    'openPlate.proteinHeavy': 'A handful of greens or veg would lighten this up.',
    'openPlate.starchHeavy': 'Some veg on the side would balance this nicely.',
    'openPlate.dairyLight': 'A bit of dairy would round this off if you have some.',
    'openPlate.vegRich': 'A protein on the side would complete this plate.',
    'openPlate.balanced': 'A calm, varied plate — anything you want to add?',
    'depth.followUp.vegLight': 'A handful of greens would round this plate out.',
    'depth.followUp.proteinHeavy': 'A small bowl of greens or roasted veg would lighten this up.',
    'depth.followUp.starchHeavy': 'Some veg on the side would balance this nicely.',
    'depth.followUp.dairyLight': 'If you have a bit of dairy around, it would round this off.',
    'depth.followUp.vegRich': 'A protein on the side would complete this plate.',
    'depth.followUp.balanced': 'Nice plate — anything you would change next time?',
  },
  /** SettingsStrings (the earlier client) and the Settings rows of app_en.arb. */
  settings: {
    aiTier: 'AI tier',
    v2Tag: 'Not in v1',
    v2Spoken: 'not in version 1',
    title: 'Settings',
    backToSettings: 'Settings',
    rowAi: 'Your AI',
    rowData: 'Your data',
    rowDataSubtitle: 'export · lock · erase',
    rowPrivacy: 'Privacy',
    rowPrivacySubtitle: 'what is stored · what is sent',
    rowInstall: 'Install on your phone',
    rowInstallSubtitle: 'offline · own icon',
    rowAbout: 'About',
    rowAboutSubtitle: 'yours to run · open source',
  },
  /** YourDataStrings (the earlier client) and the Your data lines of app_en.arb. */
  yourData: {
    title: 'Your data',
    /** The unlocked posture of the web build: cipher named truthfully, key from the passphrase. */
    protection:
      'Encrypted at rest in this browser (ChaCha20-Poly1305). The key is made from your passphrase, held in memory only while unlocked and never stored — if you forget the passphrase, the data cannot be recovered. Your AI key and settings are kept inside the same encrypted store.',
    lockHeading: 'Lock',
    exportHeading: 'Export',
    eraseLabel: 'Erase local data',
    eraseExplain:
      'Removes your history, coach notes, saved AI key and any exports still on this device. Copies you shared or downloaded elsewhere are not affected. There is no other copy of your data, so this cannot be undone — export first if you want to keep one.',
    eraseButton: 'Erase all local data',
  },
  /** ExportStrings (the earlier client) and the export lines of app_en.arb. */
  export: {
    formatLabel: 'Format',
    formatCsv: 'CSV',
    formatJson: 'JSON',
    scopeLabel: 'Scope',
    scopeVisibleDay: 'Today',
    scopeWeek: 'This week',
    scopeAllHistory: 'All history',
    action: 'Export',
    working: 'Preparing your file…',
    exportedLine: 'exported:',
    cancelled: 'Nothing was exported.',
    lastExport: 'Last export: {date}',
    lastExportNever: 'Last export: never',
    /** ExportStrings.plaintextNote, then the Erase limit (checklist: Erase cannot delete a shared file). */
    plaintextNote: 'Exports are plain, unencrypted files: keep them somewhere you trust.',
    eraseLimitNote: 'Erasing your data cannot delete a file you have already downloaded or shared.',
    reminderStale:
      'It has been a while since your last export. A copy keeps your history safe if this device or browser ever loses it.',
    reminderNever:
      'You have not exported yet. A copy keeps your history safe if this device or browser ever loses it.',
    reminderNotNow: 'Not now',
    failedLocked: 'Unlock first, then export.',
    failedRead: 'Your plates could not be read just now. Nothing was lost; you can try again.',
    failedFormat: 'That file format is not available.',
    failedDelivery: 'export failed — try again',
  },
  /** Privacy ("What this app stores and sends"), app_en.arb. */
  privacy: {
    title: 'What this app stores and sends',
    intro: 'A plain list. Nothing here is hidden, and nothing about you is collected.',
    storedHeading: 'Stored on this device, encrypted',
    storedBody:
      'Your plates and the foods in them, the coach notes shown with them, your choices (such as your AI settings and these notices) and, if you add one, your AI key. All of it is encrypted on this device. The key is made from your passphrase and kept only while the app is unlocked.',
    leavesHeading: 'What leaves this device, and when',
    leavesBarcode:
      'Scanning a barcode: the barcode number is looked up on Open Food Facts, a public database with no account. Only the barcode is sent. Open Food Facts also sees the internet details any website sees: your internet address, your device or browser type and the address of this site (the browser adds it as the Origin header). You can turn this off below.',
    leavesPhoto:
      'Recognising a photo: only if you turned on your own AI and say yes. The photo (shrunk, with its location and camera details removed), a fixed instruction and the model name go to the service you chose. That service also sees your internet address and your device or browser type, and may keep requests under its own policy.',
    offToggle: 'Look up barcodes on Open Food Facts',
    offToggleOn: 'On: a scanned barcode is looked up online.',
    offToggleOff:
      'Off: only the offline catalog is used, and an unknown barcode opens manual entry.',
    offToggleUnasked: 'You will be asked the first time you scan a barcode.',
    serverHeading: 'What the server you got this app from sees',
    serverBody:
      'Nothing about you or your plates. The server only hands out the app’s files. Like any web server it may keep a short access log of page addresses and times, with client addresses shortened; in the standard self-host setup that log is off.',
    neverHeading: 'Never collected',
    neverBody:
      'No analytics, no tracking, no crash reports, no advertising and no accounts. Nothing is sent about how you use the app.',
    deleteHeading: 'Deleting your data',
    deleteBody:
      'To remove one plate, open it from Today and choose Remove this plate. To remove everything, use Erase all local data in Settings, Your data. Exports you saved or shared elsewhere are copies outside the app: delete them yourself.',
    exportHeading: 'Exporting',
    exportBody:
      'Settings, Your data, Export saves your plates as a CSV or JSON file. Exports are plain, unencrypted text files: keep them somewhere you trust.',
    sharedHeading: 'Shared devices',
    sharedBody:
      'Everyone who can open AI Nutrition Coach in this browser profile and knows the passphrase sees the same history; there are no separate in-app profiles. For separate histories use a separate device or a separate browser profile, each with its own passphrase.',
    saveFailed: 'Couldn’t save that. Unlock the app and try again.',
  },
  /** Install on your phone (app_en.arb, docs/pwa.md). */
  install: {
    title: 'Install on your phone',
    intro:
      'AI Nutrition Coach runs in your browser. Installing it adds an icon to your home screen and lets it open without a connection once it has loaded.',
    already: 'AI Nutrition Coach is already installed on this device.',
    button: 'Install',
    iosTitle: 'iPhone or iPad',
    iosSteps:
      'Open this page in Safari. Tap the Share button, choose “Add to Home Screen”, then tap “Add”.',
    androidTitle: 'Android',
    androidSteps:
      'In Chrome, open the menu (⋮) and choose “Install app” (or “Add to Home screen”). Your browser may also offer an Install button below.',
    desktopTitle: 'Computer',
    desktopSteps:
      'In Chrome or Edge, use the install icon at the right of the address bar, or open the browser menu and choose “Install AI Nutrition Coach”. Other browsers can simply keep using it in a tab.',
    changesTitle: 'What installing changes',
    changesOffline:
      'It opens without a connection once it has loaded once, and shows a calm line when a new version is ready.',
    changesIcon: 'It gets its own icon and opens without the browser bars.',
    changesStorage:
      'On iPhone, Safari may clear a website’s data if you have not visited it for a while; an app added to the Home Screen is not subject to that. The installed app keeps its own separate data, so install it before you start logging.',
    backupNote:
      'Your data lives only on this device, so export a copy from Your data now and then.',
  },
  /** About (app_en.arb) and ManagedOversightStrings (the earlier client). */
  aboutScreen: {
    title: 'About',
    v2Notice:
      'Family oversight is a v2 seam — not in v1. Read-only, support-not-surveillance, pending COPPA review.',
    openSource: 'yours to run · open source',
    licencesHeading: 'Open-source licences',
    licenceLink: 'Read the licence',
    licenceLinkFor: 'Read the licence: {name}',
    licences: [
      { id: 'app', name: 'AI Nutrition Coach', licence: 'MIT licence' },
      {
        id: 'fonts',
        name: 'Barlow and Barlow Condensed (fonts)',
        licence: 'SIL Open Font License 1.1',
      },
      {
        id: 'sqlite',
        name: 'SQLite3 Multiple Ciphers',
        licence: 'MIT licence (SQLite itself is in the public domain)',
      },
      { id: 'zxing', name: 'zxing-wasm', licence: 'MIT licence' },
      { id: 'zxingcpp', name: 'zxing-cpp (inside zxing-wasm)', licence: 'Apache licence 2.0' },
      { id: 'react', name: 'React', licence: 'MIT licence' },
    ],
  },
  sync: {
    onThisDevice: 'Saved on this device',
    noTransport: 'Your plates stay on this device. Nothing is sent anywhere.',
  },
} as const;

type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly Widen<U>[]
    : { -readonly [K in keyof T]: Widen<T[K]> };

/** The shape every locale must satisfy. */
export type Strings = Widen<typeof en>;
