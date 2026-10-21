/**
 * English copy. A typed nested object plus a tiny `fill`/`useStrings` (see ./index.ts).
 * The full l10n system (locale switching, plurals, extraction) arrives in phase 7; until then
 * every user-visible sentence lives here so no JSX carries a string literal of its own.
 *
 * Sources: the earlier client's message catalogue and coach strings.
 * Placeholders use `{name}` and are filled with `fill()`. A plural's `one` form uses `{count}` too,
 * not a literal 1: other languages pick `one` for other numbers (French uses it for 0 and 1).
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
  /**
   * The seed foods and the units their portions are counted in. `names` is keyed by the stable id
   * in `catalog/seed-foods.ts`; a unit's forms are the bare word (the number is added by
   * `quantityLabel`), picked by the plural rule of the upper end of the range.
   */
  foods: {
    names: {
      apple: 'Apple',
      banana: 'Banana',
      orange: 'Orange',
      spinach: 'Spinach',
      broccoli: 'Broccoli',
      carrot: 'Carrot',
      tomato: 'Tomato',
      avocado: 'Avocado',
      strawberries: 'Strawberries',
      salmon: 'Salmon',
      chickenBreast: 'Chicken Breast',
      eggs: 'Eggs',
      tofu: 'Tofu',
      beef: 'Beef',
      tuna: 'Tuna',
      lentils: 'Lentils',
      chickpeas: 'Chickpeas',
      rice: 'Rice',
      pasta: 'Pasta',
      bread: 'Bread',
      potato: 'Potato',
      quinoa: 'Quinoa',
      oats: 'Oats',
      sweetPotato: 'Sweet Potato',
      tortilla: 'Tortilla',
      yogurt: 'Yogurt',
      milk: 'Milk',
      cheese: 'Cheese',
      cottageCheese: 'Cottage Cheese',
      butter: 'Butter',
      greekYogurt: 'Greek Yogurt',
      kefir: 'Kefir',
      mixedNuts: 'Mixed Nuts',
      oliveOil: 'Olive Oil',
      darkChocolate: 'Dark Chocolate',
    },
    units: {
      piece: { one: 'piece', other: 'pieces' },
      cup: { one: 'cup', other: 'cups' },
      fist: { one: 'fist', other: 'fists' },
      can: { one: 'can', other: 'cans' },
      slice: { one: 'slice', other: 'slices' },
      tbsp: { one: 'tbsp', other: 'tbsp' },
      handful: { one: 'handful', other: 'handfuls' },
      square: { one: 'square', other: 'squares' },
      serving: { one: 'serving', other: 'servings' },
    },
    /** Gram presets on catalogue matches; the grams are shown by the UI beside the label. */
    portions: {
      small: 'Small portion',
      portion: '1 portion',
      large: 'Large portion',
      per100: '100 g',
      serving: '1 serving',
      pack: 'Whole pack',
    },
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
    describe: 'Describe',
    describeHint: 'Say it or write it',
    // Phase 5: photo capture (the earlier client).
    snapTitle: 'Snap a plate',
    takePhoto: 'Take a photo',
    choosePhoto: 'Choose a photo',
    aimHint: 'Aim at your plate, then tap the shutter.',
    noAiNote:
      'Photo recognition needs an AI connection. Without one, you can still pick or type what is on the plate.',
    noAiNoteInstance:
      'Photo recognition needs an AI connection. This server offers one: you can turn it on in Settings. Without it, you can still pick or type what is on the plate.',
    reading: 'Reading your plate…',
    retake: 'Retake',
    typeManually: 'Type it manually',
    noFoodsMatched: 'No foods matched — pick one below.',
    foundFoods: {
      one: 'Found {count} food on this plate.',
      other: 'Found {count} foods on this plate.',
    },
    nothingOnPlate: 'Nothing on this plate — pick one below.',
    searchUnavailablePick: "Search isn't available right now. Pick a closest match below.",
  },
  barcode: {
    title: 'Scan a barcode',
    checkingCamera: 'Checking camera permission…',
    startingCamera: 'Starting the camera…',
    holdDistance: 'Hold about 20 cm away and fit the barcode in the box.',
    torch: 'Torch',
    typeBarcode: 'Type the barcode',
    barcodeDigits: 'Barcode digits',
    lookUpBarcode: 'Look up',
    digitsLength: 'A barcode has 8, 12 or 13 digits. Check what you typed.',
    digitsChecksum: "These digits don't add up. Check them against the pack.",
    slowHint: 'Taking a while? You can type the digits printed under the barcode.',
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
    lookedLike: { one: 'Looks like {count} food', other: 'Looks like {count} foods' },
    tickHint: 'All are ticked. Untick anything that is not on the plate.',
    nothingMatched: 'Nothing matched',
    nothingOnPlate: 'Nothing on this plate',
    pickOrType: 'Pick a closest match or type the food manually.',
    quotaTitle: "the free quota is done — choose what you'd like to do.",
    quotaHint: 'You can still pick a closest match or type it manually.',
    failureTitle: "Search isn't available right now.",
    noAiTitle: 'No AI connected',
    noAiHint:
      "Photos aren't analysed without AI. Pick a recent food, type it, or set up AI in Settings.",
    noAiHintInstance:
      "Photos aren't analysed without AI. Pick a recent food, type it, or turn on the AI this server offers in Settings.",
    setUpAi: 'Set up AI',
    recognizedLabel: 'Recognized foods',
    closestMatches: 'Closest matches',
    confidenceLikely: 'likely',
    confidenceMaybe: 'maybe',
    customFoodName: 'Custom food name',
    logCustomFood: 'Log custom food',
    typeNameFirst: 'Type a name first',
    describedLooked: {
      one: 'Found {count} food in your words',
      other: 'Found {count} foods in your words',
    },
    describedHint: 'All are ticked. Check the amounts and untick anything you did not eat.',
    describedUnmatched: 'No match for: {names}. You can add those with a custom food below.',
  },
  describe: {
    title: 'Describe a meal',
    intro: 'Write what you ate, or say it, in your own words.',
    fieldLabel: 'What did you eat?',
    placeholder: 'Two eggs, toast with butter, a coffee with milk',
    limit: 'Up to {max} characters.',
    dictation: "You can also use your keyboard's microphone to dictate.",
    find: 'Find these foods',
    finding: 'Reading…',
    typeInstead: 'Type it instead',
    matchHere: 'Match on this device',
    noAiNote:
      'No AI is set up, so your words are matched with the food list on this device. Nothing is sent anywhere.',
    aiNoteByok:
      'Your words are sent to {host} to be understood. You can change this in Settings → Your AI.',
    aiNoteInstance:
      'Your words are sent to this server ({host}), which passes them to {label}. You can change this in Settings → Your AI.',
    consentTitle: 'Send your words to {host}?',
    consentTitleInstance: 'Send your words to this server?',
    consentSent:
      'What is sent: the text you write or dictate, or a short voice recording (30 seconds at most) that is turned into text, and a fixed instruction asking which foods it mentions and in which language to answer (English or French, the app language). Nothing else: not your name, your history or your other plates. This app does not store the recording. AI Nutrition Coach does not run that service and never sees your words.',
    consentSentInstance:
      'What is sent: the text you write or dictate, or a short voice recording (30 seconds at most) that is turned into text, and a fixed instruction asking which foods it mentions and in which language to answer (English or French, the app language). It goes to this server ({host}), which adds its own AI key and passes it on to {label}. Nothing else: not your name, your history or your other plates. This app does not store the recording.',
    consentVisible:
      'Also visible to {host}: your internet address, your browser type and the address of this site, as with any website.',
    consentVisibleInstance:
      'Also visible to whoever runs {host}: your internet address and your browser type, as with any website. {label} receives your words from this server, not from your device.',
    consentRetention:
      "{host} may keep requests under its own terms: check your provider's data policy.",
    consentRetentionInstance:
      '{label} may keep requests under its own terms, and whoever runs this server chose it: ask them about its data policy.',
    consentChange: 'You can change this any time in Settings → Your AI.',
    consentAllow: 'Allow {host}',
    consentAllowInstance: 'Allow this server',
    consentDecline: 'Not now',
    declined: 'Nothing was sent. Your words are matched on this device instead.',
    busy: 'The AI is busy. Try again in a moment, or match on this device.',
    failed: 'The AI could not read that just now. Try again, or match on this device.',
    nothingFound: 'No food found in that. Try other words, or use Type it.',
    empty: 'Write or say what you ate first.',
    talk: 'Talk',
    recordHint: 'Tap Talk, say what you ate, then tap the button again.',
    listening: 'Listening. Tap the button again when you are done.',
    askFirstNote:
      'Before anything is sent to an AI you are asked first. Without it, your words are matched on this device.',
    transcribing: 'Turning your voice into text…',
    transcribed: 'Here is what was heard. Check it, then find the foods.',
    heardNothing: 'Nothing was heard. You can try again, or type instead.',
    micDenied:
      'Microphone access is off for this site. You can turn it on in your browser settings, or type instead.',
    micUnavailable:
      "No microphone is available here. You can type, or use your keyboard's microphone.",
    voiceBusy: 'The AI is busy. Try again in a moment, or type instead.',
    voiceFailed:
      'That recording could not be turned into text. You can try again, or type instead.',
    voiceKey: 'The service did not accept your key. Check it in Settings → Your AI.',
    voiceTooLong: 'That recording is too long. Try a shorter one, or type instead.',
    voiceUnsupported:
      'This service cannot turn voice into text, so the microphone button is hidden. You can type instead.',
    recordingLabel: 'Voice recording',
  },
  consent: {
    title: 'Send this photo to {host}?',
    whatIsSent:
      'What is sent: the photo, shrunk, with its location and camera details removed, a fixed instruction asking which foods are on the plate and in which language to answer (English or French, the app language), and the model name you chose. AI Nutrition Coach does not run that service and never sees the photo.',
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
    instanceTitle: 'Send this photo to this server?',
    instanceWhatIsSent:
      'What is sent: the photo, shrunk, with its location and camera details removed, and a fixed instruction asking which foods are on the plate and in which language to answer (English or French, the app language). The photo goes to this server ({host}), which adds its own AI key and passes it on to {via}. AI Nutrition Coach, the project, does not run this server or that service and never sees the photo.',
    instanceAlsoVisible:
      'Also visible to whoever runs {host}: your internet address and your browser type, as with any website. {via} receives the photo from this server, not from your device.',
    instanceRetention:
      '{via} may keep requests under its own terms, and whoever runs this server chose it: ask them about its data policy. This server’s software does not store the photo.',
    instanceAllow: 'Allow this server',
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
      thisServerActive: 'this server — {label}',
      thisServerOff: 'this server — not offered',
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
      rungInstanceLabel: 'Provided by this server',
      rungInstanceHelp: 'No key needed. Photos go to this server, which sends them on to {label}.',
      instanceHeading: 'AI on this server',
      instanceExplain:
        'The person who runs this server ({host}) keeps an AI key on it, so you need none. A photo goes first to this server and from there to {label}, which reads it and answers. You are asked before each photo is sent, unless you turn that off below.',
      instanceModel: 'Model: {model}',
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
      voiceModelLabel: 'Voice model',
      voiceModelHint: 'e.g. whisper-1',
      voiceModelHelp:
        'Turns a short recording into text for Describe, at the same endpoint. Leave it empty for whisper-1. If your service has no such model, the microphone button stays hidden.',
      instanceVoice: 'Voice to text: {model}',
      describeHeading: 'Describing a meal with AI',
      describeIntro:
        'When you describe a meal, the words you write or say can be sent to an AI to be understood. That is a different thing from a photo or from coaching, so it has its own switch.',
      describeSwitch: 'Let the AI read what I describe',
      describeSwitchHelpOff:
        'Off: Describe matches your words with the food list on this device and nothing is sent.',
      describeSwitchHelpOn:
        'On: the text you write or dictate, or a short voice recording turned into text, goes to the destination below. You can turn this off at any time.',
      describeDestinationInstance: 'Goes to {host}, this server, which passes it on to {label}.',
      describeDestinationByok: 'Goes to {host}, the service you chose.',
      describeNeedsAi:
        'Without an AI chosen above, Describe works on this device and nothing is sent.',
      describeSent:
        'What is sent: only that text (500 characters at most) or recording (30 seconds at most, turned into text and not stored by this app), and a fixed instruction. Never your name, your history, your other plates or your photos.',
      coachingHeading: 'AI coaching',
      coachingIntro:
        'The coach can write its notes and answer your questions with the help of an AI. That sends some of your meals to that AI, which is a different thing from sending a photo, so it has its own switch.',
      coachingSwitch: 'Let the AI write coach notes and answer questions',
      coachingSwitchHelpOff:
        'Off: the coach writes its built-in notes and nothing about your meals is sent.',
      coachingSwitchHelpOn:
        'On: after you log a plate, and when you ask the coach, your meal data goes to the destination below. You can turn this off at any time.',
      coachingSent:
        'What is sent: the names and food groups of your foods, their weights and nutrient totals, the dates of the days involved (no times), the meal slot, how many plates, your profile if you filled it in (goal, diet, allergies, age band, sex, activity), and what you type in Ask the coach along with the earlier answers of that conversation. Never your photos, never your passphrase. With nutrition numbers turned off, weights and nutrients are left out.',
      coachingDestinationInstance:
        'Destination: {host}, this server, which passes it on to {label}.',
      coachingDestinationByok: 'Destination: {host}, the service you chose.',
      coachingNeedsAi:
        'Choose an AI above first: the one this server offers, or your own key. Until then nothing is sent.',
      coachingSaveFailed: 'Could not keep that. Unlock the app and try again.',
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
      httpStatus: 'error {status} from {host}',
      couldNotConnect: 'could not connect to {host}',
      unreachable: 'the provider could not be reached',
      unavailableRung: 'Not available yet',
      instanceUnavailable:
        'This server does not offer AI right now. You can choose another option in Settings → Your AI.',
      instanceBusy: 'The AI on this server is busy. Try again in a moment.',
      instanceError: 'The AI on this server did not answer. Try again in a moment.',
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
    aiMark: 'Written by AI',
  },
  chip: {
    onDevice: 'On this device',
    pending: 'Pending',
    synced: 'Synced',
    retryLater: 'Retry later',
    /** Page-level sync announcements (aggregate, never per plate). */
    allSynced: 'All plates synced',
    waiting: { one: '{count} plate waiting to sync', other: '{count} plates waiting to sync' },
    retryLaterPlates: {
      one: '{count} plate will retry later',
      other: '{count} plates will retry later',
    },
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
    plates: { zero: 'No plates', one: '{count} plate', other: '{count} plates' },
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
    askCoachLink: 'Ask the coach',
    review: {
      title: 'The week, in short',
      daysLogged: {
        zero: 'No days with meals logged yet',
        one: '{count} day with meals logged',
        other: '{count} days with meals logged',
      },
      averagesTitle: 'Daily average',
      averagesNote: {
        one: 'Averaged over the {count} day that has weights and nutrition data.',
        other: 'Averaged over the {count} days that have weights and nutrition data.',
      },
      wentWellTitle: 'What went well',
      tryTitle: 'One thing to try',
      positives: {
        vegMostDays: 'Veg or fruit came up on {days} of {of} logged days.',
        proteinSteady: 'Protein averaged {approx}{g} g a day, a steady amount.',
        fibreSteady: 'Fibre averaged {approx}{g} g a day, a steady amount.',
        saltModerate: 'Salt averaged {approx}{g} g a day, on the lighter side.',
        sugarsModerate: 'Sugars averaged {approx}{g} g a day, on the lighter side.',
        variedWeek: 'Veg, protein, starch and dairy each showed up on at least two days.',
      },
      suggestions: {
        moreVeg:
          'Veg or fruit came up on {days} of {of} logged days. Could a handful join one more meal next week?',
        moreProtein:
          'Protein averaged {approx}{g} g a day. Eggs, beans, tofu or fish at lunch could add some next week.',
        moreFibre:
          'Fibre averaged {approx}{g} g a day. Beans, oats or wholegrain bread are easy places to start.',
        easeSalt:
          'Salt averaged {approx}{g} g a day. Tasting before salting is a gentle place to start.',
        easeSugars:
          'Sugars averaged {approx}{g} g a day. Fruit or plain yogurt in place of one sweet item is a small change.',
      },
      ai: {
        button: 'Ask the coach about this week',
        heading: 'The coach, on this week',
        reading: 'The coach is reading your week…',
        mark: 'Written by AI',
        busy: 'The AI is busy. Try again in a moment.',
        failure: 'The coach could not answer just now. You can try again.',
        unsure: 'The coach did not find words it was happy with. You can try again.',
        hiddenByNumbers:
          'This answer quotes amounts, which are hidden while nutrition numbers are turned off.',
        needsSetup:
          'To ask the coach about your week, choose an AI and turn on AI coaching in Settings, Your AI.',
        needsConsent:
          'To ask the coach about your week, turn on AI coaching in Settings, Your AI. Your meals are sent only after you say yes.',
        open: 'Open Your AI',
        note: 'This sends the week’s counts, daily averages and daily guide to {host}, with your profile if you filled it in. The review above stays as it is.',
      },
    },
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
    askCoachLink: 'Ask the coach',
  },
  /** Nutrition numbers (docs/adr/0006): grams, previews, Nutrient Bars. */
  nutrition: {
    sectionTitle: 'Nutrition',
    sectionTitleToday: 'Today’s nutrition',
    gramsLabel: 'Grams',
    gramsInvalid: 'Type a weight from 0.1 to 5000 g.',
    /** A weight the person typed or weighed. */
    weight: '{value} g',
    /** A weight that is a guess (a preset, a photo): never shown as exact. */
    weightApprox: '≈{value} g',
    /** The one-line preview under the grams field. */
    previewLead: '≈ {parts}',
    previewEnergy: '{value} kcal',
    previewProtein: '{value} g protein',
    previewSugars: '{value} g sugars',
    valueKcal: '{value} kcal',
    valueGrams: '{value} g',
    /** An estimated value: the number carries a tilde. */
    estimatedValue: '~{value}',
    names: {
      energyKcal: 'Energy',
      protein: 'Protein',
      carbohydrate: 'Carbohydrate',
      sugars: 'of which sugars',
      fat: 'Fat',
      saturatedFat: 'of which saturates',
      fibre: 'Fibre',
      salt: 'Salt',
    },
    reference: 'about {percent}% of the EU reference intake ({reference})',
    /** The same, when a profile drives the guide. */
    referencePersonal: 'about {percent}% of your daily guide ({reference})',
    referenceUnderOnePersonal: 'less than 1% of your daily guide ({reference})',
    /** A value above zero that rounds to 0%. */
    referenceUnderOne: 'less than 1% of the EU reference intake ({reference})',
    barsLabel: 'Nutrient amounts against reference intakes',
    coverage: {
      one: 'Based on {count} food with a weight and nutrition data; {missing} without.',
      other: 'Based on {count} foods with a weight and nutrition data; {missing} without.',
    },
    whatAre: 'What are reference intakes?',
    whatAreBody:
      'Reference intakes are the daily amounts set in EU Regulation 1169/2011 for an average adult eating 2000 kcal a day. Fibre has no EU value; 25 g is a general recommendation. Your own needs may differ, and the bars are information, not a target.',
    whatAreBodyPersonal:
      'The bars use your daily guide, worked out from the profile you chose in Settings: energy from European (EFSA) reference values for your age range, sex and activity, and the other nutrients scaled from it. It is an estimate for an average adult, not advice, and the bars are information, not a target. Without a profile, the EU reference intakes are used (2000 kcal a day).',
  },
  /** Eating-disorder support: always available, calm, one canonical organisation per language. */
  support: {
    line: 'If food or weight worries take up a lot of your thoughts, talking to someone can help.',
    linkLabel: 'Beat, the UK eating disorder charity',
    newTab: '(opens in a new tab)',
  },
  profile: {
    title: 'Profile',
    intro:
      'Optional. It only tunes the daily guide and the coach. It stays encrypted on this device.',
    notSet: 'Not set',
    ageBand: 'Age range',
    sex: 'Sex',
    activity: 'Activity',
    goal: 'Goal',
    diet: 'Diet',
    sexOptions: { female: 'Female', male: 'Male', unspecified: 'Prefer not to say' },
    activityOptions: { low: 'Mostly seated', moderate: 'Some movement', high: 'Very active' },
    goalOptions: {
      eatBetter: 'Eat better',
      maintain: 'Stay as I am',
      lose: 'Lose a little weight',
      gain: 'Gain a little weight',
    },
    dietOptions: {
      omnivore: 'Everything',
      vegetarian: 'Vegetarian',
      vegan: 'Vegan',
      pescatarian: 'Fish, no meat',
    },
    allergiesLabel: 'Allergies or foods to avoid',
    allergiesHelp: 'Type one at a time, then add it.',
    allergyAdd: 'Add',
    allergyRemove: 'Remove {tag}',
    guideComplete: 'Your daily guide is about {energy} kcal.',
    guideIncomplete:
      'Set sex, age range and activity to tailor the daily guide. Until then the EU reference intake is used.',
    goalNote: 'A goal only moves the energy guide by 10 %, and never below 1500 kcal.',
    clear: 'Clear profile',
    cleared: 'Profile cleared.',
    saveFailed: 'That did not save just now. Nothing changed.',
  },
  nutritionSettings: {
    title: 'Nutrition',
    switchTitle: 'Show nutrition numbers',
    switchHelp:
      'If numbers about food feel stressful, you can hide nutrient values and bars. Weights and your meals stay.',
    saveFailed: 'That did not save just now. The switch stays where it was.',
  },
  /** The Plate screen. */
  plate: {
    removeAction: 'Remove this plate',
  },
  /** The coach question key store (the earlier client): 3 anchors x 6 patterns, verbatim. */
  /** How a share of the day's reference reads inside a coach note. */
  coachShare: { around: 'around {pct}%', underOne: 'less than 1%' },
  /** Ask the coach (optional AI chat) and the AI coaching copy. */
  askCoach: {
    title: 'Ask the coach',
    intro:
      'Ask about your last seven days of meals. The AI sees the names of your foods, their food groups, the nutrient totals of each day and your profile, never your photos. This is not medical advice.',
    memory:
      'This conversation is kept only while the app is unlocked. It is not saved or exported, and it is gone when you lock the app.',
    offTitle: 'The AI coach is off',
    offNoAi:
      'Ask the coach needs an AI. Choose one, and say yes to AI coaching, in Settings, Your AI. Until then the coach keeps writing its built-in notes.',
    offNeedsConsent:
      'Ask the coach sends your meals to {host}, so it needs your yes first. You can give it in Settings, Your AI.',
    openYourAi: 'Open Your AI',
    inputLabel: 'Your question',
    inputHint: 'For example: is my week varied enough?',
    counter: '{count} of {max} characters',
    send: 'Ask',
    thinking: 'The coach is thinking…',
    conversation: 'Conversation',
    you: 'You',
    coach: 'The coach',
    aiMark: 'Written by AI',
    asked: '{count} of {max} questions asked',
    limit: 'That is the end of this conversation: {max} questions. Start a new one to keep going.',
    newConversation: 'Start a new conversation',
    busy: 'The AI is busy. Try again in a moment.',
    failure: 'The coach could not answer just now. Your question is still in the box.',
    consent: 'AI coaching is switched off. Turn it on in Settings, Your AI.',
    unavailable: 'No AI is set up right now. Choose one in Settings, Your AI.',
    unsure: 'I could not put that into words I am happy with. Could you ask it another way?',
    supportEating:
      'It sounds like food or your body may be weighing on you. I cannot give advice on that.',
    supportMedical:
      'That sounds like something to check with a doctor or a pharmacist. I cannot give advice on symptoms.',
    supportUrgent:
      'This could be urgent. Please call your local emergency number now: 112 in the EU, 999 in the UK, 911 in the US, 15 or 112 in France. I cannot give advice on symptoms.',
    supportSelfHarm:
      'I am sorry you are feeling this way, and I am glad you said it. You do not have to carry it alone. In France you can call 3114, the national suicide prevention line, free and open day and night. In the UK, Samaritans are on 116 123, free, any time. In the US, call or text 988. Elsewhere, please call your local emergency number or a crisis line near you.',
    hiddenByNumbers:
      'This answer quotes amounts, which are hidden while nutrition numbers are turned off.',
  },
  coachQuestions: {
    'post.resolve.vegLight':
      'No veg or fruit so far today. Could a handful join this meal, even on the side?',
    'post.resolve.proteinHeavy':
      'Quite a bit of protein here. Would a little more veg alongside suit you?',
    'post.resolve.starchHeavy':
      'Plenty of starch here. Is there a bit more veg you could tuck in beside it?',
    'post.resolve.dairyLight': 'Would a spoonful of yogurt or a little cheese fit with this?',
    'post.resolve.vegRich':
      'Lots of veg here. Is there some protein nearby, like eggs, beans or fish?',
    'post.resolve.balanced': 'Nice plate — anything you would change next time?',
    'post.resolve.breakfastSimple': 'A simple start. What usually keeps you going until lunch?',
    'post.resolve.proteinMissingDay':
      'No protein logged yet today. Could eggs, beans, tofu or fish fit into this meal?',
    'openPlate.vegLight': 'No veg or fruit logged yet today. Could this meal have a handful?',
    'openPlate.proteinHeavy': 'Protein-forward so far. A side of veg would sit well.',
    'openPlate.starchHeavy': 'Starch-forward so far. A side of veg would sit well.',
    'openPlate.dairyLight': 'A bit of dairy would round this off if you have some.',
    'openPlate.vegRich': 'Plenty of veg so far. Some protein would go well with it.',
    'openPlate.balanced': 'A calm, varied day so far. Anything you want to add?',
    'openPlate.breakfastSimple': 'A simple breakfast can be enough. What do you usually reach for?',
    'openPlate.proteinMissingDay':
      'No protein logged yet today. Could this meal have eggs, beans, tofu or fish?',
    'depth.followUp.vegLight': 'Frozen peas or a bagged salad take two minutes and keep for days.',
    'depth.followUp.proteinHeavy':
      'Frozen spinach or a tray of roasted veg goes alongside almost anything.',
    'depth.followUp.starchHeavy':
      'A handful of frozen veg stirred into the pasta or rice pot for the last few minutes needs no extra pan.',
    'depth.followUp.dairyLight':
      'Plain yogurt or a little grated cheese is easy to add at the table.',
    'depth.followUp.vegRich':
      'A boiled egg, a tin of beans or some tofu turns a veg plate into a meal in a few minutes.',
    'depth.followUp.balanced':
      'If this one worked, cooking a bit extra means tomorrow’s lunch is already sorted.',
    'depth.followUp.breakfastSimple':
      'Eggs, yogurt or a handful of nuts tend to last longer than bread or cereal alone, if you ever want a change.',
    'depth.followUp.proteinMissingDay':
      'Tinned fish, eggs and canned beans keep well and need no cooking.',
    'post.resolve.sugarsHighItem':
      'This {food} has {approx}{g} g of sugars, {share} of a day’s guide. Is it a treat today, or a habit worth a look?',
    'post.resolve.saltHighPlate':
      'This plate has {approx}{g} g of salt, {share} of a day’s guide. Might the rest of the day go lighter on salt?',
    'post.resolve.satFatHighPlate':
      'This plate has {approx}{g} g of saturated fat, {share} of a day’s guide. Would something lighter on it suit your next meal?',
    'post.resolve.energyDenseSnack':
      'That snack comes to {approx}{kcal} kcal, with no protein or veg alongside. Would some fruit or a glass of milk sit well with it?',
    'post.resolve.proteinLowDay':
      'Protein so far today is {approx}{g} g, {share} of a day’s guide. Could eggs, beans, tofu or fish find a place in your next meal?',
    'post.resolve.fibreLowDay':
      'Fibre so far today is {approx}{g} g, {share} of a day’s guide. Would a piece of fruit or a handful of nuts fit in tonight, or at breakfast tomorrow?',
    'openPlate.proteinLowDay':
      'Protein so far today is {approx}{g} g, {share} of a day’s guide. Could this meal have eggs, beans, tofu or fish?',
    'openPlate.fibreLowDay':
      'Fibre so far today is {approx}{g} g, {share} of a day’s guide. Could this meal have beans, wholegrain bread or fruit?',
    'depth.followUp.sugarsHighItem':
      'Plain yogurt with a few pieces of fruit, or sweetening it yourself with a spoon of jam, lets you choose how sweet it is.',
    'depth.followUp.saltHighPlate':
      'Tasting before adding salt, and rinsing tinned beans or vegetables, quietly lowers it without changing the meal.',
    'depth.followUp.satFatHighPlate':
      'Olive oil or a little less cheese or butter on the next plate shifts the balance, and a handful of nuts is a good swap for a snack.',
    'depth.followUp.energyDenseSnack':
      'A piece of fruit with a few nuts, or yogurt, is as quick as a biscuit and lasts longer.',
    'depth.followUp.proteinLowDay':
      'Tinned fish, eggs, canned beans or a pot of plain yogurt add protein in two minutes and need no cooking.',
    'depth.followUp.fibreLowDay':
      'Porridge oats, a tin of lentils or chickpeas, or an apple with its skin are easy sources of fibre.',
    'post.resolve.proteinLowDay.none':
      'No protein logged so far today. Could eggs, beans, tofu or fish find a place in your next meal?',
    'post.resolve.fibreLowDay.none':
      'No fibre logged so far today. Would a piece of fruit or a handful of nuts fit in tonight, or at breakfast tomorrow?',
    'openPlate.proteinLowDay.none':
      'No protein logged so far today. Could this meal have eggs, beans, tofu or fish?',
    'openPlate.fibreLowDay.none':
      'No fibre logged so far today. Could this meal have beans, wholegrain bread or fruit?',
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
    rowNutrition: 'Nutrition',
    rowNutritionSubtitle: 'show or hide numbers',
    rowProfile: 'Profile',
    rowProfileSubtitle: 'optional · tunes the daily guide',
    rowLanguage: 'Language',
    rowLanguageSubtitle: 'match your device · or choose',
    rowInstall: 'Install on your phone',
    rowInstallSubtitle: 'offline · own icon',
    rowAbout: 'About',
    rowAboutSubtitle: 'yours to run · open source',
  },
  language: {
    title: 'Language',
    groupLabel: 'App language',
    matchDevice: 'Match my device',
    explain:
      'The app follows your browser’s language until you pick one. Your pick is kept with your data on this device.',
    note: 'The chosen language is also kept as a plain note in this browser, so the screens before the unlock can use it. It reveals only the language.',
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
      'Your plates and the foods in them, the coach notes shown with them, your choices (such as your AI settings and these notices) and, if you add one, your AI key. All of it is encrypted on this device. The key is made from your passphrase and kept only while the app is unlocked. The one exception is your chosen language, which is also kept as a plain note on this device so the unlock screen can use it; it reveals nothing else.',
    leavesHeading: 'What leaves this device, and when',
    leavesBarcode:
      'Scanning a barcode: the barcode number is looked up on Open Food Facts, a public database with no account. Only the barcode is sent. Open Food Facts also sees the internet details any website sees: your internet address, your device or browser type and the address of this site (the browser adds it as the Origin header). You can turn this off below.',
    leavesPhoto:
      'Recognising a photo: only if you turned on your own AI and say yes. The photo (shrunk, with its location and camera details removed), a fixed instruction (which also says in which language to answer, the app language) and the model name go to the service you chose. That service also sees your internet address and your device or browser type, and may keep requests under its own policy.',
    leavesInstance:
      'If the person who runs this server turned on its AI, a photo you agree to send goes to this server first, which adds its own AI key and passes it on to the provider named in Settings, Your AI. This server sees your internet address and your browser type; the provider sees the photo and the instruction, coming from this server. The key never reaches your browser.',
    leavesCoaching:
      'AI coaching: only if you turned it on in Settings, Your AI. The coach then sends the AI you chose (this server’s, which passes it on to its provider, or your own key’s service) the names and food groups of your foods, their weights and nutrient totals, the dates of the days involved (no times), the meal slot, the number of plates, the week’s counts and averages and, if you filled it in, your profile. Weights and nutrients are left out while nutrition numbers are turned off. Never photos, never your passphrase. A question you type in Ask the coach goes with it, along with the earlier answers of that conversation, which is kept in memory only until you lock the app. Notes the AI writes are stored on this device like any other coach note.',
    offToggle: 'Look up barcodes on Open Food Facts',
    offToggleOn: 'On: a scanned barcode is looked up online.',
    offToggleOff:
      'Off: only the offline catalog is used, and an unknown barcode opens manual entry.',
    offToggleUnasked: 'You will be asked the first time you scan a barcode.',
    serverHeading: 'What the server you got this app from sees',
    serverBody:
      'Nothing about you or your plates. The server only hands out the app’s files. Like any web server it may keep a short access log of page addresses and times, with client addresses shortened; in the standard self-host setup that log is off.',
    serverInstance:
      'The one exception is a photo you choose to send through the AI this server offers (see above): it passes through this server on its way to the provider, and is not stored there.',
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
      {
        id: 'ciqual',
        name: 'Ciqual French food composition table (Anses, 2025)',
        licence: 'Etalab Open Licence 2.0',
      },
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
