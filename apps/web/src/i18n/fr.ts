import type { Strings } from './en';

/**
 * French copy: the same keys as `en.ts` (typed `Strings`, so a missing or extra key fails `tsc`).
 * Translated for meaning, in the same calm, non-judgmental voice, addressing the reader as
 * « vous ». Food groups are named plainly: groupe, assiette, « sans {groupe} ».
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
    remove: 'Retirer',
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
    snack: 'Collation',
    late: 'Nuit',
  },
  lineBar: {
    label: 'Groupes d’aliments dans cette assiette',
    groupPassed: '{name} · absent',
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
    nextStation: 'Prochain repas : {meal}',
    forToday: 'Pour aujourd’hui',
    forDay: 'Pour {day}',
    mealLabel: 'Repas',
    snapshot: 'Photo',
    snapshotHint: 'Une seule photo de l’assiette suffit.',
    barcode: 'Code-barres',
    barcodeHint: 'Produit emballé',
    type: 'Saisir',
    typeHint: 'Fonctionne hors ligne',
    describe: 'Décrire',
    describeHint: 'À dire ou à écrire',
    snapTitle: 'Photographier une assiette',
    takePhoto: 'Prendre une photo',
    choosePhoto: 'Choisir une photo',
    aimHint: 'Cadrez votre assiette, puis touchez le déclencheur.',
    noAiNote:
      'La reconnaissance de photo demande une connexion à une IA. Sans elle, vous pouvez toujours choisir ou saisir ce qui se trouve dans l’assiette.',
    noAiNoteInstance:
      'La reconnaissance de photo demande une connexion à une IA. Ce serveur en propose une : vous pouvez l’activer dans les réglages. Sans elle, vous pouvez toujours choisir ou saisir ce qui se trouve dans l’assiette.',
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
    offAddLink: 'Ajouter ce produit à Open Food Facts',
    offAddNewTab: '(s’ouvre dans un nouvel onglet)',
    offAddNote:
      'Open Food Facts est une base de données libre et gratuite : chacun peut y ajouter un produit.',
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
    matchLabel: {
      one: '{name}, {group}{kcal}, {presets} portion proposée',
      other: '{name}, {group}{kcal}, {presets} portions proposées',
    },
    results: 'Correspondances',
    matchKcal: '{value} kcal pour 100 g',
    chosenFood: 'Choisi : {name}. Réglez la quantité ci-dessous.',
    otherResults: 'Voir les autres résultats',
    amountFor: 'Quantité pour {name}',
    addAnother: 'Ajouter un autre aliment',
    logPlate: 'Noter l’assiette',
    onPlate: 'Sur cette assiette',
    removeItem: 'Retirer {name}',
    plateTotal: 'Total de l’assiette',
    itemNotCounted: 'Non compté dans les totaux',
    customDetails: 'Poids et nutrition (facultatif)',
    customOptional:
      'Ajoutez un poids et des calories, et cet aliment compte dans vos totaux. Laissez vide pour noter environ une portion.',
    customBasis: 'Les valeurs sont données',
    customPer100: 'pour 100 g',
    customPerServing: 'par portion',
    customGramsEaten: 'Poids mangé (g)',
    customGramsServing: 'Poids d’une portion (g)',
    customFields: {
      energyKcal: 'Énergie (kcal)',
      protein: 'Protéines (g)',
      carbohydrate: 'Glucides (g)',
      sugars: 'dont sucres (g)',
      fat: 'Lipides (g)',
      saturatedFat: 'dont saturés (g)',
      fibre: 'Fibres (g)',
      salt: 'Sel (g)',
    },
    customIssues: {
      needsGrams: 'Ajoutez le poids pour que ces valeurs comptent.',
      value: 'Tapez un nombre, ou laissez le champ vide.',
      tooHigh: 'C’est plus qu’un aliment ne contient pour 100 g. Vérifiez la valeur.',
      sugars: 'Les sucres ne peuvent pas dépasser les glucides.',
      saturates: 'Les saturés ne peuvent pas dépasser les lipides.',
      macros:
        'Protéines, glucides, lipides, fibres et sel ensemble ne peuvent pas dépasser 100 g pour 100 g. Vérifiez les valeurs.',
    },
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
    noAiHintInstance:
      'Sans IA, les photos ne sont pas analysées. Choisissez un aliment récent, saisissez-le, ou activez l’IA que ce serveur propose dans les réglages.',
    setUpAi: 'Configurer l’IA',
    recognizedLabel: 'Aliments reconnus',
    closestMatches: 'Correspondances les plus proches',
    confidenceLikely: 'probable',
    confidenceMaybe: 'possible',
    customFoodName: 'Nom de l’aliment',
    logCustomFood: 'Noter cet aliment',
    typeNameFirst: 'Tapez d’abord un nom',
    describedLooked: {
      one: '{count} aliment trouvé dans vos mots',
      other: '{count} aliments trouvés dans vos mots',
    },
    describedHint:
      'Tout est coché. Vérifiez les quantités et décochez ce que vous n’avez pas mangé.',
    describedUnmatched:
      'Aucune correspondance pour : {names}. Vous pouvez les ajouter avec un aliment personnalisé ci-dessous.',
  },
  describe: {
    title: 'Décrire un repas',
    intro: 'Écrivez ce que vous avez mangé, ou dites-le, avec vos mots.',
    fieldLabel: 'Qu’avez-vous mangé ?',
    placeholder: 'Deux œufs, une tartine au beurre, un café au lait',
    limit: '{max} caractères au maximum.',
    dictation: 'Vous pouvez aussi dicter avec le micro de votre clavier.',
    find: 'Trouver ces aliments',
    finding: 'Lecture…',
    typeInstead: 'Saisir à la main',
    matchHere: 'Comparer sur cet appareil',
    noAiNote:
      'Aucune IA n’est configurée : vos mots sont comparés à la liste d’aliments de cet appareil. Rien n’est envoyé.',
    aiNoteByok:
      'Vos mots sont envoyés à {host} pour être compris. Vous pouvez changer cela dans Réglages → Votre IA.',
    aiNoteInstance:
      'Vos mots sont envoyés à ce serveur ({host}), qui les transmet à {label}. Vous pouvez changer cela dans Réglages → Votre IA.',
    consentTitle: 'Envoyer vos mots à {host} ?',
    consentTitleInstance: 'Envoyer vos mots à ce serveur ?',
    consentSent:
      'Ce qui est envoyé : le texte que vous écrivez ou dictez, le texte d’une recette que vous collez (8 000 caractères au plus), ou un court enregistrement vocal (30 secondes au plus) transformé en texte, et une instruction fixe demandant quels aliments ou ingrédients il mentionne et dans quelle langue répondre (français ou anglais, la langue de l’application). Rien d’autre : ni votre nom, ni votre historique, ni vos autres assiettes. Cette application ne conserve pas l’enregistrement. AI Nutrition Coach n’exploite pas ce service et ne voit jamais vos mots.',
    consentSentInstance:
      'Ce qui est envoyé : le texte que vous écrivez ou dictez, le texte d’une recette que vous collez (8 000 caractères au plus), ou un court enregistrement vocal (30 secondes au plus) transformé en texte, et une instruction fixe demandant quels aliments ou ingrédients il mentionne et dans quelle langue répondre (français ou anglais, la langue de l’application). Cela part vers ce serveur ({host}), qui ajoute sa propre clé d’IA et le transmet à {label}. Rien d’autre : ni votre nom, ni votre historique, ni vos autres assiettes. Cette application ne conserve pas l’enregistrement.',
    consentVisible:
      'Également visibles par {host} : votre adresse IP, le type de votre navigateur et l’adresse de ce site, comme pour tout site web.',
    consentVisibleInstance:
      'Également visibles par la personne qui exploite {host} : votre adresse IP et le type de votre navigateur, comme pour tout site web. {label} reçoit vos mots de ce serveur, pas de votre appareil.',
    consentRetention:
      '{host} peut conserver les requêtes selon ses propres conditions : consultez la politique de données de votre fournisseur.',
    consentRetentionInstance:
      '{label} peut conserver les requêtes selon ses propres conditions, et la personne qui exploite ce serveur l’a choisi : interrogez-la sur sa politique de données.',
    consentChange: 'Vous pouvez changer cela à tout moment dans Réglages → Votre IA.',
    consentAllow: 'Autoriser {host}',
    consentAllowInstance: 'Autoriser ce serveur',
    consentDecline: 'Pas maintenant',
    declined: 'Rien n’a été envoyé. Vos mots sont comparés sur cet appareil.',
    busy: 'L’IA est occupée. Réessayez dans un instant, ou comparez sur cet appareil.',
    failed: 'L’IA n’a pas pu lire cela pour le moment. Réessayez, ou comparez sur cet appareil.',
    nothingFound: 'Aucun aliment trouvé. Essayez d’autres mots, ou utilisez Saisir.',
    empty: 'Écrivez ou dites d’abord ce que vous avez mangé.',
    talk: 'Parler',
    recordHint: 'Touchez Parler, dites ce que vous avez mangé, puis touchez de nouveau le bouton.',
    listening: 'J’écoute. Touchez de nouveau le bouton quand vous avez fini.',
    askFirstNote:
      'Avant d’envoyer quoi que ce soit à une IA, votre accord est demandé. Sans elle, vos mots sont comparés sur cet appareil.',
    transcribing: 'Transformation de votre voix en texte…',
    transcribed: 'Voici ce qui a été entendu. Vérifiez, puis trouvez les aliments.',
    heardNothing: 'Rien n’a été entendu. Vous pouvez réessayer, ou écrire à la place.',
    micDenied:
      'L’accès au micro est désactivé pour ce site. Vous pouvez l’activer dans les réglages de votre navigateur, ou écrire à la place.',
    micUnavailable:
      'Aucun micro n’est disponible ici. Vous pouvez écrire, ou utiliser le micro de votre clavier.',
    voiceBusy: 'L’IA est occupée. Réessayez dans un instant, ou écrivez à la place.',
    voiceFailed:
      'Cet enregistrement n’a pas pu être transformé en texte. Vous pouvez réessayer, ou écrire à la place.',
    voiceKey: 'Le service n’a pas accepté votre clé. Vérifiez-la dans Réglages → Votre IA.',
    voiceSignIn: 'Ce serveur vous demande de vous reconnecter. Rechargez la page pour continuer.',
    voiceTooLong:
      'Cet enregistrement est trop long. Essayez-en un plus court, ou écrivez à la place.',
    voiceUnsupported:
      'Ce service ne sait pas transformer la voix en texte, le bouton du micro est donc masqué. Vous pouvez écrire à la place.',
    recordingLabel: 'Enregistrement vocal',
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
    instanceTitle: 'Envoyer cette photo à ce serveur ?',
    instanceWhatIsSent:
      'Ce qui est envoyé : la photo, réduite, sans sa localisation ni les informations de l’appareil photo, et une instruction fixe demandant quels aliments sont dans l’assiette et dans quelle langue répondre (français ou anglais, la langue de l’application). La photo part vers ce serveur ({host}), qui ajoute sa propre clé d’IA et la transmet à {via}. AI Nutrition Coach, le projet, n’exploite ni ce serveur ni ce service et ne voit jamais la photo.',
    instanceAlsoVisible:
      'Également visibles par la personne qui exploite {host} : votre adresse IP et le type de votre navigateur, comme pour tout site web. {via} reçoit la photo de ce serveur, pas de votre appareil.',
    instanceRetention:
      '{via} peut conserver les requêtes selon ses propres conditions, et la personne qui exploite ce serveur l’a choisi : interrogez-la sur sa politique de données. Le logiciel de ce serveur ne conserve pas la photo.',
    instanceAllow: 'Autoriser ce serveur',
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
      thisServerActive: 'ce serveur — {label}',
      thisServerOff: 'ce serveur — non proposé',
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
      signInRequired:
        'Ce serveur vous demande de vous reconnecter. Rechargez la page pour continuer.',
      reloadAction: 'Recharger',
      rungInstanceLabel: 'Fournie par ce serveur',
      rungInstanceHelp:
        'Aucune clé nécessaire. Les photos vont à ce serveur, qui les transmet à {label}.',
      instanceHeading: 'L’IA de ce serveur',
      instanceExplain:
        'La personne qui exploite ce serveur ({host}) y garde une clé d’IA, vous n’en avez donc pas besoin. Une photo part d’abord vers ce serveur, puis vers {label}, qui la lit et répond. Votre accord est demandé avant chaque photo, sauf si vous le désactivez ci-dessous.',
      instanceModel: 'Modèle : {model}',
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
      cacheMarkersLabel: 'Indications de cache',
      cacheMarkersHelp:
        'Envoie une indication de cache avec Demander au coach, pour qu’un service qui la lit (OpenRouter avec un modèle Claude ou Gemini) facture moins cher la partie répétée de la conversation. Rien de plus sur vous n’est envoyé. Laissez désactivé si le test de connexion passe mais que le coach ne répond plus ensuite : certains services refusent les indications qu’ils ne connaissent pas.',
      voiceModelLabel: 'Modèle vocal',
      voiceModelHint: 'p. ex. whisper-1',
      voiceModelInvalid:
        'Utilisez uniquement des lettres, des chiffres et les signes . _ / @ + - (128 caractères au plus), ou laissez vide.',
      voiceModelHelp:
        'Transforme un court enregistrement en texte pour Décrire, au même point d’accès. Laissez vide pour whisper-1. Si votre service n’a pas un tel modèle, le bouton du micro reste masqué.',
      instanceVoice: 'Voix en texte : {model}',
      describeHeading: 'Décrire un repas avec l’IA',
      describeIntro:
        'Quand vous décrivez un repas ou collez une recette, les mots que vous écrivez ou dites, ou le texte de la recette, peuvent être envoyés à une IA pour être compris. C’est autre chose qu’une photo ou que le coaching, d’où un réglage à part.',
      describeSwitch: 'Laisser l’IA lire ce que je décris',
      describeSwitchHelpOff:
        'Désactivé : Décrire compare vos mots à la liste d’aliments de cet appareil et rien n’est envoyé.',
      describeSwitchHelpOn:
        'Activé : le texte que vous écrivez ou dictez, une recette que vous collez, ou un court enregistrement vocal transformé en texte, part vers la destination ci-dessous. Vous pouvez le désactiver à tout moment.',
      describeDestinationInstance: 'Part vers {host}, ce serveur, qui le transmet à {label}.',
      describeDestinationByok: 'Part vers {host}, le service que vous avez choisi.',
      describeNeedsAi:
        'Sans IA choisie ci-dessus, Décrire fonctionne sur cet appareil et rien n’est envoyé.',
      describeSent:
        'Ce qui est envoyé : uniquement ce texte (500 caractères au plus, ou 8 000 pour une recette collée) ou cet enregistrement (30 secondes au plus, transformé en texte et non conservé par cette application), et une instruction fixe. Jamais votre nom, votre historique, vos autres assiettes ni vos photos.',
      coachingHeading: 'Coaching par IA',
      coachingIntro:
        'Le coach peut écrire ses notes et répondre à vos questions avec l’aide d’une IA. Cela envoie une partie de vos repas à cette IA, ce qui n’a rien à voir avec l’envoi d’une photo : c’est pourquoi il a son propre réglage. Si votre objectif dans le profil est de perdre ou de prendre du poids, le coach peut vous y aider, simplement et avec prudence ; avec tout autre objectif, il n’aborde pas la perte de poids.',
      coachingSwitch: 'Laisser l’IA écrire les notes du coach et répondre aux questions',
      coachingSwitchHelpOff:
        'Désactivé : le coach écrit ses notes intégrées et rien de vos repas n’est envoyé.',
      coachingSwitchHelpOn:
        'Activé : après l’enregistrement d’une assiette, et quand vous interrogez le coach, vos données de repas partent vers la destination indiquée plus bas. Vous pouvez le désactiver à tout moment.',
      coachingSent:
        'Ce qui est envoyé : les noms et les groupes de vos aliments, leurs poids et les totaux de nutriments, les dates des jours concernés (sans l’heure), le moment du repas (celui sous lequel vous avez rangé une assiette, ou celui que son heure laisse entendre), le nombre d’assiettes, votre profil si vous l’avez rempli (objectif, régime, allergies, tranche d’âge, sexe, activité), votre repère du jour, arrondi, qui est calculé d’après votre poids et votre taille si vous les avez saisis, l’énergie moyenne de la semaine à côté de ce repère arrondi, les aliments qui ont apporté le plus d’énergie, le pas que vous avez choisi pour la semaine, et ce que vous saisissez dans Interroger le coach avec les réponses précédentes de cette conversation. Jamais le poids, la taille ni le tour de taille eux-mêmes, jamais vos photos, jamais votre phrase secrète. Si les chiffres nutritionnels sont masqués, les poids, les nutriments, l’énergie moyenne et le repère du jour ne sont pas envoyés. Votre tendance de poids n’est envoyée que si vous activez le réglage distinct ci-dessous.',
      coachingDestinationInstance: 'Destination : {host}, ce serveur, qui la transmet à {label}.',
      coachingDestinationByok: 'Destination : {host}, le service que vous avez choisi.',
      coachingNeedsAi:
        'Choisissez d’abord une IA ci-dessus : celle que ce serveur propose, ou votre propre clé. D’ici là, rien n’est envoyé.',
      coachingSaveFailed: 'Impossible de l’enregistrer. Déverrouillez l’application et réessayez.',
      trendSwitch: 'Partager ma tendance de poids avec le coach',
      trendHelpOff:
        'Désactivé : le coach ne reçoit ni pesée ni tendance de poids. Il voit tout de même votre repère quotidien, arrondi aux 100 kcal, qui est calculé à partir de votre poids et de votre taille.',
      trendHelpOn:
        'Activé : le coach reçoit aussi une description grossière de votre tendance de poids : une direction et la variation sur environ quatre semaines, au demi-kilo près. Elle n’est envoyée que si vous avez choisi de perdre ou de prendre du poids et que votre repère n’est pas maintenu par sécurité (grossesse ou allaitement, indice de masse corporelle bas, 65 ans et plus, pas de marge au-dessus du minimum, pas de données corporelles) ; dans ces cas, aucune tendance de poids n’est envoyée, même activée.',
      trendSent:
        'Jamais une pesée isolée, jamais sa date, jamais votre taille, un indice de masse corporelle ni votre tour de taille. Cela suppose que le coaching par IA soit activé, et vous pouvez le désactiver à tout moment.',
      trendNeedsCoaching: 'Activez d’abord le coaching par IA ci-dessus.',
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
      instanceUnavailable:
        'Ce serveur ne propose pas d’IA pour le moment. Vous pouvez choisir une autre option dans Réglages → Votre IA.',
      instanceBusy: 'L’IA de ce serveur est occupée. Réessayez dans un instant.',
      instanceSignIn:
        'Ce serveur vous demande de vous reconnecter. Rechargez la page pour continuer.',
      instanceError: 'L’IA de ce serveur n’a pas répondu. Réessayez dans un instant.',
      blockedByBrowser:
        'Si le service fonctionne, le navigateur a peut-être bloqué l’appel : le service doit autoriser les requêtes venant de cette page (CORS), et la Content-Security-Policy de ce site doit indiquer son adresse. Si vous hébergez vous-même cette application, ajoutez l’adresse à AI_NUTRITION_COACH_CONNECT_SRC_EXTRA (voir les notes d’auto-hébergement).',
    },
  },
  erase: {
    title: 'Tout effacer sur cet appareil ?',
    body: 'Vos assiettes, les notes du coach, les mesures du corps, la clé d’IA enregistrée et les exports encore présents sur cet appareil seront supprimés définitivement. Les copies que vous avez partagées ou téléchargées ailleurs ne sont pas concernées.',
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
    elsewhere: 'Elle sera aussi retirée de vos autres appareils.',
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
    progress: 'Évolution',
    settings: 'Réglages',
    logAPlate: 'Noter une assiette',
    logShort: 'Noter',
    dock: 'Semaine et saisie',
    brand: 'AI Nutrition Coach',
    storage: 'Sur cet appareil',
    storageNote: 'Toutes les assiettes sont stockées sur cet appareil. Rien ne sort de chez vous.',
    storageNoteServer:
      'Toutes les assiettes sont stockées sur cet appareil, avec une copie chiffrée sur ce serveur.',
    footmark: 'à héberger vous-même · open source',
    skip: 'Aller au contenu',
  },
  day: {
    mapDescription: 'Repas de la journée',
    openQuietPlace: 'Rien de noté pour l’instant.',
    reading: 'Lecture de l’assiette…',
    allStopped: 'Les quatre groupes d’aliments dans cette assiette',
    noneStopped: 'Aucun groupe d’aliments dans cette assiette',
    passedThrough: 'Sans {names}',
    stationLabel: 'Ouvrir {meal}, {time} : {stops}',
    stationLabelPassed: 'Ouvrir {meal}, {time} : {stops}. {passed}',
    stationStopped: '{names} dans l’assiette',
    stationNoneStopped: 'aucun groupe d’aliments',
    stationPassed: 'sans {names}',
    removePlateFor: 'Retirer cette assiette ({meal}, {time})',
    dismissHint: '{hint} (touchez pour masquer)',
  },
  coach: {
    group: 'Question du coach',
    sure: 'Volontiers',
    askLater: 'Plus tard',
    depthGroup: 'Plus d’idées du coach',
    close: 'Fermer',
    aiMark: 'Écrit par une IA',
  },
  chip: {
    onDevice: 'Sur cet appareil',
    pending: 'En attente',
    synced: 'Synchronisé',
    retryLater: 'Nouvel essai plus tard',
    updateNeeded: 'Mettez l’application à jour sur cet appareil pour continuer à synchroniser',
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
    earlierTitle: 'Semaine passée',
    weekNav: 'Choisir une semaine',
    earlier: 'Semaine précédente',
    later: 'Semaine suivante',
    backToThisWeek: 'Revenir à cette semaine',
    dayByDay: 'Jour par jour',
    noStreaks: 'Ni séries, ni compte à rebours, ni culpabilité.',
    routeLabel: 'Cette semaine : choisissez un jour',
    routeLabelEarlier: 'Semaine du {from} au {to} : choisissez un jour',
    today: 'Aujourd’hui',
    stateAllFour: 'les quatre groupes',
    stateNone: 'rien de noté',
    stateLoggedNoLine: 'noté — aucun groupe d’aliments',
    stateSome: '{count} groupes sur 4',
    plates: { zero: 'Aucune assiette', one: '{count} assiette', other: '{count} assiettes' },
    networkIntro: 'La semaine.',
    networkDescription: '{intro} {days}',
    daySentence: '{day} : {state}.',
    routeStop: '{day}, {state}',
    routeStopToday: '{day}, {state}, aujourd’hui',
    noteJoin: '{lead} {detail}',
    sentences: '{first} {second}',
    dayNothing: 'rien de noté',
    dayLoggedNoLine: 'noté — aucun groupe d’aliments',
    dayAll: 'les quatre groupes',
    dayQuiet: 'sans {names}',
    dayDetail: '{stopped} ; {quiet}',
    dayDescription: '{day} : {state}',
    noteAllRan: 'Les quatre groupes d’aliments étaient là cette semaine.',
    noteAllRanEarlier: 'Les quatre groupes d’aliments étaient là la semaine du {from} au {to}.',
    noteNoneEarlier: 'Aucune assiette notée la semaine du {from} au {to}.',
    noteNoneRanEarlier: 'Aucun groupe d’aliments la semaine du {from} au {to}.',
    noteSomeEarlier: 'Présents la semaine du {from} au {to} : {names}.',
    noteQuietManyEarlier: 'Pas de {names} la semaine du {from} au {to}.',
    noteNone: 'Aucune assiette notée cette semaine pour l’instant.',
    noteNoneRan: 'Aucun groupe d’aliments cette semaine.',
    noteSome: 'Présents cette semaine : {names}.',
    noteQuietDays: 'Pas de {name} {days}.',
    noteQuietAll: 'Pas de {name} de toute la semaine.',
    noteQuietMany: 'Pas de {names} cette semaine.',
    askCoachLink: 'Interroger le coach',
    review: {
      title: 'La semaine en bref',
      daysLogged: {
        zero: 'Aucun jour avec des repas notés pour l’instant',
        one: '{count} jour avec des repas notés',
        other: '{count} jours avec des repas notés',
      },
      averagesTitle: 'Moyenne par jour',
      averagesNote: {
        one: 'Moyenne sur le {count} jour terminé avec assez de repas notés. Aujourd’hui s’y ajoute une fois la journée finie.',
        other:
          'Moyenne sur les {count} jours terminés avec assez de repas notés. Aujourd’hui s’y ajoute une fois la journée finie.',
      },
      averagesExcluded: {
        one: '{count} autre jour terminé avait trop peu de repas notés pour compter.',
        other: '{count} autres jours terminés avaient trop peu de repas notés pour compter.',
      },
      averagesNone:
        'La moyenne par jour apparaît dès qu’un jour terminé a au moins deux assiettes avec poids et données nutritionnelles.',
      wentWellTitle: 'Ce qui s’est bien passé',
      tryTitle: 'Une chose à essayer',
      positives: {
        vegMostDays: 'Des légumes ou des fruits sont apparus {days} jours sur {of} notés.',
        proteinSteady:
          'Les protéines ont fait {approx}{g} g par jour en moyenne, une quantité régulière.',
        fibreSteady:
          'Les fibres ont fait {approx}{g} g par jour en moyenne, une quantité régulière.',
        saltModerate: 'Le sel a fait {approx}{g} g par jour en moyenne, plutôt léger.',
        sugarsModerate: 'Les sucres ont fait {approx}{g} g par jour en moyenne, plutôt léger.',
        variedWeek:
          'Légumes, protéines, féculents et produits laitiers sont chacun apparus au moins deux jours.',
      },
      suggestions: {
        moreVeg:
          'Des légumes ou des fruits sont apparus {days} jours sur {of} notés. Une poignée pourrait-elle rejoindre un repas de plus la semaine prochaine ?',
        moreProtein:
          'Les protéines ont fait {approx}{g} g par jour en moyenne. Ajouter {protein} au déjeuner pourrait en apporter plus la semaine prochaine.',
        moreFibre:
          'Les fibres ont fait {approx}{g} g par jour en moyenne. Des débuts faciles : {fibre}.',
        easeSalt:
          'Le sel a fait {approx}{g} g par jour en moyenne. Goûter avant de saler est un début tout doux.',
        easeSugars:
          'Les sucres ont fait {approx}{g} g par jour en moyenne. Remplacer une douceur par {sweet} est un petit changement.',
        easeEnergy:
          'L’énergie a fait environ {approx}{kcal} kcal par jour en moyenne, et « {foodLc} » est revenu souvent. Une portion plus petite ou un échange la semaine prochaine vous conviendrait-il ?',
        eatEnough:
          'L’énergie notée était bien en dessous de votre repère. Manger assez compte aussi : quelque chose échappe-t-il au journal, ou certains repas sont-ils difficiles à placer ?',
        lessSugaryDrinks: {
          one: 'Des boissons sucrées sont apparues {days} fois sur {of} jour noté. De l’eau à la place de l’une d’elles la semaine prochaine vous conviendrait-elle ?',
          other:
            'Des boissons sucrées sont apparues {days} fois sur {of} jours notés. De l’eau à la place de l’une d’elles la semaine prochaine vous conviendrait-elle ?',
        },
      },
      energy: {
        line: {
          one: 'Sur le {days} jour compté, l’énergie a fait environ {avg} kcal par jour en moyenne, {relation} votre repère de {guide} kcal.',
          other:
            'Sur les {days} jours comptés, l’énergie a fait environ {avg} kcal par jour en moyenne, {relation} votre repère de {guide} kcal.',
        },
        lineNoNumbers: {
          one: 'Sur le {days} jour compté, l’énergie a été en moyenne {relation} votre repère.',
          other:
            'Sur les {days} jours comptés, l’énergie a été en moyenne {relation} votre repère.',
        },
        relation: {
          near: 'proche de',
          above: 'un peu au-dessus de',
          farAbove: 'bien au-dessus de',
          below: 'un peu en dessous de',
          farBelow: 'bien en dessous de',
        },
        foods: 'Aliments riches en énergie revenus plus d’un jour : {foods}.',
      },
      weightLine: {
        lower: {
          one: 'Votre tendance de poids est d’environ {kg} kg plus basse qu’il y a {weeks} semaine',
          other:
            'Votre tendance de poids est d’environ {kg} kg plus basse qu’il y a {weeks} semaines',
        },
        higher: {
          one: 'Votre tendance de poids est d’environ {kg} kg plus haute qu’il y a {weeks} semaine',
          other:
            'Votre tendance de poids est d’environ {kg} kg plus haute qu’il y a {weeks} semaines',
        },
        steady: {
          one: 'Votre tendance de poids est à peu près la même qu’il y a {weeks} semaine',
          other: 'Votre tendance de poids est à peu près la même qu’il y a {weeks} semaines',
        },
        lowerNoNumbers: {
          one: 'Votre tendance de poids est un peu plus basse qu’il y a {weeks} semaine',
          other: 'Votre tendance de poids est un peu plus basse qu’il y a {weeks} semaines',
        },
        higherNoNumbers: {
          one: 'Votre tendance de poids est un peu plus haute qu’il y a {weeks} semaine',
          other: 'Votre tendance de poids est un peu plus haute qu’il y a {weeks} semaines',
        },
        intakeNear: ', alors que l’énergie notée était en moyenne proche de votre repère.',
        intakeAbove: ', alors que l’énergie notée était en moyenne au-dessus de votre repère.',
        intakeBelow: ', alors que l’énergie notée était en moyenne en dessous de votre repère.',
        end: '.',
        mismatch:
          'Les quantités notées sont des estimations, et les aliments ou portions non comptés sont la raison habituelle d’un écart entre une tendance et un journal. Chaque jour indique ce qui n’a pas été compté.',
      },
      qualityTitle: 'Un regard sur les aliments eux-mêmes',
      quality: {
        processedMeatOften: {
          one: 'De la charcuterie (jambon, saucisse, lardons) est apparue {days} fois sur {of} jour noté. Le repère habituel est d’en garder pour de temps en temps.',
          other:
            'De la charcuterie (jambon, saucisse, lardons) est apparue {days} fois sur {of} jours notés. Le repère habituel est d’en garder pour de temps en temps.',
        },
        redMeatOften: {
          one: 'De la viande rouge (bœuf, porc, agneau) est apparue {days} fois sur {of} jour noté. Le repère habituel est quelques fois par semaine au plus.',
          other:
            'De la viande rouge (bœuf, porc, agneau) est apparue {days} fois sur {of} jours notés. Le repère habituel est quelques fois par semaine au plus.',
        },
        sugaryDrinksOften: {
          one: 'Des boissons sucrées sont apparues {days} fois sur {of} jour noté. Le repère habituel pour boire au quotidien est l’eau.',
          other:
            'Des boissons sucrées sont apparues {days} fois sur {of} jours notés. Le repère habituel pour boire au quotidien est l’eau.',
        },
        pulsesLow: {
          one: 'Des légumineuses sont apparues {days} fois sur {of} jour noté. Le repère habituel est au moins deux fois par semaine.',
          other:
            'Des légumineuses sont apparues {days} fois sur {of} jours notés. Le repère habituel est au moins deux fois par semaine.',
        },
        fishLow: {
          one: 'Du poisson est apparu {days} fois sur {of} jour noté. Le repère habituel est environ deux fois par semaine, dont un poisson gras.',
          other:
            'Du poisson est apparu {days} fois sur {of} jours notés. Le repère habituel est environ deux fois par semaine, dont un poisson gras.',
        },
        wholegrainLow: {
          one: 'Les versions complètes représentent {n} sur {of} féculent à base de céréales noté. Le repère habituel est de choisir plus souvent le complet.',
          other:
            'Les versions complètes représentent {n} sur {of} féculents à base de céréales notés. Le repère habituel est de choisir plus souvent le complet.',
        },
        nutsNone: {
          one: 'Aucune noix n’est apparue sur {of} jour noté. Le repère habituel est une petite poignée de noix nature par jour.',
          other:
            'Aucune noix n’est apparue sur les {of} jours notés. Le repère habituel est une petite poignée de noix nature par jour.',
        },
      },
      stepTitle: 'Votre pas de la semaine',
      stepReview: {
        vegAtLunch: {
          one: 'Vous aviez choisi des légumes au déjeuner. Il y en avait à {matched} sur {of} déjeuner noté.',
          other:
            'Vous aviez choisi des légumes au déjeuner. Il y en avait à {matched} des {of} déjeuners notés.',
        },
        vegAtDinner: {
          one: 'Vous aviez choisi des légumes au dîner. Il y en avait à {matched} sur {of} dîner noté.',
          other:
            'Vous aviez choisi des légumes au dîner. Il y en avait à {matched} des {of} dîners notés.',
        },
        proteinAtBreakfast: {
          one: 'Vous aviez choisi des protéines au petit-déjeuner. Il y en avait à {matched} sur {of} petit-déjeuner noté.',
          other:
            'Vous aviez choisi des protéines au petit-déjeuner. Il y en avait à {matched} des {of} petits-déjeuners notés.',
        },
        proteinAtLunch: {
          one: 'Vous aviez choisi des protéines au déjeuner. Il y en avait à {matched} sur {of} déjeuner noté.',
          other:
            'Vous aviez choisi des protéines au déjeuner. Il y en avait à {matched} des {of} déjeuners notés.',
        },
        proteinAtDinner: {
          one: 'Vous aviez choisi des protéines au dîner. Il y en avait à {matched} sur {of} dîner noté.',
          other:
            'Vous aviez choisi des protéines au dîner. Il y en avait à {matched} des {of} dîners notés.',
        },
        waterForDrinks: {
          one: 'Vous aviez choisi de l’eau à la place des boissons sucrées. Des boissons sucrées sont apparues {matched} fois sur {of} jour noté.',
          other:
            'Vous aviez choisi de l’eau à la place des boissons sucrées. Des boissons sucrées sont apparues {matched} fois sur {of} jours notés.',
        },
        pulsesWeek: {
          one: 'Vous aviez choisi des légumineuses. Elles sont apparues {matched} fois sur {of} jour noté.',
          other:
            'Vous aviez choisi des légumineuses. Elles sont apparues {matched} fois sur {of} jours notés.',
        },
        fishWeek: {
          one: 'Vous aviez choisi du poisson. Il est apparu {matched} fois sur {of} jour noté.',
          other: 'Vous aviez choisi du poisson. Il est apparu {matched} fois sur {of} jours notés.',
        },
        nutsWeek: {
          one: 'Vous aviez choisi une poignée de noix. Elles sont apparues {matched} fois sur {of} jour noté.',
          other:
            'Vous aviez choisi une poignée de noix. Elles sont apparues {matched} fois sur {of} jours notés.',
        },
        wholegrainWeek: {
          one: 'Vous aviez choisi des versions complètes. Le complet représentait {matched} sur {of} féculent à base de céréales noté.',
          other:
            'Vous aviez choisi des versions complètes. Le complet représentait {matched} sur {of} féculents à base de céréales notés.',
        },
        noData:
          'Vous aviez choisi {step}. Le journal ne peut pas le montrer : vous seul pouvez dire comment cela s’est passé.',
        notYet:
          'Vous aviez choisi {step}. Il n’y a pas encore assez de repas notés pour dire comment cela s’est passé.',
      },
      suggestionsNoNumbers: {
        easeEnergy:
          'L’énergie a été au-dessus de votre repère, et « {foodLc} » est revenu souvent. Une portion plus petite ou un échange la semaine prochaine vous conviendrait-il ?',
      },
      ai: {
        button: 'Interroger le coach sur cette semaine',
        buttonEarlier: 'Interroger le coach sur la semaine du {from} au {to}',
        heading: 'Le coach, sur cette semaine',
        headingEarlier: 'Le coach, sur la semaine du {from} au {to}',
        reading: 'Le coach relit votre semaine…',
        mark: 'Écrit par une IA',
        busy: 'L’IA est occupée. Réessayez dans un instant.',
        failure: 'Le coach n’a pas pu répondre à l’instant. Vous pouvez réessayer.',
        unsure: 'Le coach n’a pas trouvé de mots dont il soit satisfait. Vous pouvez réessayer.',
        hiddenByNumbers:
          'Cette réponse cite des quantités, masquées tant que les chiffres nutritionnels sont masqués.',
        needsSetup:
          'Pour interroger le coach sur votre semaine, choisissez une IA et activez le coaching par IA dans Réglages, Votre IA.',
        needsConsent:
          'Pour interroger le coach sur votre semaine, activez le coaching par IA dans Réglages, Votre IA. Vos repas ne sont envoyés qu’après votre accord.',
        open: 'Ouvrir Votre IA',
        note: 'Cela envoie à {host} le nombre de jours, les moyennes quotidiennes et le repère quotidien de la semaine, avec votre profil si vous l’avez rempli. Le bilan ci-dessus reste tel quel.',
      },
    },
  },
  about: {
    title: 'À propos de cette application',
    lead: 'Une façon calme de noter ce que vous mangez et de comprendre votre journée. Trois choses à savoir avant de commencer.',
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
    networkHeading: 'La semaine d’un coup d’œil',
    seeWeekNetwork: 'Voir toute la semaine',
    seeProgress: 'Votre évolution',
    backToToday: 'Revenir à aujourd’hui',
    weighInLink: 'Ajouter une pesée',
    guideHint:
      'Votre journée est montrée face à une référence générale. Ajoutez quelques détails pour un repère à vous.',
    guideHintLink: 'Ajouter des détails dans le Profil',
    guideHintDismiss: 'Fermer',
    askCoachLink: 'Interroger le coach',
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
    /** La ligne facultative (Réglages, Nutrition) : le seul endroit où cette formulation est permise. */
    distanceTo: 'environ {amount} kcal avant votre repère du jour',
    distancePast: 'environ {amount} kcal au-delà de votre repère du jour',
    barsLabel: 'Quantités de nutriments par rapport aux apports de référence',
    atLeast: 'au moins {value}',
    notCounted: { one: '{count} aliment non compté', other: '{count} aliments non comptés' },
    partialNote:
      'Marqué « au moins » : certains aliments n’ont pas cette donnée, la quantité réelle peut donc être plus élevée.',
    uncountedLabel: 'Aliments sans données',
    uncountedNoWeight: 'Sans poids',
    uncountedNoData: 'Sans données nutritionnelles',
    uncountedFix: 'Compléter',
    uncountedFixOf: 'Ajouter le poids ou la nutrition de {name}',
    coverage: {
      one: 'Calculé sur {count} aliment avec un poids et des données nutritionnelles ; {missing} sans.',
      other:
        'Calculé sur {count} aliments avec un poids et des données nutritionnelles ; {missing} sans.',
    },
    whatAre: 'Que sont les apports de référence ?',
    whatAreBody:
      'Les apports de référence sont les quantités quotidiennes fixées par le règlement européen 1169/2011 pour un adulte moyen consommant 2 000 kcal par jour. Les fibres n’ont pas de valeur européenne : 25 g est une recommandation générale. Vos besoins peuvent être différents, et les barres sont une information, pas un objectif.',
    whatAreBodyPersonal:
      'Les barres utilisent votre repère du jour, calculé à partir du profil choisi dans les Réglages : votre tranche d’âge, votre sexe, votre activité, et votre poids et votre taille si vous les avez saisis, avec les valeurs de référence européennes (EFSA) et les équations de Henry (2005). C’est une estimation, en général à environ 10 % près, pas un conseil, et les barres sont une information, pas un objectif. Une barre continue au-delà du repère quand une quantité va plus loin que le repère du jour ; le chiffre dit de combien. Sans profil, ce sont les apports de référence UE qui servent (2 000 kcal par jour).',
  },
  support: {
    line: 'Si l’alimentation ou le poids occupent beaucoup vos pensées, en parler à quelqu’un peut aider.',
    linkLabel: 'FFAB, Fédération Française Anorexie Boulimie',
    newTab: '(s’ouvre dans un nouvel onglet)',
  },
  profile: {
    title: 'Profil',
    intro:
      'Facultatif. Il ajuste votre repère du jour et le coach. Il reste chiffré sur cet appareil, et dans votre sauvegarde si vous en faites une. Quand le coaching par IA est activé, votre objectif, votre régime, vos allergies, votre tranche d’âge, votre sexe et votre activité sont envoyés au coach, avec votre repère du jour arrondi. Votre poids, votre taille et votre tour de taille ne le sont jamais.',
    notSet: 'Non renseigné',
    ageBand: 'Tranche d’âge',
    sex: 'Sexe',
    activity: 'Activité',
    goal: 'Souhait',
    diet: 'Alimentation',
    aboutTitle: 'Vous',
    aboutHelp:
      'Votre tranche d’âge, votre sexe et votre activité donnent le point de départ de votre repère du jour.',
    bodyTitle: 'Corps',
    bodyHelp:
      'Facultatif. Une taille et un poids rendent votre repère plus personnel. Sans poids, un poids d’adulte moyen est utilisé.',
    goalTitle: 'Souhait',
    goalHelp:
      'Votre souhait fixe l’écart entre votre repère du jour et l’énergie qui maintient votre poids.',
    guideTitle: 'Votre repère du jour',
    foodTitle: 'Alimentation',
    foodHelp: 'Votre régime et vos allergies ajustent ce que propose le coach.',
    sexOptions: { female: 'Femme', male: 'Homme', unspecified: 'Je préfère ne pas dire' },
    activityOptions: {
      low: 'Plutôt assis',
      moderate: 'Un peu de mouvement',
      high: 'Actif',
      veryHigh: 'Très actif',
    },
    activityHelp: {
      low: 'Bureau ou maison la plupart du temps, peu d’exercice.',
      moderate: 'Debout une partie de la journée, ou un exercice léger quelques fois par semaine.',
      high: 'Debout la plupart de la journée, ou un exercice régulier presque tous les jours.',
      veryHigh: 'Travail physique, ou entraînement soutenu presque tous les jours.',
    },
    goalOptions: {
      eatBetter: 'Mieux manger',
      maintain: 'Rester comme je suis',
      lose: 'Perdre du poids',
      gain: 'Prendre du poids',
    },
    goalEffect: {
      eatBetter: 'Le repère du jour reste à l’énergie qui maintient votre poids.',
      maintain: 'Le repère du jour reste à l’énergie qui maintient votre poids.',
      lose: 'Le repère du jour est un peu en dessous de l’énergie qui maintient votre poids.',
      gain: 'Le repère du jour est un peu au-dessus de l’énergie qui maintient votre poids.',
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
    units: 'Unités',
    unitsHelp: 'Change seulement l’affichage et la saisie des longueurs et des poids.',
    unitsOptions: { metric: 'kg et cm', imperial: 'lb et pi/po' },
    heightLabel: 'Taille',
    heightHelp: 'Sert avec votre poids à rendre le repère plus personnel.',
    heightCm: 'Taille en cm',
    heightFt: 'Pieds',
    heightIn: 'Pouces',
    heightSave: 'Enregistrer la taille',
    heightRemove: 'Retirer la taille',
    weightLabel: 'Poids actuel',
    weightHelp:
      'Enregistrer un poids ajoute une pesée datée d’aujourd’hui. Une seconde le même jour la remplace.',
    weightKg: 'Poids en kg',
    weightLb: 'Poids en lb',
    weightSave: 'Enregistrer le poids',
    weightFrom: 'Dernier : {value} le {date}.',
    weighIns: 'Pesées récentes',
    weighInsAll: 'Toutes les pesées et la tendance',
    howWeighIn: 'Le poids utilisé est {value}, d’après votre pesée du {date}.',
    howWeighInStale:
      'Cette pesée a plus de deux mois. Vous pouvez en ajouter une nouvelle quand cela vous convient.',
    weighInRemove: 'Retirer la pesée du {date}',
    waistLabel: 'Tour de taille (facultatif)',
    waistCm: 'Tour de taille en cm',
    waistIn: 'Tour de taille en pouces',
    waistSave: 'Enregistrer le tour de taille',
    waistFrom: 'Mesuré le {date} : {value}.',
    waistRemove: 'Retirer le tour de taille du {date}',
    waistHow: 'Comment le mesurer',
    waistHowBody:
      'Tenez-vous détendu et mesurez à mi-chemin entre la dernière côte et le haut de l’os de la hanche, après avoir expiré, le mètre bien ajusté sans serrer.',
    unitKg: 'kg',
    unitLb: 'lb',
    unitCm: 'cm',
    unitIn: 'po',
    errorNumber: 'Saisissez un nombre, par exemple {example}.',
    errorHeight: 'Saisissez une taille entre {min} et {max} {unit}.',
    errorHeightImperial: 'Saisissez une taille entre {min} et {max}.',
    errorInches: 'Les pouces vont de 0 à 11,9.',
    heightFtIn: '{feet} pi {inches} po',
    errorWeight: 'Saisissez un poids entre {min} et {max} {unit}.',
    errorWaist: 'Saisissez un tour de taille entre {min} et {max} {unit}.',
    pace: 'Rythme',
    paceOptions: { gentle: 'Doux', standard: 'Habituel', faster: 'Plus soutenu' },
    paceHelpLose: {
      gentle: 'Environ 250 kcal par jour de moins que l’énergie qui maintient votre poids.',
      standard: 'Environ 500 kcal par jour de moins que l’énergie qui maintient votre poids.',
      faster:
        'Environ 750 kcal par jour de moins, pour au plus un quart de l’énergie qui maintient votre poids.',
    },
    paceHelpGain: {
      gentle: 'Environ 250 kcal par jour de plus que l’énergie qui maintient votre poids.',
      standard: 'Environ 250 kcal par jour de plus que l’énergie qui maintient votre poids.',
      faster: 'Environ 400 kcal par jour de plus que l’énergie qui maintient votre poids.',
    },
    paceExpectationLose:
      'Environ 0,25 à 0,75 kg par semaine au début, puis de plus en plus lentement. De 5 à 10 % de votre poids en six mois est un résultat réaliste. Ce sont des estimations, pas des promesses.',
    paceExpectationLoseImperial:
      'Environ 0,5 à 1,5 lb par semaine au début, puis de plus en plus lentement. De 5 à 10 % de votre poids en six mois est un résultat réaliste. Ce sont des estimations, pas des promesses.',
    paceExpectationGain:
      'Prendre du poids lentement se garde plus facilement. Ce sont des estimations, pas des promesses.',
    pregnantLabel: 'Je suis enceinte ou j’allaite',
    pregnantHelp: 'Votre repère du jour ne vise alors pas à perdre du poids.',
    pregnantNote:
      'Le repère ne tient pas compte des besoins supplémentaires de la grossesse ou de l’allaitement. Une sage-femme ou un médecin est la bonne personne à qui poser la question.',
    guideComplete: 'Votre repère du jour est d’environ {energy} kcal et {protein} g de protéines.',
    guideIncomplete:
      'Renseignez le sexe, la tranche d’âge et l’activité pour ajuster le repère du jour. D’ici là, l’apport de référence UE est utilisé.',
    guideMakePersonal:
      'Il utilise un poids d’adulte moyen. Saisissez votre poids dans Corps pour le rendre personnel.',
    noticeHeld:
      'Votre repère du jour reste à l’énergie qui maintient votre poids. Si vous voulez perdre du poids, en parler d’abord à un médecin ou à un diététicien peut aider.',
    noticeOlder:
      'Après 65 ans, mieux vaut décider d’une perte de poids avec un médecin. Votre repère du jour reste à l’énergie qui maintient votre poids.',
    noticeGain:
      'Votre repère du jour reste à l’énergie qui maintient votre poids. Si vous voulez prendre du poids, en parler d’abord à un médecin ou à un diététicien peut aider.',
    noticeBodyUnknownLose:
      'Pour calculer un repère de perte de poids, ajoutez votre taille et votre poids dans Corps. D’ici là, votre repère du jour est l’énergie qui maintient votre poids.',
    noticeBodyUnknownGain:
      'Pour calculer un repère de prise de poids, ajoutez votre taille et votre poids dans Corps. D’ici là, votre repère du jour est l’énergie qui maintient votre poids.',
    noticeHeldRaised:
      'Votre repère du jour est de {floor} kcal, le plus bas chiffre utilisé pour un repère, un peu au-dessus de l’énergie qui maintient votre poids. Si vous voulez perdre du poids, en parler d’abord à un médecin ou à un diététicien peut aider.',
    noticeOlderRaised:
      'Après 65 ans, mieux vaut décider d’une perte de poids avec un médecin. Votre repère du jour est de {floor} kcal, le plus bas chiffre utilisé pour un repère, un peu au-dessus de l’énergie qui maintient votre poids.',
    noticeFloor: 'Votre repère du jour est tenu à {floor} kcal au moins.',
    noticeFloorRaised:
      'Votre repère du jour est de {floor} kcal, le plus bas chiffre utilisé pour un repère, un peu au-dessus de l’énergie qui maintient votre poids.',
    how: 'Comment c’est calculé',
    howResting:
      'Énergie au repos : environ {kcal} kcal par jour, d’après les équations de Henry (2005), avec {inputs}.',
    howInputsWeightHeight: 'votre poids et votre taille',
    howInputsWeight: 'votre poids',
    howInputsReference: 'un poids d’adulte moyen, faute de poids renseigné',
    howActivity: 'Activité : multipliée par {pal} pour « {activity} ».',
    howMaintenance: 'L’énergie qui maintient votre poids : environ {kcal} kcal.',
    howAdjustLess: 'Votre souhait et votre rythme : {kcal} kcal par jour de moins.',
    howAdjustMore: 'Votre souhait et votre rythme : {kcal} kcal par jour de plus.',
    howNone: 'Votre souhait ne demande aucun changement.',
    howCustom: 'Vous avez fixé ce chiffre vous-même.',
    howFloorLimited:
      'Un écart de cette taille descendrait sous {floor} kcal, le plus bas chiffre utilisé pour un repère : il est donc fixé à {floor} kcal.',
    howFloorRaised:
      'L’énergie qui maintient votre poids est estimée sous {floor} kcal, le plus bas chiffre utilisé pour un repère : le repère est donc fixé à {floor} kcal.',
    howHeld:
      'Une précaution a décidé de ce chiffre : votre repère du jour reste à l’énergie qui maintient votre poids au lieu de passer en dessous.',
    howHeldUnknown:
      'Il faut d’abord votre taille et votre poids : pour l’instant, votre repère est l’énergie qui maintient votre poids.',
    howCustomIgnoredFloor:
      'Votre propre chiffre était sous {floor} kcal, le plus bas chiffre utilisé pour un repère : il n’a donc pas été utilisé.',
    howCustomIgnoredSafeguard:
      'Votre propre chiffre était sous l’énergie qui maintient votre poids tant que la précaution ci-dessus s’applique : il n’a donc pas été utilisé.',
    howSteps:
      'Ces règles ont des seuils : le repère peut donc changer par paliers plutôt que progressivement, et une petite variation de votre poids ou de votre taille peut le déplacer de quelques centaines de kcal.',
    howProtein: 'Protéines : {perKg} g par kg de {basis}, soit environ {grams} g.',
    howBasisWeight: 'votre poids',
    howBasisBmi25: 'poids correspondant à un IMC de 25 (votre IMC est supérieur à 30)',
    howBasisReference: 'poids d’adulte moyen',
    howBasisCapped:
      'poids correspondant à un IMC de 30 pour une taille moyenne, faute de taille renseignée et parce que votre poids est au-dessus',
    howOthers:
      'Les lipides font 35 % de l’énergie et les saturés 10 % ; les glucides sont le reste. Les fibres sont de {fibre} g (30 g est un objectif courant) et le sel de 6 g, la référence de l’étiquette européenne.',
    howAccuracy:
      'C’est une estimation, en général à environ 10 % près. C’est un point de départ que vous pouvez changer, pas un conseil.',
    customToggle: 'Fixer mon propre repère',
    customHelp:
      'Saisissez l’énergie quotidienne que vous voulez comme repère. Elle remplace celle qui est calculée.',
    customLabel: 'Énergie quotidienne en kcal',
    customSave: 'Utiliser ce chiffre',
    customReset: 'Revenir au repère calculé',
    customActive: 'Vous utilisez votre propre chiffre : {kcal} kcal.',
    customRefused:
      'Le chiffre que vous avez fixé est sous {floor} kcal, donc le repère calculé est utilisé à la place.',
    customRefusedSafeguard:
      'Le chiffre que vous avez fixé est sous l’énergie qui maintient votre poids, et votre repère du jour y est tenu pour l’instant : le repère calculé est donc utilisé à la place. Un chiffre plus bas se fixe mieux avec un médecin ou un diététicien.',
    errorCustomSafeguard:
      'C’est plus bas que l’énergie qui maintient votre poids, et votre repère du jour y est tenu pour l’instant. Un chiffre plus bas se fixe mieux avec un médecin ou un diététicien.',
    errorCustomRange: 'Saisissez un chiffre entre {min} et {max} kcal.',
    errorCustomFloor:
      'C’est plus bas que le plus bas chiffre utilisé pour un repère ({floor} kcal). Un repère si bas se fixe mieux avec un médecin ou un diététicien.',
    guideNumbersOff:
      'Les chiffres nutritionnels sont masqués : les valeurs ne sont donc pas affichées ici.',
    guideNumbersOffLink: 'Les afficher dans Réglages, Nutrition',
    bmiToggle: 'Indice de masse corporelle et rapport tour de taille sur taille',
    bmiIntro:
      'Deux nombres simples que certaines personnes aiment connaître. Ils sont approximatifs, ne disent rien de vous en tant que personne, et peuvent rester fermés.',
    bmiValue: 'Indice de masse corporelle (IMC) : {value}.',
    bmiNeeds: 'Saisissez une taille et un poids pour voir un IMC.',
    bmiRanges:
      'Plages de référence pour les adultes (OMS) : moins de 18,5 ; 18,5 à 24,9 ; 25 à 29,9 ; 30 ou plus.',
    bmiCaveats:
      'L’IMC est moins fiable avec une forte musculature, à 65 ans et plus, et pendant la grossesse. Pour les personnes d’origine sud-asiatique, chinoise, autre asiatique, moyen-orientale, africaine noire ou afro-caribéenne, des seuils plus bas sont utilisés : 23 et 27,5 au lieu de 25 et 30.',
    whtrValue: 'Rapport tour de taille sur taille : {value}.',
    whtrNeeds: 'Saisissez une taille et un tour de taille pour voir ce rapport.',
    whtrRanges:
      'Plages de référence pour les adultes (NICE) : 0,4 à 0,49 ; 0,5 à 0,59 ; 0,6 ou plus.',
    whtrNotUseful:
      'Le rapport tour de taille sur taille n’apporte pas de mesure utile en plus à partir d’un IMC de 35.',
    clear: 'Effacer le profil',
    cleared: 'Profil effacé.',
    removeMeasurements: 'Retirer toutes les mesures',
    measurementsRemoved: 'Mesures retirées.',
    removeMeasurementsTitle: 'Retirer toutes les mesures ?',
    removeMeasurementsBody:
      'Cela retire toutes les pesées et tous les tours de taille. C’est appliqué sur chaque appareil synchronisé avec celui-ci, et ce n’est pas réversible.',
    removeMeasurementsConfirm: 'Tout retirer',
    removeMeasurementsKeep: 'Les garder',
    saveFailed: 'Cela n’a pas été enregistré à l’instant. Rien n’a changé.',
  },
  nutritionSettings: {
    title: 'Nutrition',
    switchTitle: 'Afficher les valeurs nutritionnelles',
    switchHelp:
      'Si les chiffres sur l’alimentation vous pèsent, vous pouvez masquer les valeurs nutritionnelles et les barres. Les poids et vos repas restent.',
    distanceTitle: 'Afficher l’écart avec mon repère du jour',
    distanceHelp:
      'Ajoute une ligne simple sous la barre d’énergie avec l’écart entre la journée et votre repère du jour, en kcal. Rien ne change de couleur et rien n’est compté. Désactivé tant que vous ne l’activez pas.',
    saveFailed: 'Cela n’a pas été enregistré à l’instant. L’interrupteur reste où il était.',
  },
  relog: {
    again: 'Noter à nouveau',
    againTitle: 'Noter à nouveau',
    againIntro:
      'Une nouvelle assiette avec les mêmes aliments et les mêmes quantités. L’originale reste telle quelle.',
    whichDay: 'Quel jour',
    dayToday: 'Aujourd’hui',
    whichMeal: 'Quel repas',
    againConfirm: 'Noter cette assiette',
    againDoneToday: 'Noté à nouveau : {meal}.',
    againDoneOther: 'Noté à nouveau : {meal}, {day}.',
    copyDay: 'Copier ce jour sur aujourd’hui',
    copyDayIntro:
      'Ces assiettes seront ajoutées à aujourd’hui, aux mêmes heures. Ce qui s’y trouve déjà reste en place.',
    copyDayList: 'Assiettes à copier',
    copyDayLine: '{meal}, {time} : {foods}',
    copyDayConfirm: 'Copier sur aujourd’hui',
    copyDayKeep: 'Pas maintenant',
    copiedDay: {
      one: '{count} assiette copiée sur aujourd’hui.',
      other: '{count} assiettes copiées sur aujourd’hui.',
    },
    copiedDayPartial: {
      one: '{count} assiette copiée sur {total}. Les autres n’ont pas été enregistrées ; vous pouvez réessayer.',
      other:
        '{count} assiettes copiées sur {total}. Les autres n’ont pas été enregistrées ; vous pouvez réessayer.',
    },
    copyDayLater: 'Plus tard que maintenant, non copiées',
    saveMeal: 'Garder comme repas',
    saveMealIntro: 'Gardez ces aliments et ces quantités pour les noter à nouveau d’un geste.',
    mealName: 'Nom',
    saveMealConfirm: 'Garder ce repas',
    mealSaved: 'Gardé sous « {name} ».',
    nameNeeded: 'Donnez-lui d’abord un nom.',
    recent: 'Récents',
    often: 'Souvent',
    oftenTimes: { one: '{count} fois en 30 jours', other: '{count} fois en 30 jours' },
    logRowOf: 'Noter {name}, {quantity}',
    changeAmount: 'Modifier',
    changeAmountOf: 'Modifier la quantité de {name}',
    savedEntry: 'Repas et recettes gardés',
    savedTitle: 'Repas et recettes gardés',
    savedMeals: 'Repas',
    savedRecipes: 'Recettes',
    savedEmpty:
      'Rien de gardé pour l’instant. Gardez une assiette comme repas depuis sa page, ou écrivez une recette.',
    savedCannotLoad: 'Impossible de charger les repas gardés pour le moment.',
    mealFoods: { one: '{count} aliment', other: '{count} aliments' },
    recipeServings: { one: '{count} portion', other: '{count} portions' },
    logMealTitle: 'Noter « {name} »',
    logMealIntro: 'Modifiez une quantité si cette fois est différente, puis notez le repas.',
    logMeal: 'Noter ce repas',
    backToSaved: 'Repas gardés',
    useRecipe: 'Chercher dans les aliments',
    rename: 'Renommer',
    renameOf: 'Renommer {name}',
    renameField: 'Nouveau nom',
    renameSave: 'Enregistrer le nom',
    cancel: 'Annuler',
    renamed: 'Renommé.',
    remove: 'Supprimer',
    removeOf: 'Supprimer {name}',
    removeTitle: 'Supprimer « {name} » ?',
    removeBody: 'Les assiettes déjà notées avec ce repas restent telles quelles.',
    removeKeep: 'Le garder',
    removed: 'Supprimé.',
    newRecipe: 'Nouvelle recette',
    recipe: {
      title: 'Nouvelle recette',
      name: 'Nom de la recette',
      ingredients: 'Ingrédients',
      none: 'Aucun ingrédient pour l’instant.',
      search: 'Chercher un ingrédient',
      add: 'Ajouter à la recette',
      removeIngredient: 'Retirer',
      removeIngredientOf: 'Retirer {name}',
      servings: 'Portions',
      cooked: 'Poids cuit, en grammes (facultatif)',
      cookedHint:
        'Pesez le plat terminé pour un résultat plus proche. Sans cela, le poids des ingrédients est utilisé et les valeurs restent des estimations.',
      perServing: 'Une portion pèse environ {weight}.',
      perServingValues: 'Par portion : {values}',
      partial:
        'Les valeurs nutritionnelles sont connues pour {counted} ingrédients sur {total} : ces chiffres peuvent être sous-estimés.',
      save: 'Garder la recette',
      saved: 'Recette gardée : « {name} ».',
      needsName: 'Donnez un nom à la recette.',
      needsIngredient: 'Ajoutez au moins un ingrédient.',
      needsGrams: 'Chaque ingrédient a besoin d’un poids en grammes.',
      badServings: 'Les portions sont un nombre entier de 1 à {max}.',
      badCooked: 'Le poids cuit est un nombre de grammes, jusqu’à {max}.',
      cookedImplausible:
        'Ce poids cuit est très éloigné du poids des ingrédients (de un cinquième à trois fois). Vérifiez les grammes.',
      tooMany: 'Une recette compte au plus {max} ingrédients.',
      suggestions: 'Voulez-vous dire l’un de ceux-ci ?',
      useSuggestionFor: 'Utiliser {name} pour « {line} »',
      matchedFrom: '{line} →',
      pasteOpen: 'Coller une recette',
      pasteTitle: 'Coller une recette',
      pasteIntro:
        'Collez la liste des ingrédients, ou tout le texte d’une page de recette. Rien n’est récupéré sur le web.',
      pasteLabel: 'Texte de la recette',
      pasteLimit: 'Jusqu’à {max} caractères.',
      pasteRead: 'Lire cette recette',
      pasteReading: 'Lecture…',
      pasteClose: 'Fermer',
      pasteEmpty: 'Collez d’abord la recette.',
      pasteNothing:
        'Aucun ingrédient trouvé dans ce texte. Vérifiez qu’il contient la liste des ingrédients.',
      pasteNoAiNote:
        'Aucune IA n’est configurée : la recette est lue sur cet appareil. Rien n’est envoyé.',
      pasteAskFirstNote:
        'Avant que quoi que ce soit parte vers une IA, on vous le demande. Sans elle, la recette est lue sur cet appareil.',
      pasteAiNoteByok:
        'Le texte de la recette est envoyé à {host} pour être lu. Vous pouvez changer cela dans Réglages → Votre IA.',
      pasteAiNoteInstance:
        'Le texte de la recette est envoyé à ce serveur ({host}), qui le transmet à {label}. Vous pouvez changer cela dans Réglages → Votre IA.',
      pasteDeclined: 'Rien n’a été envoyé. La recette a été lue sur cet appareil.',
      pasteAiFailed:
        'L’IA n’a pas pu lire cela pour l’instant : la recette a été lue sur cet appareil.',
      pasteBusy: 'L’IA est occupée : la recette a été lue sur cet appareil.',
      pasteDone:
        'Rempli d’après votre texte. Vérifiez les noms et les quantités, puis gardez la recette.',
      pasteEstimated:
        'Les poids marqués ≈ sont des estimations : cuillères, tasses et millilitres sont convertis en grammes. Vérifiez-les.',
      notAddedTitle: 'Pas encore reconnus',
      notAddedBody:
        'Ces lignes n’ont pas de correspondance dans la liste d’aliments, ou pas de poids exploitable. Cherchez-les plus bas pour les ajouter à la main.',
      heavy: 'Cela fait plus de 5 kg par portion. Vérifiez le nombre de portions et le poids cuit.',
    },
  },
  plate: {
    removeAction: 'Retirer cette assiette',
    editAction: 'Modifier cette assiette',
    editTitle: 'Modifier l’assiette',
    editIntro:
      'Changez les quantités, retirez ou ajoutez un aliment, ou déplacez l’assiette vers un autre repas ou un autre jour.',
    editRemove: 'Retirer {name}',
    editAddFood: 'Ajouter un aliment',
    editAddConfirm: 'Ajouter à l’assiette',
    editSave: 'Enregistrer les modifications',
    editSaved: 'Assiette modifiée.',
    editFailed: 'Impossible d’enregistrer les modifications. Rien n’a été changé.',
    editEmpty:
      'Une assiette doit contenir au moins un aliment. Pour la supprimer, utilisez « Retirer cette assiette ».',
    editInvalid: 'Un des montants n’est pas encore un nombre valide. Corrigez-le pour enregistrer.',
  },
  /** How a share of the day's reference reads inside a coach note. */
  coachShare: { around: 'environ {pct} %', underOne: 'moins de 1 %' },
  /** The foods a coach note names, by slot option id (the core owns the ids and the diet and allergy limits). */
  coachFoods: {
    eggs: 'des œufs',
    beans: 'des haricots',
    lentils: 'des lentilles',
    chickpeas: 'des pois chiches',
    tofu: 'du tofu',
    fish: 'du poisson',
    tinnedFish: 'du poisson en boîte',
    yogurt: 'du yaourt',
    cheese: 'du fromage',
    milk: 'du lait',
    nuts: 'des noix',
    fruit: 'un fruit',
    oats: 'des flocons d’avoine',
    wholegrainBread: 'du pain complet',
    brownRice: 'du riz complet',
  },
  /** What a slot says when the diet and allergies leave it no option. */
  coachSlotFallback: {
    protein: 'une source de protéines qui vous convient',
    dairy: 'un produit laitier qui vous convient',
    fibre: 'un aliment riche en fibres',
    snack: 'quelque chose de léger',
    breakfast: 'une source de protéines',
    sweet: 'quelque chose de moins sucré',
    pulses: 'des légumineuses',
    wholegrain: 'des versions complètes',
  },
  /** The one next step the person may accept from the coach. */
  coachStep: {
    thisWeek: 'Cette semaine : {step}',
    offer: 'Essayer cette semaine',
    offered: 'Choisi pour cette semaine : {step}',
    done: 'C’est fait',
    drop: 'Laisser tomber',
    keep: 'Garder une semaine de plus',
    change: 'En changer',
    saveFailed: 'Impossible de garder cela. Déverrouillez l’application et réessayez.',
    names: {
      vegAtLunch: 'une portion de légumes au déjeuner',
      vegAtDinner: 'une portion de légumes au dîner',
      proteinAtBreakfast: 'des protéines au petit-déjeuner',
      proteinAtLunch: 'des protéines au déjeuner',
      proteinAtDinner: 'des protéines au dîner',
      waterForDrinks: 'de l’eau à la place des boissons sucrées',
      fruitSnack: 'un fruit à la place d’une collation riche en énergie',
      smallerPortion: 'une portion plus petite de « {food} »',
      pulsesWeek: 'des légumineuses à deux repas',
      fishWeek: 'du poisson à deux repas',
      wholegrainWeek: 'des versions complètes de vos féculents habituels',
      nutsWeek: 'une petite poignée de noix nature',
    },
  },
  /** The coach page: step, latest notes, the week, the guide, and the conversation when an AI is on. */
  coachPage: {
    title: 'Le coach',
    intro:
      'Un endroit calme pour ce que le coach a remarqué. Rien ici ne vous demande quoi que ce soit.',
    stepTitle: 'Votre pas',
    stepNone:
      'Aucun pas choisi. Quand le coach propose un petit changement sous une assiette, vous pouvez l’essayer pour la semaine.',
    notesTitle: 'Dernières notes',
    notesNone: 'Aucune note ces derniers jours.',
    notesFor: '{day}, {meal}',
    weekTitle: 'La semaine',
    weekNone: 'Rien de noté cette semaine pour l’instant.',
    guideTitle: 'Votre repère du jour',
    guidePersonal:
      'Environ {kcal} kcal et {protein} g de protéines par jour, calculés d’après votre profil.',
    guideReference: 'Les apports de référence de l’UE, faute d’un profil pour un repère à vous.',
    guideNoNumbers:
      'Les chiffres nutritionnels sont masqués, le repère aussi. Vous pouvez les afficher dans Réglages, Nutrition.',
    profileLink: 'Ouvrir le profil',
    aiNone: 'Aucune IA n’est configurée, le coach écrit donc ses notes intégrées.',
    aiNeedsConsent:
      'Une IA est choisie, mais le coaching par IA est désactivé : le coach écrit donc ses notes intégrées.',
    aiLink: 'En choisir une dans Votre IA',
    aiLinkConsent: 'L’activer dans Votre IA',
    chatTitle: 'Interroger le coach',
  },
  /** Ask the coach (optional AI chat) and the AI coaching copy. */
  askCoach: {
    title: 'Interroger le coach',
    intro:
      'Posez une question sur vos sept derniers jours de repas. L’IA voit les noms de vos aliments, leurs groupes, les totaux de nutriments de chaque jour et votre profil, jamais vos photos. Ce n’est pas un avis médical.',
    memory:
      'Cette conversation n’est gardée que pendant que l’application est déverrouillée. Elle n’est ni enregistrée ni exportée, et elle disparaît quand vous verrouillez l’application.',
    offTitle: 'Le coach IA est désactivé',
    offNoAi:
      'Interroger le coach demande une IA. Choisissez-en une, et acceptez le coaching par IA, dans Réglages, Votre IA. D’ici là, le coach continue d’écrire ses notes intégrées.',
    offNeedsConsent:
      'Interroger le coach envoie vos repas à {host} : il faut donc votre accord d’abord. Vous pouvez le donner dans Réglages, Votre IA.',
    openYourAi: 'Ouvrir Votre IA',
    inputLabel: 'Votre question',
    inputHint: 'Par exemple : ma semaine est-elle assez variée ?',
    counter: '{count} caractères sur {max}',
    send: 'Demander',
    thinking: 'Le coach réfléchit…',
    conversation: 'Échange',
    you: 'Vous',
    coach: 'Le coach',
    aiMark: 'Écrit par une IA',
    asked: '{count} questions posées sur {max}',
    limit:
      'Cette conversation est terminée : {max} questions. Commencez-en une nouvelle pour continuer.',
    newConversation: 'Commencer une nouvelle conversation',
    busy: 'L’IA est occupée. Réessayez dans un instant.',
    failure:
      'Le coach n’a pas pu répondre à l’instant. Votre question est toujours dans la zone de saisie.',
    consent: 'Le coaching par IA est désactivé. Activez-le dans Réglages, Votre IA.',
    unavailable:
      'Aucune IA n’est configurée pour le moment. Choisissez-en une dans Réglages, Votre IA.',
    unsure:
      'Je n’ai pas trouvé de mots dont je sois satisfait. Pourriez-vous poser la question autrement ?',
    supportEating:
      'Il semble que la nourriture ou votre corps vous préoccupent. Je ne peux pas vous conseiller là-dessus.',
    supportMedical:
      'Cela mérite l’avis d’un médecin ou d’un pharmacien. Je ne peux pas donner de conseil sur des symptômes.',
    supportUrgent:
      'Cela peut être urgent. Appelez les secours maintenant : le 15 ou le 112 en France, le 112 dans l’Union européenne. Je ne peux pas donner de conseil sur des symptômes.',
    supportSelfHarm:
      'Ce que vous ressentez compte, et merci d’en parler. Vous n’avez pas à porter cela sans aide. En France, vous pouvez appeler le 3114, le numéro national de prévention du suicide, gratuit et ouvert jour et nuit. Ailleurs, appelez le numéro d’urgence local (le 112 dans l’Union européenne) ou une ligne d’écoute près de chez vous.',
    supportExtreme:
      'Manger si peu, ou perdre du poids si vite, est dur pour le corps, et je ne peux pas vous y aider. Un médecin ou un diététicien peut en parler avec vous. Je peux vous aider avec un rythme plus doux et avec ce que vous mangez déjà.',
    unsureWeight:
      'Cela ressemble à une question sur la perte de poids. Si c’est votre objectif, vous pouvez le choisir dans le profil, et je pourrai alors vous aider sur ce que vous mangez.',
    openProfile: 'Ouvrir le profil',
    hiddenByNumbers:
      'Cette réponse cite des quantités, masquées tant que les chiffres nutritionnels sont masqués.',
  },
  coachQuestions: {
    'post.resolve.vegLight':
      'Pas de légumes ni de fruits pour l’instant aujourd’hui. Une poignée pourrait-elle se glisser dans ce repas, même à côté ?',
    'post.resolve.proteinHeavy':
      'Pas mal de protéines ici. Un peu plus de légumes à côté vous conviendrait-il ?',
    'post.resolve.starchHeavy':
      'Beaucoup de féculents ici. Auriez-vous quelques légumes de plus à glisser à côté ?',
    'post.resolve.dairyLight': 'Auriez-vous envie d’ajouter {dairy} avec ça ?',
    'post.resolve.vegRich':
      'Beaucoup de légumes ici. Auriez-vous des protéines sous la main, comme {protein} ?',
    'post.resolve.balanced': 'Jolie assiette — changeriez-vous quelque chose la prochaine fois ?',
    'post.resolve.breakfastSimple':
      'Un début simple. Qu’est-ce qui vous fait tenir jusqu’au déjeuner d’habitude ?',
    'post.resolve.proteinMissingDay':
      'Pas encore de protéines aujourd’hui. Ce repas pourrait-il avoir {protein} ?',
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
      'Pas encore de protéines aujourd’hui. Ce repas pourrait-il avoir {protein} ?',
    'depth.followUp.vegLight':
      'Des petits pois surgelés ou une salade en sachet, c’est prêt en deux minutes et ça se garde des jours.',
    'depth.followUp.proteinHeavy':
      'Des épinards surgelés ou une plaque de légumes rôtis vont avec presque tout.',
    'depth.followUp.starchHeavy':
      'Une poignée de légumes surgelés jetée dans la casserole pour les dernières minutes, sans autre poêle à laver.',
    'depth.followUp.dairyLight': 'Ajouter {dairy} à table, c’est facile.',
    'depth.followUp.vegRich':
      'Ajouter {protein} fait d’une assiette de légumes un vrai repas en quelques minutes.',
    'depth.followUp.balanced':
      'Si celui-ci a bien marché, en cuisiner un peu plus règle déjà le déjeuner de demain.',
    'depth.followUp.breakfastSimple':
      'Un petit-déjeuner avec des protéines, comme {breakfast}, tient souvent plus longtemps, si l’envie de changer vous prend.',
    'depth.followUp.proteinMissingDay': 'Avoir {protein} sous la main rend l’ajout rapide.',
    'post.resolve.sugarsHighItem':
      'Cet aliment ({food}) contient {approx}{g} g de sucres, soit {share} de la référence d’une journée. Un petit plaisir aujourd’hui, ou une habitude à regarder ?',
    'post.resolve.saltHighPlate':
      'Cette assiette contient {approx}{g} g de sel, soit {share} de la référence d’une journée. Le reste de la journée pourrait-il être plus léger en sel ?',
    'post.resolve.satFatHighPlate':
      'Cette assiette contient {approx}{g} g d’acides gras saturés, soit {share} de la référence d’une journée. Quelque chose de plus léger en graisses saturées irait-il pour le prochain repas ?',
    'post.resolve.energyDenseSnack':
      'Cette collation fait {approx}{kcal} kcal, sans protéines ni légumes à côté. Pourriez-vous y ajouter {snack} ?',
    'post.resolve.proteinLowDay':
      'Les protéines d’aujourd’hui font {approx}{g} g pour l’instant, soit {share} de la référence d’une journée. Pourriez-vous ajouter {protein} au prochain repas ?',
    'post.resolve.fibreLowDay':
      'Les fibres d’aujourd’hui font {approx}{g} g pour l’instant, soit {share} de la référence d’une journée. Pourriez-vous ajouter {fibre} ce soir, ou au petit-déjeuner demain ?',
    'openPlate.proteinLowDay':
      'Les protéines d’aujourd’hui font {approx}{g} g pour l’instant, soit {share} de la référence d’une journée. Ce repas pourrait-il avoir {protein} ?',
    'openPlate.fibreLowDay':
      'Les fibres d’aujourd’hui font {approx}{g} g pour l’instant, soit {share} de la référence d’une journée. Ce repas pourrait-il avoir {fibre} ?',
    'depth.followUp.sugarsHighItem':
      'Choisir soi-même la douceur, avec quelques morceaux de fruit ou une cuillère de confiture sur du nature, vous laisse décider du degré de sucre.',
    'depth.followUp.saltHighPlate':
      'Goûter avant de saler, et rincer les légumes ou les légumineuses en conserve, fait baisser le sel sans changer le repas.',
    'depth.followUp.satFatHighPlate':
      'Cuisiner avec un peu d’huile d’olive, ou alléger la garniture de la prochaine assiette, change l’équilibre.',
    'depth.followUp.energyDenseSnack':
      'Prendre {snack}, c’est aussi rapide qu’une collation toute prête, et ça cale plus longtemps.',
    'depth.followUp.proteinLowDay':
      'Faciles à ajouter en deux minutes, sans grande cuisine : {protein}.',
    'depth.followUp.fibreLowDay': 'Des sources de fibres faciles : {fibre}.',
    'post.resolve.proteinLowDay.none':
      'Pas encore de protéines notées aujourd’hui. Pourriez-vous ajouter {protein} au prochain repas ?',
    'post.resolve.fibreLowDay.none':
      'Pas encore de fibres notées aujourd’hui. Pourriez-vous ajouter {fibre} ce soir, ou au petit-déjeuner demain ?',
    'openPlate.proteinLowDay.none':
      'Pas encore de protéines notées aujourd’hui. Ce repas pourrait-il avoir {protein} ?',
    'openPlate.fibreLowDay.none':
      'Pas encore de fibres notées aujourd’hui. Ce repas pourrait-il avoir {fibre} ?',
    'post.resolve.energyHighDay':
      'Une bonne part de l’énergie d’aujourd’hui vient de « {foodLc} », environ {approx}{kcal} kcal. Une portion plus petite, ou un échange, vous conviendrait-il la prochaine fois ?',
    'post.resolve.energyHighDay.two':
      'Une bonne part de l’énergie d’aujourd’hui vient de « {foodLc} » et de « {food2Lc} », environ {approx}{kcal} kcal ensemble. Une portion plus petite de l’un des deux vous conviendrait-elle la prochaine fois ?',
    'post.resolve.energyHighDay.nonum':
      'Une bonne part de l’énergie d’aujourd’hui vient de « {foodLc} ». Une portion plus petite, ou un échange, vous conviendrait-il la prochaine fois ?',
    'post.resolve.energyHighDay.twoNonum':
      'Une bonne part de l’énergie d’aujourd’hui vient de « {foodLc} » et de « {food2Lc} ». Une portion plus petite de l’un des deux vous conviendrait-elle la prochaine fois ?',
    'depth.followUp.energyHighDay':
      'Décider de la quantité avant de commencer, ou partager le plat, garde le repas que vous aimez et allège le total.',
    'post.resolve.energyLowDay':
      'Les repas notés aujourd’hui font {share} de la référence d’une journée. Manger assez compte aussi : y a-t-il quelque chose qui n’a pas été noté, ou un repas difficile à placer ?',
    'post.resolve.energyLowDay.nonum':
      'Manger assez compte aussi. Y a-t-il quelque chose d’aujourd’hui qui n’a pas été noté, ou un repas difficile à placer ?',
    'depth.followUp.energyLowDay':
      'Un petit repas ou une collation à heure régulière est une façon simple d’équilibrer la journée.',
    'post.resolve.sugaryDrink':
      'Cette boisson ({food}) contient {approx}{g} g de sucres, et une boisson cale moins qu’un aliment. De l’eau ou de l’eau gazeuse à la place vous conviendrait-elle la prochaine fois ?',
    'post.resolve.sugaryDrink.nonum':
      'Une boisson cale moins qu’un aliment. De l’eau ou de l’eau gazeuse à la place de « {foodLc} » vous conviendrait-elle la prochaine fois ?',
    'depth.followUp.sugaryDrink':
      'Une rondelle de citron ou quelques feuilles de menthe dans de l’eau fraîche rendent le changement plus facile.',
    'post.resolve.alcoholDrink':
      'Cette boisson ({food}) apporte de l’énergie sans caler. Un verre plus petit, ou un verre d’eau à côté, vous conviendrait-il ?',
    'depth.followUp.alcoholDrink':
      'Décider à l’avance du nombre de verres que vous voulez rend la soirée plus simple.',
    'post.resolve.proteinPlateLose':
      'Les protéines calent plus longtemps. Pourriez-vous ajouter « {foodLc} », que vous mangez souvent, à cette assiette ?',
    'depth.followUp.proteinPlateLose':
      'L’ajouter à ce qui est déjà cuit, plutôt qu’en plat supplémentaire, le rend facile.',
    'post.resolve.vegVolumeLose':
      'Les légumes ajoutent du volume pour peu d’énergie. Pourriez-vous ajouter « {foodLc} », que vous mangez souvent, à cette assiette ?',
    'depth.followUp.vegVolumeLose':
      'Des légumes surgelés ou déjà coupés, ajoutés à la dernière minute, sont le moyen le plus rapide d’ajouter du volume.',
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
    rowSaved: 'Repas gardés',
    rowSavedSubtitle: 'repas et recettes · renommer · supprimer',
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
      'Supprime votre historique, les notes du coach, les mesures du corps, la clé d’IA enregistrée et les exports encore présents sur cet appareil. Les copies que vous avez partagées ou téléchargées ailleurs ne sont pas concernées. Il n’existe aucune autre copie de vos données, c’est donc définitif — exportez d’abord si vous voulez en garder une.',
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
      'Votre dernier export ou votre dernière sauvegarde remonte à un moment. Une sauvegarde chiffrée protège votre historique si cet appareil ou ce navigateur venait à le perdre.',
    reminderNever:
      'Vous n’avez pas encore gardé de copie. Une sauvegarde chiffrée protège votre historique si cet appareil ou ce navigateur venait à le perdre.',
    reminderBackup: 'Préparer une sauvegarde',
    reminderNotNow: 'Pas maintenant',
    failedLocked: 'Déverrouillez d’abord, puis exportez.',
    failedRead:
      'Vos assiettes n’ont pas pu être lues pour le moment. Rien n’est perdu ; vous pouvez réessayer.',
    failedFormat: 'Ce format de fichier n’est pas disponible.',
    failedDelivery: 'l’export a échoué — réessayez',
    failedSaved:
      'Vos repas, recettes ou mesures du corps n’ont pas pu être lus pour le moment, donc rien n’a été exporté. Rien n’est perdu\u202F; vous pouvez réessayer.',
  },
  backup: {
    heading: 'Sauvegarde chiffrée',
    explain:
      'Un seul fichier avec vos assiettes, les notes du coach, vos repas et recettes gardés, votre profil, les mesures du corps et votre langue, verrouillé par une phrase secrète. Gardez-le en lieu sûr : c’est le chemin de retour si ce navigateur perd un jour vos données. Il n’inclut jamais votre clé d’IA ni vos réglages d’IA.',
    suggest:
      'Utiliser la même phrase secrète que celle qui déverrouille l’application, c’est une seule chose à retenir. N’importe quelle phrase secrète convient.',
    warning:
      'Si vous oubliez la phrase secrète de la sauvegarde, le fichier ne pourra pas être ouvert — ni par nous, ni par personne d’autre.',
    passphraseLabel: 'Phrase secrète de la sauvegarde',
    confirmLabel: 'Confirmez la phrase secrète de la sauvegarde',
    action: 'Enregistrer une sauvegarde chiffrée',
    working: 'Préparation de votre sauvegarde…',
    savedLine: 'Sauvegarde enregistrée :',
    cancelled: 'Rien n’a été enregistré.',
    failedLocked: 'Déverrouillez d’abord, puis enregistrez une sauvegarde.',
    failedRead:
      'Vos données n’ont pas pu être lues pour le moment. Rien n’est perdu ; vous pouvez réessayer.',
    failedTooLarge:
      'Vos données dépassent ce qu’un fichier de sauvegarde peut contenir. Rien n’a été enregistré ; un export CSV ou JSON reste possible.',
    failedSeal:
      'Ce navigateur n’a pas pu verrouiller la sauvegarde pour le moment. Rien n’a été enregistré ; vous pouvez réessayer.',
    failedDelivery: 'La sauvegarde n’a pas pu être enregistrée. Réessayez.',
  },
  restore: {
    heading: 'Restaurer une sauvegarde',
    explain:
      'Choisissez un fichier de sauvegarde et saisissez sa phrase secrète. Son contenu est fusionné avec ce qui est déjà là : rien n’est supprimé parce qu’il est absent de la sauvegarde, et une assiette que vous aviez supprimée avant la sauvegarde reste supprimée.',
    fileLabel: 'Fichier de sauvegarde',
    passphraseLabel: 'Phrase secrète de la sauvegarde',
    action: 'Restaurer',
    working: 'Ouverture de votre sauvegarde…',
    restored: 'Restauration terminée. Votre sauvegarde a été fusionnée avec ce qui était déjà là.',
    noFile: 'Choisissez d’abord un fichier de sauvegarde.',
    noPassphrase: 'Saisissez la phrase secrète de la sauvegarde.',
    wrongOrDamaged:
      'Cette phrase secrète n’ouvre pas ce fichier, ou le fichier est abîmé. Rien n’a été modifié.',
    notABackup:
      'Ce fichier ne ressemble pas à une sauvegarde d’AI Nutrition Coach. Rien n’a été modifié.',
    tooLarge: 'Ce fichier est trop volumineux pour être une sauvegarde. Rien n’a été modifié.',
    newerVersion:
      'Cette sauvegarde a été créée par une version plus récente d’AI Nutrition Coach. Rechargez la page pour mettre à jour, puis réessayez. Rien n’a été modifié.',
    invalidContent:
      'Cette sauvegarde s’est ouverte, mais son contenu est inutilisable. Rien n’a été modifié.',
    unreadable: 'Ce fichier n’a pas pu être lu. Rien n’a été modifié.',
    unavailable:
      'Ce navigateur n’a pas pu ouvrir la sauvegarde pour le moment. Rien n’a été modifié ; vous pouvez réessayer.',
    clockAhead:
      'Cette sauvegarde porte une date bien postérieure à l’horloge de cet appareil. Vérifiez la date et l’heure de cet appareil, puis réessayez. Rien n’a été modifié.',
    storeProblem:
      'La sauvegarde s’est ouverte, mais elle n’a pas pu être ajoutée à cet appareil pour le moment. Rien n’a été modifié ; vous pouvez réessayer.',
    storeProblemNotRemoved:
      'La sauvegarde s’est ouverte, mais elle n’a pas pu être ajoutée pour le moment, et le coffre vide créé n’a pas pu être supprimé. Il est vide et utilise la phrase secrète de la sauvegarde : déverrouillez-le avec cette phrase secrète, ou effacez-le avec « Phrase secrète oubliée ? » ci-dessous, puis réessayez.',
    createLink: 'Restaurer une sauvegarde',
    createTitle: 'Restaurer une sauvegarde',
    createExplain:
      'Choisissez votre fichier de sauvegarde et saisissez sa phrase secrète. La sauvegarde est d’abord ouverte ; si quelque chose ne va pas, rien n’est créé sur cet appareil.',
    createSame:
      'Cette phrase secrète déverrouillera aussi l’application sur cet appareil désormais. Si vous l’oubliez, vos données ne pourront pas être récupérées.',
    createWeak:
      'Pour protéger cet appareil, la phrase secrète doit compter au moins 10 caractères, avec quelques caractères différents. Créez plutôt une nouvelle phrase secrète, puis restaurez la sauvegarde depuis Réglages, Vos données.',
    createAction: 'Restaurer et déverrouiller',
    createBack: 'Retour à la création d’une phrase secrète',
  },
  privacy: {
    title: 'Ce que l’application stocke et envoie',
    intro: 'Une liste simple. Rien n’est caché ici, et rien n’est collecté sur vous.',
    storedHeading: 'Stocké sur cet appareil, chiffré',
    storedBody:
      'Vos assiettes et les aliments qu’elles contiennent, les notes du coach affichées avec elles, votre profil et, si vous les saisissez, votre taille, votre poids et votre tour de taille (datés), vos choix (comme vos réglages d’IA et ces avis) et, si vous en ajoutez une, votre clé d’IA. Tout est chiffré sur cet appareil. La clé est tirée de votre phrase secrète et n’est gardée que tant que l’application est déverrouillée. La seule exception est la langue choisie, aussi conservée en clair sur cet appareil pour que l’écran de déverrouillage puisse l’utiliser ; elle ne révèle rien d’autre.',
    leavesHeading: 'Ce qui quitte cet appareil, et quand',
    leavesBarcode:
      'Scan d’un code-barres : le numéro du code-barres est recherché sur Open Food Facts, une base de données publique sans compte. Seul le code-barres est envoyé. Open Food Facts voit aussi les informations de connexion que voit tout site web : votre adresse IP, le type de votre appareil ou de votre navigateur et l’adresse de ce site (le navigateur l’ajoute dans l’en-tête Origin). Vous pouvez désactiver cela ci-dessous.',
    leavesPhoto:
      'Reconnaissance d’une photo : seulement si vous avez activé votre propre IA et donné votre accord. La photo (réduite, sans sa localisation ni les informations de l’appareil photo), une instruction fixe (qui précise aussi dans quelle langue répondre, la langue de l’application) et le nom du modèle vont au service que vous avez choisi. Ce service voit aussi votre adresse IP et le type de votre appareil ou de votre navigateur, et peut conserver les requêtes selon sa propre politique.',
    leavesInstance:
      'Si la personne qui exploite ce serveur a activé son IA, une photo que vous acceptez d’envoyer part d’abord vers ce serveur, qui ajoute sa propre clé d’IA et la transmet au fournisseur indiqué dans Réglages, Votre IA. Ce serveur voit votre adresse IP et le type de votre navigateur ; le fournisseur voit la photo et l’instruction, venant de ce serveur. La clé n’atteint jamais votre navigateur.',
    leavesCoaching:
      'Coaching par IA : seulement si vous l’avez activé dans Réglages, Votre IA. Le coach envoie alors à l’IA que vous avez choisie (celle de ce serveur, qui la transmet à son fournisseur, ou le service de votre propre clé) les noms et les groupes de vos aliments, leurs poids et les totaux de nutriments, les dates des jours concernés (sans l’heure), le moment du repas, le nombre d’assiettes, les comptes et les moyennes de la semaine et, si vous l’avez rempli, votre profil, votre repère du jour, arrondi, qui est calculé d’après votre poids et votre taille si vous les avez saisis (jamais le poids, la taille ni le tour de taille eux-mêmes), l’énergie moyenne de la semaine à côté de ce repère arrondi, les aliments qui ont apporté le plus d’énergie et le pas que vous avez choisi. Les poids, les nutriments, l’énergie moyenne et le repère du jour ne sont pas envoyés tant que les chiffres nutritionnels sont masqués. Une description grossière de votre tendance de poids (une direction et la variation sur environ quatre semaines, au demi-kilo près) n’est envoyée que si vous avez aussi activé le réglage distinct dans Réglages, Votre IA ; il est désactivé par défaut. Jamais de photos, jamais votre phrase secrète. Une question saisie dans Interroger le coach part avec elles, ainsi que les réponses précédentes de cette conversation, conservée en mémoire seulement jusqu’au verrouillage de l’application. Une question sur un apport très bas ou une perte de poids très rapide reçoit sa réponse sur cet appareil et n’est jamais envoyée. Les notes écrites par l’IA sont conservées sur cet appareil comme n’importe quelle note du coach.',
    leavesServerCopy:
      'Sauvegarde sur ce serveur : seulement si la personne qui gère ce serveur l’a activée et que vous choisissez Sauvegarder sur ce serveur dans Réglages, Vos données. Une copie chiffrée de vos données est alors envoyée à ce serveur, verrouillée sur cet appareil avant de partir, et mise à jour peu après vos modifications tant que l’application est déverrouillée. Ce serveur voit l’identifiant que vous avez choisi, le moment où la copie change et sa taille, ainsi que votre adresse internet et le type de votre navigateur, comme tout site web. Il ne peut pas lire vos aliments, vos heures, vos notes, votre profil ni vos mesures du corps, et il ne reçoit jamais votre phrase secrète. Vous pouvez arrêter à tout moment dans Réglages, Vos données.',
    offToggle: 'Rechercher les codes-barres sur Open Food Facts',
    offToggleOn: 'Activé : un code-barres scanné est recherché en ligne.',
    offToggleOff:
      'Désactivé : seul le catalogue hors ligne est utilisé, et un code-barres inconnu ouvre la saisie manuelle.',
    offToggleUnasked:
      'La question vous sera posée la première fois que vous scannerez un code-barres.',
    serverHeading: 'Ce que voit le serveur d’où vient cette application',
    serverBody:
      'Rien sur vous ni sur vos assiettes. Le serveur ne fait que distribuer les fichiers de l’application. Comme tout serveur web, il peut tenir un court journal d’accès (adresses des pages et heures), avec les adresses des clients tronquées ; dans l’installation auto-hébergée standard, ce journal est désactivé.',
    serverInstance:
      'La seule exception est une photo que vous choisissez d’envoyer avec l’IA que ce serveur propose (voir plus haut) : elle transite par ce serveur avant d’arriver au fournisseur, et n’y est pas conservée.',
    serverRelay:
      'Si vous choisissez aussi de vous sauvegarder sur ce serveur (voir plus haut), il conserve votre identifiant et votre copie chiffrée. La personne qui le gère peut voir que la copie existe, sa taille et le moment où elle change. Elle ne peut pas la lire.',
    neverHeading: 'Jamais collecté',
    neverBody:
      'Pas de statistiques, pas de pistage, pas de rapports de plantage, pas de publicité et pas de comptes. Rien n’est envoyé sur la façon dont vous utilisez l’application. Si vous vous sauvegardez sur ce serveur, l’identifiant que vous choisissez pour la copie est le seul nom en jeu ; ce n’est pas une adresse e-mail.',
    deleteHeading: 'Supprimer vos données',
    deleteBody:
      'Pour retirer une assiette, ouvrez-la depuis Aujourd’hui et choisissez Retirer cette assiette. Pour tout retirer, utilisez Effacer toutes les données locales dans Réglages, Vos données. Les exports que vous avez enregistrés ou partagés ailleurs sont des copies hors de l’application : supprimez-les vous-même.',
    exportHeading: 'Exporter',
    exportBody:
      'Réglages, Vos données, Exporter enregistre vos assiettes dans un fichier CSV ou JSON. Les exports sont des fichiers texte en clair, non chiffrés : gardez-les en lieu sûr.',
    backupHeading: 'Sauvegardes chiffrées',
    backupBody:
      'Réglages, Vos données, Enregistrer une sauvegarde chiffrée écrit un seul fichier, verrouillé sur cet appareil par une phrase secrète que vous choisissez (Argon2id et AES-256-GCM). Il contient vos assiettes, les notes du coach, vos repas et recettes gardés, votre profil, les mesures du corps et votre langue, et jamais votre clé d’IA, vos réglages d’IA ni vos consentements. Rien n’est envoyé : le fichier va là où vous l’enregistrez. Si vous oubliez sa phrase secrète, il ne pourra pas être ouvert — ni par nous, ni par personne d’autre. La restauration le fusionne avec ce qui est déjà sur l’appareil.',
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
        name: 'Schibsted Grotesk (police)',
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
  server: {
    backupHeading: 'Sauvegarder sur ce serveur',
    backupExplain:
      'Ce serveur peut conserver une copie chiffrée de vos données, pour les retrouver sur un nouveau téléphone ou après avoir vidé ce navigateur, et les utiliser sur un autre appareil. Vos données sont verrouillées sur cet appareil avant d’être envoyées : le serveur ne garde que ce qu’il ne peut pas lire. Il ne voit jamais vos aliments, vos heures, votre clé d’IA ni votre phrase secrète.',
    backupAuto:
      'Une fois en place, la copie se met à jour toute seule peu après vos modifications, tant que l’application est déverrouillée.',
    backupHandleHelp:
      'Un identifiant est un nom pour votre copie : de 3 à 32 lettres, chiffres, point, tiret ou tiret bas. Ce n’est pas une adresse e-mail.',
    backupWarning:
      'Si vous oubliez cette phrase secrète, la copie ne pourra pas être ouverte — ni par nous, ni par la personne qui gère ce serveur.',
    backupSame:
      'Utiliser la même phrase secrète que celle qui déverrouille cette application, c’est une seule chose à retenir. Une autre est permise ; elle ne protège alors que la copie sur ce serveur.',
    handleLabel: 'Identifiant',
    passphraseLabel: 'Phrase secrète de cette copie',
    confirmLabel: 'Confirmez la phrase secrète',
    inviteLabel: 'Code d’invitation',
    inviteHelp:
      'La personne qui gère ce serveur demande un code d’invitation pour créer une copie.',
    closedHelp: 'La personne qui gère ce serveur n’accepte pas de nouvelles copies pour le moment.',
    backupAction: 'Sauvegarder sur ce serveur',
    backupWorking: 'Verrouillage et envoi de votre copie…',
    backedUp:
      'C’est fait. Vos données sont sauvegardées sur ce serveur, et la copie se tiendra à jour toute seule.',
    missingHandle: 'Saisissez un identifiant.',
    missingPassphrase: 'Saisissez la phrase secrète.',
    invalidHandle:
      'Un identifiant compte de 3 à 32 caractères : lettres, chiffres, point, tiret ou tiret bas.',
    handleTaken:
      'Cet identifiant est déjà pris sur ce serveur. Si vous venez de le créer depuis cet appareil et que la connexion a coupé, utilisez « Se connecter à la copie de ce serveur » avec la même phrase secrète. Sinon, essayez-en un autre.',
    signupClosed: 'Ce serveur n’accepte pas de nouvelles copies pour le moment.',
    inviteInvalid: 'Ce code d’invitation n’est pas accepté.',
    serverFull: 'Ce serveur n’a plus de place pour une autre copie.',
    createTooLarge: 'Vos données dépassent ce que ce serveur accepte. Rien n’a été envoyé.',
    noMatch: 'Rien sur ce serveur ne correspond à cet identifiant et à cette phrase secrète.',
    rateLimited: 'Trop d’essais. Attendez quelques minutes, puis réessayez.',
    offline: 'Ce serveur n’a pas pu être joint. Rien n’a été modifié ; vous pouvez réessayer.',
    signInRequired:
      'Ce serveur vous demande de vous reconnecter. Rechargez la page pour continuer.',
    reloadAction: 'Recharger',
    unavailable:
      'Cela n’a pas abouti pour le moment. Rien n’a été modifié ; vous pouvez réessayer.',
    newerVersion:
      'Cette copie a été créée par une version plus récente d’AI Nutrition Coach. Rechargez la page pour mettre à jour, puis réessayez. Rien n’a été modifié.',
    damaged:
      'La copie a été trouvée, mais elle ne s’ouvre pas ou elle est abîmée. Rien n’a été modifié.',
    tooLarge:
      'La copie est plus volumineuse que ce que cette application peut ouvrir. Rien n’a été modifié.',
    clockAhead:
      'Cette copie porte une date bien postérieure à l’horloge de cet appareil. Vérifiez la date et l’heure de cet appareil, puis réessayez. Rien n’a été modifié.',
    storeProblem:
      'La copie s’est ouverte, mais elle n’a pas pu être ajoutée à cet appareil pour le moment. Rien n’a été modifié ; vous pouvez réessayer.',
    storeProblemNotRemoved:
      'La copie s’est ouverte, mais elle n’a pas pu être ajoutée pour le moment, et le coffre vide créé n’a pas pu être supprimé. Il est vide et utilise la phrase secrète de la copie : déverrouillez-le avec cette phrase secrète, ou effacez-le avec « Phrase secrète oubliée ? » ci-dessous, puis réessayez.',
    joinHeading: 'Se connecter à la copie de ce serveur',
    joinExplain:
      'Déjà sauvegardé depuis un autre appareil ? Saisissez l’identifiant et la phrase secrète de cette copie. Cet appareil et la copie sont combinés : rien n’est supprimé de part ni d’autre.',
    joinPassphraseLabel: 'Phrase secrète de la copie',
    joinAction: 'Trouver ma copie',
    joinWorking: 'Recherche de votre copie…',
    previewHeading: 'Votre copie est trouvée',
    previewServer: {
      one: 'Sur ce serveur : {count} assiette',
      other: 'Sur ce serveur : {count} assiettes',
    },
    previewDevice: {
      one: 'Sur cet appareil : {count} assiette',
      other: 'Sur cet appareil : {count} assiettes',
    },
    previewShared: '{count} déjà sur le serveur',
    previewTogether: {
      one: 'Ensemble : {count} assiette',
      other: 'Ensemble : {count} assiettes',
    },
    combineAction: 'Combiner',
    combineWorking: 'Combinaison…',
    combineHelp: 'Combiner garde tout ce qui est dans les deux. Rien n’est supprimé.',
    cancelAction: 'Annuler',
    combined: 'C’est fait. Cet appareil et la copie sont combinés, et la copie est à jour.',
    combinedPending:
      'C’est fait sur cet appareil. La copie du serveur sera mise à jour dès qu’il pourra être joint.',
    profileLegend: 'Quel profil faut-il garder ?',
    profileExplain:
      'Cet appareil et la copie ont des profils différents. Choisissez celui à garder ; il sera ensuite utilisé sur tous les appareils.',
    profileLine: '{field} : {device} sur cet appareil, {server} sur le serveur',
    profileUnset: 'non renseigné',
    profileFromDevice: 'Le profil de cet appareil',
    profileFromServer: 'Le profil du serveur',
    profileChoose: 'Choisissez le profil à garder.',
    otherOptions: 'Autres options',
    freshHeading: 'Repartir de la copie du serveur',
    freshExplain:
      'Pour un appareil dont les données étaient un essai ou ne sont pas voulues. Ce qui est sur cet appareil est remplacé par la copie du serveur, qui n’est pas modifiée.',
    freshRemoves: {
      one: 'L’assiette ({count}) qui n’est que sur cet appareil sera supprimée de cet appareil.',
      other:
        'Les {count} assiettes qui ne sont que sur cet appareil seront supprimées de cet appareil.',
    },
    freshNothing:
      'Tout ce qui est sur cet appareil figure déjà dans la copie du serveur, rien ne serait donc perdu.',
    freshBackupFirst: 'Enregistrer d’abord une sauvegarde chiffrée',
    freshAction: 'Effacer cet appareil et restaurer depuis le serveur',
    freshWorking: 'Restauration depuis le serveur…',
    freshConfirmTitle: 'Effacer cet appareil et restaurer depuis le serveur ?',
    freshKeep: 'Garder cet appareil tel quel',
    freshConfirm: 'Effacer et restaurer',
    freshWeak:
      'Repartir de zéro fait de la phrase secrète de cette copie celle de cet appareil, et elle doit compter au moins 10 caractères, avec quelques caractères différents. Rien n’a été modifié sur cet appareil. Vous pouvez plutôt tout combiner.',
    freshAgain:
      'Pour repartir de zéro, retrouvez votre copie avec sa phrase secrète. Rien n’a été modifié sur cet appareil.',
    freshFailed:
      'La copie du serveur n’a pas pu être remise sur cet appareil pour le moment. La copie du serveur n’a pas été touchée ; choisissez « Restaurer depuis ce serveur » pour réessayer.',
    connectedHeading: 'Sauvegarde sur ce serveur',
    connectedAs: 'Cet appareil se sauvegarde sur ce serveur sous l’identifiant {handle}.',
    statusBackedUp: 'Tout ce qui est sur cet appareil est sauvegardé.',
    statusLast: 'Dernière copie envoyée à {time}.',
    statusPending: 'Les modifications de cet appareil seront envoyées sous peu.',
    statusSyncing: 'Envoi d’une copie…',
    statusOffline:
      'Ce serveur ne peut pas être joint pour le moment. Vos modifications restent sur cet appareil et seront envoyées dès que possible.',
    statusFailed:
      'La dernière copie n’est pas passée. Une nouvelle tentative aura lieu ; rien n’est perdu.',
    statusSignInRequired:
      'Ce serveur vous demande de vous reconnecter, aucune copie n’est donc envoyée pour le moment. Rechargez la page pour continuer ; vos modifications restent sur cet appareil.',
    statusNeedsUpdate:
      'La copie de ce serveur vient d’une version plus récente de l’application. Mettez l’application à jour sur cet appareil pour continuer à synchroniser ; d’ici là, rien n’est envoyé et la copie du serveur n’est pas modifiée.',
    statusRolledBack:
      'Le serveur a renvoyé une copie plus ancienne que celle que cet appareil a déjà vue, la sauvegarde est donc suspendue et rien n’est écrasé. Vous pouvez réessayer, ou arrêter de sauvegarder depuis cet appareil.',
    statusSignedOut:
      'Cet appareil n’est plus accepté par le serveur. Arrêtez de sauvegarder depuis cet appareil, puis reconnectez-le avec votre identifiant et votre phrase secrète.',
    statusTooLarge:
      'Vos données dépassent ce que ce serveur accepte, aucune copie n’est donc envoyée.',
    statusPaused:
      'La sauvegarde est suspendue parce que la copie ou cet appareil demande un coup d’œil. Rien n’a été modifié. Vous pouvez réessayer.',
    nowAction: 'Sauvegarder maintenant',
    nowWorking: 'Envoi…',
    nowDone: 'C’est fait. Tout ce qui est sur cet appareil est sauvegardé.',
    stopAction: 'Arrêter de sauvegarder depuis cet appareil',
    stopExplain:
      'Cet appareil oublie la connexion. La copie du serveur reste telle quelle, et vous pouvez vous reconnecter avec votre identifiant et votre phrase secrète.',
    stopped:
      'Cet appareil ne se sauvegarde plus sur le serveur. La copie du serveur n’a pas été touchée.',
    stopFailed: 'Cela n’a pas abouti pour le moment. Rien n’a été modifié ; vous pouvez réessayer.',
    restoreLink: 'Restaurer depuis ce serveur',
    restoreTitle: 'Restaurer depuis ce serveur',
    restoreExplain:
      'Saisissez l’identifiant et la phrase secrète de votre copie sur ce serveur. La copie est d’abord ouverte ; si quelque chose ne va pas, rien n’est créé sur cet appareil.',
    restoreSame:
      'Cette phrase secrète déverrouillera aussi l’application sur cet appareil désormais. Si vous l’oubliez, vos données ne pourront pas être récupérées.',
    restoreFind: 'Trouver ma copie',
    restoreFound: 'Vos données sont trouvées : {plates}, {range}.',
    restoreFoundEmpty: 'Votre copie est trouvée. Elle ne contient encore aucune assiette.',
    restorePlates: { one: '{count} assiette', other: '{count} assiettes' },
    rangeFromTo: 'de {from} à {to}',
    rangeIn: 'en {when}',
    rangeToday: 'aujourd’hui',
    restoreAction: 'Restaurer et déverrouiller',
    restoreWorking: 'Restauration de vos données…',
    restoreBack: 'Retour à la création d’une phrase secrète',
    restoreChange: 'Utiliser un autre identifiant',
    restoreWeak:
      'Pour protéger cet appareil, la phrase secrète doit compter au moins 10 caractères, avec quelques caractères différents. Créez plutôt une nouvelle phrase secrète, puis connectez-vous à la copie de ce serveur depuis Réglages, Vos données.',
    restoringTitle: 'Restauration depuis le serveur',
    restoringBody: 'Vos données sont remises sur cet appareil. Cela prend un instant.',
  },
  /** Pesées : la saisie rapide (Aujourd’hui et Évolution). */
  weighIn: {
    title: 'Pesée',
    help: 'Une pesée par jour. Choisissez le jour si vous en ajoutez une plus ancienne.',
    day: 'Jour',
    waistCm: 'Tour de taille en cm (facultatif)',
    waistIn: 'Tour de taille en pouces (facultatif)',
    protocolMetric:
      'Même balance, le matin, avant de manger. Un écart d’un kilo environ d’un jour à l’autre, c’est surtout de l’eau.',
    protocolImperial:
      'Même balance, le matin, avant de manger. Un écart de deux livres environ d’un jour à l’autre, c’est surtout de l’eau.',
    replaces: 'Vous avez déjà une pesée pour ce jour. Enregistrer la remplace.',
    replacesWaist: 'Vous avez déjà un tour de taille pour ce jour. Enregistrer le remplace.',
    save: 'Enregistrer',
    cancel: 'Annuler',
    futureDay: 'Choisissez aujourd’hui ou un jour passé.',
    needsValue: 'Saisissez un poids, un tour de taille, ou les deux.',
    saved: 'Pesée enregistrée.',
    removed: 'Retiré.',
    saveFailed: 'L’enregistrement n’a pas abouti. Rien n’a changé ; vous pouvez réessayer.',
    link: 'Ajouter une pesée',
    edit: 'Modifier',
    editWeight: 'Modifier la pesée du {date}',
    editWaist: 'Modifier le tour de taille du {date}',
    invalidDay: 'Choisissez une date.',
    confirmDifferent:
      'C’est assez différent de votre dernière pesée. L’enregistrer telle que saisie ?',
    confirmSave: 'Enregistrer',
    confirmChange: 'La modifier',
    removeTitle: 'Retirer cette entrée ?',
    removeBodyWeight: 'La pesée du {date} sera retirée, sur chaque appareil synchronisé.',
    removeBodyWaist: 'Le tour de taille du {date} sera retiré, sur chaque appareil synchronisé.',
    removeKeep: 'La garder',
  },
  /** Évolution : la tendance du poids, l’historique des pesées et de ce qui a été noté. */
  progress: {
    title: 'Évolution',
    intro:
      'Une courbe lissée à travers vos pesées, et ce que vous avez noté chaque jour. Elle décrit, elle ne note pas, et elle ne demande rien.',
    addWeighIn: 'Ajouter une pesée',
    rangeLabel: 'Période',
    ranges: { fourWeeks: '4 semaines', threeMonths: '3 mois', oneYear: '1 an', all: 'Tout' },
    numbersOff:
      'Les chiffres de nutrition sont masqués, la tendance et les totaux aussi. Les pesées s’enregistrent quand même.',
    numbersOffLink: 'Afficher les chiffres dans Réglages, Nutrition',
    weightTitle: 'Poids',
    noWeighIns:
      'Pas encore de pesée. Quelques-unes sur deux semaines suffisent pour tracer une tendance.',
    oneWeighIn: 'Pesée du {date} : {value}. Il en faut quelques autres pour une tendance.',
    trendOnly:
      'Tendance : {value}. Pour voir un écart, il faut des pesées réparties sur au moins une semaine.',
    trendLower: 'Tendance : {value}, environ {amount} de moins {ago}.',
    trendHigher: 'Tendance : {value}, environ {amount} de plus {ago}.',
    trendSame: 'Tendance : {value}, à peu près la même {ago}.',
    agoWeek: 'qu’il y a une semaine',
    agoFourWeeks: 'qu’il y a quatre semaines',
    agoDays: 'qu’il y a {count} jours',
    paceLower:
      'Sur les {count} derniers jours, la tendance a baissé d’environ {amount} par semaine, soit {pct} de votre poids.',
    paceHigher:
      'Sur les {count} derniers jours, la tendance a monté d’environ {amount} par semaine, soit {pct} de votre poids.',
    paceSame: 'Sur les {count} derniers jours, la tendance est restée à peu près la même.',
    gaps: 'Il y a des trous entre certaines pesées. La courbe prolonge la tendance à travers eux et n’invente aucune valeur.',
    outsideRange: 'Aucune pesée sur cette période. Essayez-en une plus longue.',
    legend: 'La ligne est la tendance. Les ronds sont vos pesées.',
    chartLabel: 'Graphique du poids et de la tendance',
    xAxisWeeks: 'Les repères marquent les semaines.',
    tableSummary: 'Pesées et tendance sous forme de tableau',
    tableCaption: 'Les pesées et la tendance de chaque jour',
    colDay: 'Jour',
    colWeighIn: 'Pesée',
    colTrend: 'Tendance',
    stale:
      'Votre dernière pesée date du {date}. Vous pouvez en ajouter une nouvelle quand vous voulez.',
    paceNotice:
      'Votre poids baisse plus vite qu’environ 1 % par semaine. Un rythme plus lent est plus facile à tenir et plus doux pour le corps ; pensez à un rythme plus doux dans le Profil, ou parlez-en à un médecin ou à un diététicien.',
    paceNoticeLink: 'Choisir un rythme dans le Profil',
    paceNoticeDismiss: 'Masquer pendant 14 jours',
    historyTitle: 'Pesées',
    waistHistoryTitle: 'Tour de taille',
    rowWeighIn: '{date} : {value}',
    removeWeight: 'Retirer la pesée du {date}',
    removeWaist: 'Retirer le tour de taille du {date}',
    showAll: 'Tout afficher ({count})',
    showFewer: 'En afficher moins',
    hiddenValue: 'Pesée du {date}',
    hiddenWaist: 'Tour de taille du {date}',
    notUsed: 'non retenue pour la tendance',
    notUsedNote:
      'Certaines pesées sont très différentes de celles qui les entourent : la tendance les laisse de côté, au cas où ce serait une faute de frappe. Elles restent dans votre liste et vous pouvez les modifier.',
    tableCapped: 'Le tableau liste les {count} dernières pesées de cette période.',
    waistFirstLatest: 'Tour de taille : {first} le {firstDate}, {latest} le {latestDate}.',
    waistOne: 'Tour de taille : {value} le {date}.',
    intakeTitle: 'Ce que vous avez noté',
    intakeIntroPersonal:
      'L’énergie et les protéines de chaque jour. Le repère marque votre repère du jour. Un jour sans rien de noté reste vide, il n’est pas compté comme zéro.',
    intakeIntroReference:
      'L’énergie et les protéines de chaque jour. Le repère marque l’apport de référence de l’UE. Un jour sans rien de noté reste vide, il n’est pas compté comme zéro.',
    intakeNothing: 'Rien de noté',
    intakeNoFigures: 'Noté, sans chiffres',
    intakeCapped: 'Les {count} derniers jours sont affichés.',
    intakeOpenDay: 'Afficher le {date} dans Aujourd’hui',
  },
  /** L’accueil de la première fois (après la phrase secrète, une seule fois). */
  welcome: {
    stepOf: 'Étape {step} sur {total}',
    next: 'Suivant',
    back: 'Retour',
    notNow: 'Pas maintenant',
    introTitle: 'Bienvenue',
    introLead: 'Voici ce que fait l’application.',
    introLine1: 'Notez ce que vous mangez par photo, code-barres, saisie, ou en le décrivant.',
    introLine2: 'Voyez chaque journée face à votre propre repère, en chiffres simples, sans note.',
    introLine3: 'Un coach qui pose une question plutôt que de porter un jugement.',
    introData:
      'Vos données restent sur cet appareil, chiffrées par votre phrase secrète. Trois choses peuvent envoyer quelque chose, et seulement une fois que vous avez dit oui : une IA que vous connectez pour les photos et les descriptions, la synchronisation entre vos appareils si vous la mettez en place, et la recherche des codes-barres sur Open Food Facts après un avis unique.',
    goalTitle: 'Pourquoi vous êtes là',
    goalHelp:
      'Cela façonne votre repère du jour. Vous pouvez le changer à tout moment dans Réglages, Profil.',
    aboutTitle: 'À propos de vous',
    aboutHelp:
      'Seulement ce dont le repère a besoin. Chaque réponse est facultative, et vous pouvez les changer dans Réglages, Profil.',
    guideTitle: 'Votre repère du jour',
    firstTitle: 'Votre première assiette',
    firstHelp: 'Quatre façons de noter une assiette.',
    firstSnapshot: 'Photo : prenez l’assiette en photo. Cela demande une IA.',
    firstBarcode:
      'Code-barres : scannez un aliment emballé. Le code-barres est recherché sur Open Food Facts.',
    firstType:
      'Saisie : cherchez un aliment et choisissez la quantité. Cela fonctionne sur cet appareil.',
    firstDescribe:
      'Décrire : écrivez ce que vous avez mangé. Sans IA, vos mots sont comparés à la liste d’aliments de cet appareil ; parler demande une IA pour transformer votre voix en texte.',
    aiReady:
      'Une IA est connectée, une photo peut donc être lue. Décrire avec l’IA et parler fonctionnent une fois que vous les avez autorisés dans Réglages, Votre IA. On vous demande avant d’envoyer quoi que ce soit.',
    aiOffered:
      'Ce serveur propose une IA ({label}). Activez-la dans Réglages, Votre IA pour utiliser la photo et pour dicter une description. La saisie d’un aliment, la description écrite et le code-barres fonctionnent sans elle.',
    aiNone:
      'Aucune IA n’est connectée, une photo ne peut donc pas être lue et parler ne fonctionnera pas encore. La saisie d’un aliment, la description écrite (comparée à la liste d’aliments de cet appareil) et le scan d’un code-barres fonctionnent sans elle.',
    aiLink: 'Réglages, Votre IA',
    start: 'Noter ma première assiette',
  },
  sync: {
    onThisDevice: 'Enregistré sur cet appareil',
    noTransport: 'Vos assiettes restent sur cet appareil. Rien n’est envoyé nulle part.',
  },
};
