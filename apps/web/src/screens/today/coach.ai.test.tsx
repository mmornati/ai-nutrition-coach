// An AI-written note replaces the template note under the plate in place (with "Written by AI"),
// and never when it quotes amounts while numbers are off, or after the question was dismissed.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import {
  AI_FOLLOW_UP_QUESTION_KEY,
  AI_NOTE_QUESTION_KEY,
  aiQuestionKey,
  coachNoteDismissalKey,
} from '@anc/core';
import { at, renderInSession, seedPlate, unlockedBundle } from '../../app/testing';
import { KV_KEYS, type StoreBundle } from '../../storage';
import { strings } from '../../i18n';
import { TodayScreen } from './TodayScreen';

const s = strings();
const TEMPLATE = s.coachQuestions['post.resolve.proteinHeavy'];
const AI_TEXT =
  'Chicken on its own today. Some greens beside it would sit well. What is in the fridge?';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 12, 10) });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.location.hash = '';
});

async function seed(options: { aiText?: string; numbersOff?: boolean; followUp?: boolean } = {}) {
  const bundle = await unlockedBundle();
  if (options.numbersOff) await bundle.kv.write(KV_KEYS.uiShowNumbers, 'off');
  await seedPlate(bundle, at(12, 5), [['Chicken', 'protein']]);
  const template = await bundle.notes.append({
    id: 0,
    plateLogId: 1,
    anchor: 'postResolve',
    questionKey: 'post.resolve.proteinHeavy',
    text: TEMPLATE,
    generatedAt: at(12, 6),
  });
  if (template.kind !== 'coachNoteAppended') throw new Error('seed');
  if (options.aiText !== undefined) {
    await bundle.notes.append({
      id: 0,
      plateLogId: 1,
      anchor: 'postResolve',
      questionKey: aiQuestionKey(AI_NOTE_QUESTION_KEY, 'en'),
      text: options.aiText,
      generatedAt: at(12, 7),
    });
  }
  if (options.followUp) {
    await bundle.notes.append({
      id: 0,
      plateLogId: 1,
      anchor: 'depthFollowUp',
      questionKey: aiQuestionKey(AI_FOLLOW_UP_QUESTION_KEY, 'en'),
      text: 'Do you like roasted vegetables?',
      generatedAt: at(12, 7),
    });
  }
  return { bundle, templateId: template.note.id };
}

const open = async (bundle: StoreBundle) => {
  const view = await renderInSession(<TodayScreen />, { bundle });
  await screen.findByRole('group', { name: s.coach.group });
  return view;
};

describe('Today: the AI coach note under a plate', () => {
  it('shows the template note alone when the AI wrote nothing (no mark)', async () => {
    const { bundle } = await seed();
    await open(bundle);
    const card = screen.getByRole('group', { name: s.coach.group });
    expect(within(card).getByText(TEMPLATE)).toBeVisible();
    expect(within(card).queryByText('Written by AI')).toBeNull();
  });

  it('shows the AI note instead of the template one, marked as written by AI', async () => {
    const { bundle } = await seed({ aiText: AI_TEXT });
    const { container } = await open(bundle);
    const card = screen.getByRole('group', { name: s.coach.group });
    expect(within(card).getByText(AI_TEXT)).toBeVisible();
    expect(within(card).getByText('Written by AI')).toBeVisible();
    expect(screen.queryByText(TEMPLATE)).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('the upgrade lands in place while the card is on screen', async () => {
    const { bundle } = await seed();
    await open(bundle);
    expect(screen.getByText(TEMPLATE)).toBeVisible();
    await bundle.notes.append({
      id: 0,
      plateLogId: 1,
      anchor: 'postResolve',
      questionKey: aiQuestionKey(AI_NOTE_QUESTION_KEY, 'en'),
      text: AI_TEXT,
      generatedAt: at(12, 8),
    });
    await waitFor(() => expect(screen.getByText(AI_TEXT)).toBeVisible());
    expect(screen.queryByText(TEMPLATE)).toBeNull();
  });

  it('Sure opens the AI follow-up (marked), Close retires the question for good', async () => {
    const user = userEvent.setup();
    const { bundle } = await seed({ aiText: AI_TEXT, followUp: true });
    await open(bundle);
    await user.click(screen.getByRole('button', { name: 'Sure' }));
    const depth = await screen.findByRole('group', { name: s.coach.depthGroup });
    expect(within(depth).getByText('Do you like roasted vegetables?')).toBeVisible();
    expect(within(depth).getByText('Written by AI')).toBeVisible();
    await user.click(within(depth).getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: s.coach.depthGroup })).toBeNull(),
    );
    expect(screen.queryByRole('group', { name: s.coach.group })).toBeNull();
  });

  it('Ask later dismisses the question, AI version included', async () => {
    const user = userEvent.setup();
    const { bundle } = await seed({ aiText: AI_TEXT });
    await open(bundle);
    await user.click(screen.getByRole('button', { name: 'Ask later' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: s.coach.group })).toBeNull());
  });

  it('a question dismissed before the AI note arrived stays dismissed', async () => {
    const { bundle, templateId } = await seed({ aiText: AI_TEXT });
    await bundle.notes.recordDismissal(coachNoteDismissalKey(templateId));
    await renderInSession(<TodayScreen />, { bundle });
    await screen.findByText('Chicken');
    expect(screen.queryByRole('group', { name: s.coach.group })).toBeNull();
  });

  it('while numbers are off an AI note quoting an amount is not shown: the template note stands', async () => {
    const { bundle } = await seed({
      aiText: 'About 40 g of protein here. Would some greens sit well beside it?',
      numbersOff: true,
    });
    await renderInSession(<TodayScreen />, { bundle });
    await screen.findByText('Chicken');
    // The template note for this pattern has no numbers, so it is the one that shows.
    const card = await screen.findByRole('group', { name: s.coach.group });
    expect(within(card).getByText(TEMPLATE)).toBeVisible();
    expect(screen.queryByText(/40 g of protein/)).toBeNull();
    expect(within(card).queryByText('Written by AI')).toBeNull();
  });
});

describe('Today: AI note edge cases', () => {
  const addAi = (bundle: StoreBundle, key: string, text = AI_TEXT) =>
    bundle.notes.append({
      id: 0,
      plateLogId: 1,
      anchor: 'postResolve',
      questionKey: key,
      text,
      generatedAt: at(12, 7),
    });

  it('an AI note written in another language than the interface is not shown', async () => {
    const { bundle } = await seed();
    await addAi(
      bundle,
      aiQuestionKey(AI_NOTE_QUESTION_KEY, 'fr'),
      'Un peu de vert ? Pourquoi pas.',
    );
    await renderInSession(<TodayScreen />, { bundle });
    const card = await screen.findByRole('group', { name: s.coach.group });
    expect(within(card).getByText(TEMPLATE)).toBeVisible();
    expect(screen.queryByText(/Un peu de vert/)).toBeNull();
  });

  it('an AI note stored without a language is not shown either', async () => {
    const { bundle } = await seed();
    await addAi(bundle, AI_NOTE_QUESTION_KEY);
    await renderInSession(<TodayScreen />, { bundle });
    const card = await screen.findByRole('group', { name: s.coach.group });
    expect(within(card).getByText(TEMPLATE)).toBeVisible();
  });

  it('numbers off: an AI follow-up with an amount is not opened under the AI note', async () => {
    const user = userEvent.setup();
    const { bundle } = await seed({ aiText: AI_TEXT, numbersOff: true });
    await bundle.notes.append({
      id: 0,
      plateLogId: 1,
      anchor: 'depthFollowUp',
      questionKey: aiQuestionKey(AI_FOLLOW_UP_QUESTION_KEY, 'en'),
      text: 'Could 30 g of beans join it?',
      generatedAt: at(12, 8),
    });
    await renderInSession(<TodayScreen />, { bundle });
    await screen.findByRole('group', { name: s.coach.group });
    await user.click(screen.getByRole('button', { name: 'Sure' }));
    const depth = await screen.findByRole('group', { name: s.coach.depthGroup });
    expect(within(depth).queryByText(/30 g of beans/)).toBeNull();
  });

  it('an AI note that lands after Sure was tapped does not swap the open panel', async () => {
    const user = userEvent.setup();
    const { bundle } = await seed();
    await renderInSession(<TodayScreen />, { bundle });
    await screen.findByRole('group', { name: s.coach.group });
    await user.click(screen.getByRole('button', { name: 'Sure' }));
    await screen.findByRole('group', { name: s.coach.depthGroup });
    await addAi(bundle, aiQuestionKey(AI_NOTE_QUESTION_KEY, 'en'));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByRole('group', { name: s.coach.depthGroup })).toBeVisible();
    expect(screen.queryByRole('group', { name: s.coach.group })).toBeNull();
    // Close retires the question for good; the late AI note never shows as a fresh card.
    await user.click(
      within(screen.getByRole('group', { name: s.coach.depthGroup })).getByRole('button', {
        name: 'Close',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: s.coach.depthGroup })).toBeNull(),
    );
    expect(screen.queryByRole('group', { name: s.coach.group })).toBeNull();
  });
});
