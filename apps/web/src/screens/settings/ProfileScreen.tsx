import { useState, useSyncExternalStore } from 'react';
import {
  DIETS,
  GOALS,
  MAX_ALLERGY_TAGS,
  MAX_ALLERGY_TAG_LENGTH,
  sanitizeAllergyTags,
} from '@anc/core';
import { SupportLine } from '../../components/nutrition';
import { ConfirmDialog } from '../../components/dialogs';
import { Checkbox } from '../../components/primitives';
import { fill, useStrings } from '../../i18n';
import { useSession } from '../../app/session';
import { PaceChoice, ProfileAboutFields, useProfileEditor } from './profile-editor';
import { ProfileBodySection } from './ProfileBodySection';
import { ProfileGuideSection } from './ProfileGuideSection';
import { Prose, Section, SettingsPage } from './SettingsPage';

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
  const editor = useProfileEditor();
  const { profile, status, setStatus, withField, group } = editor;
  const measurements = useSyncExternalStore(pref.subscribe, pref.measurementList);
  const [draft, setDraft] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const tags = profile?.allergies ?? [];
  const addTag = () => {
    const next = sanitizeAllergyTags([...tags, draft]);
    setDraft('');
    withField('allergies', next);
  };

  const goal = profile?.goal;

  return (
    <SettingsPage title={s.title} wide>
      {/* Phone: one column, the guide after the goal that shapes it. Desktop: the form on the left and the guide beside it, in view while a field changes. */}
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-x-12 lg:*:col-start-1">
        <Prose>{s.intro}</Prose>

        <Section title={s.aboutTitle}>
          <Prose>{s.aboutHelp}</Prose>
          <ProfileAboutFields editor={editor} />
        </Section>

        <ProfileBodySection profile={profile} onProfile={withField} />

        <Section title={s.goalTitle}>
          <Prose>{s.goalHelp}</Prose>
          {group('goal', s.goal, GOALS, (v) => s.goalOptions[v])}
          {goal !== undefined && (
            <p className="text-body-small text-ink-soft">{s.goalEffect[goal]}</p>
          )}
          <SupportLine />
          <PaceChoice editor={editor} />
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

        <div className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:row-span-6 lg:row-start-1 lg:self-start lg:col-start-2!">
          <ProfileGuideSection profile={profile} onProfile={withField} />
        </div>

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
