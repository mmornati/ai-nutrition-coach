import { aiRungLabel, type AiRungKind } from '@anc/core';
import { fill, strings } from '../i18n';
import type { AiSettings } from './ai-settings';
import type { ByokEndpointProblem } from './byok-endpoint';
import type { ByokConnectionResult } from './openai-compatible-provider';
import { RUNG_LISTING } from './rungs';
import type { SaveByokResult } from './your-ai';

/** Where the Your AI screen shows a piece of copy. */
export interface FieldMessage {
  readonly field: 'endpoint' | 'model' | 'message';
  readonly text: string;
}

export function endpointProblemText(problem: ByokEndpointProblem): string {
  const c = strings().ai.yourAi;
  switch (problem) {
    case 'empty':
      return c.endpointEmpty;
    case 'notAUrl':
      return c.endpointNotAUrl;
    case 'notHttps':
      return c.endpointNotHttps;
    case 'hasCredentials':
      return c.endpointHasCredentials;
    case 'hasQueryOrFragment':
      return c.endpointHasQuery;
  }
}

/** "key saved • ends with ••••abcd" (the last four only) or the plain "key saved". */
export function keySavedText(keyEnding: string | null): string {
  const c = strings().ai.yourAi;
  return keyEnding === null ? c.keySavedPlain : fill(c.keySavedTemplate, { last4: keyEnding });
}

export function saveResultMessage(result: SaveByokResult): FieldMessage {
  const c = strings().ai.yourAi;
  switch (result.kind) {
    case 'saved':
      return { field: 'message', text: c.saved };
    case 'endpointInvalid':
      return { field: 'endpoint', text: endpointProblemText(result.problem) };
    case 'modelMissing':
      return { field: 'model', text: c.modelEmpty };
    case 'keyInvalid':
      return { field: 'message', text: c.keyInvalid };
    case 'keyMissing':
      return { field: 'message', text: c.testNotConfigured };
    case 'keyForOtherHost':
      return { field: 'message', text: fill(c.keyOtherHost, { host: result.savedFor }) };
    case 'storageFailed':
      return { field: 'message', text: c.testNetwork };
  }
}

/**
 * The calm line for a "Test connection" outcome. Never carries key material. An unreachable
 * service adds the browser note: a CORS or Content-Security-Policy block looks exactly like an
 * offline host, so the message says it plainly.
 */
export function connectionResultMessage(result: ByokConnectionResult): FieldMessage {
  const t = strings().ai;
  const c = t.yourAi;
  switch (result.kind) {
    case 'ok':
      return { field: 'message', text: c.testOk };
    case 'keyRejected':
      return { field: 'message', text: c.testKeyRejected };
    case 'rateLimited':
      return { field: 'message', text: c.testRateLimited };
    case 'endpointInvalid':
      return { field: 'endpoint', text: endpointProblemText(result.problem) };
    case 'notConfigured':
      return { field: 'message', text: c.testNotConfigured };
    case 'keyForOtherHost':
      return { field: 'message', text: c.testKeyOtherHost };
    case 'responseTooLarge':
      return { field: 'message', text: c.testTooLarge };
    case 'unreachable':
      return {
        field: 'message',
        text:
          result.reason === 'timeout'
            ? c.testTimeout
            : `${c.testNetwork} ${t.failure.blockedByBrowser}`,
      };
    case 'unexpectedStatus':
      return { field: 'message', text: fill(c.testUnexpected, { status: result.statusCode }) };
  }
}

/** The Settings row subtitle: the live rung as a calm mono status line. */
export function rungStatusLine(settings: AiSettings, hasKey: boolean): string {
  const t = strings().ai;
  if (settings.rung.kind === 'byok') return hasKey ? t.byok.statusActive : t.byok.statusMissing;
  return t.rung.offlineNoAi;
}

/** "removing this key returns to <previous rung>" under the key form. */
export function previousRungHint(settings: AiSettings): string | null {
  if (settings.rung.kind !== 'byok') return null;
  const previous: AiRungKind = settings.rung.previousRung?.previousKind ?? 'noOp';
  return fill(strings().ai.byok.previousRungHint, { previousRungLabel: aiRungLabel(previous) });
}

export interface RungChoice {
  readonly kind: AiRungKind;
  readonly label: string;
  /** Help under the choice; "Not available yet" for the rungs that cannot be chosen. */
  readonly help: string;
  readonly selectable: boolean;
}

/** All four rungs for the Your AI list; only No AI and My own key can be chosen. */
export function rungChoices(): readonly RungChoice[] {
  const c = strings().ai.yourAi;
  const labels: Record<AiRungKind, { label: string; help: string }> = {
    noOp: { label: c.rungNoneLabel, help: c.rungNoneHelp },
    byok: { label: c.rungByokLabel, help: c.rungByokHelp },
    hostedQuota: { label: c.rungHostedLabel, help: c.rungUnavailable },
    local: { label: c.rungLocalLabel, help: c.rungUnavailable },
  };
  return RUNG_LISTING.map(({ kind, selectable }) => ({ kind, selectable, ...labels[kind] }));
}
