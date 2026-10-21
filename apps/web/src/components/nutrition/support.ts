import type { Locale } from '../../i18n/locale';

/**
 * Where "talking to someone can help" points, one well-known organisation per language
 * (docs/no-dark-patterns-standard.md, "Support": URLs and verification date). Opened in a new tab;
 * never fetched by the app. The exact URLs are allow-listed in tools/check_no_external_hosts.sh.
 */
export const SUPPORT_URL: Readonly<Record<Locale, string>> = {
  en: 'https://www.beateatingdisorders.org.uk/get-information-and-support/get-help-for-myself/support-now/',
  fr: 'https://www.ffab.fr/trouver-de-l-aide/permanence-telephonique',
};
