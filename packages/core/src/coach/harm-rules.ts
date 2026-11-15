/**
 * The harmful-advice patterns of the AI output validator, English and French, and the clause-level
 * negation that decides whether a mention ADVISES the harmful thing or advises AGAINST it.
 *
 * Matched on the folded text of `text-prep.ts` (lower-case, no accents, straight apostrophes and
 * dashes, spaced-out letters joined; "jeûne" is "jeuxne"). This is a phrase list: it cannot catch
 * every wording, and it is only a backstop behind the system prompt (see docs/ai-tiers.md).
 *
 * NEGATION THAT GOVERNS. A negatable term is acceptable only when its own clause advises against
 * it. Clauses end at `. ? ! ; : ,` and at a contrast or condition word (but, however, if, when,
 * because, mais, si, quand ...), so "if you are not hungry, skip breakfast" does not borrow the
 * "not" of the clause before. Within the clause:
 *  - BEFORE: a governing negator close in front of the term (no need to, do not, never, avoid,
 *    without, instead of, rather than, évitez de, ne ... pas, inutile de ...) with at most four
 *    words between; a bare list continuation ("avoid skipping meals, fasting or detox") inherits
 *    the clause before.
 *  - AFTER: a verdict right after the term ("fasting is not recommended", "skipping meals often
 *    backfires", "le jeûne n'est pas conseillé").
 *  - A warning in a condition ("if you skip breakfast you may feel hungrier later") counts as
 *    against.
 *  - PERMISSIVE forms win over any negator: "it's fine to", "no harm in", "you could", "il n'y a pas
 *    de mal à" are advice.
 * Some rules are never negatable (drug names, body and moral words): mentioning them is the problem.
 */

const MEAL =
  '(?:meals?|breakfasts?|lunch(?:es)?|dinners?|suppers?|brunch|repas|petits?-?dejeuners?|dejeuners?|diners?|soupers?|gouters?)';

interface Rule {
  readonly re: RegExp;
  /** The same pattern with the global flag, compiled once (`matchAll` copies it per call). */
  readonly all: RegExp;
  /** `true`: advising AGAINST it ("do not skip meals") is acceptable. */
  readonly negatable: boolean;
  /** `true`: a typed QUESTION that matches also routes to the calm support line. */
  readonly ask?: boolean;
  /** A match inside a sentence this returns `true` for is acceptable (planning, not compensation). */
  readonly exempt?: (sentence: string) => boolean;
}

const rule = (
  source: string,
  negatable: boolean,
  extra: Pick<Rule, 'ask' | 'exempt'> = {},
): Rule => ({
  re: new RegExp(source),
  all: new RegExp(source, 'g'),
  negatable,
  ...extra,
});

/** Ahead planning ("planning one lighter meal on Saturday") that does not react to having eaten. */
const PLANNING = /\b(?:plan(?:ning|ned|s)?|schedul\w+|prevoir|prevu\w*|prevoyez|envisag\w+)\b/;
const REACTIVE =
  /\b(?:yesterday|last night|today|tonight|this (?:morning|lunch|evening|weekend)|hier|ce (?:midi|soir|matin)|aujourd'hui|too much|trop|ran over|over(?:ate|ran|shot|did)|splurg\w*|binge\w*|excess\w*|exces|went over|depass\w*|(?:ate|eaten) (?:more|too))\b/;
const isAheadPlanning = (sentence: string): boolean =>
  PLANNING.test(sentence) && !REACTIVE.test(sentence);

/**
 * What was LOGGED ("you had just two meals a day on Tuesday", "you logged only water this
 * morning") is a description of the past, not advice to repeat it, unless the sentence goes on to
 * approve of it.
 */
const LOGGED =
  /\b(?:you|vous) (?:had|ate|logged|only had|just had|have (?:had|eaten|logged)|avez (?:mange|pris|eu|note|enregistre|bu)|n'avez (?:mange|pris|bu))\b/;
const ENDORSES =
  /\b(?:keep (?:that|it|this|going)|keep it up|continue|stick (?:to|with)|stay (?:with|on)|more of (?:that|this)|great|good|well done|bravo|perfect|exactly|plenty|enough|ideal|impressive|best|continuez|gardez ce|parfait|bien|exactement|suffit|largement)\b/;
const isLoggedDescription = (sentence: string): boolean =>
  LOGGED.test(sentence) && !ENDORSES.test(sentence);

/** "If you missed lunch today, ...": a past event named as the reason for advice to EAT. */
const PAST_MISS =
  /\b(?:if|when|since|because|once|as|si|quand|puisque|comme) (?:you|you've|you have|vous|tu|i|j'ai)\b(?: \w+){0,2} (?:missed|skipped|forgot|forgotten|didn't (?:have|eat)|did not (?:have|eat)|rate|oublie|saute|manque|omis)\b/;
const isPastMissThenFood = (sentence: string): boolean =>
  PAST_MISS.test(sentence) &&
  /\b(?:snack|collation|eat|manger|mangez|prenez|have something|meal|repas)\b/.test(sentence);

/** A real snack or meal offered next to water or bed: water PLUS food is fine. */
const OFFERS_FOOD =
  /\b(?:small|light|planned|proper|real|nourishing|filling|simple|nourrissante?|vraie|petite|petit) (?:snack|collation|meal|repas|bite)\b|\b(?:snack|collation) is (?:fine|ok|okay)\b|\bprenez (?:une|un) (?:vraie |petite |bonne )?(?:collation|encas|repas)\b|\bhave (?:a|some) (?:snack|bite|fruit|yoghurt)\b/;
const DENIES_FOOD = /\b(?:instead of|rather than|skip|without|plutot que|au lieu|sans|ne )\b/;
const isWaterPlusFood = (sentence: string): boolean =>
  OFFERS_FOOD.test(sentence) && !DENIES_FOOD.test(sentence);

/** Reassurance that moderation of hunger is fine: "a lighter dinner is fine if you are not hungry". */
const isPermissionNotReaction = (sentence: string): boolean =>
  /\b(?:is|are|c'est) (?:fine|ok|okay|alright|bien|possible)\b/.test(sentence) &&
  /\b(?:not hungry|aren't hungry|pas faim|n'avez pas faim|as long as|tant que)\b/.test(sentence);

/** A real food named as the meal ("an omelette instead of dinner, with bread and a salad"). */
const REAL_FOOD =
  /\b(?:omelettes?|eggs?|oeufs?|pasta|pates|rice|riz|bread|pain|cheese|fromage|chicken|poulet|fish|poisson|meat|viande|vegetables|legumes|beans|haricots|lentils|lentilles|tofu|potato(?:es)?|pommes? de terre|salad|salade|sandwich(?:es)?|toast|tartines?)\b/;
const hasRealFood = (sentence: string): boolean => REAL_FOOD.test(sentence);

const src = (...parts: string[]): string => parts.join('|');

export const HARM_RULES: readonly Rule[] = Object.freeze([
  // ---- Fasting, one meal a day, eating windows --------------------------------------------
  rule(src(String.raw`\bfasting\b`, String.raw`\bfasted\b`), true),
  rule(
    src(
      String.raw`\b(?:to|you|we|please|try|start|begin|do|doing|an?|the|your|extended|prolonged|water|juice|dry|intermittent|short|daily|weekly|\d+-?hours?|\d+-?days?) fast\b(?![- ]?(?:food|er\b|ing|ly))`,
      String.raw`\bfast (?:until|till|for \d|for (?:a|an|the|one|two|three|several|few|some)|from|between|during|on (?:mon|tue|wed|thu|fri|sat|sun))\b`,
    ),
    true,
  ),
  rule(
    src(
      String.raw`\bomad\b`,
      String.raw`\bone meal (?:a|per|each) day\b`,
      String.raw`\b(?:1|a single|one single|single) meal (?:a|per|each) day\b`,
      String.raw`\bone big meal\b`,
      String.raw`\beat(?:ing)? (?:only |just )?once (?:a |per )?(?:day|daily)\b`,
      String.raw`\bonce (?:a|per) day (?:eating|meal|diet|plan|regimen)\b`,
      String.raw`\bonly (?:eat|eating) once\b`,
      String.raw`\bun seul repas\b`,
      String.raw`\bun repas (?:par jour|unique|seulement)\b`,
      String.raw`\bune (?:seule )?fois par jour\b[^.?!;]{0,12}\b(?:manger|repas)\b`,
      String.raw`\bmanger une (?:seule )?fois par jour\b`,
    ),
    true,
  ),
  rule(
    src(
      String.raw`\b(?:eating|feeding|meal) window\b`,
      String.raw`\bwindow of eating\b`,
      String.raw`\beat(?:ing)? only between\b`,
      String.raw`\bonly eat(?:ing)? (?:between|from|within|during)\b`,
      String.raw`\bfenetre (?:alimentaire|de repas|d'alimentation|de (?:\w+ )?heures?)\b`,
      String.raw`\bne mangez qu'(?:entre|a)\b`,
      String.raw`\bmanger (?:uniquement|seulement) entre\b`,
      String.raw`\b(?:16|18|20|14|12)\s?[:/]\s?(?:8|6|4|10)(?!\d)`,
      String.raw`\b5\s?[:/]\s?2(?!\d)`,
      String.raw`\btime[- ]restricted (?:eating|feeding)\b`,
      String.raw`\bintermittent fasting\b`,
      String.raw`\balternate[- ]day (?:fast|diet)\b`,
      String.raw`\bwarrior diet\b`,
      String.raw`\bjeune intermittent\b`,
      String.raw`\bjeuxn\w*`,
      String.raw`\bjeune (?:prolonge|hydrique|de \d+ (?:h|heures?|jours?))\b`,
      String.raw`\bje jeune\b`,
      String.raw`\bfaire un jeune\b`,
      String.raw`\bjeuner\b`,
      String.raw`\bjeunez\b`,
    ),
    true,
  ),
  rule(
    src(
      String.raw`\bno (?:food|eating|meals?|dinner|supper|snacks?) (?:after|before|until|past)\b`,
      String.raw`\bnothing (?:to eat )?after \d`,
      String.raw`\bpas de (?:repas|diner|dejeuner|petit-dejeuner|collation|nourriture) (?:apres|avant|ce soir|aujourd'hui|jusqu)`,
      String.raw`\brien (?:a manger )?apres \d`,
      String.raw`\bne mangez (?:rien|plus|pas (?:ce|le|apres|avant|aujourd|demain))`,
      String.raw`\bne (?:dinez|dejeunez|soupez|petit-dejeunez)\b[^.?!;]{0,10}\bpas\b`,
      String.raw`\bn'avalez rien\b`,
      String.raw`\b(?:don't|do not|dont|never|stop|no more)\s+(?:have|having|eat|eating|take|taking)\s+(?:any\s+|a\s+|your\s+)?(?:dinner|supper|lunch|breakfast|meals?)\s+(?:tonight|today|tomorrow|at all|anymore|any more|this evening|this morning|now|on (?:mon|tue|wed|thu|fri|sat|sun))`,
      String.raw`\bne (?:prenez|faites) pas (?:de |d'|le |un )?(?:repas|diner|dejeuner|petit-dejeuner)\b|\bne prenez (?:rien|aucun repas)\b`,
    ),
    false,
  ),
  // ---- Skipping, leaving out, replacing a meal ---------------------------------------------
  rule(
    src(
      String.raw`\b(?:skip|skips|skipping|skipped)\b[^.?!;]{0,48}?\b${MEAL}\b`,
      String.raw`\b(?:leav(?:e|es|ing) out|go(?:es|ing)? without|do(?:es|ing)? without|omit(?:ting)?|forg(?:o|oing)|drop(?:ping)?|cut(?:ting)? out|miss(?:ing)? out on|stop(?:ping)? (?:eating|having))\b[^.?!;]{0,16}?\b${MEAL}\b`,
      String.raw`\bmiss(?:ing|ed)? (?:a |your |some |one )?${MEAL}\b`,
      String.raw`\b(?:cut|drop|ditch|remove|eliminate|delete)\s+(?:a |your |the |my )?(?:meal|breakfast|lunch|dinner|supper)s?(?: out| altogether| completely)\b`,
      String.raw`\b(?:having|have|eat(?:ing)?|taking) no (?:dinner|supper|lunch|breakfast|meal)\b|\bno (?:dinner|supper|lunch|breakfast) (?:now and then|sometimes|occasionally|once in a while)\b`,
      String.raw`\bne plus (?:prendre|manger) (?:de |du |d')?(?:petit-dejeuner|diner|dejeuner|repas|gouter)\b|\bne plus (?:dejeuner|diner)\b`,
      String.raw`\bpas de (?:diner|dejeuner|petit-dejeuner|repas) (?:de temps en temps|parfois|occasionnellement|le soir|une fois)\b|\bsans (?:diner|dejeuner|petit-dejeuner|repas)\b`,
      String.raw`\barret\w+ de manger[^.?!;,]{0,16}\b(?:diner|dejeuner|petit-dejeuner|repas|soir|midi|matin|apres)\b|\bstop(?:ping)? eating (?:after|before|from|at)\b`,
      String.raw`\b(?:not|never) (?:eat|eating|have|having) (?:a |your |any )?(?:breakfast|lunch|dinner|supper)\b`,
      String.raw`\bsaut(?:er|ez|ons|e|es|ant)\b[^.?!;]{0,48}?\b${MEAL}\b`,
      String.raw`\bsaut(?:ez|ons)(?:-\w+)?\b`,
      String.raw`\bpassez[- ]vous (?:du|de la|des|de l'|de)\s*${MEAL}\b`,
      String.raw`\b(?:vous|se|me|te) passer (?:du|de la|des|de l'|de)\s*${MEAL}\b`,
      String.raw`\bimpasse sur (?:le|la|les|l'|un|une|votre)\s*${MEAL}\b`,
      String.raw`\barret\w+ de (?:diner|dejeuner|manger le soir|prendre (?:un |le |votre )?(?:petit|diner|dejeuner))\b`,
      String.raw`\b(?:omettez|supprimez|retirez|enlevez) (?:le|la|un|une|votre)\s*${MEAL}\b`,
    ),
    true,
    { exempt: isPastMissThenFood },
  ),
  rule(
    src(
      String.raw`\binstead of (?:a |an |your |the |some )?(?:meal|breakfast|lunch|dinner|supper|brunch)\b`,
      String.raw`\bin place of (?:a |your |the )?(?:meal|breakfast|lunch|dinner|supper)\b`,
      String.raw`\b(?:swap|swapping|swapped|trade|replac\w*|substitut\w*|switch(?:ing)? out)\b[^.?!;]{0,12}\b(?:meals?|breakfasts?|lunch(?:es)?|dinners?|suppers?|brunch)\b`,
      String.raw`\bmeal[- ]replacement|\bmeal[- ]substitute|\bshake diet\b|\bslim[- ]?fast\b|\bliquid diet\b|\bsoup diet\b|\bcabbage soup\b`,
      String.raw`\bremplac\w+\b[^.?!;]{0,16}\b${MEAL}\b`,
      String.raw`\bsubstituts? de repas\b|\brepas de remplacement\b|\bregime (?:soupe|liquide)\b`,
      String.raw`\b(?:au lieu|a la place) (?:du|de la|de l'|d'un|d'une|de votre)\s*${MEAL}\b`,
    ),
    true,
  ),
  rule(
    src(
      String.raw`\byou (?:do not|don't|dont) need (?:a |your |any |to eat )?(?:dinner|lunch|breakfast|supper|meals?|food)\b`,
      String.raw`\bno need for (?:dinner|lunch|breakfast|supper)\b`,
      String.raw`\bvous n'avez pas besoin (?:de|du|d')\s*${MEAL}\b`,
    ),
    false,
  ),
  rule(
    src(
      String.raw`\bgo(?:ing)? to (?:bed|sleep) (?:a bit |a little |slightly |somewhat )?(?:hungry|on an empty stomach|without eating)\b`,
      String.raw`\bgo(?:ing)? (?:to bed )?hungry\b`,
      String.raw`\b(?:stay|staying|remain|remaining) hungry\b`,
      String.raw`\bse coucher (?:le ventre vide|avec (?:un peu )?faim|sans manger|affame)\b`,
      String.raw`\brester (?:un peu )?(?:sur sa|a la|avec la) faim\b`,
      String.raw`\b(?:ignore|ignoring|resist|resisting|suppress|suppressing|push through|pushing through|endure|tough out|power through|override|overriding)\b[^.?!;]{0,12}\b(?:hunger|hungry|appetite|cravings?|urges?)\b`,
      String.raw`\bignorez (?:votre |la |les )?(?:faim|envies?)\b`,
      String.raw`\bresistez (?:a la faim|aux envies|a vos envies)\b`,
      String.raw`\binstead of eating\b|\bau lieu de manger\b|\bplutot que de manger\b|\b(?:wait|waiting)\b[^.?!;]{0,20}\bhunger\b|\bhunger (?:usually |will |soon |always )?(?:fades?|passes?|goes away|disappears?|subsides)\b|\bla faim (?:passe|disparait|s'estompe)\b|\battendez\b[^.?!;]{0,20}\bfaim\b`,
    ),
    true,
  ),
  rule(
    src(
      String.raw`\b(?:drink|drinking|have|sip|sipping|reach for|try)\b[^.?!;]{0,16}\b(?:water|tea|coffee|sparkling)\b[^.?!;]{0,28}\b(?:when|if|whenever|instead|rather than)\b[^.?!;]{0,16}\b(?:hungry|hunger|cravings?|appetite|food|eating|snack)\b`,
      String.raw`\bjust (?:drink|have) (?:some )?water\b`,
      String.raw`\bwater (?:is|will be|should be) enough\b`,
      String.raw`\ba glass of water (?:is|will be) enough\b`,
      String.raw`\bbuvez\b[^.?!;]{0,16}\beau\b[^.?!;]{0,28}\b(?:faim|envie|envies|appetit|a la place|plutot que|au lieu|grignot)\w*`,
      String.raw`\bun verre d'eau (?:suffit|est suffisant|fait l'affaire)\b`,
      String.raw`\bde l'eau (?:suffit|est suffisante)\b`,
      String.raw`\bde l'eau a la place (?:du|de la|de l'|d'un|d'une|de votre)\s*${MEAL}\b`,
      String.raw`\bboire de l'eau\b[^.?!;]{0,24}\b(?:faim|envie)\b`,
    ),
    true,
    { exempt: isWaterPlusFood },
  ),
  // ---- Detox, cleanses, vinegar, fat burning ------------------------------------------------
  rule(
    src(
      String.raw`\bdetox\w*`,
      String.raw`\bcleanse[sd]?\b|\bcleansing\b`,
      String.raw`\bjuice (?:cleanse|fast|cure|diet|detox)\b`,
      String.raw`\bcure (?:de jus|detox|de \d+ jours|minceur|amaigrissante|de soupe|de legumes)\b`,
      String.raw`\bjus (?:detox|de cure)\b`,
      String.raw`\b(?:fruit|fruits|juice|soup|cabbage|salad|water|smoothies?|shakes?|liquids?|tea|coffee)[- ]only\b|\bonly (?:fruit|juice|soup|water|smoothies?|liquids?|tea|coffee)\b|\blive on (?:juice|water|tea|coffee|fruit|soup)\b`,
      String.raw`\bfruits? uniquement\b|\buniquement (?:des |de l')?(?:fruits|jus|soupe|eau|liquides)\b|\bque des (?:fruits|jus|soupes)\b|\bvivre (?:de|avec) (?:jus|eau|the|cafe|fruits|soupe)\b`,
      String.raw`\bflush (?:out )?(?:toxins|your system|the body)\b`,
      String.raw`\btoxins?\b|\btoxines?\b`,
      String.raw`\bdrain(?:er|ant|age)\b`,
      String.raw`\bpurif\w+ (?:your |the |votre |le )?(?:body|system|corps|organisme)\b`,
    ),
    true,
    { exempt: isLoggedDescription },
  ),
  rule(
    src(
      String.raw`\b(?:apple )?cider vinegar\b`,
      String.raw`\bvinaigre de cidre\b`,
      String.raw`\bapple cider\b`,
      String.raw`\bacv\b`,
      String.raw`\bvinegar (?:shot|drink|tonic)\b`,
      String.raw`\bvinaigre\b[^.?!;]{0,24}\b(?:minceur|maigrir|graisse|bruler|faim|coupe)\w*`,
    ),
    false,
  ),
  rule(
    src(
      String.raw`\bfat[- ]?burn\w*`,
      String.raw`\bburn(?:s|ing|ed)? (?:body |belly |stubborn )?fat\b`,
      String.raw`\bbrul\w+[- ]?(?:de )?graisses?\b|\bbruler (?:la |les |votre )?graisses?\b`,
      String.raw`\b(?:boost|speed(?:s|ing)? up|kick[- ]?start|fire up|rev(?:s|ving)? up|accel\w+|stimul\w+)\b[^.?!;]{0,12}\b(?:metabolism|metabolisme)\b`,
      String.raw`\bmetabolism[- ]?boost\w*|\bthermogenic\b|\bthermogeniques?\b|\blipotropic\b`,
    ),
    true,
  ),
  // ---- Elimination and fad diets ------------------------------------------------------------
  rule(
    src(
      String.raw`\bketo\w*`,
      String.raw`\bketogenic\b|\bcetogene\w*|\bcetogenique\b|\bcetose\b`,
      String.raw`\batkins\b|\bdukan\b|\bpaleo\b|\bcarnivore\b|\bwhole30\b`,
      String.raw`\blow[- ]carb diet\b`,
      String.raw`\bregime (?:pauvre en glucides|sans glucides|hyperproteine|cetogene|dissocie)\b`,
      String.raw`\bsans glucides\b|\bzero (?:carbs?|glucides?|sucre)\b|\bno[- ]carbs?\b|\bcarb[- ]free\b`,
      String.raw`\bcut(?:ting)? out (?:all |every |entire |whole )?(?:carbs?|carbohydrates?|bread|pasta|rice|starch\w*|dairy|gluten|grains?|fats?|food groups?)\b`,
      String.raw`\b(?:eliminat\w+|giv(?:e|ing) up|ban(?:ning)?|quit(?:ting)?|stop eating|swear off|ditch(?:ing)?|remov(?:e|ing)|drop(?:ping)?) (?:all |every |entire |whole )?(?:carbs?|carbohydrates?|bread|pasta|rice|starch\w*|dairy|gluten|grains?|fats?)\b`,
      String.raw`\b(?:cut(?:ting)? out|eliminat\w+|giv(?:e|ing) up|ban(?:ning)?|quit(?:ting)?|stop eating) (?:all |any |every )?(?:sugar|sweets)\b[^.?!;]{0,12}\b(?:completely|entirely|totally|altogether|for good|forever|whole)\b`,
      String.raw`\b(?:supprim\w+|elimin\w+|bannir|bannissez|exclu\w+|retir\w+|bye[- ]?bye|renonc\w+ (?:a|au|aux)|arret\w+ (?:le|les|de|d'))\b[^.?!;]{0,16}\b(?:glucides?|feculents?|pain|pates|riz|gluten|laitages?|produits laitiers|graisses?|lipides?|sucres?)\b`,
      String.raw`\bevit\w+ (?:les |tous les |tout )?(?:feculents|glucides|pain|pates|sucres?)\b[^.?!;]{0,16}\b(?:completement|totalement|definitivement|a tout prix)\b`,
      String.raw`\bne mangez plus (?:de |du |des |d')`,
      String.raw`\b(?:avoid|avoiding|steer clear of|lay off|forget) (?:all|every|any|entire|whole)[ ]?(?:bread|rice|pasta|potatoes?|carbs?|starch\w*|sugar|dairy|fats?|gluten|grains?)\b`,
      String.raw`\bevit\w+ tout(?:e)? (?:le |la |les |l')?(?:pain|riz|pates|feculents|glucides|sucre|pommes de terre)\b`,
    ),
    true,
  ),
  rule(
    src(
      String.raw`\bvery[- ]low[- ]calorie\b|\bvlcd\b|\bcrash diet\b|\bfad diet\b|\bextreme diet\b|\brestrictive diet\b|\bdetox diet\b`,
      String.raw`\bstarv(?:e|ing) (?:yourself|your body|the body|themselves)\b|\bstarvation\b`,
      String.raw`\bregime (?:drastique|draconien|express|miracle|restrictif)\b|\bminceur express\b|\bhypocalorique\b`,
    ),
    true,
  ),
  // ---- Fast loss claims ---------------------------------------------------------------------
  rule(
    src(
      String.raw`\b(?:fastest|quickest|faster|quicker|fast|quick|speedy|rapid|overnight) (?:way|route|method|results?|weight loss|fat loss|loss)\b`,
      String.raw`\blos(?:e|ing) (?:weight|fat|\w+ kilos?) (?:fast|quickly|rapidly|in days)\b`,
      String.raw`\b(?:lose|losing|drop|dropping|shed|shedding|slim down|perdre|maigrir)\b[^.?!;]{0,30}\b(?:in (?:just )?(?:a )?(?:few|couple of|\d+) days?|in just days|in (?:just )?(?:a|one|1) week|overnight|by (?:next week|tomorrow|the weekend|friday)|en (?:quelques|\d+) jours|en (?:une|1) semaine|d'ici (?:demain|la semaine|vendredi|le week-end))\b`,
      String.raw`\bperdre (?:du poids |des kilos |du gras )?(?:vite|rapidement|en quelques jours)\b`,
      String.raw`\b(?:maigrir|perdre)\b[^.?!;,]{0,24}\b(?:vite|rapidement|en un temps record|en un rien de temps)\b`,
      String.raw`\bperte (?:de poids )?rapide\b|\bresultats? rapides?\b`,
    ),
    true,
  ),
  // ---- Drugs and supplements ----------------------------------------------------------------
  rule(
    String.raw`\b(?:semaglutide|ozempic|wegovy|rybelsus|tirzepatide|mounjaro|zepbound|liraglutide|saxenda|victoza|orlistat|xenical|alli|naltrexone|bupropion|contrave|phentermine|adipex|phendimetrazine|qsymia|topiramate|metformin|metformine|sibutramine|lorcaserin|belviq|dulaglutide|trulicity|exenatide|byetta|retatrutide|glp-?1|glp1|ephedrine|clenbuterol|dnp|furosemide|lasilix|levothyrox\w*|thyroxine|adderall|ritalin|amphetamines?)\b`,
    false,
  ),
  rule(
    src(
      String.raw`\bstylos? (?:amaigrissant|coupe-faim|ozempic)\b`,
      String.raw`\binjections? (?:amaigrissantes?|pour maigrir)\b`,
      String.raw`\bmedicaments? (?:pour |afin de )?(?:maigrir|perdre|couper)`,
      String.raw`\bmedicaments? (?:amaigrissants?|coupe-faim)\b`,
      String.raw`\bpilules? (?:minceur|amaigrissantes?|coupe-faim)\b`,
      String.raw`\bcoupe-?faim\b|\banorexigene\w*`,
      String.raw`\bappetite[- ](?:suppress\w*|control\w*|blocker)|\bsuppress(?:ant|ing|es)? (?:your |the )?appetite\b`,
      String.raw`\bweight[- ]?loss (?:pills?|drugs?|medications?|injections?|supplements?|tablets?|shots?|jabs?|products?|aid)\b`,
    ),
    false,
  ),
  rule(
    src(
      String.raw`\bdiet pills?\b|\bfat[- ]?(?:burners?|blockers?|binders?)\b`,
      String.raw`\blaxati\w*|\bdiuretic\w*|\bdiuretique\w*|\bwater pills\b|\bpurg\w+|\bvomi\w*|\bthrow(?:ing)? up\b|\bmake yourself sick\b|\bchew and spit\b`,
    ),
    true,
  ),
  rule(
    src(
      String.raw`\bglucomannan\w*|\bkonjac\b|\bgarcinia\b|\bgreen tea extract\b|\bcla\b|\bchitosan\b|\bberberine\b|\bhca\b|\b7-?keto\b|\bspiruline\b`,
      String.raw`\bcaffeine (?:pills?|tablets?)\b|\bgelules?\b|\bcapsules?\b|\bcachets?\b|\bpills?\b|\bpilules?\b|\bcomprimes?\b`,
      String.raw`\bsupplements?\b|\bcomplements? alimentaires?\b|\bmultivitamins?\b|\bvitamin (?:c|d|b\d*) (?:pills?|tablets?|capsules?)\b`,
    ),
    true,
  ),
  // ---- Eating a fraction of the usual -------------------------------------------------------
  rule(
    src(
      String.raw`\b(?:cut|halve|reduce|shrink|slash)\b[^.?!;,]{0,16}\b(?:portions?|meals?|servings?|plate|food)\b[^.?!;]{0,16}\b(?:in half|by half|by (?:a )?(?:third|half|quarter)|in two)\b`,
      String.raw`\bhalf (?:the|your) (?:portions?|food)\b|\bhalf as much\b|\b(?:a third|a quarter|two[- ]thirds) (?:as much|of (?:what|your usual|the usual))\b`,
      String.raw`\bdeux fois moins\b|\bmoitie moins\b|\b(?:coupez|divisez|reduisez)\b[^.?!;,]{0,12}\b(?:portions?|repas|assiette)\b[^.?!;]{0,16}\b(?:en deux|de moitie|par deux)\b`,
    ),
    true,
  ),
  // ---- Compensation, exercise as punishment -------------------------------------------------
  rule(
    src(
      String.raw`\b(?:walk|run|jog|sweat|exercise|train|work|burn|burning|walking|running|sweating|working)\b[^.?!;]{0,8}\b(?:it|them|this|that|these|those|off|away)\b[^.?!;]{0,4}\b(?:off|away)\b`,
      String.raw`\bburn(?:s|ed|ing)? (?:it|them|this|that|these|those) (?:off|away)\b`,
      String.raw`\bburn (?:off|away)\b`,
      String.raw`\bmake up for\b|\bmaking up for\b`,
      String.raw`\bcompensat(?:e|es|ed|ing|ion)\b`,
      String.raw`\b(?:to )?earn (?:it|your|that|the|a)\b`,
      String.raw`\bdeserve (?:it|your|that|a|the)\b`,
      String.raw`\bpunish\w*|\boffset(?:s|ting)? (?:it|that|the|this|calories)\b|\bundo(?:ing)? (?:the|yesterday|today|that|it)\b`,
      String.raw`\b(?:make|making) (?:tomorrow|tonight|today|the next day|your next meal|dinner)\b[^.?!;]{0,8}\b(?:lighter|smaller|leaner)\b`,
      String.raw`\b(?:eat|have|go|cut back|eating|having) (?:a )?(?:less|lighter|smaller|fewer|easier)\b[^.?!;]{0,16}\b(?:tomorrow|tonight|later|afterwards|the next day|to (?:make up|balance|compensate|offset|even))\b`,
      String.raw`\b(?:tomorrow|tonight|later)\b[^.?!;]{0,10}\b(?:eat|have|aim|go|cut) (?:less|lighter|smaller|fewer|easier)\b`,
      String.raw`\bcut back (?:tomorrow|tonight|later|the next day)\b|\bgo easy (?:tomorrow|tonight|the next day|on the next)\b`,
      String.raw`\beat less (?:today|tomorrow|tonight|later|at dinner|the next day)\b`,
      String.raw`\bbruler (?:ca|cela|les calories|cette|ce|la|le)\b`,
      String.raw`(?<!\bpas )(?<!\bnon )\bpour (?:equilibrer|compenser|rattraper|se rattraper|reequilibrer|effacer|eliminer|bruler|eponger)\b`,
      String.raw`\bcompens(?:er|ez|ation)\b|\brattrap(?:er|ez)\b|\bse rattraper\b|\bpunition\b|\bmeriter (?:ce|son|votre|ca)\b`,
      String.raw`\belimin(?:er|ez) (?:la|le|les|cette|ce|ces|l')\s*\w+`,
      String.raw`\b(?:mistake|error|slip[- ]?up|failure|sin)\b[^.?!;]{0,24}\b(?:fix|correct|repair|undo|make up|erase|atone)\b`,
      String.raw`\b(?:fix|correct|repair|undo|erase|atone for)\b[^.?!;]{0,16}\b(?:pizza|dessert|meal|dinner|lunch|binge|slip|indulgence|weekend)\b`,
      String.raw`\bcount (?:it|that|the \w+) as a (?:mistake|slip|failure|sin)\b|\bune erreur a (?:reparer|corriger|effacer|rattraper)\b|\bcomme une erreur\b`,
      String.raw`\b(?:plus leger|moins) (?:demain|ce soir|ensuite|apres|le lendemain)\b|\bmangez (?:plus leger|moins)\b[^.?!;]{0,16}\b(?:demain|ce soir|apres|ensuite|le lendemain|aujourd'hui)\b|\ballegez\b|\bdemain,? (?:mangez|prenez|faites) (?:moins|plus leger|un repas leger)\b`,
    ),
    true,
  ),
  rule(
    src(
      String.raw`\b(?:eat|eating|consume|consuming|have|aim for|stay) (?:less|fewer|lower|under|below) (?:than )?(?:your|the) (?:daily )?(?:guide|floor)\b`,
      String.raw`\bmanger moins que votre\b|\bmoins que votre repere\b`,
      String.raw`\b(?:stay|keep|remain|go|eat|aim|restez|reste|gardez|visez|mangez)\b[^.?!;]{0,12}\b(?:under|below|sous|en dessous de|au-dessous de|en deca de)\s+(?:your|the|votre|le)\s+(?:daily\s+)?(?:guide|repere|floor|plancher)\b`,
    ),
    true,
  ),
  // ---- Moral words about the person or the food ---------------------------------------------
  rule(
    src(
      String.raw`\byou(?:'ve| have)? been (?:so |very |too |really |a bit |quite )?(?:bad|good|naughty|great|perfect|wicked|lazy|weak|disciplined|strict)\b`,
      String.raw`\byou (?:were|was|are|'re) (?:so |very |too |really |a bit |quite )?(?:bad|naughty|wicked|lazy|weak)\b`,
      String.raw`\bbe (?:good|strict|disciplined|perfect)\b[^.?!;]{0,20}\b(?:all week|during the week|weekdays|monday to friday)\b`,
      String.raw`\bsoyez (?:tres |bien |toujours )?(?:sages?|stricte?s?|rigoureu\w+|disciplin\w+)\b|\boffrez[- ]vous\b[^.?!;]{0,24}\b(?:samedi|dimanche|week-end|apres)\b`,
      String.raw`\b(?:cheat|cheats|cheated|cheating)\b`,
      String.raw`\btreat (?:day|meal|yourself)\b|\bcheat (?:day|meal)\b|\breward (?:yourself|your)\b|\byou deserve\b|\bindulg\w+|\bsinful\b|\bguilty\b|\bnaughty\b|\bwicked\b`,
      String.raw`\b(?:bad|naughty|sinful|junk|clean|dirty) (?:food|foods|meal|choice|choices|habits?|boy|girl)\b`,
      String.raw`\b(?:vous|tu) (?:avez|as) ete (?:tres |bien |trop |plutot )?(?:sage|bon|bonne|mauvais|mauvaise|raisonnable|vilain|vilaine|coquin|coquine|strict|stricte)\b`,
      String.raw`\b(?:vous|tu) (?:etes|es) (?:tres |bien |trop |plutot )?(?:sages?|vilains?|vilaines?|coquins?|coquines?)\b`,
      String.raw`\bcraqu(?:age|ages|er|e|es|ez|ons)\b`,
      String.raw`\b(?:faire|faites|petits?|gros|grands?|vos|votre)\s+(?:petits? |gros |grands? )?ecarts?\b|\becarts? (?:alimentaires?|de regime|de conduite)\b`,
      String.raw`\b(?:jour|repas) (?:de triche|plaisir)\b|\bpeche mignon\b|\bgourmandise coupable\b|\bculpabilis\w*`,
    ),
    false,
  ),
  // ---- Second pass of the lexical layer (measured 2026-11-15): the same harms, worded without the
  //      key verb. Appended so the indexes of `ASK_RULE_INDEXES` stay valid; `ask` rules also route a
  //      typed question.
  // Letting a meal go, waiting for the next one, pushing the first one back.
  rule(
    src(
      String.raw`\blet(?:ting)? (?:the |your |a |that )?(?:meals?|breakfasts?|lunch(?:es)?|dinners?|suppers?|brunch|snacks?) go\b`,
      String.raw`\b(?:wait|waiting|hold off|holding off|hold out|holding out)\b[^.?!;]{0,6}\b(?:until|till|for)\b[^.?!;]{0,4}\b(?:lunch|dinner|supper|noon|midday|the afternoon|the evening|tonight|\d{1,2} ?(?:pm|am|o'clock))\b`,
      String.raw`\b(?:push|pushing|pushed|delay|delaying|delayed|postpone|postponing|put off|putting off|move|moving|shift|shifting|defer|deferring)\b[^.?!;]{0,12}\b(?:(?:first|next|morning|evening) meal\b|(?:main|big) meal\b(?! (?:to|at|for|until) (?:the )?(?:lunch(?:time)?|midday|noon|earlier|the middle of the day)))`,
      String.raw`\bfirst meal\b[^.?!;]{0,20}\b(?:mid-?afternoon|late afternoon|later|noon|midday|late)\b`,
      String.raw`\battendez\b[^.?!;]{0,12}\b(?:midi|le dejeuner|le diner|le soir|l'apres-midi|\d{1,2} ?h)\b`,
      String.raw`\b(?:retardez|repoussez|reportez|decalez|differez)\b[^.?!;]{0,16}\b(?:premier repas|repas|petit-dejeuner|dejeuner|diner)\b`,
      String.raw`\bpremier repas\b[^.?!;]{0,20}\b(?:tard|midi|apres-midi|plus tard|\d{1,2} ?h)\b`,
      String.raw`\b(?:zapp\w+|loup(?:er|ez|e|es|ant)|rat(?:er|ez|ant)|oubli(?:er|ez))\b[^.?!;]{0,48}?\b${MEAL}\b`,
    ),
    true,
    { ask: true, exempt: isPastMissThenFood },
  ),
  // Something small standing in for a meal.
  rule(
    src(
      String.raw`\b(?:stand(?:s|ing)? in (?:for|of)|takes? the place of|taking the place of|in lieu of|can do for|will do for|is enough for|suffices? for)\b[^.?!;]{0,12}\b(?:a |an |your |the |any )?(?:meals?|breakfasts?|lunch(?:es)?|dinners?|suppers?|brunch)\b`,
      String.raw`\b(?:cup|glass|mug|bowl|bottle) of (?:tea|coffee|water|broth|soup|juice|milk)\b(?:(?!\b(?:bread|cheese|pasta|rice|eggs?|chicken|fish|meat|beans|lentils|toast|sandwich|tofu|potatoes?)\b)[^.?!;]){0,30}\b(?:is enough|suffices|will do|does the trick|can do|should do|is all you need|stand in)\b`,
      String.raw`\bcontenter (?:d'|de |du |des )(?:une? )?(?:simple )?(?:tisane|the|cafe|eau|bouillon|soupe|yaourt|fruit|pomme|salade|jus|collation|rien|peu)\b`,
      String.raw`\b(?:tient|tiennent|tenir|tenez|tiendra) lieu (?:de|du|des)\b[^.?!;]{0,12}\b${MEAL}\b`,
      String.raw`\b(?:un|une|le|la|du|de la|des)\s+(?:simple |petit |petite |bon |grand |grande )?(?:cafe|the|tisane|infusion|bouillon|verre d'eau|soupe|jus|yaourt|fruit|pomme)(?: noir| vert)?\b(?:(?!\b(?:pain|fromage|pates|riz|oeufs?|poulet|poisson|viande|legumes?|haricots|lentilles|tartines?|omelette)\b)[^.?!;]){0,20}\b(?:suffit|suffisent|suffira|fait l'affaire|fera l'affaire|est assez|est suffisant|tient lieu)\b`,
      String.raw`\ben guise d(?:e|u|'un|'une)?\s*(?:diner|dejeuner|petit-dejeuner|repas)\b`,
    ),
    true,
    { ask: true, exempt: hasRealFood },
  ),
  // One or two meals a day, said as a count.
  rule(
    src(
      String.raw`\b(?:eat|eating|have|having|take|taking|stick to|sticking to|stay on|aim for|go for|limit yourself to|limit to|just|only|manger|prenez|limitez[- ]vous a|contentez[- ]vous de)\b[^.?!;]{0,16}\b(?:1|2|one|two|un|une|deux)\s+(?:(?:real|proper|big|large|full|main|vrai|vraie|gros|bon)\s+){0,2}(?:meals?|repas)\s+(?:a|per|each|every|par|chaque)\s+(?:day|jour)\b`,
      String.raw`\b(?:1|2|one|two|un|une|deux)\s+(?:(?:real|proper|big|large|full|main|vrai|vraie|gros|bon)\s+){0,2}(?:meals?|repas)\s+(?:a|per|each|every|par|chaque)\s+(?:day|jour)\b[^.?!;]{0,30}\b(?:plenty|enough|suffi\w*|sufficient|largement|all you need|is best|are best|ideal|do the job|is fine|are fine|c'est assez)\b`,
      String.raw`\b(?:mang\w+|prenez|prends|prendre|limitez\w*|contentez\w*)\b[^.?!;]{0,10}\bqu'(?:un|une)\s+(?:seul\w*\s+)?(?:(?:vrai|vraie|bon|gros)\s+)?repas\b`,
      String.raw`\bun seul (?:vrai|vraie|gros|bon) repas\b`,
    ),
    true,
    { ask: true, exempt: isLoggedDescription },
  ),
  // Not eating for a stretch of the clock, without the word "fast".
  rule(
    src(
      String.raw`\bgo(?:ing)? without (?:any )?(?:food|eating|anything to eat)\b`,
      String.raw`\b(?:without (?:any )?(?:food|eating)|no food|nothing to eat|eat nothing|not eat(?:ing)?|don'?t eat|do not eat|abstain\w*|refrain\w* from eating|ne mangez (?:rien|pas|plus)|rien (?:a )?manger|sans (?:manger|nourriture)|pas de nourriture)\b[^.?!;]{0,30}\b(?:from|de|depuis|entre|between|after|apres|des)\b[^.?!;]{0,10}\b\d{1,2} ?(?:h|pm|am|:\d\d|o'clock|heures?)\b[^.?!;]{0,25}\b(?:until|till|to|a|et|jusqu'a|jusqu'au|au|and|-)\b[^.?!;]{0,12}\d{1,2}`,
      String.raw`\b(?:from|between|de|entre) \d{1,2} ?(?:h|pm|am|:\d\d|o'clock|heures?)\b[^.?!;]{0,12}\b(?:until|till|to|et|a|jusqu'a|and)\b[^.?!;]{0,12}\d{1,2} ?(?:h|pm|am|:\d\d|heures?)\b[^.?!;]{0,16}\b(?:no food|nothing|without eating|sans manger|ne mangez|rien|fast|next day|lendemain)\b`,
    ),
    true,
    { ask: true },
  ),
  // Mono-diets, liquid and protein diets, only soups, "reset" cures.
  rule(
    src(
      String.raw`\bmono[- ]?diet(?:e|es|s)?\b|\bmono[- ]?regime\b`,
      String.raw`\b(?:apple|banana|rice|potato|egg|cabbage|grapefruit|pineapple|watermelon|lemon|maple syrup|liquid|water|juice|smoothie|shake|soup|broth|baby food|raw food|fruit) (?:only )?diet\b`,
      String.raw`\bregime (?:a la |au |aux |de la |du |de l'|d')?(?:pomme|riz|banane|pamplemousse|oeufs?|chou|ananas|pasteque|pommes? de terre|citron|eau|jus|liquide|proteine\w*)\b`,
      String.raw`\bdiete\b[^.?!;]{0,16}\b(?:eau|hydrique|liquide|proteinee|fruits?|jus|soupe|citron|pomme)\b`,
      String.raw`\bproteinee? liquide\b|\bprotein\w* (?:diet|shakes?) (?:only|for \d)\b`,
      String.raw`\bonly (?:\w+ (?:and|or) )?(?:soups?|broths?|juices?|smoothies?|shakes?|liquids?|fruits?|salads?|water|teas?|coffee|bars?)\b`,
      String.raw`\b(?:great|good|quick|fast|easy|full|total|hard|real|fresh|clean) reset (?:after (?:the |a |your )?(?:holidays?|christmas|festive|weekend|binge|vacation|indulg\w+)|for (?:your )?(?:body|system|gut|diet|weight)|of (?:your )?(?:body|system|diet)|with (?:a |an )?(?:soup|juice|cleanse|detox|diet|fast))\b|\breset (?:your |the )?(?:body|system|metabolism|gut|digestion)\b|\bbody reset\b|\b(?:reset|reboot) (?:diet|cure|week|plan|cleanse)\b|\b(?:cure|diete) de (?:reset|reboot)\b`,
      String.raw`\bnothing but (?:shakes?|water|juice|tea|coffee|soup|broth|liquids?|fruit)\b|\bnothing else\b[^.?!;]{0,12}\b(?:for|than)\b[^.?!;]{0,10}\b(?:week|month|days?)\b`,
      String.raw`\bne (?:boire|manger|prendre) (?:que|qu')\s*(?:des |de l'|du |un |une )?(?:shakes?|liquides?|jus|eau|soupes?|fruits?|cafe|the|tisanes?|bouillons?|smoothies?)\b`,
      String.raw`\b(?:uniquement|seulement|exclusivement) (?:des |de l'|du )?(?:shakes?|liquides?|soupes?|bouillons?|smoothies?|boissons)\b`,
    ),
    true,
    { ask: true, exempt: isLoggedDescription },
  ),
  // Water, a toothbrush or bed offered as the answer to hunger.
  rule(
    src(
      String.raw`\b(?:hunger|hungry|cravings?|appetite|faim|envie de manger|envies?|grignot\w*)\b[^.?!;]{0,60}\b(?:toothbrush|brush(?:ing)? (?:your |the )?teeth|chew(?:ing)? gum|chewing-?gum|go(?:ing)? to bed|go(?:ing)? to sleep|early night|se coucher|vous coucher|allez dormir|brossez|brosser|brossage|distract\w*)\b`,
      String.raw`\b(?:toothbrush|brush(?:ing)? (?:your |the )?teeth|chew(?:ing)? gum|go(?:ing)? to bed|go(?:ing)? to sleep|brossez|vous coucher)\b[^.?!;]{0,40}\b(?:hunger|hungry|cravings?|appetite|faim|envies?)\b`,
      String.raw`\b(?:hunger|hungry|cravings?|appetite|faim|envie de manger|envies?)\b[^.?!;]{0,40}\b(?:buvez|boire|drink|have|sip|sparkling|glass of water|verre d'eau|tisane|tea|coffee|cafe)\b[^.?!;]{0,50}\b(?:do the trick|does the trick|usually works|usually do|should do|is enough|will do|suffit|fait l'affaire|suffira|passera|calmera|will pass|will fade)\b`,
      String.raw`\b(?:faim|envie|hunger|cravings?)\b[^.?!;]{0,40}\bbuvez\b[^.?!;]{0,20}\b(?:eau|tisane|the|cafe)\b`,
    ),
    true,
    { ask: true, exempt: isWaterPlusFood },
  ),
  // Halving portions and meals, cutting them across the board.
  rule(
    src(
      String.raw`\bhalv(?:e|ing|ed)\b[^.?!;]{0,12}\b(?:portions?|meals?|servings?|plates?|amounts?|food|intake|what you eat)\b`,
      String.raw`\bhalf of (?:your|the|each) (?:portions?|meals?|servings?)\b`,
      String.raw`\b(?:cut|reduce|shrink|slash|trim|lower)\b[^.?!;]{0,12}\b(?:portions?|meals?|servings?|food)\b[^.?!;]{0,16}\b(?:across the board|drastically|sharply|massively|dramatically|by (?:\d+ ?%|half|a third|a quarter|two thirds))\b`,
      String.raw`\b(?:divisez|reduisez|diminuez|coupez|halvez)\b[^.?!;]{0,20}\b(?:portions?|repas|assiette|quantites?)\b[^.?!;]{0,12}\b(?:par (?:deux|trois)|de moitie|en deux|du tiers)\b`,
    ),
    true,
  ),
  // Praise for eating very little.
  rule(
    src(
      String.raw`\b(?:barely|hardly|scarcely|almost nothing|next to nothing|so little|very little|(?:just|only) (?:a|an) (?:coffee|tea|salad|apple|yoghurt)|presque rien|a peine mange|tres peu mange|quasiment rien)\b[^.?!;]{0,70}\b(?:exactly|that'?s what|that is what|the kind of|we want|control|discipline|willpower|impressive|proud|keep (?:that|it) up|ce qu'il faut|ce qu'on veut|ce que l'on veut|controle|volonte|fier|fiere|admirable|continuez|c'est bien|c'est parfait|c'est exactement)\b`,
      String.raw`\b(?:exactly|that'?s what|that is what|the kind of|we want|control|discipline|willpower|impressive|proud|keep (?:that|it) up|ce qu'il faut|ce qu'on veut|ce que l'on veut|controle|volonte|fier|fiere|admirable|continuez|c'est bien|c'est parfait|c'est exactement)\b[^.?!;]{0,70}\b(?:barely|hardly|scarcely|almost nothing|next to nothing|so little|very little|presque rien|a peine mange|tres peu mange|quasiment rien)\b`,
    ),
    true,
  ),
  // Moralising nouns and adjectives about the person or a food choice.
  rule(
    src(
      String.raw`\b(?:lazy|weak|pathetic|greedy|sloppy|careless|irresponsible|shameful|disgusting|undisciplined|self-indulgent)\b[^.?!;]{0,16}\b(?:choice|decision|habit|eating|move|call|snack|meal|dessert|food|person|you|of you)\b`,
      String.raw`\byou(?:'re| are| were)? (?:so |very |really |a bit )?(?:lazy|weak|greedy|pathetic|undisciplined)\b`,
      String.raw`\b(?:know|knows) better\b|\bshould have known\b`,
      // Moral words count when they are said OF the person or their eating: a verdict ("great
      // discipline", "lack of control", "your willpower"), not the bare word ("no willpower
      // needed", "good control of salt", "a reset for the mood").
      String.raw`\bweakness\b|\black of (?:self-?)?(?:control|discipline|restraint|will-?power)\b|\b(?:poor|weak|bad) (?:self-?)?(?:control|discipline|will-?power)\b|\b(?:kind|sort) of (?:self-?)?control\b`,
      String.raw`\b(?:good|great|strong|iron|real|total|perfect|impressive|admirable|excellent|amazing|incredible|such|nice|sheer|remarkable|your|more|show(?:ed|ing|s)?|showing) (?:self-?)?(?:control|discipline|will-?power|restraint)\b(?! (?:of|over|on|in|with) (?:the |your |a |some )?(?:salt|sodium|sugar|fat|fats|oil|ingredients?|seasoning|portion sizes?|temperature|quality|flavou?rs?|spices?))`,
      String.raw`\bself-?control\b(?= (?:is|was|are|were)\b)`,
      String.raw`\bfaiblesse\b|\bmanque de (?:volonte|controle|discipline|rigueur|caractere)\b|\bforce de volonte\b|\b(?:bonne|belle|grande|forte|votre|quelle) volonte\b|\bde la volonte\b|\bparess\w+|\bmollesse\b|\b(?:bon|beau|vrais?|vraie|bonne|grand|grande|forte?|parfait|total|bien|garde[rz]?|avoir|avez|belle)\s+(?:le |la |du )?(?:controle|maitrise|discipline)\b(?! (?:du|de|des|sur) (?:sel|sucre|gras|ingredients?|assaisonnement|temperature|qualite))|\bbelle (?:maitrise|discipline|volonte)\b|\bc'est du controle\b|\bde la discipline\b`,
    ),
    true,
  ),
  // Compensation in other forms: passive, "earn", "merit", "erase".
  rule(
    src(
      String.raw`\bburn(?:s|ed|t|ing)? (?:it |them |that |this |those |these )?(?:off|away)\b`,
      String.raw`\b(?:worked|walked|ran|sweated|jogged|exercised|trained) (?:it |them |that |this |those |these )?(?:off|away)\b`,
      String.raw`\b(?:can|could|will|would|should|must|to) be (?:burn\w*|worked|walked|run|sweated|exercised|compensated|offset|cancelled|canceled|undone|erased)\b[^.?!;]{0,8}\b(?:off|away|out|by|with)\b`,
      String.raw`\b(?:effac\w+|annul\w+|gomm\w+|eponge\w*|expi\w+|neutralis\w+|racht\w+|brul\w+)\b[^.?!;]{0,20}\b(?:dessert|gateau|repas|ecart|exces|pizza|burger|glace|biere|chocolat|ce que vous|ce que tu|cela|ca|ces calories|vos calories|les calories (?:de|du|d'|en trop))\b`,
      String.raw`\bmerit\w+\b[^.?!;]{0,28}\b(?:seance|sport|course|marche|velo|effort|entrainement|dessert|gateau|chocolat|glace|repas|plaisir|friandise|biere|verre|pizza)\b`,
      String.raw`\b(?:earned|earn)\b[^.?!;]{0,12}\b(?:dessert|treat|cake|chocolate|ice cream|pizza|meal|snack|drink|beer|glass|it)\b`,
      String.raw`\b(?:deserve|deserved)\b[^.?!;]{0,16}\b(?:dessert|treat|cake|chocolate|ice cream|pizza|reward|beer)\b`,
      String.raw`\bpour tout (?:eliminer|effacer|bruler|compenser|annuler)\b`,
    ),
    true,
  ),
  // Evening a day out after eating: acceptable as planning ahead, not as a reaction.
  rule(
    src(
      String.raw`\bbalanc\w* (?:it|this|that|things|them|the day|yesterday|today|tomorrow|your (?:day|week|intake))(?: out)?\b|\bbalance[sd]? out\b|\bbalance (?:it )?out\b`,
      String.raw`\beven(?:ing)? (?:it|this|that|things|the day|today|yesterday)? ?out\b`,
      String.raw`\blighter (?:tomorrow|day|meal|dinner|tonight)\b`,
      String.raw`\bequilibr(?:er|ez) (?:la journee|le repas|hier|ca|cela|demain|aujourd'hui|votre (?:journee|semaine))\b`,
    ),
    true,
    { exempt: (sentence) => isAheadPlanning(sentence) || isPermissionNotReaction(sentence) },
  ),
]);

/**
 * The rules that also route a typed QUESTION to the calm support line (`detectSupportSignal`):
 * indices into `HARM_RULES` of fasting, skipping or replacing a meal, detox, vinegar, fat burning,
 * very low calorie diets, fast loss, drugs, laxatives and the like. Not keto, supplements,
 * compensation or moral words: those are ordinary questions.
 */
const ASK_RULE_INDEXES: readonly number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18,
];

/**
 * Questions that ask for something harmful rather than say it: undoing a meal with exercise,
 * switching hunger off, pills that curb it, eating every other day. Matched with no negation
 * reading: a question is routed on its subject, the lower bar of the ask side.
 */
const ASK_EXTRA: readonly RegExp[] = Object.freeze([
  /\b(?:how (?:many|much|long|far)|combien)\b[^.?!;]{0,50}\b(?:to|pour|pour pouvoir)\b[^.?!;]{0,14}\b(?:undo|burn off|burn|work off|cancel|offset|make up|compensate|eliminate|erase|eliminer|effacer|annuler|compenser|bruler|expier|rattraper)\b/,
  /\b(?:how (?:many|much|long|far)|combien)\b[^.?!;]{0,50}\bget rid of (?:what i|the calories|everything i|the (?:pizza|binge|cake|dessert|meal) i)\b/,
  /\bhow (?:do|can|could|should) i (?:undo|burn off|work off|cancel out|offset|make up for|erase|compensate for)\b/,
  /\bhow (?:do|can|could|should) i get rid of (?:what i (?:just )?(?:ate|had)|everything i (?:ate|had)|the calories|the (?:pizza|binge|cake|dessert|meal) i (?:ate|had)|(?:this|that|my) (?:meal|binge|dessert|pizza|cake)(?! (?:bloating|belly))|the damage)\b/,
  /\b(?:undo|burn off|work off|make up for|compensate for|get rid of|erase|cancel out)\b[^.?!;]{0,12}\b(?:what i (?:just )?(?:ate|had)|everything i (?:ate|had)|the (?:pizza|binge|damage|meal|cake|dessert|calories)|(?:this|that|my) (?:meal|binge|dessert|pizza|cake))\b/,
  /\bmake up for (?:today|yesterday|eating|what i|it|the)\b/,
  /\bpour (?:tout )?(?:eliminer|effacer|annuler|compenser|bruler|expier|rattraper)\b/,
  /\b(?:eliminer|effacer|annuler|compenser|bruler|expier|rattraper)\b[^.?!;]{0,14}\b(?:ce que j'ai|tout ce que|mon repas|ce repas|mon exces|le gateau|la pizza|les calories|ces calories|mes calories|ce que je viens)\b/,
  /\b(?:pills?|tablets?|meds?|medications?|medicines?|supplements?|drugs?|injections?|patch(?:es)?)\b[^.?!;]{0,40}\b(?:hunger|hungry|appetite|cravings?|lose weight|slim|weight loss|eat less|stop eating)\b/,
  /\b(?:suppress|curb|kill|reduce|stop|block|dampen|get rid of|switch off|turn off)\w*\b[^.?!;]{0,12}\b(?:my |your |the )?(?:hunger|appetite|feeling hungry|feeling of hunger)\b/,
  /\b(?:medicaments?|pilules?|gelules?|cachets?|comprimes?|complements?|produits?)\b[^.?!;]{0,30}\b(?:coup\w+|supprim\w+|calm\w+|reduis\w+|bloqu\w+|stop\w*|eteign\w+)\b[^.?!;]{0,6}\b(?:la |l'|mon |ma |votre )?(?:faim|appetit)\b/,
  /\b(?:couper|supprimer|eteindre|perdre|calmer|bloquer) (?:la |l'|mon |ma )?(?:faim|appetit)\b/,
  /\b(?:not|never|no longer|stop\w*)\b[^.?!;]{0,6}\b(?:want\w*|feel\w* like|wish\w*)\b[^.?!;]{0,6}\b(?:to )?eat\w*\b[^.?!;]{0,12}\b(?:at all|anymore|any more|ever|again)\b/,
  /\b(?:make|get|train) (?:myself|me)\b[^.?!;]{0,12}\b(?:not|never|stop)\b[^.?!;]{0,16}\beat/,
  /\bne plus (?:avoir|ressentir|sentir)\b[^.?!;]{0,6}\b(?:envie de manger|faim|d'appetit)\b|\bne plus manger du tout\b|\bmanger du tout\b/,
  /\bun jour sur (?:deux|trois|2|3)\b|\btous les (?:deux|trois|2|3) jours\b[^.?!;]{0,16}\bmanger|\bmanger\b[^.?!;]{0,24}\btous les (?:deux|trois|2|3) jours\b|\bne manger qu'(?:un|une|1)\b|\bne manger que\b[^.?!;]{0,12}\b(?:fois|jour|soir|midi|matin)\b/,
  /\bonce every (?:two|three|2|3|other) days?\b|\beat\w*\b[^.?!;]{0,20}\bevery (?:other|second|third) day\b|\balternate[- ]days?\b/,
  /\bwater[- ]?(?:only|diet|fast)\b/,
  /\b(?:drink|have|live on|only)\b[^.?!;]{0,12}\b(?:shakes?|smoothies?|juices?|soups?|water)\b[^.?!;]{0,16}\b(?:and nothing else|nothing else|only|alone|exclusively)\b/,
]);

/** Words about the person's body or a verdict on it. Never negatable. */
export const BODY_RULES: readonly RegExp[] = Object.freeze([
  /\byou(?:'re| are| look| seem| appear| must be)\b.{0,12}\b(?:fat|overweight|obese|skinny|thin|heavy|chubby|underweight|big|huge|flabby|slim|bloated)\b/,
  /\byour (?:body|belly|stomach|tummy|thighs|waist|arms|hips|weight|figure)\b.{0,24}\b(?:fat|big|huge|large|ugly|disgusting|too (?:big|much|heavy|high|large)|a problem)\b/,
  /\b(?:belly fat|muffin top|love handles|flabby|chubby|skinny|obese|obesity|overweight|underweight|fatty|beer belly)\b/,
  /\b(?:vous etes|tu es|vous avez l'air|vous semblez)\b.{0,14}\b(?:gros|grosse|maigre|obese|rond|ronde|en surpoids|trop maigre|trop gros)\b/,
  /\bvotre (?:corps|ventre|silhouette|poids|taille|bedon|cuisses?)\b.{0,24}\b(?:gros|grosse|gras|enorme|laid|trop|probleme)\b/,
  /\b(?:surpoids|obesite|obese|maigreur|bourrelets?|poignees d'amour|bedaine|bedon)\b/,
  /(?<!pork )\bbell(?:y|ies)\b|\btumm(?:y|ies)\b|\bwaist(?:line)?\b|\bbikini\b|\bsummer body\b|\bbeach body\b|\bsix[- ]?pack\b|\bswimsuit\b|\bbody goals\b|\bdream body\b|\bflat (?:stomach|abs|tummy|belly)\b|\bstomach fat\b|\b(?:slim|trim|tone|flatten|reduce|lose|burn) (?:your |the |down )?(?:stomach|hips|thighs|waist|arms)\b/,
  /(?<!chicken )\bthighs?\b|\bhips\b|\bbuttocks?\b|\bglutes\b|\bthinner\b|\bslimmer\b|\bskinnier\b|\btoned (?:body|legs|arms)\b/,
  /\bventres?\b|\bventre plat\b|\bsilhouette\b|\bcuisses?\b(?! de (?:poulet|canard|grenouille|dinde|lapin))|\bhanches\b|\bfessiers?\b|\bplus mince\b|\bsvelte\b|\btaille fine\b|\bmaillot de bain\b|\bcorps de reve\b|\bmince\b|\bminceur\b(?! express)|\baffiner\b|\bamincir\b|\bamincissant\w*/,
]);

// ---------------------------------------------------------------------------------------------
// Negation
// ---------------------------------------------------------------------------------------------

const NEG_EN = String.raw`(?:no need(?: to| for)?|not (?:need|needed|necessary)(?: to)?|need not|needn't|don't|do not|doesn't|does not|didn't|never|avoid(?:ing)?|shouldn't|should not|can't|cannot|won't|will not|wouldn't|would not|mustn't|must not|not to|rather than|instead of|without|stop|refrain from|resist the urge to|no point in|no reason to|not worth|best not to|better not to|try not to|not advis\w+ to|not (?:as|a|meant|intended|used|designed|for|the|something|anything) (?:\w+ ){0,5}?(?:to|for|of)|nothing (?:to|for) (?:gain|gained) (?:from|by))`;
const NEG_FR = String.raw`(?:evit\w+(?: de| d')?|inutile (?:de|d')|pas besoin (?:de|d')|plutot que(?: de)?|au lieu (?:de|d')|sans|renonc\w+ (?:a|au)|il ne faut pas|il vaut mieux ne pas|mieux vaut ne pas|n'est pas necessaire de|jamais|pas pour|non pour|pas afin de|(?:n'est|ne sert|ce n'est) pas (?:a|pour)|n'(?:a|ont|avez|as|avons) pas (?:a|besoin (?:de|d'))|(?:ce )?n'est pas (?:de la|du|de l'|un|une)|ni (?:a|pour))`;
const NEG_BEFORE = new RegExp(
  `\\b(?:${NEG_EN}|${NEG_FR})(?:\\s+|(?<=')\\s*)(?:[a-z'-]+\\s+){0,4}$`,
);
const NEG_TAIL = new RegExp(
  `\\b(?:${NEG_EN}|${NEG_FR})(?:\\s+|(?<=')\\s*)(?:[a-z'-]+\\s+){0,6}[a-z'-]*$`,
);

const PERMISSIVE_BEFORE =
  /(?:it'?s|it is|that'?s|that is|is|are|be)\s+(?:perfectly\s+|totally\s+|completely\s+)?(?:fine|ok|okay|alright|acceptable|good|great|safe|helpful|useful|a good idea|a great idea|worth)\b[^.?!;]{0,12}$|\bno harm (?:in|if|to)\b|\bnothing wrong\b|\bfeel free to\b|\bil n'y a pas de mal\b|\bpas de mal (?:a|de)\b|\bc'est (?:ok|bien|bon|acceptable|possible)\b|\bca ne fait pas de mal\b|\brien de mal\b/;

const PERMISSIVE_AFTER =
  /^[^.?!;,]{0,30}?\b(?:not (?:a )?(?:problem|issue|bad|wrong|harmful|dangerous|unhealthy|risky)|is fine|are fine|is ok|is okay|is alright|is acceptable|can help|will help|helps you|works|speeds?|boosts?|n'est pas (?:un probleme|grave|mal|dangereux)|c'est (?:ok|bien|bon)|aide a|peut aider|fonctionne bien)\b/;

const AFTER_NEG = new RegExp(
  String.raw`^[^.,;:?!]{0,30}?\b(?:(?:is not|are not|isn't|aren't|was not|not) (?:recommended|advised|advisable|needed|necessary|required|a good idea|wise|helpful|healthy|safe|sustainable|worth|the answer|ideal|effective|useful|something (?:i|we) (?:would |could |can )?(?:suggest|recommend|advise)|what (?:i|we) (?:would )?(?:suggest|recommend|advise)|the best (?:way|idea|approach)|a good (?:plan|approach|way))|leads? to (?:snacking|grazing|more hunger|a (?:rebound|crash))|(?:end|ends) up (?:snacking|overeating)|(?:ne sont|n'est|ne sera|ne seront) pas (?:ce que je|conseille\w*|recommande\w*|necessaires?|utiles?|indispensables?|obligatoires?|une bonne idee|souhaitables?|sain\w*|judicieux\w*|raisonnables?|durables?|la solution|ideal\w*|efficaces?|requis\w*|indique\w*)|pousse (?:souvent |generalement )?a (?:grignoter|manger plus|craquer)|(?:fait|donne|donnent) (?:souvent |generalement |parfois )?(?:plus )?(?:de )?(?:grignoter|craquer|faim)|rend (?:souvent )?plus (?:faim|affame)|unnecessary|unhelpful|unwise|unsafe|ineffective|discouraged|a bad idea|a mistake|bad for|backfires?|backfired|backfiring|(?:doesn't|does not|don't|do not|won't|will not|can't|cannot|rarely|seldom|never) (?:help|work|last|helps|works|needed|necessary|a good idea|worth)|rarely helps|best avoided|(?:to|should|must|need to) be avoided|leads? to (?:overeating|cravings|binges?)|makes? (?:you )?(?:hungrier|hungry)|can leave you|risky|dangerous|harmful|counter-?productive|can backfire|may backfire|tends? to backfire|n'est pas (?:conseille|recommande|necessaire|utile|une bonne idee|souhaitable|sain|judicieux|raisonnable|durable|la solution|ideal|efficace|requis|indique)|est deconseille|est a eviter|est inutile|est une mauvaise idee|une mauvaise idee|se retourne|ne (?:vous )?(?:aide|sert|fonctionne|marche|dure|mene) pas|n'aide pas|a des effets contraires|donne faim|mene a|conduit a|risque de|contre-productif|dangereux|nocif|deconseill\w+|a eviter)\b`,
);

const CONSEQUENCE_NEG =
  /\b(?:hungrier|more hungry|overeat\w*|cravings?|binge\w*|backfire\w*|tired|dizzy|exhaust\w*|irritable|headache|crash|energy dips?|lose focus|faim|fringales?|craquer|trop manger|fatigu\w*|vertige|irritab\w*|maux de tete|coup de barre|plus tard|later)\b/;

const CLAUSE_BREAK =
  /[.?!;:\n]|,|\s-\s|\b(?:but|however|although|though|yet|while|whereas|mais|cependant|toutefois|pourtant|alors que|even if|if|when|whenever|because|since|unless|si|quand|lorsque|car|parce que|puisque)\b/g;

interface Clause {
  start: number;
  end: number;
  /** The clause follows a comma (a list continuation), not a full stop or a contrast word. */
  afterComma: boolean;
}

function clausesOf(f: string): Clause[] {
  const out: Clause[] = [];
  let start = 0;
  let afterComma = false;
  for (const m of f.matchAll(CLAUSE_BREAK)) {
    const at = m.index ?? 0;
    const isWord = /^[a-z]/.test(m[0]);
    // A word break (if, but, mais ...) starts the NEW clause; punctuation ends the old one.
    if (at >= start) out.push({ start, end: at, afterComma });
    start = isWord ? at : at + m[0].length;
    afterComma = m[0] === ',';
  }
  out.push({ start, end: f.length, afterComma });
  return out;
}

function isNegated(f: string, clauses: Clause[], index: number, matched: string): boolean {
  const ci = clauses.findIndex((c) => index >= c.start && index <= c.end);
  const clause = clauses[ci] ?? { start: 0, end: f.length, afterComma: false };
  const prefix = f.slice(clause.start, index);
  const end = index + matched.length;
  const suffix = f.slice(end, Math.max(end, clause.end));
  if (PERMISSIVE_BEFORE.test(prefix.slice(-40))) return false;
  if (PERMISSIVE_AFTER.test(suffix.slice(0, 90))) return false;
  if (
    /(?:\bne\s+(?:vous\s+|te\s+)?|\bn')$/.test(prefix) &&
    /^\w+\s+(?:pas|jamais|plus)\b/.test(matched)
  ) {
    return true;
  }
  if (NEG_BEFORE.test(prefix.slice(-60))) return true;
  const clauseWords = f.slice(clause.start, clause.end).trim().split(/\s+/).length;
  const listPrefix = /^\s*$|(?:\bor|\band|\bou|\bet|\bnor|\bni)\s+$/.test(prefix);
  if (listPrefix && clause.afterComma && ci > 0 && clauseWords <= 6) {
    const prev = clauses[ci - 1];
    if (prev !== undefined && NEG_TAIL.test(f.slice(prev.start, prev.end))) return true;
  }
  const after = suffix.slice(0, 90);
  if (PERMISSIVE_AFTER.test(after)) return false;
  if (AFTER_NEG.test(after)) return true;
  if (
    /^\s*(?:if|when|whenever|si|quand|lorsque|once)\b/.test(
      f.slice(clause.start, clause.start + 12),
    )
  ) {
    if (CONSEQUENCE_NEG.test(suffix)) return true;
    const nxt = clauses[ci + 1];
    if (nxt !== undefined && CONSEQUENCE_NEG.test(f.slice(nxt.start, nxt.end))) return true;
  }
  return false;
}

/** The sentence (up to . ? ! ; or a line end) a position falls in. */
function sentenceAround(f: string, at: number): string {
  const before = f.slice(0, at).search(/[.?!;\n][^.?!;\n]*$/);
  const startAt = before < 0 ? 0 : before + 1;
  const after = f.slice(at).search(/[.?!;\n]/);
  return f.slice(startAt, after < 0 ? f.length : at + after);
}

/** True when the folded text advises a harmful thing (see the module header). */
export function hasHarmfulPattern(f: string): boolean {
  const clauses = clausesOf(f);
  for (const { all, negatable, exempt } of HARM_RULES) {
    for (const m of f.matchAll(all)) {
      const at = m.index ?? 0;
      if (exempt !== undefined && exempt(sentenceAround(f, at))) continue;
      if (!negatable) return true;
      if (!isNegated(f, clauses, at, m[0])) return true;
    }
  }
  return false;
}

/** True when a typed question (folded) asks for something `ASK_RULE_INDEXES` lists. */
export function askMentionsHarmfulPlan(f: string): boolean {
  const clauses = clausesOf(f);
  for (const [i, r] of HARM_RULES.entries()) {
    if (r.ask !== true && !ASK_RULE_INDEXES.includes(i)) continue;
    for (const m of f.matchAll(r.all)) {
      if (!r.negatable || !isNegated(f, clauses, m.index ?? 0, m[0])) return true;
    }
  }
  return ASK_EXTRA.some((re) => re.test(f));
}

/** True when the folded text comments on the body or labels it. */
export function hasBodyComment(f: string): boolean {
  return BODY_RULES.some((r) => r.test(f));
}
