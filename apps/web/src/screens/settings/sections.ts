/** The sub-routes of `#/settings/<section>`. `#/privacy` is the same page as `privacy`. */
export const SECTIONS = {
  ai: 'ai',
  data: 'data',
  privacy: 'privacy',
  language: 'language',
  nutrition: 'nutrition',
  profile: 'profile',
  saved: 'saved',
  install: 'install',
  about: 'about',
} as const;

export type SettingsSection = (typeof SECTIONS)[keyof typeof SECTIONS];

export function parseSection(raw: string | null): SettingsSection | null {
  return (Object.values(SECTIONS) as string[]).includes(raw ?? '')
    ? (raw as SettingsSection)
    : null;
}
