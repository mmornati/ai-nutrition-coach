import { useMemo } from 'react';
import { DepartureBoard, type DepartureRow } from '../../components/shell';
import { useStrings } from '../../i18n';
import { rungStatusLine, useYourAi } from '../../ai';
import { hrefs, navigate } from '../../app/router';
import { SettingsPage } from './SettingsPage';
import { SECTIONS } from './sections';

/**
 * Settings, as a departures board: one row per place, a line segment, a title, a calm subtitle
 * (the Your AI row shows the live rung) and a chevron. No tip jar, no toggles here (the one switch lives in Nutrition).
 */
export function SettingsList() {
  const all = useStrings();
  const s = all.settings;
  const { settings, keyStatus, instance } = useYourAi();
  const aiLine = rungStatusLine(settings, keyStatus.hasKey, instance.config);

  const rows = useMemo<readonly DepartureRow[]>(() => {
    const go = (section: string) => () => navigate(hrefs.section(section));
    return [
      {
        id: SECTIONS.ai,
        line: 'dairy',
        title: s.rowAi,
        subtitle: aiLine,
        status: '',
        onSelect: go(SECTIONS.ai),
      },
      {
        id: SECTIONS.data,
        line: 'vegFruit',
        title: s.rowData,
        subtitle: s.rowDataSubtitle,
        status: '',
        onSelect: go(SECTIONS.data),
      },
      {
        id: SECTIONS.privacy,
        line: 'protein',
        title: s.rowPrivacy,
        subtitle: s.rowPrivacySubtitle,
        status: '',
        onSelect: go(SECTIONS.privacy),
      },
      {
        id: SECTIONS.language,
        line: 'vegFruit',
        title: s.rowLanguage,
        subtitle: s.rowLanguageSubtitle,
        status: '',
        onSelect: go(SECTIONS.language),
      },
      {
        id: SECTIONS.nutrition,
        line: 'protein',
        title: s.rowNutrition,
        subtitle: s.rowNutritionSubtitle,
        status: '',
        onSelect: go(SECTIONS.nutrition),
      },
      {
        id: SECTIONS.install,
        line: 'starch',
        title: s.rowInstall,
        subtitle: s.rowInstallSubtitle,
        status: '',
        onSelect: go(SECTIONS.install),
      },
      {
        id: SECTIONS.about,
        line: 'other',
        title: s.rowAbout,
        subtitle: s.rowAboutSubtitle,
        status: '',
        onSelect: go(SECTIONS.about),
      },
    ];
  }, [s, aiLine]);

  return (
    <SettingsPage title={s.title} backTo="today">
      <DepartureBoard rows={rows} className="mt-0" />
      <p className="font-display text-porcelain-dim text-aside tracking-[0.1em] uppercase">
        {all.shell.footmark}
      </p>
    </SettingsPage>
  );
}
