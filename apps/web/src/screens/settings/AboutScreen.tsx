import { fill, useStrings } from '../../i18n';
import { Prose, Section, SettingsPage } from './SettingsPage';

/** Licence texts that ship with the app (same origin, precached), by licence row id. */
const base = import.meta.env.BASE_URL;
export const LICENCE_FILES: Readonly<Record<string, string>> = {
  app: `${base}licenses/app-MIT.txt`,
  react: `${base}licenses/react-MIT.txt`,
  zxing: `${base}licenses/zxing-wasm-MIT.txt`,
  zxingcpp: `${base}licenses/zxing-cpp-Apache-2.0.txt`,
  sqlite: `${base}licenses/sqlite3-multiple-ciphers.txt`,
  ciqual: `${base}licenses/ciqual-Etalab-2.0.txt`,
  fonts: `${base}fonts/OFL.txt`,
};

/**
 * Settings, About. The v2 managed-oversight line (plainly "not in v1": never "coming soon",
 * never a countdown), the open-source footmark and the licences, including Barlow's SIL OFL.
 */
export function AboutScreen() {
  const s = useStrings().aboutScreen;
  return (
    <SettingsPage title={s.title}>
      <Prose>{s.v2Notice}</Prose>
      <p className="font-display text-porcelain-dim text-aside tracking-[0.1em] uppercase">
        {s.openSource}
      </p>
      <Section title={s.licencesHeading}>
        <ul className="flex flex-col">
          {s.licences.map((licence) => {
            const href = LICENCE_FILES[licence.id];
            return (
              <li key={licence.id} className="border-rule flex flex-col gap-0.5 border-b py-3">
                <span className="font-display text-title uppercase">{licence.name}</span>
                <span className="text-porcelain-dim text-body-small">{licence.licence}</span>
                {href !== undefined && (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener"
                    aria-label={fill(s.licenceLinkFor, { name: licence.name })}
                    className="text-porcelain inline-flex min-h-12 items-center self-start underline underline-offset-4"
                  >
                    {s.licenceLink}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </Section>
    </SettingsPage>
  );
}
