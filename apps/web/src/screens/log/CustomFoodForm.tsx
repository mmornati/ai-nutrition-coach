import { useEffect, useId, useRef } from 'react';
import {
  CUSTOM_NUTRIENT_FIELDS,
  type CustomBasis,
  type CustomFoodInput,
  type CustomFoodIssue,
  type CustomNutrientField,
} from '../../catalog';
import { TextField } from '../../components/primitives';
import { useStrings } from '../../i18n';
import { ChoiceGroup } from '../settings/ChoiceGroup';

/** The calm line for an issue, or `null` when there is nothing to say yet (a missing name). */
export function useIssueText(issue: CustomFoodIssue | null): string | null {
  const all = useStrings();
  if (issue === null) return null;
  const t = all.catalog.customIssues;
  switch (issue.kind) {
    case 'name':
      return null;
    case 'grams':
      return all.nutrition.gramsInvalid;
    case 'needsGrams':
      return t.needsGrams;
    case 'value':
      return t.value;
    case 'tooHigh':
      return t.tooHigh;
    case 'sugars':
      return t.sugars;
    case 'saturates':
      return t.saturates;
    case 'macros':
      return t.macros;
  }
}

const issueField = (issue: CustomFoodIssue | null): CustomNutrientField | 'grams' | null => {
  if (issue === null) return null;
  if (issue.kind === 'value' || issue.kind === 'tooHigh') return issue.field;
  if (issue.kind === 'grams' || issue.kind === 'needsGrams') return 'grams';
  if (issue.kind === 'sugars') return 'sugars';
  if (issue.kind === 'saturates') return 'saturatedFat';
  if (issue.kind === 'macros') return 'protein';
  return null;
};

/**
 * The optional weight and nutrition of a food: which basis the values are given on, the weight
 * (eaten, or of one serving) and the eight nutrient fields. No name field: the caller owns that.
 */
export function NutritionFields({
  value,
  onChange,
  issue,
}: {
  readonly value: CustomFoodInput;
  readonly onChange: (next: CustomFoodInput) => void;
  readonly issue: CustomFoodIssue | null;
}) {
  const c = useStrings().catalog;
  const message = useIssueText(issue);
  const bad = issueField(issue);
  const messageId = useId();
  const describedBy = (field: CustomNutrientField | 'grams') =>
    bad === field && message !== null ? messageId : undefined;
  const basisChoices: readonly { value: CustomBasis; label: string }[] = [
    { value: 'per100g', label: c.customPer100 },
    { value: 'perServing', label: c.customPerServing },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-small text-ink-soft">{c.customOptional}</p>
      <ChoiceGroup
        label={c.customBasis}
        choices={basisChoices}
        value={value.basis}
        onChange={(basis) => onChange({ ...value, basis })}
      />
      <TextField
        label={value.basis === 'per100g' ? c.customGramsEaten : c.customGramsServing}
        value={value.grams}
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={bad === 'grams' ? true : undefined}
        aria-describedby={describedBy('grams')}
        onChange={(e) => onChange({ ...value, grams: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        {CUSTOM_NUTRIENT_FIELDS.map((field) => (
          <TextField
            key={field}
            label={c.customFields[field]}
            value={value.values[field] ?? ''}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={bad === field ? true : undefined}
            aria-describedby={describedBy(field)}
            onChange={(e) =>
              onChange({ ...value, values: { ...value.values, [field]: e.target.value } })
            }
          />
        ))}
      </div>
      <p id={messageId} role="status" className="text-body-small text-ink-soft empty:hidden">
        {message}
      </p>
    </div>
  );
}

/** A custom food: its name, then the optional weight and nutrition in a disclosure. */
export function CustomFoodForm({
  value,
  onChange,
  issue,
}: {
  readonly value: CustomFoodInput;
  readonly onChange: (next: CustomFoodInput) => void;
  readonly issue: CustomFoodIssue | null;
}) {
  const s = useStrings();
  const c = s.catalog;
  const details = useRef<HTMLDetailsElement>(null);
  // The reason Log is off can sit in the folded part: open it so the message and the field it
  // points at are on screen. It stays open afterwards (the person may be mid-correction).
  const inDetails = issue !== null && issue.kind !== 'name';
  useEffect(() => {
    if (inDetails && details.current) details.current.open = true;
  }, [inDetails, issue]);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-small text-ink-soft">{c.customHint}</p>
      <TextField
        label={c.customFoodName}
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
      />
      <details ref={details} className="group text-ink">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 py-3 text-lead underline underline-offset-4 [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden="true"
            className="border-ink-soft size-2 shrink-0 -rotate-45 border-r-2 border-b-2 transition-transform group-open:rotate-45"
          />
          <span>{c.customDetails}</span>
        </summary>
        <NutritionFields value={value} onChange={onChange} issue={issue} />
      </details>
    </div>
  );
}
