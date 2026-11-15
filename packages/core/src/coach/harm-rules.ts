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
  /** `true`: advising AGAINST it ("do not skip meals") is acceptable. */
  readonly negatable: boolean;
}

const rule = (source: string, negatable: boolean): Rule => ({
  re: new RegExp(source),
  negatable,
});

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
      String.raw`\b(?:skip|skips|skipping|skipped)\b[^.?!;]{0,24}?\b${MEAL}\b`,
      String.raw`\b(?:leav(?:e|es|ing) out|go(?:es|ing)? without|do(?:es|ing)? without|omit(?:ting)?|forg(?:o|oing)|drop(?:ping)?|cut(?:ting)? out|miss(?:ing)? out on|stop(?:ping)? (?:eating|having))\b[^.?!;]{0,16}?\b${MEAL}\b`,
      String.raw`\bmiss(?:ing|ed)? (?:a |your |some |one )?${MEAL}\b`,
      String.raw`\b(?:cut|drop|ditch|remove|eliminate|delete)\s+(?:a |your |the |my )?(?:meal|breakfast|lunch|dinner|supper)s?(?: out| altogether| completely)\b`,
      String.raw`\b(?:having|have|eat(?:ing)?|taking) no (?:dinner|supper|lunch|breakfast|meal)\b|\bno (?:dinner|supper|lunch|breakfast) (?:now and then|sometimes|occasionally|once in a while)\b`,
      String.raw`\bne plus (?:prendre|manger) (?:de |du |d')?(?:petit-dejeuner|diner|dejeuner|repas|gouter)\b|\bne plus (?:dejeuner|diner)\b`,
      String.raw`\bpas de (?:diner|dejeuner|petit-dejeuner|repas) (?:de temps en temps|parfois|occasionnellement|le soir|une fois)\b|\bsans (?:diner|dejeuner|petit-dejeuner|repas)\b`,
      String.raw`\barret\w+ de manger[^.?!;,]{0,16}\b(?:diner|dejeuner|petit-dejeuner|repas|soir|midi|matin|apres)\b|\bstop(?:ping)? eating (?:after|before|from|at)\b`,
      String.raw`\b(?:not|never) (?:eat|eating|have|having) (?:a |your |any )?(?:breakfast|lunch|dinner|supper)\b`,
      String.raw`\bsaut(?:er|ez|ons|e|es|ant)\b[^.?!;]{0,24}?\b${MEAL}\b`,
      String.raw`\bsaut(?:ez|ons)(?:-\w+)?\b`,
      String.raw`\bpassez[- ]vous (?:du|de la|des|de l'|de)\s*${MEAL}\b`,
      String.raw`\b(?:vous|se|me|te) passer (?:du|de la|des|de l'|de)\s*${MEAL}\b`,
      String.raw`\bimpasse sur (?:le|la|les|l'|un|une|votre)\s*${MEAL}\b`,
      String.raw`\barret\w+ de (?:diner|dejeuner|manger le soir|prendre (?:un |le |votre )?(?:petit|diner|dejeuner))\b`,
      String.raw`\b(?:omettez|supprimez|retirez|enlevez) (?:le|la|un|une|votre)\s*${MEAL}\b`,
    ),
    true,
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
      String.raw`\bbalanc\w* (?:it|this|that|things|them|the day|yesterday|today|tomorrow|your (?:day|week|intake))(?: out)?\b|\bbalance[sd]? out\b|\bbalance (?:it )?out\b`,
      String.raw`\beven(?:ing)? (?:it|this|that|things|the day|today|yesterday)? ?out\b`,
      String.raw`\b(?:make|making) (?:tomorrow|tonight|today|the next day|your next meal|dinner)\b[^.?!;]{0,8}\b(?:lighter|smaller|leaner)\b`,
      String.raw`\blighter (?:tomorrow|day|meal|dinner|tonight)\b`,
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
      String.raw`\bequilibr(?:er|ez) (?:la journee|le repas|hier|ca|cela|demain|aujourd'hui|votre (?:journee|semaine))\b`,
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

const NEG_EN = String.raw`(?:no need (?:to|for)|not (?:need|needed|necessary) to|need not|needn't|don't|do not|doesn't|does not|didn't|never|avoid(?:ing)?|shouldn't|should not|can't|cannot|won't|will not|wouldn't|would not|mustn't|must not|not to|rather than|instead of|without|stop|refrain from|resist the urge to|no point in|no reason to|not worth|best not to|better not to|try not to|not advis\w+ to|not (?:as|a|meant|intended|used|designed|for|the|something|anything) (?:\w+ ){0,5}?(?:to|for|of)|nothing (?:to|for) (?:gain|gained) (?:from|by))`;
const NEG_FR = String.raw`(?:evit\w+(?: de| d')?|inutile (?:de|d')|pas besoin (?:de|d')|plutot que(?: de)?|au lieu (?:de|d')|sans|renonc\w+ (?:a|au)|il ne faut pas|il vaut mieux ne pas|mieux vaut ne pas|n'est pas necessaire de|jamais|pas pour|non pour|pas afin de|(?:n'est|ne sert|ce n'est) pas (?:a|pour)|ni (?:a|pour))`;
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
  String.raw`^[^.,;:?!]{0,30}?\b(?:(?:is not|are not|isn't|aren't|was not|not) (?:recommended|advised|advisable|needed|necessary|required|a good idea|wise|helpful|healthy|safe|sustainable|worth|the answer|ideal|effective|useful|something (?:i|we) (?:would |could |can )?(?:suggest|recommend|advise)|what (?:i|we) (?:would )?(?:suggest|recommend|advise)|the best (?:way|idea|approach)|a good (?:plan|approach|way))|leads? to (?:snacking|grazing|more hunger|a (?:rebound|crash))|(?:end|ends) up (?:snacking|overeating)|(?:ne sont|n'est|ne sera|ne seront) pas (?:ce que je|conseille\w*|recommande\w*|necessaires?|utiles?|indispensables?|obligatoires?|une bonne idee|souhaitables?|sain\w*|judicieux\w*|raisonnables?|durables?|la solution|ideal\w*|efficaces?|requis\w*|indique\w*)|pousse (?:souvent |generalement )?a (?:grignoter|manger plus|craquer)|(?:fait|donne) (?:souvent )?(?:grignoter|craquer|faim)|unnecessary|unhelpful|unwise|unsafe|ineffective|discouraged|a bad idea|a mistake|bad for|backfires?|backfired|backfiring|(?:doesn't|does not|don't|do not|won't|will not|can't|cannot|rarely|seldom|never) (?:help|work|last|helps|works|needed|necessary|a good idea|worth)|rarely helps|best avoided|(?:to|should|must|need to) be avoided|leads? to (?:overeating|cravings|binges?)|makes? (?:you )?(?:hungrier|hungry)|can leave you|risky|dangerous|harmful|counter-?productive|can backfire|may backfire|tends? to backfire|n'est pas (?:conseille|recommande|necessaire|utile|une bonne idee|souhaitable|sain|judicieux|raisonnable|durable|la solution|ideal|efficace|requis|indique)|est deconseille|est a eviter|est inutile|est une mauvaise idee|une mauvaise idee|se retourne|ne (?:vous )?(?:aide|sert|fonctionne|marche|dure|mene) pas|n'aide pas|a des effets contraires|donne faim|mene a|conduit a|risque de|contre-productif|dangereux|nocif|deconseill\w+|a eviter)\b`,
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

/** True when the folded text advises a harmful thing (see the module header). */
export function hasHarmfulPattern(f: string): boolean {
  const clauses = clausesOf(f);
  for (const { re, negatable } of HARM_RULES) {
    for (const m of f.matchAll(new RegExp(re.source, 'g'))) {
      if (!negatable) return true;
      if (!isNegated(f, clauses, m.index ?? 0, m[0])) return true;
    }
  }
  return false;
}

/** True when a typed question (folded) asks for something `ASK_RULE_INDEXES` lists. */
export function askMentionsHarmfulPlan(f: string): boolean {
  const clauses = clausesOf(f);
  for (const i of ASK_RULE_INDEXES) {
    const r = HARM_RULES[i];
    if (r === undefined) continue;
    for (const m of f.matchAll(new RegExp(r.re.source, 'g'))) {
      if (!r.negatable || !isNegated(f, clauses, m.index ?? 0, m[0])) return true;
    }
  }
  return false;
}

/** True when the folded text comments on the body or labels it. */
export function hasBodyComment(f: string): boolean {
  return BODY_RULES.some((r) => r.test(f));
}
