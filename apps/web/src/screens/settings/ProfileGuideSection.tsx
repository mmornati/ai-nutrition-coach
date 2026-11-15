import { useState, useSyncExternalStore } from 'react';
import {
  CUSTOM_ENERGY_RANGE_KCAL,
  ENERGY_FLOOR_KCAL,
  bodyMassIndex,
  customEnergyVerdict,
  waistToHeightRatio,
  whtrApplies,
  type DailyGuide,
  type Profile,
} from '@anc/core';
import { formatWhole, useShowNumbers } from '../../components/nutrition';
import { Button, TextField } from '../../components/primitives';
import { fill, useLocale, useStrings } from '../../i18n';
import type { Locale } from '../../i18n/locale';
import { useSession } from '../../app/session';
import { hrefs } from '../../app/router';
import { SECTIONS } from './sections';
import { parseTypedNumber } from './body-input';
import { Prose, Section } from './SettingsPage';

const decimals = (locale: Locale, digits: number) =>
  new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

function Disclosure({
  summary,
  children,
}: {
  readonly summary: string;
  readonly children: React.ReactNode;
}) {
  return (
    <details className="group text-body-small text-ink-soft">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 underline underline-offset-4 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="border-ink-soft size-2 shrink-0 -rotate-45 border-r-2 border-b-2 transition-transform group-open:rotate-45"
        />
        <span>{summary}</span>
      </summary>
      <div className="flex flex-col gap-2 pb-2">{children}</div>
    </details>
  );
}

type ProfileStrings = ReturnType<typeof useStrings>['profile'];

/**
 * The calm fixed line that says why the guide is what it is when a safeguard or the floor decided
 * it, or `null`. The floor wording is used whenever the floor raised the guide above maintenance,
 * so the line never contradicts the figure. With `floorText` null (numbers off) only the lines that
 * carry no kcal figure are returned.
 */
export function guideNoticeText(
  e: DailyGuide['explanation'],
  goal: Profile['goal'],
  floorText: string | null,
  s: ProfileStrings,
): string | null {
  const raised = e.raisedByFloor;
  switch (e.notice) {
    case 'underweight':
    case 'pregnancyBreastfeeding':
    case 'belowFloor':
      if (!raised) return s.noticeHeld;
      return floorText === null ? null : fill(s.noticeHeldRaised, { floor: floorText });
    case 'olderAdult':
      if (!raised) return s.noticeOlder;
      return floorText === null ? null : fill(s.noticeOlderRaised, { floor: floorText });
    case 'noSurplus':
      return s.noticeGain;
    case 'bodyUnknown':
      return goal === 'gain' ? s.noticeBodyUnknownGain : s.noticeBodyUnknownLose;
    case null:
      if (e.flooredAt === null || floorText === null) return null;
      return fill(raised ? s.noticeFloorRaised : s.noticeFloor, { floor: floorText });
  }
}

/**
 * Settings, Profile, "Your daily guide": the energy and protein, the one-line reason when the guide
 * is held at maintenance, "How this is worked out", the person's own figure, and the BMI and
 * waist-to-height numbers behind a disclosure with their reference ranges written as text. Plain
 * numbers and text only: no colour, no label attached to the person (docs/adr/0008).
 */
export function ProfileGuideSection({
  profile,
  onProfile,
}: {
  readonly profile: Profile | undefined;
  readonly onProfile: <K extends keyof Profile>(key: K, value: Profile[K] | undefined) => void;
}) {
  const s = useStrings().profile;
  const { locale } = useLocale();
  const { profile: pref } = useSession();
  const showNumbers = useShowNumbers();
  const guide: DailyGuide = useSyncExternalStore(pref.subscribe, pref.guide);
  const body = useSyncExternalStore(pref.subscribe, pref.measurementList);
  const [custom, setCustom] = useState('');
  const [customError, setCustomError] = useState('');

  const e = guide.explanation;
  const floor = ENERGY_FLOOR_KCAL[profile?.sex ?? 'unspecified'];
  const floorText = showNumbers ? formatWhole(e.flooredAt ?? floor, locale) : null;
  const notice = guideNoticeText(e, profile?.goal, floorText, s);
  const weight = body.find((m) => m.kind === 'weight')?.value;
  const waist = body.find((m) => m.kind === 'waist')?.value;
  const bmi = bodyMassIndex(weight, profile?.heightCm);
  const whtr = waistToHeightRatio(waist, profile?.heightCm);

  const saveCustom = (): void => {
    const typed = parseTypedNumber(custom);
    if (typed === null) {
      setCustomError(fill(s.errorNumber, { example: '2000' }));
      return;
    }
    const rounded = Math.round(typed);
    const verdict = customEnergyVerdict(rounded, profile, weight);
    if (verdict === 'outOfRange') {
      setCustomError(
        fill(s.errorCustomRange, {
          min: formatWhole(CUSTOM_ENERGY_RANGE_KCAL.min, locale),
          max: formatWhole(CUSTOM_ENERGY_RANGE_KCAL.max, locale),
        }),
      );
      return;
    }
    if (verdict === 'belowFloor') {
      setCustomError(fill(s.errorCustomFloor, { floor: formatWhole(floor, locale) }));
      return;
    }
    if (verdict !== 'ok') {
      // A safeguard holds the guide at maintenance: a lower figure of one's own is not taken.
      setCustomError(s.errorCustomSafeguard);
      return;
    }
    setCustomError('');
    onProfile('customEnergyKcal', rounded);
  };

  const inputsText =
    e.equation === 'weightHeight'
      ? s.howInputsWeightHeight
      : e.equation === 'weightOnly'
        ? s.howInputsWeight
        : s.howInputsReference;
  const basisText = e.proteinOnBmi25
    ? s.howBasisBmi25
    : e.proteinCapped
      ? s.howBasisCapped
      : e.inputs.weightKg === undefined
        ? s.howBasisReference
        : s.howBasisWeight;
  const customReason =
    e.customRefused === null || e.customRefused === 'outOfRange'
      ? null
      : e.customRefused === 'belowFloor'
        ? 'floor'
        : 'safeguard';
  const decided = e.flooredAt !== null || e.notice !== null || e.customRefused !== null;
  const activityName = e.inputs.activity === undefined ? '' : s.activityOptions[e.inputs.activity];

  if (!showNumbers) {
    // Numbers are off: no kcal, protein, maintenance, BMI or ratio here. The calm notices stay.
    return (
      <Section title={s.guideTitle}>
        {notice !== null && <p className="text-body-small text-ink-soft">{notice}</p>}
        <p className="text-body-small text-ink-soft">
          {s.guideNumbersOff}{' '}
          <a
            href={hrefs.section(SECTIONS.nutrition)}
            className="inline-flex min-h-12 items-center underline underline-offset-4"
          >
            {s.guideNumbersOffLink}
          </a>
        </p>
      </Section>
    );
  }

  return (
    <Section title={s.guideTitle}>
      <Prose>
        {guide.personal
          ? fill(s.guideComplete, {
              energy: formatWhole(guide.targets.energyKcal, locale),
              protein: formatWhole(guide.targets.protein, locale),
            })
          : s.guideIncomplete}
      </Prose>
      {guide.personal && e.inputs.weightKg === undefined && e.basis === 'personal' && (
        <p className="text-body-small text-ink-soft">{s.guideMakePersonal}</p>
      )}
      {notice !== null && <p className="text-body-small text-ink-soft">{notice}</p>}
      {e.customRefused !== null && e.customRefused !== 'outOfRange' && (
        <p className="text-body-small text-ink-soft">
          {e.customRefused === 'belowFloor'
            ? fill(s.customRefused, { floor: formatWhole(floor, locale) })
            : s.customRefusedSafeguard}
        </p>
      )}

      {guide.personal && (
        <Disclosure summary={s.how}>
          {e.basis === 'custom' ? (
            <p>{s.howCustom}</p>
          ) : (
            <>
              <p>
                {fill(s.howResting, {
                  kcal: formatWhole(e.restingKcal ?? 0, locale),
                  inputs: inputsText,
                })}
              </p>
              <p>
                {fill(s.howActivity, {
                  pal: decimals(locale, 1).format(e.pal ?? 0),
                  activity: activityName,
                })}
              </p>
              <p>{fill(s.howMaintenance, { kcal: formatWhole(e.maintenanceKcal ?? 0, locale) })}</p>
              <p>
                {e.adjustmentKcal < 0
                  ? fill(s.howAdjustLess, { kcal: formatWhole(-e.adjustmentKcal, locale) })
                  : e.adjustmentKcal > 0
                    ? fill(s.howAdjustMore, { kcal: formatWhole(e.adjustmentKcal, locale) })
                    : s.howNone}
              </p>
              {e.flooredAt !== null && (e.raisedByFloor || e.notice === null) && (
                <p>
                  {fill(e.raisedByFloor ? s.howFloorRaised : s.howFloorLimited, {
                    floor: formatWhole(e.flooredAt, locale),
                  })}
                </p>
              )}
              {e.notice !== null && (
                <p>{e.notice === 'bodyUnknown' ? s.howHeldUnknown : s.howHeld}</p>
              )}
              {customReason === 'floor' && (
                <p>{fill(s.howCustomIgnoredFloor, { floor: formatWhole(floor, locale) })}</p>
              )}
              {customReason === 'safeguard' && <p>{s.howCustomIgnoredSafeguard}</p>}
              {decided && <p>{s.howSteps}</p>}
            </>
          )}
          <p>
            {fill(s.howProtein, {
              perKg: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
                e.proteinGPerKg,
              ),
              basis: basisText,
              grams: formatWhole(guide.targets.protein, locale),
            })}
          </p>
          <p>{fill(s.howOthers, { fibre: formatWhole(guide.targets.fibre, locale) })}</p>
          <p>{s.howAccuracy}</p>
        </Disclosure>
      )}

      <Disclosure summary={s.customToggle}>
        <p>{s.customHelp}</p>
        {profile?.customEnergyKcal !== undefined && e.customRefused === null && (
          <p>{fill(s.customActive, { kcal: formatWhole(profile.customEnergyKcal, locale) })}</p>
        )}
        <TextField
          label={s.customLabel}
          inputMode="decimal"
          autoComplete="off"
          value={custom}
          onChange={(ev) => setCustom(ev.target.value)}
          message={customError || undefined}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={saveCustom}>
            {s.customSave}
          </Button>
          {profile?.customEnergyKcal !== undefined && (
            <Button
              variant="secondary"
              onClick={() => {
                setCustom('');
                setCustomError('');
                onProfile('customEnergyKcal', undefined);
              }}
            >
              {s.customReset}
            </Button>
          )}
        </div>
      </Disclosure>

      <Disclosure summary={s.bmiToggle}>
        <p>{s.bmiIntro}</p>
        <p>
          {bmi === null ? s.bmiNeeds : fill(s.bmiValue, { value: decimals(locale, 1).format(bmi) })}
        </p>
        <p>{s.bmiRanges}</p>
        <p>{s.bmiCaveats}</p>
        {whtrApplies(bmi) ? (
          <>
            <p>
              {whtr === null
                ? s.whtrNeeds
                : fill(s.whtrValue, { value: decimals(locale, 2).format(whtr) })}
            </p>
            <p>{s.whtrRanges}</p>
          </>
        ) : (
          <p>{s.whtrNotUseful}</p>
        )}
      </Disclosure>
    </Section>
  );
}
