// The output validator once the person chose to lose weight (docs/adr/0008, decision 3): a helpful
// answer about losing weight passes, and advice that is harmful in itself is refused whatever the
// topic. Table-driven, English and French. These are fixed sentences, not the output of a model:
// no real AI output was evaluated here.
import { describe, expect, it } from 'vitest';
import {
  containsBodyComment,
  containsHarmfulAdvice,
  detectSupportSignal,
  exceedsSafePace,
  hasUnsafeEnergyFigure,
  statedLossPerWeek,
  validateCoachText,
  type CoachTextRules,
} from '../src/index';

const allowed = (over: Partial<CoachTextRules> = {}): CoachTextRules => ({
  maxChars: 800,
  numbersOn: true,
  maxQuestions: 2,
  weightTalk: 'allowed',
  floorKcal: 1500,
  guideKcal: 1900,
  ...over,
});
const frAllowed = (over: Partial<CoachTextRules> = {}): CoachTextRules =>
  allowed({ locale: 'fr', ...over });

const ACCEPTABLE_EN: readonly string[] = [
  'Losing weight comes down to eating a little less energy than you use, over weeks rather than days. Your daily guide already builds that in, so the useful question is which foods carry most of your energy.',
  'Most of your energy this week came from the pizza and the soda. Would a smaller portion of one of them suit you next time?',
  'Protein and vegetables keep you full for longer. You often have lentils at lunch, so would a bigger spoonful of them at dinner fit?',
  'A realistic pace is about 0.25 to 0.75 kg a week at first, around 5 to 10 % of your body weight over six months.',
  'Plateaus are normal: the scale moves up and down by a kilo or more from one day to the next, so the trend over weeks says more than any single morning.',
  'Drinks add energy without filling you up. Would water or sparkling water in place of the soda at dinner suit you?',
  'Regular meals tend to make evenings easier. Is there a lunch you often have late?',
  'Your daily guide is about 1,900 kcal. On the days you logged, you were close to it, so the logged amounts match the plan.',
  'Fibre and volume help: a bowl of vegetables or a soup before the main dish fills a plate for little energy. Which vegetables do you already like?',
  'Swapping the usual white bread for the wholegrain you logged on Tuesday adds fibre and keeps you full a bit longer.',
  'Logged amounts are estimates. Foods or portions that were not counted are the usual reason a log and the scale disagree.',
  'Snacks late in the evening add up quietly. Would a piece of fruit with a few nuts do the same job as the biscuits?',
  'Energy balance is simple on paper and hard in practice, so one small change at a time works better than many. Which one feels easiest this week?',
  'If you want to lose more, or faster than this, a doctor or a dietitian can look at it with you.',
  'Since you take medication, please talk to your doctor or a dietitian before changing how much you eat.',
  'Weight can change for many reasons, so please talk to a doctor if something worries you.',
  'About 1,900 kcal a day is your guide. The pizza on Friday came to about 900 kcal, which is a big share of one day.',
  'Cooking with a little less oil, or measuring it with a spoon, is a small change that adds up over a week.',
  'Eating enough matters too. Is there a meal that was hard to fit in this week?',
  'Weight loss is slow and uneven, and that is expected. A drop of half a kilo a week is a good pace to aim for.',
  'Between 5 and 10 % of body weight over six months is the usual first aim.',
  'Pregnancy changes what a guide should be, so a midwife or a doctor is the right person to ask before losing weight.',
  'At your age, a doctor or a dietitian should be part of any plan to lose weight.',
  'Your trend is about 0.5 kg lower than four weeks ago, while your logged energy averaged close to your guide. That fits together.',
  'A smaller plate of pasta with an extra helping of vegetables keeps the meal as big and trims the energy.',
  'Protein at breakfast, like eggs or yogurt, tends to make the morning easier. Do you have either at home?',
  'Do not skip meals: regular meals make the evening easier.',
  'Avoid fasting and crash plans, they rarely last. Small swaps do.',
  'Sweet drinks are an easy place to start: one soda a day is about 140 kcal.',
  'You could try a smaller glass of wine on the evenings you have one, or a glass of water alongside it.',
  'Your daily guide is the floor and the target at once: close to it is the aim, not below it.',
  'Eating around your guide, about 1,900 kcal, with a protein source at each meal is a steady way to lose weight slowly.',
  'The vegetables you log most, courgettes and carrots, are good for filling half the plate.',
  'Would it help to prepare the lunches on Sunday so that the weekday ones need no thought?',
  'Sleep and stress change appetite too, which is one reason a week can feel harder than the last.',
  'Your weight trend is a little lower than four weeks ago. The scale moves daily, so the trend is the part to look at.',
  'A slice of pizza and a salad is a perfectly good dinner. Would you want to keep the salad as the larger part?',
  'One or two small swaps from what you already eat are enough for a gentle pace.',
  'Walking more is fine for its own sake, but it is not something to eat back or to make up for a meal.',
  'The guide counts your logged foods only. If a snack went unlogged, the week looks lighter than it was.',
  'Ask your pharmacist or your doctor before using anything sold to help lose weight.',
];

const ACCEPTABLE_FR: readonly string[] = [
  'Perdre du poids revient à manger un peu moins d’énergie que vous n’en dépensez, sur des semaines plutôt que des jours. Votre repère quotidien en tient déjà compte : la bonne question est donc quels aliments portent l’essentiel de votre énergie.',
  'L’essentiel de votre énergie cette semaine vient de la pizza et du soda. Une portion plus petite de l’un des deux vous conviendrait-elle la prochaine fois ?',
  'Les protéines et les légumes calent plus longtemps. Vous mangez souvent des lentilles au déjeuner : une cuillère de plus au dîner vous irait-elle ?',
  'Un rythme réaliste est d’environ 0,25 à 0,75 kg par semaine au début, soit 5 à 10 % du poids du corps en six mois.',
  'Les plateaux sont normaux : la balance varie d’un kilo ou plus d’un jour à l’autre, donc la tendance sur plusieurs semaines en dit plus qu’un seul matin.',
  'Les boissons apportent de l’énergie sans caler. De l’eau gazeuse à la place du soda au dîner vous conviendrait-elle ?',
  'Des repas réguliers rendent souvent les soirées plus faciles. Y a-t-il un déjeuner que vous prenez souvent tard ?',
  'Votre repère quotidien est d’environ 1 900 kcal. Sur les jours enregistrés, vous en étiez proche : les quantités notées correspondent au plan.',
  'Les fibres et le volume aident : un bol de légumes ou une soupe avant le plat remplit l’assiette pour peu d’énergie. Quels légumes aimez-vous déjà ?',
  'Remplacer le pain blanc habituel par le pain complet noté mardi apporte des fibres et cale un peu plus longtemps.',
  'Les quantités enregistrées sont des estimations. Les aliments ou portions non comptés sont la raison habituelle d’un écart entre le journal et la balance.',
  'Les grignotages tard le soir s’additionnent sans bruit. Un fruit avec quelques noix ferait-il le même travail que les biscuits ?',
  'Le bilan énergétique est simple sur le papier et difficile en pratique : un petit changement à la fois marche mieux que beaucoup. Lequel vous semble le plus facile cette semaine ?',
  'Si vous voulez perdre plus, ou plus vite, un médecin ou un diététicien peut en parler avec vous.',
  'Comme vous prenez un médicament, parlez-en à votre médecin ou à un diététicien avant de changer ce que vous mangez.',
  'Le poids varie pour de nombreuses raisons : parlez-en à un médecin si quelque chose vous inquiète.',
  'Environ 1 900 kcal par jour, c’est votre repère. La pizza de vendredi faisait environ 900 kcal, une grande part d’une journée.',
  'Cuisiner avec un peu moins d’huile, en la mesurant à la cuillère, est un petit changement qui compte sur une semaine.',
  'Manger assez compte aussi. Y a-t-il un repas difficile à placer cette semaine ?',
  'La perte de poids est lente et irrégulière, c’est normal. Une demi-livre par semaine est un bon rythme.',
  'Entre 5 et 10 % du poids du corps en six mois est le premier objectif habituel.',
  'La grossesse change ce qu’un repère devrait être : une sage-femme ou un médecin est la bonne personne à interroger avant de perdre du poids.',
  'À votre âge, un médecin ou un diététicien devrait faire partie de tout projet pour perdre du poids.',
  'Votre tendance est d’environ 0,5 kg plus basse qu’il y a quatre semaines, alors que votre énergie enregistrée était proche de votre repère. Cela se tient.',
  'Une assiette de pâtes plus petite avec une double portion de légumes garde le repas copieux et réduit l’énergie.',
  'Des protéines au petit-déjeuner, comme des œufs ou du yaourt, facilitent souvent la matinée. En avez-vous à la maison ?',
  'Ne sautez pas de repas : des repas réguliers rendent la soirée plus facile.',
  'Évitez le jeûne et les régimes éclairs, ils durent rarement. Les petits échanges, si.',
  'Les boissons sucrées sont un point de départ facile : un soda par jour fait environ 140 kcal.',
  'Un verre de vin plus petit les soirs où vous en prenez un, ou un verre d’eau à côté, est une option.',
  'Votre repère quotidien est à la fois le plancher et la cible : s’en approcher est le but, pas descendre dessous.',
  'Manger autour de votre repère, environ 1 900 kcal, avec une source de protéines à chaque repas est une façon régulière de perdre du poids lentement.',
  'Les légumes que vous notez le plus, courgettes et carottes, sont bons pour remplir la moitié de l’assiette.',
  'Préparer les déjeuners le dimanche vous aiderait-il, pour que ceux de la semaine ne demandent aucune réflexion ?',
  'Le sommeil et le stress changent aussi l’appétit, ce qui explique en partie qu’une semaine paraisse plus dure que la précédente.',
  'Votre tendance de poids est un peu plus basse qu’il y a quatre semaines. La balance bouge chaque jour : c’est la tendance qui compte.',
  'Une part de pizza avec une salade fait un très bon dîner. Voudriez-vous garder la salade comme plus grande part ?',
  'Un ou deux petits échanges à partir de ce que vous mangez déjà suffisent pour un rythme doux.',
  'Marcher davantage est très bien en soi, mais ce n’est pas à « rattraper » ni à compenser un repas.',
  'Le repère ne compte que les aliments enregistrés. Si une collation n’a pas été notée, la semaine paraît plus légère qu’elle ne l’était.',
  'Demandez à votre pharmacien ou à votre médecin avant d’utiliser un produit vendu pour maigrir.',
];

const HARMFUL_EN: readonly string[] = [
  'Skip breakfast and lunch and have one meal in the evening.',
  'Try intermittent fasting, it works well.',
  'A day of fasting every week would speed things up.',
  'You could skip dinner on the days you ate pizza.',
  'Try a detox for three days.',
  'A juice cleanse resets everything.',
  'Take a laxative after a big meal.',
  'Purge if you feel too full.',
  'Replace two meals a day with a shake.',
  'A meal replacement shake is the easiest way.',
  'Try an appetite suppressant before dinner.',
  'Semaglutide is worth asking about.',
  'Ozempic helps many people lose weight quickly.',
  'Take a fat burner before you train.',
  'Diet pills can help you along.',
  'Take a supplement to boost the loss.',
  'Eat 1,000 kcal a day for two weeks.',
  'Aim for 900 calories per day.',
  'You should eat only 800 kcal.',
  'Stay under 1,200 kcal a day and you will lose faster.',
  'Eat less than 1,300 calories a day if you can.',
  'Aim for 1,500 kcal a day.',
  'Eating below your daily guide is how the loss happens.',
  'Stay under your daily guide every day.',
  'Go for a very low calorie diet for a month.',
  'A crash diet is the quickest route.',
  'You can lose 5 kg in a week this way.',
  'Aim to lose 2 kg per week.',
  'Rapid weight loss is possible if you cut everything.',
  'Burn it off with a run after the pizza.',
  'Work it off at the gym tomorrow.',
  'Make up for dinner with an extra hour of cardio.',
  'You have to earn your dessert with exercise.',
  'Cut out all carbs for a month.',
  'Go keto, it is the fastest.',
  'You are overweight, so you should eat less.',
  'Your belly is too big for your age.',
  'Your thighs are too big for your height.',
  'You look heavy in the photo you logged.',
  'Compensate with a smaller dinner after a big lunch.',
];

const HARMFUL_FR: readonly string[] = [
  'Sautez le petit-déjeuner et le déjeuner et prenez un seul repas le soir.',
  'Essayez le jeûne intermittent, ça marche bien.',
  'Un jour de jeûne par semaine accélérerait les choses.',
  'Vous pourriez sauter le dîner les jours de pizza.',
  'Faites une détox de trois jours.',
  'Une cure de jus remet tout à zéro.',
  'Prenez un laxatif après un gros repas.',
  'Provoquez-vous des vomissements si vous vous sentez trop plein.',
  'Remplacez deux repas par jour par un substitut de repas.',
  'Un substitut de repas est le moyen le plus simple.',
  'Essayez un coupe-faim avant le dîner.',
  'Le Wegovy vaut la peine d’être demandé.',
  'Les pilules minceur peuvent vous aider.',
  'Prenez un brûleur de graisse avant le sport.',
  'Prenez un complément alimentaire pour accélérer la perte.',
  'Mangez 1 000 kcal par jour pendant deux semaines.',
  'Visez 900 calories par jour.',
  'Vous devriez manger seulement 800 kcal.',
  'Restez sous 1 200 kcal par jour et vous perdrez plus vite.',
  'Mangez moins de 1 300 calories par jour si possible.',
  'Mangez moins que votre repère quotidien.',
  'Restez sous votre repère chaque jour.',
  'Suivez un régime très hypocalorique pendant un mois.',
  'Un régime express est la route la plus rapide.',
  'Vous pouvez perdre 5 kilos en une semaine ainsi.',
  'Visez de perdre 2 kg par semaine.',
  'Une perte de poids rapide est possible si vous supprimez tout.',
  'Brûler ça en courant après la pizza.',
  'Compensez par une heure de cardio de plus.',
  'Il faut mériter son dessert par du sport.',
  'Supprimez tous les glucides pendant un mois.',
  'Vous êtes en surpoids, donc vous devriez manger moins.',
  'Votre ventre est trop gros pour votre âge.',
  'Vous avez l’air gros sur la photo.',
  'Vous êtes trop maigre.',
  'Un régime draconien serait le plus efficace.',
  'Perdre 10 kilos en un mois est possible avec ce plan.',
  'Rattrapez-vous au dîner en ne mangeant presque rien.',
  'Un diurétique aide à perdre vite.',
  'Faites une cure détox.',
];

describe('a helpful answer about losing weight passes (goal: lose)', () => {
  it('has at least 40 acceptable sentences in each language', () => {
    expect(ACCEPTABLE_EN.length).toBeGreaterThanOrEqual(40);
    expect(ACCEPTABLE_FR.length).toBeGreaterThanOrEqual(40);
  });

  it.each(ACCEPTABLE_EN.map((t) => [t]))('en: %s', (text) => {
    const checked = validateCoachText(text, allowed({ locale: 'en' }));
    expect(checked).toMatchObject({ ok: true });
  });

  it.each(ACCEPTABLE_FR.map((t) => [t]))('fr: %s', (text) => {
    const checked = validateCoachText(text, frAllowed());
    expect(checked).toMatchObject({ ok: true });
  });
});

describe('advice that is harmful in itself is refused (goal: lose)', () => {
  it('has at least 40 harmful sentences in each language', () => {
    expect(HARMFUL_EN.length).toBeGreaterThanOrEqual(40);
    expect(HARMFUL_FR.length).toBeGreaterThanOrEqual(40);
  });

  it.each(HARMFUL_EN.map((t) => [t]))('en: %s', (text) => {
    expect(validateCoachText(text, allowed({ locale: 'en' })).ok).toBe(false);
  });

  it.each(HARMFUL_FR.map((t) => [t]))('fr: %s', (text) => {
    expect(validateCoachText(text, frAllowed()).ok).toBe(false);
  });
});

describe('the pieces', () => {
  it('a negated mention is not advice to do it', () => {
    expect(containsHarmfulAdvice('Do not skip meals.')).toBe(false);
    expect(containsHarmfulAdvice('Never fast to make up for a big dinner.')).toBe(false);
    expect(containsHarmfulAdvice('Fast to make up for a big dinner.')).toBe(true);
    expect(containsHarmfulAdvice('Skip dinner.')).toBe(true);
    expect(containsHarmfulAdvice('Ne sautez pas de repas.')).toBe(false);
  });

  it('the energy guard reads daily figures against the floor and the guide, not meals', () => {
    expect(hasUnsafeEnergyFigure('Eat 1,100 kcal a day.', { floorKcal: 1500 })).toBe(true);
    expect(hasUnsafeEnergyFigure('Eat 1 100 kcal par jour.', { floorKcal: 1500 })).toBe(true);
    expect(hasUnsafeEnergyFigure('Eat 800 to 1000 calories a day', { floorKcal: 1200 })).toBe(true);
    expect(hasUnsafeEnergyFigure('That lunch is about 600 kcal.', { floorKcal: 1500 })).toBe(false);
    expect(hasUnsafeEnergyFigure('Dinner of 700 kcal a day fits.', { floorKcal: 1500 })).toBe(
      false,
    );
    expect(hasUnsafeEnergyFigure('About 1,900 kcal a day is the guide.', { floorKcal: 1500 })).toBe(
      false,
    );
    // Below the guide presented as a target; the guide itself, rounded, is fine.
    expect(
      hasUnsafeEnergyFigure('Aim for about 1,700 kcal.', { floorKcal: 1500, guideKcal: 1900 }),
    ).toBe(true);
    expect(
      hasUnsafeEnergyFigure('Aim for about 1,900 kcal.', { floorKcal: 1500, guideKcal: 1900 }),
    ).toBe(false);
  });

  it('the pace guard reads kilos and a time, in kilos or pounds', () => {
    expect(statedLossPerWeek('lose 5 kg in a week')).toBeCloseTo(5);
    expect(statedLossPerWeek('perdre 10 kilos en un mois')).toBeCloseTo(10 / 4.33, 1);
    expect(statedLossPerWeek('lose 0.5 kg a week')).toBeCloseTo(0.5);
    expect(statedLossPerWeek('you eat 3 kg of vegetables a week')).toBeNull();
    expect(exceedsSafePace('about 1 kg a week of loss')).toBe(false);
    expect(exceedsSafePace('You may lose 6 pounds a week')).toBe(true);
  });

  it('body comments are caught in both languages and never negatable', () => {
    expect(containsBodyComment('You are overweight.')).toBe(true);
    expect(containsBodyComment('You are not overweight.')).toBe(true);
    expect(containsBodyComment('Votre ventre est trop gros.')).toBe(true);
    expect(containsBodyComment('A big plate of pasta.')).toBe(false);
    expect(containsBodyComment('Un gros repas hier soir.')).toBe(false);
  });

  it('without a weight goal the blanket restraint stays', () => {
    const text = 'To lose weight, a little less rice would help.';
    expect(validateCoachText(text, { maxChars: 300, numbersOn: true })).toEqual({
      ok: false,
      problem: 'weightTalk',
    });
    expect(validateCoachText(text, allowed()).ok).toBe(true);
  });

  it('medication is allowed next to a pointer to a doctor, never alone', () => {
    expect(
      validateCoachText('Medication changes what is right: ask your doctor.', allowed()).ok,
    ).toBe(true);
    expect(validateCoachText('Your medication is the reason.', allowed())).toEqual({
      ok: false,
      problem: 'medicalClaim',
    });
    expect(validateCoachText('Ce traitement vous guérit.', frAllowed()).ok).toBe(false);
  });

  it('routes very low intake and very fast loss to the calm line, before anything is sent', () => {
    for (const text of [
      'lose 5 kg in a week',
      'perdre 10 kilos en un mois',
      'I want to eat 800 kcal',
      'Je veux tenir à 700 calories',
    ]) {
      expect(detectSupportSignal(text)).toBe('extremeDiet');
    }
  });
});
