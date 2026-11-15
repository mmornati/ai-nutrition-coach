import { useMemo } from 'react';
import { DepartureBoard, type DepartureRow } from '../../components/shell';
import { useStrings } from '../../i18n';
import { rungStatusLine, useYourAi } from '../../ai';
import { hrefs, navigate } from '../../app/router';
import { SettingsPage } from './SettingsPage';
import { SECTIONS } from './sections';

/**
 * Settings, in four groups under their own headings (You, Coach and AI, Data and privacy, App),
 * Profile first: one row per place, a title, a calm subtitle (the Your AI row shows the live rung)
 * and a chevron. No tip jar, no toggles here (the one switch lives in Nutrition).
 */
export function SettingsList() {
  const all = useStrings();
  const s = all.settings;
  const { settings, keyStatus, instance } = useYourAi();
  const aiLine = rungStatusLine(settings, keyStatus.hasKey, instance.config);

  const groups = useMemo(() => {
    const go = (section: string) => () => navigate(hrefs.section(section));
    const row = (id: string, title: string, subtitle: string): DepartureRow => ({
      id,
      title,
      subtitle,
      status: '',
      onSelect: go(id),
    });
    return [
      {
        id: 'you',
        title: s.groupYou,
        rows: [
          row(SECTIONS.profile, s.rowProfile, s.rowProfileSubtitle),
          row(SECTIONS.nutrition, s.rowNutrition, s.rowNutritionSubtitle),
          row(SECTIONS.language, s.rowLanguage, s.rowLanguageSubtitle),
        ],
      },
      {
        id: 'coach',
        title: s.groupCoach,
        rows: [row(SECTIONS.ai, s.rowAi, aiLine)],
      },
      {
        id: 'data',
        title: s.groupData,
        rows: [
          row(SECTIONS.data, s.rowData, s.rowDataSubtitle),
          row(SECTIONS.privacy, s.rowPrivacy, s.rowPrivacySubtitle),
          row(SECTIONS.saved, s.rowSaved, s.rowSavedSubtitle),
        ],
      },
      {
        id: 'app',
        title: s.groupApp,
        rows: [
          row(SECTIONS.install, s.rowInstall, s.rowInstallSubtitle),
          row(SECTIONS.about, s.rowAbout, s.rowAboutSubtitle),
        ],
      },
    ];
  }, [s, aiLine]);

  return (
    <SettingsPage title={s.title} backTo="today">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`settings-group-${group.id}`}>
          <h2 id={`settings-group-${group.id}`} className="font-display text-section text-thread">
            {group.title}
          </h2>
          <DepartureBoard rows={group.rows} className="border-ink mt-2 border-t-2" />
        </section>
      ))}
      <p className="font-display text-ink-soft text-aside">{all.shell.footmark}</p>
    </SettingsPage>
  );
}
