// Settings and its sub-screens, by the sub-route of `#/settings/<section>`:
//
//   (none)   the departures board           ai       Your AI
//   data     Your data                      privacy  What this app stores and sends
//   install  Install on your phone          about    About
//   language Language                       nutrition Nutrition numbers  profile  Optional profile
//
// `#/privacy` is the same Privacy page and is the one screen reachable BEFORE the unlock, when
// there is no session (and so no shell, no AI services and no Open Food Facts switch). Everything
// else needs the session. An unknown section is the list: a malformed address never strands anyone.
import { AiProvider } from '../../ai';
import { useSessionOptional, type Session } from '../../app/session';
import { AboutScreen } from './AboutScreen';
import { InstallScreen } from './InstallScreen';
import { LanguageScreen } from './LanguageScreen';
import { NutritionScreen } from './NutritionScreen';
import { ProfileScreen } from './ProfileScreen';
import { parseSection, SECTIONS } from './sections';
import { PrivacyScreen } from './PrivacyScreen';
import { SettingsList } from './SettingsList';
import { YourAiScreen } from './YourAiScreen';
import { YourDataScreen } from './YourDataScreen';

function SessionSection({
  session,
  section,
}: {
  readonly session: Session;
  readonly section: string | null;
}) {
  const parsed = parseSection(section);
  const screen = (() => {
    switch (parsed) {
      case SECTIONS.ai:
        return <YourAiScreen />;
      case SECTIONS.data:
        return <YourDataScreen />;
      case SECTIONS.privacy:
        return <PrivacyScreen />;
      case SECTIONS.language:
        return <LanguageScreen />;
      case SECTIONS.nutrition:
        return <NutritionScreen />;
      case SECTIONS.profile:
        return <ProfileScreen />;
      case SECTIONS.install:
        return <InstallScreen />;
      case SECTIONS.about:
        return <AboutScreen />;
      case null:
        return <SettingsList />;
    }
  })();
  return <AiProvider services={session.ai}>{screen}</AiProvider>;
}

export function SettingsScreen(props: { readonly section: string | null }) {
  const session = useSessionOptional();
  if (session === null) return <PrivacyScreen />;
  return <SessionSection session={session} section={props.section} />;
}
