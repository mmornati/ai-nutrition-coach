import type { Strings } from './en';

/**
 * French copy: the same keys as `en.ts` (typed `Strings`, so a missing or extra key fails `tsc`).
 * Translated for meaning, in the same calm, non-judgmental voice, addressing the reader as
 * « vous ». The metro vocabulary stays fixed: ligne, station, arrêt, sans arrêt, réseau.
 *
 * French typography: a narrow no-break space (U+202F) before `: ; ? !` and inside « »,
 * the typographic apostrophe ’ and the ellipsis …; `fr.test.ts` enforces it.
 * Copy with legal or privacy weight (consent, privacy, About, erase) is a faithful translation:
 * nothing is softened or dropped.
 */
export const fr: Strings = {
  common: {
    close: 'Fermer',
    back: 'Retour',
    logging: 'Enregistrement…',
    log: 'Noter',
    logFailed: 'L’enregistrement n’a pas abouti. Rien n’est perdu ; vous pouvez réessayer.',
  },
  groups: {
    vegFruit: 'Fruits & légumes',
    protein: 'Protéines',
    starch: 'Féculents',
    dairy: 'Produits laitiers',
    other: 'Autres',
  },
  slots: {
    breakfast: 'Petit-déjeuner',
    lunch: 'Déjeuner',
    dinner: 'Dîner',
    late: 'Nuit',
  },
  lineBar: {
    label: 'Lignes à cette station',
    groupPassed: '{name} · sans arrêt',
  },
  entries: {
    label: 'Dans l’assiette',
  },
  portion: {
    label: 'Portion',
    oneServing: '~1 portion',
    labelFor: '{label} : {name}',
  },
  foods: {
    names: {
      apple: 'Pomme',
      banana: 'Banane',
      orange: 'Orange',
      spinach: 'Épinards',
      broccoli: 'Brocoli',
      carrot: 'Carotte',
      tomato: 'Tomate',
      avocado: 'Avocat',
      strawberries: 'Fraises',
      salmon: 'Saumon',
      chickenBreast: 'Filet de poulet',
      eggs: 'Œufs',
      tofu: 'Tofu',
      beef: 'Bœuf',
      tuna: 'Thon',
      lentils: 'Lentilles',
      chickpeas: 'Pois chiches',
      rice: 'Riz',
      pasta: 'Pâtes',
      bread: 'Pain',
      potato: 'Pomme de terre',
      quinoa: 'Quinoa',
      oats: 'Flocons d’avoine',
      sweetPotato: 'Patate douce',
      tortilla: 'Tortilla',
      yogurt: 'Yaourt',
      milk: 'Lait',
      cheese: 'Fromage',
      cottageCheese: 'Cottage cheese',
      butter: 'Beurre',
      greekYogurt: 'Yaourt grec',
      kefir: 'Kéfir',
      mixedNuts: 'Mélange de noix',
      oliveOil: 'Huile d’olive',
      darkChocolate: 'Chocolat noir',
    },
    units: {
      piece: { one: 'pièce', other: 'pièces' },
      cup: { one: 'tasse', other: 'tasses' },
      fist: { one: 'poing', other: 'poings' },
      can: { one: 'boîte', other: 'boîtes' },
      slice: { one: 'tranche', other: 'tranches' },
      tbsp: { one: 'c. à soupe', other: 'c. à soupe' },
      handful: { one: 'poignée', other: 'poignées' },
      square: { one: 'carré', other: 'carrés' },
      serving: { one: 'portion', other: 'portions' },
    },
    portions: {
      small: 'Petite portion',
      portion: '1 portion',
      large: 'Grande portion',
      per100: '100 g',
      serving: '1 portion',
      pack: 'Paquet entier',
    },
  },
  camera: {
    deniedTitle: 'Caméra refusée — saisissez à la main',
    deniedBody: 'Vous pouvez toujours noter une assiette depuis l’écran de saisie manuelle.',
    unavailableTitle: 'Caméra indisponible — saisissez à la main',
    unavailableBody: 'Impossible de démarrer la caméra. La saisie manuelle fonctionne toujours.',
  },
  capture: {
    title: 'Noter une assiette',
    nextStation: 'Prochaine station : {meal}',
    snapshot: 'Photo',
    snapshotHint: 'Une seule photo de l’assiette suffit.',
    barcode: 'Code-barres',
    barcodeHint: 'Produit emballé',
    type: 'Saisir',
    typeHint: 'Fonctionne hors ligne',
    snapTitle: 'Photographier une assiette',
    takePhoto: 'Prendre une photo',
    choosePhoto: 'Choisir une photo',
    aimHint: 'Cadrez votre assiette, puis touchez le déclencheur.',
    noAiNote:
      'La reconnaissance de photo demande une connexion à une IA. Sans elle, vous pouvez toujours choisir ou saisir ce qui se trouve dans l’assiette.',
    reading: 'Lecture de votre assiette…',
    retake: 'Reprendre',
    typeManually: 'Saisir à la main',
    noFoodsMatched: 'Aucun aliment reconnu — choisissez-en un ci-dessous.',
    foundFoods: {
      one: '{count} aliment trouvé dans cette assiette.',
      other: '{count} aliments trouvés dans cette assiette.',
    },
    nothingOnPlate: 'Rien dans cette assiette — choisissez un aliment ci-dessous.',
    searchUnavailablePick:
      'La recherche n’est pas disponible pour le moment. Choisissez la correspondance la plus proche ci-dessous.',
  },
  barcode: {
    title: 'Scanner un code-barres',
    checkingCamera: 'Vérification de l’accès à la caméra…',
    startingCamera: 'Démarrage de la caméra…',
    holdDistance: 'Tenez l’appareil à environ 20 cm et placez le code-barres dans le cadre.',
    torch: 'Lampe torche',
    typeBarcode: 'Saisir le code-barres',
    barcodeDigits: 'Chiffres du code-barres',
    lookUpBarcode: 'Rechercher',
    digitsLength: 'Un code-barres compte 8, 12 ou 13 chiffres. Vérifiez votre saisie.',
    digitsChecksum: 'Ces chiffres ne correspondent pas. Vérifiez-les sur l’emballage.',
    slowHint: 'Ça prend du temps ? Vous pouvez saisir les chiffres imprimés sous le code-barres.',
    aimHint: 'Visez le code-barres d’un produit emballé pour le noter.',
    lookingUp: 'Recherche de {code}…',
    cameraPreview: 'Aperçu de la caméra',
    notFoundTypeIt: 'Introuvable — saisissez-le à la main',
    notFoundTitle: 'Introuvable',
    notFoundBody: 'Ce code-barres n’est pas encore dans le catalogue. Le saisir à la main ?',
    scanAgain: 'Scanner à nouveau',
    typeManually: 'Saisir à la main',
    searchUnavailable: 'La recherche n’est pas disponible pour le moment.',
    unsupportedTitle: 'Le scan n’est pas disponible dans ce navigateur — saisissez à la main',
    unsupportedBody:
      'Ce navigateur ne sait pas lire les codes-barres sur votre appareil, et AI Nutrition Coach n’envoie jamais d’images de la caméra ailleurs. La saisie manuelle fonctionne toujours.',
  },
  catalog: {
    title: 'Ajouter un aliment',
    searchLabel: 'Recherche d’aliment',
    typeHint: 'Tapez le nom d’un aliment. Nous classerons les correspondances pour vous.',
    customHint: 'Tapez le nom de l’aliment pour l’ajouter à la main.',
    searchUnavailable: 'La recherche n’est pas disponible pour le moment.',
    pickQuantity: 'Choisissez une quantité',
    typeNameFirst: 'Tapez d’abord un nom',
    customFoodName: 'Nom de l’aliment',
    logCustomFood: 'Noter cet aliment',
    matchLabel: '{name}, {group}, {presets} portions proposées',
    results: 'Correspondances',
  },
  barcodeMatch: {
    groupLabel: 'Groupe d’aliments',
  },
  recognized: {
    lookedLike: { one: 'On dirait {count} aliment', other: 'On dirait {count} aliments' },
    tickHint: 'Tout est coché. Décochez ce qui n’est pas dans l’assiette.',
    nothingMatched: 'Aucune correspondance',
    nothingOnPlate: 'Rien dans cette assiette',
    pickOrType: 'Choisissez la correspondance la plus proche ou saisissez l’aliment à la main.',
    quotaTitle: 'le quota gratuit est épuisé — choisissez ce que vous souhaitez faire.',
    quotaHint:
      'Vous pouvez toujours choisir la correspondance la plus proche ou saisir l’aliment à la main.',
    failureTitle: 'La recherche n’est pas disponible pour le moment.',
    noAiTitle: 'Aucune IA connectée',
    noAiHint:
      'Sans IA, les photos ne sont pas analysées. Choisissez un aliment récent, saisissez-le, ou configurez une IA dans les réglages.',
    setUpAi: 'Configurer l’IA',
    recognizedLabel: 'Aliments reconnus',
    closestMatches: 'Correspondances les plus proches',
    confidenceLikely: 'probable',
    confidenceMaybe: 'possible',
    customFoodName: 'Nom de l’aliment',
    logCustomFood: 'Noter cet aliment',
    typeNameFirst: 'Tapez d’abord un nom',
  },
  consent: {
    title: 'Envoyer cette photo à {host} ?',
    whatIsSent:
      'Ce qui est envoyé : la photo, réduite, sans sa localisation ni les informations de l’appareil photo, une instruction fixe demandant quels aliments sont dans l’assiette et dans quelle langue répondre (français ou anglais, la langue de l’application), et le nom du modèle que vous avez choisi. AI Nutrition Coach n’exploite pas ce service et ne voit jamais la photo.',
    alsoVisible:
      'Également visibles par {host} : votre adresse IP et le type de votre appareil ou de votre application, comme pour tout site web.',
    alsoVisibleWeb:
      'Également visibles par {host} : votre adresse IP, le type de votre navigateur et l’adresse de ce site, comme pour tout site web.',
    retention:
      '{host} peut conserver les requêtes selon ses propres conditions : consultez la politique de données de votre fournisseur.',
    notSent: 'Non envoyés : votre nom, votre historique et vos autres assiettes.',
    revokeHint: 'Vous pouvez changer cela à tout moment dans Réglages → Votre IA.',
    askEveryHint:
      'Votre accord est demandé avant chaque photo. Vous pouvez changer cela dans Réglages → Votre IA.',
    allow: 'Autoriser {host}',
    allowOnce: 'Envoyer cette photo',
    decline: 'Pas maintenant',
    learnMore: 'Ce que l’application stocke et envoie',
  },
  ai: {
    rung: {
      freeModelRemaining: 'modèle gratuit — {N} appels restants aujourd’hui',
      freeModelResetAt: 'modèle gratuit — réinitialisation à {time}',
      offlineNoAi: 'hors ligne (sans IA)',
      noticeShort: 'le quota gratuit est épuisé — choisissez ce que vous souhaitez faire.',
      noticeLong:
        'Le quota gratuit est épuisé pour aujourd’hui. L’assiette est notée sans IA dans tous les cas — choisissez ce qui vous convient.',
      keepLogging: 'continuer à noter sans IA',
      bringYourOwnKey: 'utiliser votre propre clé',
      waitForReset: 'attendre la réinitialisation du quota',
      quotaStatusHeading: 'Quand le quota gratuit est épuisé',
      manualFallbackHint:
        'Vous pouvez toujours choisir la correspondance la plus proche ou saisir l’aliment à la main.',
    },
    byok: {
      title: 'Votre IA',
      label: 'votre clé',
      placeholder: 'collez votre clé compatible OpenAI — stockée chiffrée sur cet appareil',
      save: 'Enregistrer',
      remove: 'Retirer la clé',
      statusActive: 'votre clé — 1 modèle',
      statusMissing: 'votre clé — aucune',
      statusRejected: 'votre clé — refusée',
      statusQuotaExhausted: 'votre clé — quota épuisé',
      previousRungHint: 'retirer cette clé ramène à {previousRungLabel}',
    },
    yourAi: {
      title: 'Votre IA',
      intro:
        'AI Nutrition Coach fonctionne entièrement sans IA. Si vous le souhaitez, vous pouvez laisser un service de votre choix suggérer des aliments à partir d’une photo — avec votre propre clé, c’est vous qui décidez.',
      rungHeading: 'Reconnaissance d’une photo',
      rungNoneLabel: 'Sans IA',
      rungNoneHelp:
        'Les photos restent sur cet appareil. Vous choisissez une correspondance ou vous saisissez l’aliment.',
      rungByokLabel: 'Ma propre clé',
      rungByokHelp: 'Les photos vont au service indiqué ci-dessous, avec votre clé.',
      rungHostedLabel: 'Modèle hébergé gratuit',
      rungLocalLabel: 'Modèle sur cet appareil',
      rungUnavailable: 'Pas encore disponible',
      byokHeading: 'Votre service',
      endpointLabel: 'Adresse du service',
      endpointHint: 'https://openrouter.ai/api/v1',
      endpointHelp:
        'Commence par https://. Un modèle qui tourne sur cet appareil peut utiliser http://localhost.',
      endpointEmpty: 'Ajoutez l’adresse de votre service.',
      endpointNotAUrl: 'Cela ne ressemble pas à une adresse web.',
      endpointNotHttps: 'Utilisez https:// — http:// simple ne fonctionne que pour localhost.',
      endpointHasCredentials: 'Retirez le nom d’utilisateur et le mot de passe de l’adresse.',
      endpointHasQuery: 'Retirez de l’adresse tout ce qui suit « ? » ou « # ».',
      modelLabel: 'Modèle',
      modelHint: 'p. ex. google/gemini-2.0-flash-exp:free',
      modelEmpty: 'Ajoutez le nom du modèle proposé par votre service.',
      keyLabel: 'Clé d’API',
      keyHint: 'Collez votre clé',
      keyHelp:
        'Conservée chiffrée sur cet appareil. Elle n’est envoyée qu’à l’adresse ci-dessus et n’est plus jamais affichée.',
      keyHelpWeb:
        'Conservée chiffrée dans ce navigateur, avec vos données — elle ne peut être lue qu’après le déverrouillage. Elle n’est envoyée qu’à l’adresse ci-dessus et n’est plus jamais affichée.',
      keySavedTemplate: 'clé enregistrée • se termine par ••••{last4}',
      keySavedPlain: 'clé enregistrée',
      keyNone: 'aucune clé enregistrée',
      keyReplaceHint: 'Collez une nouvelle clé pour la remplacer.',
      save: 'Enregistrer',
      removeKey: 'Retirer la clé',
      saved: 'Enregistré.',
      keyRemoved: 'Clé retirée.',
      keyInvalid: 'Cette clé contient des espaces ou des retours à la ligne — collez-la à nouveau.',
      testConnection: 'Tester la connexion',
      testing: 'Vérification…',
      testOk: 'Connecté — l’adresse, le modèle et la clé fonctionnent.',
      testKeyRejected: 'Le service n’a pas accepté cette clé.',
      testRateLimited: 'Le service demande de ralentir. Réessayez un peu plus tard.',
      testTimeout: 'Le service n’a pas répondu à temps.',
      testNetwork: 'Impossible de joindre le service.',
      testUnexpected: 'Le service a répondu avec un statut inattendu ({status}).',
      testNotConfigured: 'Ajoutez d’abord une adresse, un modèle et une clé.',
      testTooLarge: 'Le service a renvoyé bien plus que prévu, la réponse a donc été interrompue.',
      testKeyOtherHost:
        'La clé enregistrée a été saisie pour un autre service. Collez la clé de celui-ci pour le tester.',
      keyOtherHost:
        'La clé enregistrée a été saisie pour {host} : elle n’est donc envoyée nulle part ailleurs. Collez la clé de cette adresse pour l’enregistrer.',
      privacyHeading: 'Photos et consentement',
      consentNone: 'Vous n’avez autorisé aucun service à recevoir des photos.',
      consentExplainer:
        'Avant l’envoi d’une photo, votre accord vous est demandé. Les photos sont d’abord réduites et débarrassées de leur localisation et des informations de l’appareil photo.',
      consentRevoke: 'Révoquer',
      consentRevokeFor: 'Révoquer {host}',
      consentHosts: 'Services pouvant recevoir des photos',
      docsHint: 'Ce que l’application stocke et envoie',
      askEveryPhotoLabel: 'Demander avant chaque envoi de photo',
      askEveryPhotoHelp:
        'Activé : chaque photo demande son propre accord. Désactivé : vous acceptez une fois par service, puis les photos partent sans demander, jusqu’à ce que vous révoquiez cet accord ci-dessous.',
    },
    failure: {
      keyMissing: 'il manque votre propre clé — ouvrez Réglages → Votre IA pour la saisir',
      keyRejected:
        'votre propre clé a été refusée par le service — vérifiez-la dans Réglages → Votre IA',
      consentRequired: 'l’envoi de photos n’a pas encore été accepté — voir Réglages → Votre IA',
      endpointNotSet:
        'L’adresse du service ou le modèle (clé personnelle) n’est pas renseigné — ouvrez Réglages → Votre IA.',
      endpointInvalid:
        'L’adresse du service (clé personnelle) n’est pas valide — ouvrez Réglages → Votre IA.',
      photoNotSendable: 'Ce format de photo ne peut pas être envoyé sans ses métadonnées.',
      responseTooLarge: 'la réponse du fournisseur était trop volumineuse',
      timedOut: 'la requête vers {host} a expiré',
      httpStatus: 'erreur {status} renvoyée par {host}',
      couldNotConnect: 'impossible de se connecter à {host}',
      unreachable: 'le fournisseur est injoignable',
      unavailableRung: 'Pas encore disponible',
      blockedByBrowser:
        'Si le service fonctionne, le navigateur a peut-être bloqué l’appel : le service doit autoriser les requêtes venant de cette page (CORS), et la Content-Security-Policy de ce site doit indiquer son adresse. Si vous hébergez vous-même cette application, ajoutez l’adresse à AI_NUTRITION_COACH_CONNECT_SRC_EXTRA (voir les notes d’auto-hébergement).',
    },
  },
  erase: {
    title: 'Tout effacer sur cet appareil ?',
    body: 'Vos assiettes, les notes du coach, la clé d’IA enregistrée et les exports encore présents sur cet appareil seront supprimés définitivement. Les copies que vous avez partagées ou téléchargées ailleurs ne sont pas concernées.',
    confirm: 'Effacer',
    keep: 'Garder mes données',
    failed:
      'Certaines données n’ont pas pu être effacées. Réessayez, ou videz le stockage de l’application dans les réglages de votre appareil.',
  },
  offNotice: {
    title: 'Recherche de codes-barres',
    body: 'Les codes-barres que vous scannez sont recherchés sur Open Food Facts (base publique, sans compte). Seul le code-barres est envoyé.',
    alsoWeb:
      'Open Food Facts voit aussi votre adresse IP, le type de votre navigateur et l’adresse de ce site (votre navigateur l’ajoute), comme tout site web.',
    ok: 'OK',
    offline: 'Ne pas chercher en ligne',
    privacyLink: 'Ce que l’application stocke et envoie',
  },
  removePlate: {
    title: 'Retirer cette assiette ?',
    body: 'L’assiette « {dish} » sera retirée de votre historique sur cet appareil, avec sa note du coach. C’est définitif.',
    keep: 'La garder',
    confirm: 'Retirer',
  },
  update: {
    message:
      'Une nouvelle version est prête. Recharger verrouille vos données : vous saisirez à nouveau votre phrase secrète.',
    reload: 'Recharger',
    later: 'Plus tard',
  },
  lock: {
    action: 'Verrouiller',
  },
  shell: {
    mainNav: 'Principale',
    today: 'Aujourd’hui',
    week: 'Semaine',
    settings: 'Réglages',
    logAPlate: 'Noter une assiette',
    logShort: 'Noter',
    dock: 'Semaine et saisie',
    brand: 'AI Nutrition Coach',
    storage: 'Sur cet appareil',
    storageNote: 'Toutes les assiettes sont stockées sur cet appareil. Rien ne sort de chez vous.',
    footmark: 'à héberger vous-même · open source',
    skip: 'Aller au contenu',
  },
  day: {
    mapDescription: 'Plan de la journée',
    openQuietPlace: 'Un endroit ouvert et calme.',
    reading: 'Lecture de l’assiette…',
    allStopped: 'Les quatre lignes se sont arrêtées ici',
    noneStopped: 'Aucune ligne ne s’est arrêtée ici',
    passedThrough: '{names} : passage sans arrêt',
    stationLabel: 'Ouvrir {meal}, {time} : {stops}',
    stationLabelPassed: 'Ouvrir {meal}, {time} : {stops}. {passed}',
    stationStopped: 'arrêt pour {names}',
    stationNoneStopped: 'aucun arrêt',
    stationPassed: '{names} : passage sans arrêt',
    removePlateFor: 'Retirer cette assiette ({meal}, {time})',
    dismissHint: '{hint} (touchez pour masquer)',
  },
  coach: {
    group: 'Question du coach',
    sure: 'Volontiers',
    askLater: 'Plus tard',
    depthGroup: 'Plus d’idées du coach',
    close: 'Fermer',
  },
  chip: {
    onDevice: 'Sur cet appareil',
    pending: 'En attente',
    synced: 'Synchronisé',
    retryLater: 'Nouvel essai plus tard',
    allSynced: 'Toutes les assiettes sont synchronisées',
    waiting: {
      one: '{count} assiette en attente de synchronisation',
      other: '{count} assiettes en attente de synchronisation',
    },
    retryLaterPlates: {
      one: 'Nouvel essai plus tard pour {count} assiette',
      other: 'Nouvel essai plus tard pour {count} assiettes',
    },
  },
  week: {
    title: 'Cette semaine',
    dayByDay: 'Jour par jour',
    noStreaks: 'Ni séries, ni compte à rebours, ni culpabilité.',
    routeLabel: 'Cette semaine : choisissez un jour',
    today: 'Aujourd’hui',
    stateAllFour: 'les quatre lignes',
    stateNone: 'rien de noté',
    stateLoggedNoLine: 'noté — aucune ligne de groupe d’aliments',
    stateSome: '{count} sur 4 lignes',
    plates: { zero: 'Aucune assiette', one: '{count} assiette', other: '{count} assiettes' },
    networkIntro: 'Réseau de la semaine.',
    networkDescription: '{intro} {days}',
    daySentence: '{day} : {state}.',
    routeStop: '{day}, {state}',
    routeStopToday: '{day}, {state}, aujourd’hui',
    noteJoin: '{lead} {detail}',
    sentences: '{first} {second}',
    dayNothing: 'rien de noté',
    dayLoggedNoLine: 'noté — aucune ligne de groupe d’aliments',
    dayAll: 'les quatre lignes',
    dayQuiet: '{names} au calme',
    dayDetail: '{stopped} ; {quiet}',
    dayDescription: '{day} : {state}',
    noteAllRan: 'Les quatre lignes ont circulé cette semaine.',
    noteNone: 'Aucune assiette notée cette semaine pour l’instant.',
    noteNoneRan: 'Aucune ligne n’a circulé cette semaine.',
    noteSome: 'En service cette semaine : {names}.',
    noteQuietDays: 'La ligne {name} est restée calme {days}.',
    noteQuietAll: 'La ligne {name} est restée calme toute la semaine.',
    noteQuietMany: 'Les lignes {names} sont restées calmes cette semaine.',
  },
  about: {
    title: 'À propos de cette application',
    adults: 'AI Nutrition Coach est conçu pour les adultes.',
    ai: 'La reconnaissance de photos est désactivée par défaut. Si vous l’activez, une photo est envoyée à un service de votre choix, et seulement après votre accord.',
    local:
      'Vos assiettes restent sur cet appareil, chiffrées. Il n’y a ni compte ni statistiques d’utilisation.',
    ok: 'Compris',
    privacyLink: 'Ce que l’application stocke et envoie',
  },
  session: {
    label: 'Déverrouiller votre coffre',
    placeholder: 'Phrase secrète',
    unlock: 'Déverrouiller',
    wrongPassphrase: 'Cette phrase secrète n’ouvre pas ce coffre.',
    unavailable:
      'Ce navigateur ne peut pas ouvrir le coffre protégé. Il lui faut une page sécurisée (https ou localhost) où le stockage du site est autorisé. Vérifiez ce point, puis réessayez.',
    unavailableInsecure:
      'AI Nutrition Coach a besoin d’une page sécurisée (https:// ou localhost) pour protéger vos données. Cette adresse est en http:// simple, le navigateur n’autorise donc pas le chiffrement ici. Ouvrez plutôt l’adresse https:// de cette application ; vos données ne sont pas touchées.',
    throttled: 'Veuillez patienter un instant avant de réessayer.',
    inOtherTab:
      'AI Nutrition Coach est ouvert dans un autre onglet. Verrouillez-le ou fermez-le dans cet autre onglet, puis réessayez ici.',
    newerVersion:
      'Ces données ont été ouvertes par une version plus récente d’AI Nutrition Coach. Rien n’est perdu : rechargez la page pour mettre à jour, puis déverrouillez à nouveau.',
    forgot: 'Phrase secrète oubliée ?',
    forgotBody:
      'Elle ne peut pas être récupérée : votre historique est chiffré avec une clé tirée de votre phrase secrète, et personne d’autre n’en a de copie. Vous pouvez l’effacer et recommencer.',
    forgotAction: 'Effacer et recommencer',
    createTitle: 'Protégez votre historique',
    createExplain:
      'Choisissez une phrase secrète. Elle chiffre tout ce qu’AI Nutrition Coach enregistre dans ce navigateur, et vous la saisissez à chaque ouverture de l’application.',
    createWarning:
      'Si vous l’oubliez, vos données ne pourront pas être récupérées — ni par nous, ni par personne d’autre. Il n’existe aucun lien de réinitialisation.',
    createPassphraseLabel: 'Phrase secrète',
    createConfirmLabel: 'Confirmez la phrase secrète',
    createAction: 'Créer et déverrouiller',
    tooShort: 'Utilisez au moins 10 caractères.',
    tooRepetitive: 'Utilisez quelques caractères différents.',
    mismatch: 'Les deux phrases secrètes ne correspondent pas.',
    lockAction: 'Verrouiller',
    lockAfterLabel: 'Verrouiller automatiquement après',
    lockAfterOptions: ['5 minutes', '15 minutes', '30 minutes', '1 heure'],
  },
  storeUnavailable: {
    title: 'Votre coffre ne peut pas s’ouvrir pour le moment',
    retry: 'Réessayer',
  },
  keyLost: {
    unreadable: {
      title: 'Votre historique enregistré est introuvable',
      body: 'Le coffre protégé de ce navigateur est incomplet ou illisible — par exemple après l’effacement des données du site. Recharger la page suffit parfois. Sinon, vous pouvez effacer ce qui reste et recommencer.',
      action: 'Effacer les données locales et recommencer',
    },
    lost: {
      title: 'Votre historique ne peut pas être ouvert',
      body: 'Cet appareil n’a plus la clé qui protège votre historique enregistré, il ne peut donc pas être lu. Cela peut arriver après une restauration depuis une sauvegarde ou une réinitialisation de l’appareil. Vous pouvez effacer les données illisibles et recommencer.',
      action: 'Effacer les données locales et recommencer',
    },
    openFailed: {
      title: 'Votre historique ne peut pas être ouvert pour le moment',
      body: 'Le coffre protégé de cet appareil n’a pas pu être ouvert. Fermer puis rouvrir AI Nutrition Coach suffit parfois. Si cela se reproduit, vous pouvez effacer les données illisibles et recommencer — cela supprime tout ce qui est enregistré sur cet appareil.',
      action: 'Effacer les données locales et recommencer',
    },
  },
  durable: {
    persisted: 'Stockage : protégé du nettoyage automatique.',
    notPersisted:
      'Stockage : le navigateur peut effacer ces données si l’espace vient à manquer — exportez régulièrement.',
  },
  today: {
    today: 'Aujourd’hui',
    yesterday: 'Hier',
    historyCannotLoad: 'Impossible de charger l’historique pour le moment.',
    logAnother: 'Noter une autre assiette',
    logAnotherLink: '+ noter une autre assiette',
    plateRemoved: 'Assiette retirée.',
    plateRemoveFailed: 'Impossible de la retirer. Réessayez.',
    networkHeading: 'Le réseau de la semaine',
    seeWeekNetwork: 'Voir le réseau de la semaine',
  },
  nutrition: {
    sectionTitle: 'Nutrition',
    sectionTitleToday: 'Nutrition du jour',
    gramsLabel: 'Grammes',
    gramsInvalid: 'Saisissez un poids de 0,1 à 5 000 g.',
    weight: '{value} g',
    weightApprox: '≈{value} g',
    previewLead: '≈ {parts}',
    previewEnergy: '{value} kcal',
    previewProtein: '{value} g de protéines',
    previewSugars: '{value} g de sucres',
    valueKcal: '{value} kcal',
    valueGrams: '{value} g',
    estimatedValue: '~{value}',
    names: {
      energyKcal: 'Énergie',
      protein: 'Protéines',
      carbohydrate: 'Glucides',
      sugars: 'dont sucres',
      fat: 'Lipides',
      saturatedFat: 'dont acides gras saturés',
      fibre: 'Fibres',
      salt: 'Sel',
    },
    reference: 'environ {percent} % de l’apport de référence UE ({reference})',
    referenceUnderOne: 'moins de 1 % de l’apport de référence UE ({reference})',
    referencePersonal: 'environ {percent} % de votre repère du jour ({reference})',
    referenceUnderOnePersonal: 'moins de 1 % de votre repère du jour ({reference})',
    barsLabel: 'Quantités de nutriments par rapport aux apports de référence',
    coverage: {
      one: 'Calculé sur {count} aliment avec un poids et des données nutritionnelles ; {missing} sans.',
      other:
        'Calculé sur {count} aliments avec un poids et des données nutritionnelles ; {missing} sans.',
    },
    whatAre: 'Que sont les apports de référence ?',
    whatAreBody:
      'Les apports de référence sont les quantités quotidiennes fixées par le règlement européen 1169/2011 pour un adulte moyen consommant 2 000 kcal par jour. Les fibres n’ont pas de valeur européenne : 25 g est une recommandation générale. Vos besoins peuvent être différents, et les barres sont une information, pas un objectif.',
    whatAreBodyPersonal:
      'Les barres utilisent votre repère du jour, calculé à partir du profil choisi dans les Réglages : l’énergie vient des valeurs de référence européennes (EFSA) pour votre tranche d’âge, votre sexe et votre activité, et les autres nutriments en sont déduits. C’est une estimation pour un adulte moyen, pas un conseil, et les barres sont une information, pas un objectif. Sans profil, ce sont les apports de référence UE qui servent (2 000 kcal par jour).',
  },
  support: {
    line: 'Si l’alimentation ou le poids occupent beaucoup vos pensées, en parler à quelqu’un peut aider.',
    linkLabel: 'FFAB, Fédération Française Anorexie Boulimie',
    newTab: '(s’ouvre dans un nouvel onglet)',
  },
  profile: {
    title: 'Profil',
    intro:
      'Facultatif. Il sert seulement à ajuster le repère du jour et le coach. Il reste chiffré sur cet appareil.',
    notSet: 'Non renseigné',
    ageBand: 'Tranche d’âge',
    sex: 'Sexe',
    activity: 'Activité',
    goal: 'Souhait',
    diet: 'Alimentation',
    sexOptions: { female: 'Femme', male: 'Homme', unspecified: 'Je préfère ne pas dire' },
    activityOptions: { low: 'Plutôt assis', moderate: 'Un peu de mouvement', high: 'Très actif' },
    goalOptions: {
      eatBetter: 'Mieux manger',
      maintain: 'Rester comme je suis',
      lose: 'Perdre un peu de poids',
      gain: 'Prendre un peu de poids',
    },
    dietOptions: {
      omnivore: 'De tout',
      vegetarian: 'Végétarisme',
      vegan: 'Véganisme',
      pescatarian: 'Poisson, pas de viande',
    },
    allergiesLabel: 'Allergies ou aliments à éviter',
    allergiesHelp: 'Saisissez-les un par un, puis ajoutez-les.',
    allergyAdd: 'Ajouter',
    allergyRemove: 'Retirer {tag}',
    guideComplete: 'Votre repère du jour est d’environ {energy} kcal.',
    guideIncomplete:
      'Renseignez le sexe, la tranche d’âge et l’activité pour ajuster le repère du jour. D’ici là, l’apport de référence UE est utilisé.',
    goalNote: 'Un souhait ne déplace le repère d’énergie que de 10 %, et jamais sous 1 500 kcal.',
    clear: 'Effacer le profil',
    cleared: 'Profil effacé.',
    saveFailed: 'Cela n’a pas été enregistré à l’instant. Rien n’a changé.',
  },
  nutritionSettings: {
    title: 'Nutrition',
    switchTitle: 'Afficher les valeurs nutritionnelles',
    switchHelp:
      'Si les chiffres sur l’alimentation vous pèsent, vous pouvez masquer les valeurs nutritionnelles et les barres. Les poids et vos repas restent.',
    saveFailed: 'Cela n’a pas été enregistré à l’instant. L’interrupteur reste où il était.',
  },
  plate: {
    removeAction: 'Retirer cette assiette',
  },
  coachQuestions: {
    'post.resolve.vegLight':
      'Pas de légumes ni de fruits pour l’instant aujourd’hui. Une poignée pourrait-elle se glisser dans ce repas, même à côté ?',
    'post.resolve.proteinHeavy':
      'Pas mal de protéines ici. Un peu plus de légumes à côté vous conviendrait-il ?',
    'post.resolve.starchHeavy':
      'Beaucoup de féculents ici. Auriez-vous quelques légumes de plus à glisser à côté ?',
    'post.resolve.dairyLight': 'Une cuillère de yaourt ou un peu de fromage irait-il avec ça ?',
    'post.resolve.vegRich':
      'Beaucoup de légumes ici. Auriez-vous des protéines sous la main, comme des œufs, des légumineuses ou du poisson ?',
    'post.resolve.balanced': 'Jolie assiette — changeriez-vous quelque chose la prochaine fois ?',
    'post.resolve.breakfastSimple':
      'Un début simple. Qu’est-ce qui vous fait tenir jusqu’au déjeuner d’habitude ?',
    'post.resolve.proteinMissingDay':
      'Pas encore de protéines aujourd’hui. Des œufs, des légumineuses, du tofu ou du poisson iraient-ils dans ce repas ?',
    'openPlate.vegLight':
      'Pas de légumes ni de fruits pour l’instant aujourd’hui. Ce repas pourrait-il en avoir une poignée ?',
    'openPlate.proteinHeavy': 'Plutôt protéiné jusqu’ici. Des légumes à côté iraient bien.',
    'openPlate.starchHeavy': 'Plutôt féculents jusqu’ici. Des légumes à côté iraient bien.',
    'openPlate.dairyLight': 'Un produit laitier compléterait bien le tout, si vous en avez.',
    'openPlate.vegRich': 'Pas mal de légumes jusqu’ici. Des protéines iraient bien avec.',
    'openPlate.balanced':
      'Une journée plutôt variée jusqu’ici. Vous aimeriez ajouter quelque chose ?',
    'openPlate.breakfastSimple':
      'Un petit-déjeuner simple peut suffire. Vous prenez quoi d’habitude ?',
    'openPlate.proteinMissingDay':
      'Pas encore de protéines aujourd’hui. Ce repas pourrait-il avoir des œufs, des légumineuses, du tofu ou du poisson ?',
    'depth.followUp.vegLight':
      'Des petits pois surgelés ou une salade en sachet, c’est prêt en deux minutes et ça se garde des jours.',
    'depth.followUp.proteinHeavy':
      'Des épinards surgelés ou une plaque de légumes rôtis vont avec presque tout.',
    'depth.followUp.starchHeavy':
      'Une poignée de légumes surgelés jetée dans la casserole de pâtes ou de riz pour les dernières minutes, sans autre poêle à laver.',
    'depth.followUp.dairyLight':
      'Un yaourt nature ou un peu de fromage râpé, c’est facile à ajouter à table.',
    'depth.followUp.vegRich':
      'Un œuf dur, une boîte de haricots ou un peu de tofu font d’une assiette de légumes un vrai repas en quelques minutes.',
    'depth.followUp.balanced':
      'Si celui-ci a bien marché, en cuisiner un peu plus règle déjà le déjeuner de demain.',
    'depth.followUp.breakfastSimple':
      'Des œufs, un yaourt ou une poignée de noix tiennent plus longtemps que le pain ou les céréales seuls, si l’envie de changer vous prend.',
    'depth.followUp.proteinMissingDay':
      'Le poisson en boîte, les œufs et les haricots en conserve se gardent bien et ne demandent aucune cuisson.',
  },
  settings: {
    aiTier: 'Niveau d’IA',
    v2Tag: 'Pas dans la v1',
    v2Spoken: 'pas dans la version 1',
    title: 'Réglages',
    backToSettings: 'Réglages',
    rowAi: 'Votre IA',
    rowData: 'Vos données',
    rowDataSubtitle: 'export · verrouillage · effacement',
    rowPrivacy: 'Confidentialité',
    rowPrivacySubtitle: 'ce qui est stocké · ce qui est envoyé',
    rowNutrition: 'Nutrition',
    rowNutritionSubtitle: 'afficher ou masquer les chiffres',
    rowProfile: 'Profil',
    rowProfileSubtitle: 'facultatif · ajuste le repère du jour',
    rowLanguage: 'Langue',
    rowLanguageSubtitle: 'comme votre appareil · ou au choix',
    rowInstall: 'Installer sur votre téléphone',
    rowInstallSubtitle: 'hors ligne · icône dédiée',
    rowAbout: 'À propos',
    rowAboutSubtitle: 'à héberger vous-même · open source',
  },
  language: {
    title: 'Langue',
    groupLabel: 'Langue de l’application',
    matchDevice: 'Suivre mon appareil',
    explain:
      'L’application suit la langue de votre navigateur tant que vous n’en choisissez pas une. Votre choix est conservé avec vos données sur cet appareil.',
    note: 'La langue choisie est aussi conservée en clair dans ce navigateur, pour que les écrans avant le déverrouillage puissent l’utiliser. Cette note ne révèle que la langue.',
  },
  yourData: {
    title: 'Vos données',
    protection:
      'Chiffrées au repos dans ce navigateur (ChaCha20-Poly1305). La clé est tirée de votre phrase secrète, gardée en mémoire seulement tant que l’application est déverrouillée, et jamais enregistrée — si vous oubliez la phrase secrète, les données sont irrécupérables. Votre clé d’IA et vos réglages sont conservés dans ce même coffre chiffré.',
    lockHeading: 'Verrouillage',
    exportHeading: 'Export',
    eraseLabel: 'Effacer les données locales',
    eraseExplain:
      'Supprime votre historique, les notes du coach, la clé d’IA enregistrée et les exports encore présents sur cet appareil. Les copies que vous avez partagées ou téléchargées ailleurs ne sont pas concernées. Il n’existe aucune autre copie de vos données, c’est donc définitif — exportez d’abord si vous voulez en garder une.',
    eraseButton: 'Effacer toutes les données locales',
  },
  export: {
    formatLabel: 'Format',
    formatCsv: 'CSV',
    formatJson: 'JSON',
    scopeLabel: 'Période',
    scopeVisibleDay: 'Aujourd’hui',
    scopeWeek: 'Cette semaine',
    scopeAllHistory: 'Tout l’historique',
    action: 'Exporter',
    working: 'Préparation de votre fichier…',
    exportedLine: 'exporté :',
    cancelled: 'Rien n’a été exporté.',
    lastExport: 'Dernier export : {date}',
    lastExportNever: 'Dernier export : jamais',
    plaintextNote: 'Les exports sont des fichiers en clair, non chiffrés : gardez-les en lieu sûr.',
    eraseLimitNote:
      'Effacer vos données ne peut pas supprimer un fichier que vous avez déjà téléchargé ou partagé.',
    reminderStale:
      'Votre dernier export remonte à un moment. Une copie protège votre historique si cet appareil ou ce navigateur venait à le perdre.',
    reminderNever:
      'Vous n’avez pas encore fait d’export. Une copie protège votre historique si cet appareil ou ce navigateur venait à le perdre.',
    reminderNotNow: 'Pas maintenant',
    failedLocked: 'Déverrouillez d’abord, puis exportez.',
    failedRead:
      'Vos assiettes n’ont pas pu être lues pour le moment. Rien n’est perdu ; vous pouvez réessayer.',
    failedFormat: 'Ce format de fichier n’est pas disponible.',
    failedDelivery: 'l’export a échoué — réessayez',
  },
  privacy: {
    title: 'Ce que l’application stocke et envoie',
    intro: 'Une liste simple. Rien n’est caché ici, et rien n’est collecté sur vous.',
    storedHeading: 'Stocké sur cet appareil, chiffré',
    storedBody:
      'Vos assiettes et les aliments qu’elles contiennent, les notes du coach affichées avec elles, vos choix (comme vos réglages d’IA et ces avis) et, si vous en ajoutez une, votre clé d’IA. Tout est chiffré sur cet appareil. La clé est tirée de votre phrase secrète et n’est gardée que tant que l’application est déverrouillée. La seule exception est la langue choisie, aussi conservée en clair sur cet appareil pour que l’écran de déverrouillage puisse l’utiliser ; elle ne révèle rien d’autre.',
    leavesHeading: 'Ce qui quitte cet appareil, et quand',
    leavesBarcode:
      'Scan d’un code-barres : le numéro du code-barres est recherché sur Open Food Facts, une base de données publique sans compte. Seul le code-barres est envoyé. Open Food Facts voit aussi les informations de connexion que voit tout site web : votre adresse IP, le type de votre appareil ou de votre navigateur et l’adresse de ce site (le navigateur l’ajoute dans l’en-tête Origin). Vous pouvez désactiver cela ci-dessous.',
    leavesPhoto:
      'Reconnaissance d’une photo : seulement si vous avez activé votre propre IA et donné votre accord. La photo (réduite, sans sa localisation ni les informations de l’appareil photo), une instruction fixe (qui précise aussi dans quelle langue répondre, la langue de l’application) et le nom du modèle vont au service que vous avez choisi. Ce service voit aussi votre adresse IP et le type de votre appareil ou de votre navigateur, et peut conserver les requêtes selon sa propre politique.',
    offToggle: 'Rechercher les codes-barres sur Open Food Facts',
    offToggleOn: 'Activé : un code-barres scanné est recherché en ligne.',
    offToggleOff:
      'Désactivé : seul le catalogue hors ligne est utilisé, et un code-barres inconnu ouvre la saisie manuelle.',
    offToggleUnasked:
      'La question vous sera posée la première fois que vous scannerez un code-barres.',
    serverHeading: 'Ce que voit le serveur d’où vient cette application',
    serverBody:
      'Rien sur vous ni sur vos assiettes. Le serveur ne fait que distribuer les fichiers de l’application. Comme tout serveur web, il peut tenir un court journal d’accès (adresses des pages et heures), avec les adresses des clients tronquées ; dans l’installation auto-hébergée standard, ce journal est désactivé.',
    neverHeading: 'Jamais collecté',
    neverBody:
      'Pas de statistiques, pas de pistage, pas de rapports de plantage, pas de publicité et pas de comptes. Rien n’est envoyé sur la façon dont vous utilisez l’application.',
    deleteHeading: 'Supprimer vos données',
    deleteBody:
      'Pour retirer une assiette, ouvrez-la depuis Aujourd’hui et choisissez Retirer cette assiette. Pour tout retirer, utilisez Effacer toutes les données locales dans Réglages, Vos données. Les exports que vous avez enregistrés ou partagés ailleurs sont des copies hors de l’application : supprimez-les vous-même.',
    exportHeading: 'Exporter',
    exportBody:
      'Réglages, Vos données, Exporter enregistre vos assiettes dans un fichier CSV ou JSON. Les exports sont des fichiers texte en clair, non chiffrés : gardez-les en lieu sûr.',
    sharedHeading: 'Appareils partagés',
    sharedBody:
      'Toute personne qui peut ouvrir AI Nutrition Coach dans ce profil de navigateur et qui connaît la phrase secrète voit le même historique ; il n’y a pas de profils séparés dans l’application. Pour des historiques séparés, utilisez un autre appareil ou un autre profil de navigateur, chacun avec sa propre phrase secrète.',
    saveFailed: 'Impossible d’enregistrer ce choix. Déverrouillez l’application et réessayez.',
  },
  install: {
    title: 'Installer sur votre téléphone',
    intro:
      'AI Nutrition Coach fonctionne dans votre navigateur. L’installer ajoute une icône à votre écran d’accueil et permet de l’ouvrir sans connexion une fois chargé.',
    already: 'AI Nutrition Coach est déjà installé sur cet appareil.',
    button: 'Installer',
    iosTitle: 'iPhone ou iPad',
    iosSteps:
      'Ouvrez cette page dans Safari. Touchez le bouton Partager, choisissez « Sur l’écran d’accueil », puis touchez « Ajouter ».',
    androidTitle: 'Android',
    androidSteps:
      'Dans Chrome, ouvrez le menu (⋮) et choisissez « Installer l’application » (ou « Ajouter à l’écran d’accueil »). Votre navigateur peut aussi proposer un bouton Installer ci-dessous.',
    desktopTitle: 'Ordinateur',
    desktopSteps:
      'Dans Chrome ou Edge, utilisez l’icône d’installation à droite de la barre d’adresse, ou ouvrez le menu du navigateur et choisissez « Installer AI Nutrition Coach ». Les autres navigateurs peuvent simplement continuer à l’utiliser dans un onglet.',
    changesTitle: 'Ce que change l’installation',
    changesOffline:
      'L’application s’ouvre sans connexion après un premier chargement, et affiche une ligne discrète quand une nouvelle version est prête.',
    changesIcon: 'Elle a sa propre icône et s’ouvre sans les barres du navigateur.',
    changesStorage:
      'Sur iPhone, Safari peut effacer les données d’un site web si vous ne l’avez pas consulté depuis un moment ; une application ajoutée à l’écran d’accueil n’est pas concernée. L’application installée garde ses propres données, séparées : installez-la donc avant de commencer à noter.',
    backupNote:
      'Vos données ne se trouvent que sur cet appareil : exportez-en une copie depuis Vos données de temps en temps.',
  },
  aboutScreen: {
    title: 'À propos',
    v2Notice:
      'Le suivi familial est une piste pour la v2 — absent de la v1. En lecture seule, pour accompagner et non surveiller, en attente d’un examen COPPA.',
    openSource: 'à héberger vous-même · open source',
    licencesHeading: 'Licences open source',
    licenceLink: 'Lire la licence',
    licenceLinkFor: 'Lire la licence : {name}',
    licences: [
      { id: 'app', name: 'AI Nutrition Coach', licence: 'Licence MIT' },
      {
        id: 'fonts',
        name: 'Barlow et Barlow Condensed (polices)',
        licence: 'SIL Open Font License 1.1',
      },
      {
        id: 'sqlite',
        name: 'SQLite3 Multiple Ciphers',
        licence: 'Licence MIT (SQLite lui-même est dans le domaine public)',
      },
      { id: 'zxing', name: 'zxing-wasm', licence: 'Licence MIT' },
      { id: 'zxingcpp', name: 'zxing-cpp (inclus dans zxing-wasm)', licence: 'Licence Apache 2.0' },
      { id: 'react', name: 'React', licence: 'Licence MIT' },
      {
        id: 'ciqual',
        name: 'Table de composition nutritionnelle des aliments Ciqual (Anses, 2025)',
        licence: 'Licence Ouverte Etalab 2.0',
      },
    ],
  },
  sync: {
    onThisDevice: 'Enregistré sur cet appareil',
    noTransport: 'Vos assiettes restent sur cet appareil. Rien n’est envoyé nulle part.',
  },
};
