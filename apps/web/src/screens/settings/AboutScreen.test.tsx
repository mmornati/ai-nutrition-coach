// Port of the earlier client.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { en } from '../../i18n/en';
import { renderInSession, unlockedBundle } from '../../app/testing';
import { ZXING_VERSION } from '../../barcode/zxing-pin';
import { AboutScreen, LICENCE_FILES } from './AboutScreen';

async function open() {
  const bundle = await unlockedBundle();
  await renderInSession(<AboutScreen />, { bundle });
  await screen.findByRole('heading', { level: 1, name: 'About' });
}

describe('AboutScreen', () => {
  it('renders the v2 managed-oversight line as plain "not in v1"', async () => {
    await open();
    expect(screen.getByText(/Family oversight is a v2 seam/)).toBeVisible();
    expect(en.aboutScreen.v2Notice.toLowerCase()).toContain('not in v1');
    const text = document.body.textContent?.toLowerCase() ?? '';
    expect(text).not.toContain('coming soon');
    expect(text).not.toMatch(/\d+\s*(days|weeks|months)/);
  });

  it('renders the open-source footmark', async () => {
    await open();
    expect(screen.getAllByText('yours to run · open source').length).toBeGreaterThan(0);
  });

  it('lists the licences, including Schibsted Grotesk under the SIL Open Font Licence, with a same-origin text', async () => {
    await open();
    const licences = screen.getByRole('heading', { level: 2, name: 'Open-source licences' });
    expect(licences).toBeVisible();
    expect(screen.getByText('Schibsted Grotesk (font)')).toBeVisible();
    expect(screen.getByText('SIL Open Font License 1.1')).toBeVisible();
    const link = screen.getByRole('link', {
      name: 'Read the licence: Schibsted Grotesk (font)',
    });
    expect(link.getAttribute('href')).toMatch(/^\/fonts\/OFL\.txt$/);
    // Never an off-origin link.
    for (const a of screen.getAllByRole('link')) {
      expect(a.getAttribute('href') ?? '').not.toMatch(/^[a-z]+:\/\//i);
    }
  });

  it('every listed licence links to its full text, a same-origin file that ships in public/', async () => {
    await open();
    const rows = en.aboutScreen.licences;
    expect(rows.map((r) => r.id).sort()).toEqual(Object.keys(LICENCE_FILES).sort());
    for (const row of rows) {
      const link = screen.getByRole('link', { name: `Read the licence: ${row.name}` });
      const href = link.getAttribute('href') ?? '';
      expect(href, row.name).toBe(LICENCE_FILES[row.id]);
      expect(href).toMatch(/^\/(licenses|fonts)\/[\w.-]+\.txt$/);
      // Precached by the service worker: the build globs `*.txt` from public/.
      const file = join(__dirname, '../../../public', href);
      expect(existsSync(file), href).toBe(true);
      expect(readFileSync(file, 'utf8').length, href).toBeGreaterThan(500);
    }
  });

  it('the shipped licence texts are the real ones', () => {
    const pub = join(__dirname, '../../../public');
    const read = (p: string) => readFileSync(p, 'utf8');
    // The app's own licence is the repository's.
    expect(read(join(pub, 'licenses/app-MIT.txt'))).toBe(
      read(join(__dirname, '../../../../../LICENSE')),
    );
    // React's is the installed package's.
    const reactLicence = join(
      dirname(createRequire(import.meta.url).resolve('react/package.json')),
      'LICENSE',
    );
    expect(read(join(pub, 'licenses/react-MIT.txt'))).toBe(read(reactLicence));
    // zxing-wasm's is the one the pinned tarball ships (fetched into public/zxing/ at build).
    const fetched = join(pub, 'zxing', ZXING_VERSION, 'LICENSE');
    if (existsSync(fetched)) {
      expect(read(join(pub, 'licenses/zxing-wasm-MIT.txt'))).toBe(read(fetched));
    }
    expect(read(join(pub, 'licenses/zxing-cpp-Apache-2.0.txt'))).toContain(
      'Apache License\n                           Version 2.0, January 2004',
    );
    const sqlite = read(join(pub, 'licenses/sqlite3-multiple-ciphers.txt'));
    expect(sqlite).toContain('MIT License');
    expect(sqlite).toMatch(/public domain/i);
    const ciqual = read(join(pub, 'licenses/ciqual-Etalab-2.0.txt'));
    expect(ciqual).toContain(
      'Anses. 2025. Table de composition nutritionnelle des aliments Ciqual',
    );
    expect(ciqual).toContain('Open Licence');
    expect(read(join(pub, 'fonts/OFL.txt'))).toContain('SIL Open Font License');
  });

  it('has no tip jar or donation surface', async () => {
    await open();
    expect(document.body.textContent?.toLowerCase()).not.toMatch(/tip jar|donat/);
  });

  it('has no axe violations', async () => {
    const bundle = await unlockedBundle();
    await renderInSession(<AboutScreen />, { bundle });
    await screen.findByRole('heading', { level: 1, name: 'About' });
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
