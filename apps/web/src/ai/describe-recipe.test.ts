// A pasted recipe through the person's AI: the Describe consent gates it (no call without it, none
// for another destination), exactly two messages are sent and fit the proxy's 24 KB, and the reply
// is read strictly: any broken rule is a failure, so the caller reads the text on the device.
import { describe, expect, it } from 'vitest';
import { createAiServices, type AiServices } from './create-ai-services';
import {
  buildRecipeMessages,
  cleanRecipeText,
  parseRecipeReply,
  RECIPE_BUDGET_BYTES,
  RECIPE_PROMPTS,
} from './describe-recipe';
import {
  chatReply,
  FakeFetch,
  MemoryKv,
  stubClassify,
  stubDigest,
  stubSanitizer,
  TEST_KEY,
} from './testing';

const REPLY = JSON.stringify({
  name: 'Pancakes',
  servings: 4,
  ingredients: [
    { name: 'flour', grams: 200, estimated: false },
    { name: 'milk', grams: 240, estimated: true },
  ],
});

async function services(
  options: { byok?: boolean } = {},
): Promise<{ ai: AiServices; fake: FakeFetch }> {
  const fake = new FakeFetch();
  fake.jsonBody = chatReply(REPLY);
  const ai = await createAiServices({
    kv: new MemoryKv(),
    sanitizePhoto: stubSanitizer,
    classifyFoodGroup: stubClassify,
    photoDigest: stubDigest,
    fetch: fake.fetch,
    origin: () => 'https://coach.example.org',
  });
  await ai.instance.refresh();
  await new Promise((r) => setTimeout(r, 0));
  if (options.byok) {
    await ai.keyStore.write(TEST_KEY);
    await ai.settings.setByokTarget({
      endpointUrl: 'https://api.example.com/v1',
      model: 'gpt-test',
      keyHost: 'api.example.com',
    });
    await ai.settings.setRung({ kind: 'byok', previousRung: { previousKind: 'noOp' } });
  }
  return { ai, fake };
}

const EN = { locale: 'en' } as const;

describe('Paste a recipe: the consent gate', () => {
  it('sends nothing without the Describe yes, for any rung', async () => {
    const { ai, fake } = await services({ byok: true });
    expect(await ai.describe.readRecipe('Ingredients\n200 g flour', EN)).toEqual({
      kind: 'consentRequired',
    });
    expect(fake.requests).toHaveLength(0);
  });

  it('on No AI there is nothing to send to', async () => {
    const { ai, fake } = await services();
    expect(await ai.describe.readRecipe('Ingredients\n200 g flour', EN)).toEqual({
      kind: 'unavailable',
    });
    expect(fake.requests).toHaveLength(0);
  });

  it('the photo yes and the coaching yes do not unlock it; the Describe yes does, and a revoke stops it', async () => {
    const { ai, fake } = await services({ byok: true });
    await ai.settings.grantPhotoConsent('api.example.com');
    await ai.coaching.grant();
    expect(await ai.describe.readRecipe('Ingredients\n200 g flour', EN)).toEqual({
      kind: 'consentRequired',
    });
    await ai.describe.grant();
    const out = await ai.describe.readRecipe('Ingredients\n200 g flour', EN);
    expect(out).toEqual({
      kind: 'recipe',
      recipe: {
        name: 'Pancakes',
        servings: 4,
        ingredients: [
          { name: 'flour', grams: 200, estimated: false },
          { name: 'milk', grams: 240, estimated: true },
        ],
      },
    });
    expect(fake.requests).toHaveLength(1);
    await ai.describe.revoke();
    expect(await ai.describe.readRecipe('Ingredients\n200 g flour', EN)).toEqual({
      kind: 'consentRequired',
    });
    expect(fake.requests).toHaveLength(1);
  });

  it('lapses with the destination, like a description', async () => {
    const { ai, fake } = await services({ byok: true });
    await ai.describe.grant();
    await ai.settings.setByokTarget({ endpointUrl: 'https://api.elsewhere.test/v1', model: 'm' });
    expect(await ai.describe.readRecipe('Ingredients\n200 g flour', EN)).toEqual({
      kind: 'consentRequired',
    });
    expect(fake.requests).toHaveLength(0);
  });

  it('sends exactly two messages (the fixed instruction, then the text) and nothing else', async () => {
    const { ai, fake } = await services({ byok: true });
    await ai.describe.grant();
    await ai.describe.readRecipe('Ingredients\n200 g flour', EN);
    const body = JSON.parse(fake.last.body) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['max_tokens', 'messages', 'model', 'temperature']);
    expect(body['messages']).toEqual([
      { role: 'system', content: RECIPE_PROMPTS.en },
      { role: 'user', content: 'Ingredients\n200 g flour' },
    ]);
  });

  it('empty text is not sent', async () => {
    const { ai, fake } = await services({ byok: true });
    await ai.describe.grant();
    expect(await ai.describe.readRecipe('  \n  ', EN)).toEqual({ kind: 'empty' });
    expect(fake.requests).toHaveLength(0);
  });

  it('a reply that breaks a rule is a failure (the caller reads the text on the device)', async () => {
    const { ai, fake } = await services({ byok: true });
    await ai.describe.grant();
    fake.jsonBody = chatReply('Sorry, I cannot help with that.');
    expect(await ai.describe.readRecipe('Ingredients\n200 g flour', EN)).toEqual({
      kind: 'failure',
    });
    fake.jsonBody = chatReply(JSON.stringify({ ingredients: [{ name: 'flour', grams: 99999 }] }));
    expect(await ai.describe.readRecipe('Ingredients\n200 g flour', EN)).toEqual({
      kind: 'failure',
    });
  });
});

describe('buildRecipeMessages: the budget', () => {
  it('keeps both messages within 24 KB, cutting the text and nothing else', () => {
    const long = 'é'.repeat(8000) + '\n' + 'x'.repeat(8000);
    const messages = buildRecipeMessages(long, 'fr');
    expect(messages).not.toBeNull();
    const bytes = (messages ?? []).reduce(
      (n, m) => n + new TextEncoder().encode(m.content).length,
      0,
    );
    expect(bytes).toBeLessThanOrEqual(RECIPE_BUDGET_BYTES);
    expect(messages).toHaveLength(2);
    expect(messages?.[0]?.content).toBe(RECIPE_PROMPTS.fr);
  });

  it('cuts four-byte characters on a character boundary', () => {
    const messages = buildRecipeMessages('🥕'.repeat(8000), 'en');
    const user = messages?.[1]?.content ?? '';
    expect(Array.from(user).every((c) => c === '🥕')).toBe(true);
    expect(
      new TextEncoder().encode(user).length + new TextEncoder().encode(RECIPE_PROMPTS.en).length,
    ).toBeLessThanOrEqual(RECIPE_BUDGET_BYTES);
  });

  it('cleans the text: control characters go, lines stay, 8,000 characters at most', () => {
    expect(cleanRecipeText('  a\u0007b \t c \n\n\n d  ')).toBe('a b c\nd');
    expect(Array.from(cleanRecipeText('y'.repeat(9000)))).toHaveLength(8000);
  });

  it('has an English and a French instruction that ask for no nutrients and treat the text as data', () => {
    for (const prompt of Object.values(RECIPE_PROMPTS)) {
      expect(prompt).toMatch(/JSON/);
      expect(prompt).toMatch(/estimated/);
      expect(prompt).not.toMatch(/per100g/);
    }
  });
});

describe('parseRecipeReply: strict', () => {
  const ok = (extra: object = {}) =>
    JSON.stringify({ ingredients: [{ name: 'flour', grams: 100 }], ...extra });

  it('reads a fenced object and an object inside prose', () => {
    expect(parseRecipeReply('```json\n' + ok() + '\n```')?.ingredients).toHaveLength(1);
    expect(parseRecipeReply('Here you go: ' + ok() + ' Enjoy!')?.ingredients).toHaveLength(1);
  });

  it('treats a weight as a guess unless the reply says plainly it is not', () => {
    expect(parseRecipeReply(ok())?.ingredients[0]?.estimated).toBe(true);
    expect(
      parseRecipeReply(JSON.stringify({ ingredients: [{ name: 'a', grams: 1, estimated: false }] }))
        ?.ingredients[0]?.estimated,
    ).toBe(false);
  });

  it('refuses more than 40 ingredients, none, grams outside 0.1 to 5000, long or empty names, non-numbers', () => {
    const many = Array.from({ length: 41 }, () => ({ name: 'a', grams: 1 }));
    expect(parseRecipeReply(JSON.stringify({ ingredients: many }))).toBeNull();
    expect(parseRecipeReply(JSON.stringify({ ingredients: [] }))).toBeNull();
    expect(parseRecipeReply(ok({ ingredients: [{ name: 'a', grams: 0.05 }] }))).toBeNull();
    expect(parseRecipeReply(ok({ ingredients: [{ name: 'a', grams: 5000.5 }] }))).toBeNull();
    expect(parseRecipeReply(ok({ ingredients: [{ name: 'a', grams: '100' }] }))).toBeNull();
    expect(parseRecipeReply(ok({ ingredients: [{ name: 'a'.repeat(101), grams: 1 }] }))).toBeNull();
    expect(parseRecipeReply(ok({ ingredients: [{ name: '  ', grams: 1 }] }))).toBeNull();
    expect(parseRecipeReply(ok({ ingredients: ['flour'] }))).toBeNull();
    expect(parseRecipeReply('[]')).toBeNull();
    expect(parseRecipeReply('not json')).toBeNull();
  });

  it('keeps the edges: 0.1 g and 5000 g, 40 ingredients; drops bad servings and long names quietly', () => {
    const edge = parseRecipeReply(
      JSON.stringify({
        servings: 101,
        name: 'n'.repeat(101),
        ingredients: [
          { name: 'a', grams: 0.1 },
          { name: 'b', grams: 5000 },
        ],
      }),
    );
    expect(edge?.ingredients.map((i) => i.grams)).toEqual([0.1, 5000]);
    expect(edge?.servings).toBeUndefined();
    expect(edge?.name).toBeUndefined();
    const forty = Array.from({ length: 40 }, () => ({ name: 'a', grams: 1 }));
    expect(parseRecipeReply(JSON.stringify({ ingredients: forty }))?.ingredients).toHaveLength(40);
  });
});
