import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ACTIVITIES, AGE_BANDS, PACES, SEXES, type Pace, type Profile } from '@anc/core';
import { useStrings } from '../../i18n';
import { useSession } from '../../app/session';
import { ChoiceGroup, type Choice } from './ChoiceGroup';

const UNSET = 'unset';
type OrUnset<T extends string> = T | typeof UNSET;

/**
 * The one place a Profile answer is written, shared by Settings, Profile and the first-run welcome:
 * a choice applies at once, a write that fails leaves the screen as it was and says so, and an
 * unreadable profile is never saved over (saving one field over it would erase the rest).
 */
export function useProfileEditor() {
  const s = useStrings().profile;
  const { profile: pref, live } = useSession();
  const profile = useSyncExternalStore(pref.subscribe, pref.current);
  const [status, setStatus] = useState('');

  const save = async (next: Profile | undefined, ok = '') => {
    try {
      await pref.set(next);
      if (live()) setStatus(ok);
    } catch {
      if (live()) setStatus(s.saveFailed);
    }
  };

  // Writes are queued and each starts from the profile as it is by then, never from the one this
  // render saw: three quick taps (age, sex, activity) must all land, not the last one over a stale copy.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const withField = <K extends keyof Profile>(key: K, value: Profile[K] | undefined) => {
    queue.current = queue.current.then(async () => {
      if (!pref.trusted()) {
        if (live()) setStatus(s.saveFailed);
        return;
      }
      const next: Record<string, unknown> = { ...pref.current() };
      if (value === undefined) delete next[key];
      else next[key] = value;
      await save(next as Profile);
    });
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

  return { profile, status, setStatus, save, withField, group };
}

export type ProfileEditor = ReturnType<typeof useProfileEditor>;

/** Age range, sex and activity, with the line on what the activity level means. */
export function ProfileAboutFields({ editor }: { readonly editor: ProfileEditor }): ReactNode {
  const s = useStrings().profile;
  const { profile, group } = editor;
  const activityHelp = profile?.activity === undefined ? '' : s.activityHelp[profile.activity];
  return (
    <>
      {group('ageBand', s.ageBand, AGE_BANDS, (v) => v)}
      {group('sex', s.sex, SEXES, (v) => s.sexOptions[v])}
      {group('activity', s.activity, ACTIVITIES, (v) => s.activityOptions[v])}
      {activityHelp !== '' && <p className="text-body-small text-ink-soft">{activityHelp}</p>}
    </>
  );
}

/** The pace of a weight goal (lose or gain) and what each pace means; nothing for other goals. */
export function PaceChoice({ editor }: { readonly editor: ProfileEditor }): ReactNode {
  const s = useStrings().profile;
  const { profile, withField } = editor;
  const goal = profile?.goal;
  if (goal !== 'lose' && goal !== 'gain') return null;
  const pace: Pace = profile?.pace ?? 'gentle';
  const imperial = profile?.units === 'imperial';
  return (
    <div id="profile-pace" className="flex flex-col gap-2">
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
  );
}
