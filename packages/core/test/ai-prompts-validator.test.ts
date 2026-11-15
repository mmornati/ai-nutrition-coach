import { describe, expect, it } from 'vitest';
import { coachSystemPrompt, validateCoachText, type CoachTextRules } from '../src/index';

const rules = (locale: 'en' | 'fr'): CoachTextRules => ({
  maxChars: 800,
  numbersOn: true,
  maxQuestions: 2,
  locale,
  weightTalk: 'allowed',
  floorKcal: 1200,
  guideKcal: 1700,
});

/**
 * The system prompts and the validator must not contradict each other: everything the prompt asks
 * for (or allows) is something the validator lets through, and everything it forbids the validator
 * refuses. These are the sentences a model following the prompt would write.
 */
describe('what the prompt asks for passes the validator', () => {
  it.each([
    'Eating a little less than your body uses, a deficit of about 250 to 500 kcal a day, is what leads to slow loss.',
    'A deficit of about 500 kcal a day leads to roughly half a kilo a week.',
    'Your logged days averaged about 1,450 kcal, a little below your guide of 1,700 kcal; eating enough matters.',
    'That plate is about 450 kcal, most of it from the rice.',
    'Today you reached about half of your guide so far.',
    'Fasting or skipping meals is not recommended; regular meals make it easier to feel full.',
    'There is no need to skip meals: a snack in the afternoon can help.',
    'A realistic pace is about 0.25 to 0.75 kg a week at first, and plateaus are normal.',
    'Losing 5 to 10 % of body weight in six months is a common aim.',
    'If you take medication, a doctor or a pharmacist is the right person to ask.',
    'Your guide is about 1,700 kcal a day.',
  ])('en: %s', (text) => {
    expect(validateCoachText(text, rules('en'))).toMatchObject({ ok: true });
  });

  it.each([
    'Manger un peu moins que ce que le corps dépense, un déficit d’environ 250 à 500 kcal par jour, mène à une perte lente.',
    'Un déficit d’environ 500 kcal par jour mène à environ un demi-kilo par semaine.',
    'Vos jours enregistrés font en moyenne environ 1 450 kcal, un peu sous votre repère de 1 700 kcal ; manger assez compte.',
    'Cette assiette fait environ 450 kcal, surtout à cause du riz.',
    'Jeûner ou sauter des repas n’est pas conseillé ; des repas réguliers aident à tenir.',
    'Inutile de sauter des repas : une collation l’après-midi peut aider.',
    'Un rythme réaliste est d’environ 0,25 à 0,75 kg par semaine au début.',
    'Si vous prenez un traitement, un médecin ou un pharmacien est la bonne personne.',
    'Votre repère est d’environ 1 700 kcal par jour.',
  ])('fr: %s', (text) => {
    expect(validateCoachText(text, rules('fr'))).toMatchObject({ ok: true });
  });
});

describe('what the prompt forbids is refused by the validator', () => {
  it.each([
    'Eat 1,300 kcal a day.',
    'Try a day of fasting.',
    'Skip dinner tonight.',
    'Take a supplement.',
    'Ozempic could help.',
    'Walk it off.',
    'Cut your guide in half.',
    'Your logged days averaged 1,450 kcal, so keep it there.',
  ])('en: %s', (text) => {
    expect(validateCoachText(text, rules('en')).ok).toBe(false);
  });
});

describe('the prompt tells the model what the validator checks', () => {
  const en = coachSystemPrompt('chat', 'en', { weightHelp: 'lose' });
  const fr = coachSystemPrompt('chat', 'fr', { weightHelp: 'lose' });
  it('says the guide is rounded and the only daily figure', () => {
    expect(en).toContain('rounded to the nearest 100 kcal');
    expect(en).toMatch(/that guide and no other number/);
    expect(fr).toContain('arrondi aux 100 kcal');
    expect(fr).toMatch(/ce repère et aucun autre chiffre/);
  });
  it('never a figure below the guide as something to eat', () => {
    expect(en).toMatch(/Never give a figure below the guide as something to eat/);
    expect(fr).toMatch(/Ne donnez jamais un chiffre inférieur au repère/);
  });
  it('describe logged amounts without telling the person to repeat them', () => {
    expect(en).toMatch(/without telling them to repeat it/);
    expect(fr).toMatch(/sans lui dire de le refaire/);
  });
  it('never name a medicine or a supplement, not even to advise against it', () => {
    expect(en).toMatch(
      /never name any medicine, drug, injection, supplement or dose, not even to advise against it/,
    );
    expect(fr).toMatch(
      /ne nommez aucun médicament, injection, complément ni dosage, pas même pour le déconseiller/,
    );
  });
  it('write amounts as digits', () => {
    expect(en).toMatch(/write it as digits with its unit/);
    expect(fr).toMatch(/écrivez-la en chiffres/);
  });
});
