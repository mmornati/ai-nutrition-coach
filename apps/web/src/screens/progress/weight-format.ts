import type { UnitSystem } from '@anc/core';
import type { Locale } from '../../i18n/locale';
import type { Strings } from '../../i18n';
import { cmToInches, kgToLb } from '../settings/body-input';

/** A no-break space and a narrow one (French puts one before a percent sign), spelt by code. */
export const NBSP = String.fromCharCode(0xa0);
const NNBSP = String.fromCharCode(0x202f);

const decimals = (locale: Locale, digits: number) =>
  new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** A weight in the person's units, as a number and as text with its unit: "81,6 kg", "180 lb". */
export function weightText(
  kg: number,
  units: UnitSystem,
  locale: Locale,
  s: Strings['profile'],
): string {
  const imperial = units === 'imperial';
  const value = imperial ? kgToLb(kg) : Math.round(kg * 10) / 10;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}${NBSP}${imperial ? s.unitLb : s.unitKg}`;
}

/** The size of a change without its sign, one decimal, with the unit: "0,4 kg". */
export function amountText(
  kg: number,
  units: UnitSystem,
  locale: Locale,
  s: Strings['profile'],
): string {
  const imperial = units === 'imperial';
  const value = Math.abs(imperial ? kgToLb(kg) : kg);
  return `${decimals(locale, 1).format(value)}${NBSP}${imperial ? s.unitLb : s.unitKg}`;
}

/** A percentage with one decimal: "0,5 %" (a narrow no-break space in French). */
export function percentText(pct: number, locale: Locale): string {
  const space = locale === 'fr' ? NNBSP : NBSP;
  return `${decimals(locale, 1).format(Math.abs(pct))}${space}%`;
}

/** A weight value in the person's units as a plain number (for chart axes). */
export const weightValue = (kg: number, units: UnitSystem): number =>
  units === 'imperial' ? kgToLb(kg) : kg;

/** Whether a change of `kg` shows as zero at the one decimal it is written with. */
export const changeIsZero = (kg: number, units: UnitSystem): boolean =>
  Math.round(Math.abs(units === 'imperial' ? kgToLb(kg) : kg) * 10) === 0;

/** A waist in the person's units (cm or inches), one decimal, with the unit. */
export function waistText(
  cm: number,
  units: UnitSystem,
  locale: Locale,
  s: Strings['profile'],
): string {
  const imperial = units === 'imperial';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(imperial ? cmToInches(cm) : cm)}${NBSP}${imperial ? s.unitIn : s.unitCm}`;
}
