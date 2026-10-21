import { useState, useSyncExternalStore } from 'react';
import {
  ACTIVITIES,
  AGE_BANDS,
  DIETS,
  GOALS,
  MAX_ALLERGY_TAGS,
  MAX_ALLERGY_TAG_LENGTH,
  SEXES,
  sanitizeAllergyTags,
  type Profile,
} from '@anc/core';
import { SupportLine, formatWhole } from '../../components/nutrition';
import { fill, useLocale, useStrings } from '../../i18n';
import { useSession } from '../../app/session';
import { ChoiceGroup, type Choice } from './ChoiceGroup';
import { Prose, SettingsPage } from './SettingsPage';

const UNSET = 'unset';
type OrUnset<T extends string> = T | typeof UNSET;

/**
 * Settings, Profile: every field is optional ("Not set" by default). It only tunes the daily guide
 * and the coach, and stays in the encrypted store. A choice applies at once; a write that fails
 * leaves the screen as it was and says so. When the goal is to lose weight, the calm support line
 * sits next to the choice.
 */
export function ProfileScreen() {
  const all = useStrings();
  const s = all.profile;
  const { locale } = useLocale();
  const { profile: pref, live } = useSession();
  const profile = useSyncExternalStore(pref.subscribe, pref.current);
  const targets = useSyncExternalStore(pref.subscribe, pref.targets);
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState('');

  const save = async (next: Profile | undefined, ok = '') => {
    try {
      await pref.set(next);
      if (live()) setStatus(ok);
    } catch {
      if (live()) setStatus(s.saveFailed);
    }
  };

  const withField = <K extends keyof Profile>(key: K, value: Profile[K] | undefined) => {
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

  const personal = pref.personal();

  return (
    <SettingsPage title={s.title}>
      <div className="flex flex-col gap-6">
        <Prose>{s.intro}</Prose>
        {group('ageBand', s.ageBand, AGE_BANDS, (v) => v)}
        {group('sex', s.sex, SEXES, (v) => s.sexOptions[v])}
        {group('activity', s.activity, ACTIVITIES, (v) => s.activityOptions[v])}
        <div className="flex flex-col gap-2">
          {group('goal', s.goal, GOALS, (v) => s.goalOptions[v])}
          {profile?.goal === 'lose' && <SupportLine />}
          {profile?.goal !== undefined && <Prose>{s.goalNote}</Prose>}
        </div>
        {group('diet', s.diet, DIETS, (v) => s.dietOptions[v])}

        <div className="flex flex-col gap-2">
          <label
            htmlFor="profile-allergy"
            className="font-display text-label text-signal-muted uppercase"
          >
            {s.allergiesLabel}
          </label>
          <p className="text-body-small text-porcelain-dim">{s.allergiesHelp}</p>
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
              className="border-control bg-enamel text-porcelain min-h-12 min-w-0 flex-1 border-2 px-3"
            />
            <button
              type="button"
              onClick={addTag}
              className="font-display text-button border-control text-porcelain min-h-12 border-2 px-4 uppercase"
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
                    className="border-control text-porcelain min-h-12 border-2 px-3"
                  >
                    {tag} ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Prose>
          {personal
            ? fill(s.guideComplete, { energy: formatWhole(targets.energyKcal, locale) })
            : s.guideIncomplete}
        </Prose>

        <div>
          <button
            type="button"
            disabled={profile === undefined}
            onClick={() => void save(undefined, s.cleared)}
            className="font-display text-button border-control text-porcelain min-h-12 border-2 px-4 uppercase disabled:opacity-50"
          >
            {s.clear}
          </button>
          <p role="status" className="text-body-small text-porcelain-dim empty:hidden">
            {status}
          </p>
        </div>
      </div>
    </SettingsPage>
  );
}
