import { useId, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Button, TextField } from '../../components/primitives';
import { TierRadio, type Tier } from '../../components/shell';
import { fill, useStrings } from '../../i18n';
import {
  describeInstanceConsent,
  MODEL_PATTERN,
  filterKeyInput,
  KEY_FIELD_ATTRIBUTES,
  keySavedText,
  previousRungHint,
  rungChoices,
  useYourAi,
  type FieldMessage,
} from '../../ai';
import { hrefs } from '../../app/router';
import { useSession } from '../../app/session';
import { useSessionCoachingStatus } from '../../coaching';
import { Prose, Section, SettingsPage } from './SettingsPage';
import { SwitchRow } from './SwitchRow';

function messageFor(
  message: FieldMessage | null,
  field: FieldMessage['field'],
): string | undefined {
  return message?.field === field ? message.text : undefined;
}

/**
 * The coaching consent, apart from the photo consent: "Let the AI write coach notes and answer
 * questions". Off by default; it shows exactly what is sent and where, and it lapses by itself if
 * the destination changes. A write that fails leaves the switch where it was and says so.
 */
function CoachingSection() {
  const c = useStrings().ai.yourAi;
  const { ai } = useSession();
  const coaching = ai.coaching;
  const status = useSessionCoachingStatus();
  const [failed, setFailed] = useState(false);
  const on = status.kind === 'ready';

  const change = async (next: boolean) => {
    try {
      if (next) await coaching.grant();
      else await coaching.revoke();
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };

  const destination =
    status.kind === 'noAi'
      ? c.coachingNeedsAi
      : status.destination.label !== null
        ? fill(c.coachingDestinationInstance, {
            host: status.destination.host,
            label: status.destination.label,
          })
        : fill(c.coachingDestinationByok, { host: status.destination.host });

  return (
    <Section title={c.coachingHeading}>
      <Prose>{c.coachingIntro}</Prose>
      <SwitchRow
        title={c.coachingSwitch}
        help={on ? c.coachingSwitchHelpOn : c.coachingSwitchHelpOff}
        checked={on}
        disabled={status.kind === 'noAi'}
        onChange={(next) => void change(next)}
      />
      <Prose>{c.coachingSent}</Prose>
      <Prose>{destination}</Prose>
      <p role="status" className="text-body-small text-porcelain-dim empty:hidden">
        {failed ? c.coachingSaveFailed : ''}
      </p>
    </Section>
  );
}

/**
 * The "Describe a meal" consent, apart from the photo and coaching consents: "Let the AI read what
 * I describe". Off by default, per destination, and it lapses by itself if the destination changes.
 * The same shape as the coaching switch.
 */
function DescribeSection() {
  const c = useStrings().ai.yourAi;
  const { ai } = useSession();
  const { describe } = ai;
  const state = useSyncExternalStore(describe.subscribe, describe.getSnapshot);
  const [failed, setFailed] = useState(false);
  const status = state.status;
  const on = status.kind === 'ready';

  const change = async (next: boolean) => {
    try {
      if (next) await describe.grant();
      else await describe.revoke();
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };

  const destination =
    status.kind === 'noAi'
      ? c.describeNeedsAi
      : status.destination.label !== null
        ? fill(c.describeDestinationInstance, {
            host: status.destination.host,
            label: status.destination.label,
          })
        : fill(c.describeDestinationByok, { host: status.destination.host });

  return (
    <Section title={c.describeHeading}>
      <Prose>{c.describeIntro}</Prose>
      <SwitchRow
        title={c.describeSwitch}
        help={on ? c.describeSwitchHelpOn : c.describeSwitchHelpOff}
        checked={on}
        disabled={status.kind === 'noAi'}
        onChange={(next) => void change(next)}
      />
      <Prose>{c.describeSent}</Prose>
      <Prose>{destination}</Prose>
      <p role="status" className="text-body-small text-porcelain-dim empty:hidden">
        {failed ? c.coachingSaveFailed : ''}
      </p>
    </Section>
  );
}

/**
 * Settings, Your AI. Choose how a photo is recognised (No AI, the AI this server offers while it
 * offers one, or My own key; the hosted and on-device rungs are listed as not available yet), set
 * the endpoint, model and key, test the connection, and manage which services may receive photos.
 *
 * The key is typed into an obscured field with no suggestions, stripped of whitespace, never
 * displayed back (the only trace is "ends with ••••abcd") and emptied after every save. It lives
 * in this component's state only until Save; it never enters the Your AI hook's state.
 */
export function YourAiScreen() {
  const all = useStrings();
  const c = all.ai.yourAi;
  const ai = useYourAi();
  const { settings, instance } = ai;
  const [byokChosen, setByokChosen] = useState(settings.rung.kind === 'byok');
  const [endpoint, setEndpoint] = useState(settings.byokEndpointUrl);
  const [model, setModel] = useState(settings.byokModel);
  const [voiceModel, setVoiceModel] = useState(settings.byokTranscriptionModel);
  const [voiceModelBad, setVoiceModelBad] = useState(false);
  const [key, setKey] = useState('');
  const [removed, setRemoved] = useState(false);
  const formId = useId();

  const tiers: Tier[] = rungChoices(instance.config).map((choice) => ({
    id: choice.kind,
    title: choice.label,
    description: choice.help,
    disabled: !choice.selectable,
    // Only the on-device model is a version-1 non-goal; the hosted tier is just not available yet.
    versionTag: choice.kind === 'local',
  }));
  const hosts = [...settings.photoConsentHosts].sort();
  const keyLine = ai.keyStatus.hasKey ? keySavedText(ai.keyStatus.keyEnding) : c.keyNone;
  const hint = previousRungHint(settings);
  // A transient line owned by this screen (the key was removed), shown in the same live region.
  const live = ai.message?.field === 'message' ? ai.message.text : removed ? c.keyRemoved : '';

  const choose = (id: string) => {
    setRemoved(false);
    if (id === 'noOp') {
      setByokChosen(false);
      void ai.selectNoAi();
    } else if (id === 'instance') {
      setByokChosen(false);
      void ai.selectInstance();
    } else if (id === 'byok') {
      setByokChosen(true);
    }
  };

  const save = async () => {
    setRemoved(false);
    const typed = voiceModel.trim();
    if (typed !== '' && !MODEL_PATTERN.test(typed)) {
      setVoiceModelBad(true);
      return;
    }
    setVoiceModelBad(false);
    await ai.setTranscriptionModel(typed);
    const saved = await ai.save({ endpointUrl: endpoint, model, newKey: key });
    if (saved) setKey('');
  };

  const remove = async () => {
    await ai.removeKey();
    setKey('');
    setByokChosen(false);
    setRemoved(true);
  };

  // The radio that is on: My own key while its form is open, the server's AI while it is chosen and
  // still offered, No AI when chosen. Nothing is on when the saved choice (this server's AI) is no
  // longer offered, so a click on No AI still registers.
  const instanceOn = settings.rung.kind === 'instance' && instance.config.enabled;
  const radioValue = byokChosen
    ? 'byok'
    : instanceOn
      ? 'instance'
      : settings.rung.kind === 'instance'
        ? ''
        : 'noOp';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save();
  };

  return (
    <SettingsPage title={c.title}>
      <Prose>{c.intro}</Prose>

      <Section title={c.rungHeading}>
        <TierRadio tiers={tiers} value={radioValue} onChange={choose} label={c.rungHeading} />
      </Section>

      {instanceOn && !byokChosen && instance.config.enabled && (
        <Section title={c.instanceHeading}>
          <Prose>
            {fill(c.instanceExplain, { host: instance.host, label: instance.config.label })}
          </Prose>
          <Prose>{fill(c.instanceModel, { model: instance.config.model })}</Prose>
          {instance.config.transcriptionModel !== undefined && (
            <Prose>{fill(c.instanceVoice, { model: instance.config.transcriptionModel })}</Prose>
          )}
        </Section>
      )}

      {byokChosen && (
        <Section title={c.byokHeading}>
          <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <TextField
              label={c.endpointLabel}
              placeholder={c.endpointHint}
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={endpoint}
              message={messageFor(ai.message, 'endpoint') ?? c.endpointHelp}
              onChange={(e) => {
                setEndpoint(e.target.value);
                ai.clearMessage();
              }}
            />
            <TextField
              label={c.modelLabel}
              placeholder={c.modelHint}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={model}
              message={messageFor(ai.message, 'model')}
              onChange={(e) => {
                setModel(e.target.value);
                ai.clearMessage();
              }}
            />
            <TextField
              label={c.voiceModelLabel}
              placeholder={c.voiceModelHint}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={voiceModel}
              maxLength={128}
              message={voiceModelBad ? c.voiceModelInvalid : c.voiceModelHelp}
              onChange={(e) => {
                setVoiceModel(e.target.value);
                setVoiceModelBad(false);
                ai.clearMessage();
              }}
            />
            <TextField
              label={c.keyLabel}
              placeholder={c.keyHint}
              {...KEY_FIELD_ATTRIBUTES}
              value={key}
              message={c.keyHelpWeb}
              onChange={(e) => setKey(filterKeyInput(e.target.value))}
            />
            <p role="status" className="text-porcelain-dim text-small">
              {keyLine}
            </p>
            {ai.keyStatus.hasKey && <Prose>{c.keyReplaceHint}</Prose>}
            {hint !== null && <Prose>{hint}</Prose>}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="solid-porcelain" busy={ai.busy}>
                {c.save}
              </Button>
              <Button
                variant="outline-porcelain"
                busy={ai.testing}
                busyLabel={c.testing}
                onClick={() => void ai.test({ endpointUrl: endpoint, model, typedKey: key })}
              >
                {c.testConnection}
              </Button>
              {ai.keyStatus.hasKey && (
                <Button variant="outline-porcelain" busy={ai.busy} onClick={() => void remove()}>
                  {c.removeKey}
                </Button>
              )}
            </div>
          </form>
        </Section>
      )}

      {/* Always mounted: a live region is announced reliably only when its text changes. */}
      <p role="status" className="text-body text-porcelain empty:hidden">
        {live}
      </p>

      <CoachingSection />

      <DescribeSection />

      <Section title={c.privacyHeading}>
        <Prose>{c.consentExplainer}</Prose>
        <SwitchRow
          title={c.askEveryPhotoLabel}
          help={c.askEveryPhotoHelp}
          checked={settings.askBeforeEveryPhoto}
          onChange={(next) => void ai.setAskBeforeEveryPhoto(next)}
        />
        {hosts.length === 0 ? (
          <Prose>{c.consentNone}</Prose>
        ) : (
          <ul aria-label={c.consentHosts} className="flex flex-col">
            {hosts.map((host) => (
              <li
                key={host}
                className="border-rule flex min-h-14 items-center justify-between gap-3 border-b"
              >
                <span className="text-body [overflow-wrap:anywhere]">
                  {describeInstanceConsent(host) ?? host}
                </span>
                <Button
                  variant="outline-porcelain"
                  aria-label={fill(c.consentRevokeFor, {
                    host: describeInstanceConsent(host) ?? host,
                  })}
                  onClick={() => void ai.revokeConsent(host)}
                >
                  {c.consentRevoke}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <a
          href={hrefs.privacy}
          className="text-porcelain inline-flex min-h-12 items-center self-start underline underline-offset-4"
        >
          {c.docsHint}
        </a>
      </Section>
    </SettingsPage>
  );
}
