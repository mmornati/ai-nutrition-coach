import { useState, useSyncExternalStore } from 'react';
import {
  ACTIVITIES,
  AGE_BANDS,
  DIETS,
  GOALS,
  MAX_ALLERGY_TAGS,
  MAX_ALLERGY_TAG_LENGTH,
  PACES,
  SEXES,
  sanitizeAllergyTags,
  type Pace,
  type Profile,
} from '@anc/core';
import { SupportLine } from '../../components/nutrition';
import { ConfirmDialog } from '../../components/dialogs';
import { Checkbox } from '../../components/primitives';
import { fill, useStrings } from '../../i18n';
import { useSession } from '../../app/session';
import { ChoiceGroup, type Choice } from './ChoiceGroup';
import { ProfileBodySection } from './ProfileBodySection';
import { ProfileGuideSection } from './ProfileGuideSection';
import { Prose, Section, SettingsPage } from './SettingsPage';

const UNSET = 'unset';
type OrUnset<T extends string> = T | typeof UNSET;

/**
 * Settings, Profile, in sections with a line on what each answer changes: About you, Body, Goal,
 * Your daily guide, Food. Every field is optional ("Not set" by default). It only tunes the daily
 * guide and the coach, and stays in the encrypted store (and the encrypted backup). A choice
 * applies at once; a write that fails leaves the screen as it was and says so. The calm support
 * line sits next to the goal and pace choice and next to the weigh-in entry (docs/adr/0008).
 */
export function ProfileScreen() {
  const all = useStrings();
  const s = all.profile;
  const { profile: pref, live } = useSession();
  const profile = useSyncExternalStore(pref.subscribe, pref.current);
  const measurements = useSyncExternalStore(pref.subscribe, pref.measurementList);
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const save = async (next: Profile | undefined, ok = '') => {
    try {
      await pref.set(next);
      if (live()) setStatus(ok);
    } catch {
      if (live()) setStatus(s.saveFailed);
    }
  };

  const withField = <K extends keyof Profile>(key: K, value: Profile[K] | undefined) => {
    // An unreadable profile is not an empty one: saving one field over it would erase the rest.
    if (!pref.trusted()) {
      setStatus(s.saveFailed);
      return;
    }
    const next: Record<string, unknown> = { ...profile };
    if (value === undefined) delete next[key];
    else next[key] = value;
    void save(next as Profile);
  };

  const choicesOf = <T extends string>(
    values: readonly T[],
    label: (value: T) => string,
  ): readonly Choice<OrUnset<T>>[] => [
    { value: UNSET, label: s.notSet },
    ...values.map((value) => ({ value, label: label(value) })),
  ];

  const group = <K extends 'ageBand' | 'sex' | 'activity' | 'goal' | 'diet'>(
    key: K,
    legend: string,
    values: readonly NonNullable<Profile[K]>[],
    label: (value: NonNullable<Profile[K]>) => string,
  ) => (
    <ChoiceGroup<OrUnset<NonNullable<Profile[K]>>>
      label={legend}
      choices={choicesOf(values, label)}
      value={profile?.[key] ?? UNSET}
      onChange={(value) => withField(key, value === UNSET ? undefined : (value as Profile[K]))}
    />
  );

  const tags = profile?.allergies ?? [];
  const addTag = () => {
    const next = sanitizeAllergyTags([...tags, draft]);
    setDraft('');
    withField('allergies', next);
  };

  const goal = profile?.goal;
  const weighsToMove = goal === 'lose' || goal === 'gain';
  const pace: Pace = profile?.pace ?? 'gentle';
  const imperial = profile?.units === 'imperial';
  const activityHelp = profile?.activity === undefined ? '' : s.activityHelp[profile.activity];

  return (
    <SettingsPage title={s.title}>
      <div className="flex flex-col gap-8">
        <Prose>{s.intro}</Prose>

        <Section title={s.aboutTitle}>
          <Prose>{s.aboutHelp}</Prose>
          {group('ageBand', s.ageBand, AGE_BANDS, (v) => v)}
          {group('sex', s.sex, SEXES, (v) => s.sexOptions[v])}
          {group('activity', s.activity, ACTIVITIES, (v) => s.activityOptions[v])}
          {activityHelp !== '' && <p className="text-body-small text-ink-soft">{activityHelp}</p>}
        </Section>

        <ProfileBodySection profile={profile} onProfile={withField} />

        <Section title={s.goalTitle}>
          <Prose>{s.goalHelp}</Prose>
          {group('goal', s.goal, GOALS, (v) => s.goalOptions[v])}
          {goal !== undefined && (
            <p className="text-body-small text-ink-soft">{s.goalEffect[goal]}</p>
          )}
          <SupportLine />
          {weighsToMove && (
            <div className="flex flex-col gap-2">
              <ChoiceGroup<Pace>
                label={s.pace}
                choices={PACES.map((value) => ({ value, label: s.paceOptions[value] }))}
                value={pace}
                onChange={(value) => withField('pace', value)}
              />
              <p className="text-body-small text-ink-soft">
                {goal === 'lose' ? s.paceHelpLose[pace] : s.paceHelpGain[pace]}
              </p>
              <p className="text-body-small text-ink-soft">
                {goal === 'lose'
                  ? imperial
                    ? s.paceExpectationLoseImperial
                    : s.paceExpectationLose
                  : s.paceExpectationGain}
              </p>
            </div>
          )}
          {goal === 'lose' && profile?.sex !== 'male' && (
            <div>
              <Checkbox
                checked={profile?.pregnantOrBreastfeeding === true}
                onChange={(e) =>
                  withField('pregnantOrBreastfeeding', e.target.checked ? true : undefined)
                }
              >
                <span className="text-lead block font-medium">{s.pregnantLabel}</span>
                <span className="text-ink-soft text-body-small mt-0.5 block">{s.pregnantHelp}</span>
                <span className="text-ink-soft text-body-small mt-0.5 block">{s.pregnantNote}</span>
              </Checkbox>
            </div>
          )}
        </Section>

        <ProfileGuideSection profile={profile} onProfile={withField} />

        <Section title={s.foodTitle}>
          <Prose>{s.foodHelp}</Prose>
          {group('diet', s.diet, DIETS, (v) => s.dietOptions[v])}

          <div className="flex flex-col gap-2">
            <label htmlFor="profile-allergy" className="font-display text-label text-thread">
              {s.allergiesLabel}
            </label>
            <p className="text-body-small text-ink-soft">{s.allergiesHelp}</p>
            <div className="flex gap-2">
              <input
                id="profile-allergy"
                type="text"
                value={draft}
                maxLength={MAX_ALLERGY_TAG_LENGTH}
                disabled={tags.length >= MAX_ALLERGY_TAGS}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                className="border-control bg-cloth text-ink min-h-12 min-w-0 flex-1 border-2 px-3"
              />
              <button
                type="button"
                onClick={addTag}
                className="font-display text-button border-control text-ink min-h-12 border-2 px-4"
              >
                {s.allergyAdd}
              </button>
            </div>
            {tags.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <li key={tag}>
                    <button
                      type="button"
                      aria-label={fill(s.allergyRemove, { tag })}
                      onClick={() =>
                        withField('allergies', sanitizeAllergyTags(tags.filter((t) => t !== tag)))
                      }
                      className="border-control text-ink min-h-12 border-2 px-3"
                    >
                      {tag} ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={profile === undefined}
              onClick={async () => {
                try {
                  await pref.clear();
                  if (live()) setStatus(s.cleared);
                } catch {
                  if (live()) setStatus(s.saveFailed);
                }
              }}
              className="font-display text-button border-control text-ink min-h-12 border-2 px-4 disabled:opacity-50"
            >
              {s.clear}
            </button>
            <button
              type="button"
              disabled={measurements.length === 0}
              onClick={() => setConfirmRemove(true)}
              className="font-display text-button border-control text-ink min-h-12 border-2 px-4 disabled:opacity-50"
            >
              {s.removeMeasurements}
            </button>
          </div>
          <p role="status" className="text-body-small text-ink-soft empty:hidden">
            {status}
          </p>
        </div>
        <ConfirmDialog
          open={confirmRemove}
          title={s.removeMeasurementsTitle}
          body={<p>{s.removeMeasurementsBody}</p>}
          confirmLabel={s.removeMeasurementsConfirm}
          dismissLabel={s.removeMeasurementsKeep}
          busy={removing}
          onDismiss={() => setConfirmRemove(false)}
          onConfirm={async () => {
            setRemoving(true);
            try {
              await pref.removeAllMeasurements();
              if (live()) setStatus(s.measurementsRemoved);
            } catch {
              if (live()) setStatus(s.saveFailed);
            } finally {
              if (live()) {
                setRemoving(false);
                setConfirmRemove(false);
              }
            }
          }}
        />
      </div>
    </SettingsPage>
  );
}
