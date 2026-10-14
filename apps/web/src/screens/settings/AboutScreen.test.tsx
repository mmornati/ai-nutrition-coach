// Port of apps/client/test/screens/about_screen_test.dart.
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { en } from '../../i18n/en';
import { renderInSession, unlockedBundle } from '../../app/testing';
import { AboutScreen } from './AboutScreen';

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

  it('lists the licences, including Barlow under the SIL Open Font Licence, with a same-origin text', async () => {
    await open();
    const licences = screen.getByRole('heading', { level: 2, name: 'Open-source licences' });
    expect(licences).toBeVisible();
    expect(screen.getByText('Barlow and Barlow Condensed (fonts)')).toBeVisible();
    expect(screen.getByText('SIL Open Font License 1.1')).toBeVisible();
    const link = screen.getByRole('link', {
      name: 'Read the licence: Barlow and Barlow Condensed (fonts)',
    });
    expect(link.getAttribute('href')).toMatch(/^\/fonts\/OFL\.txt$/);
    // Never an off-origin link.
    for (const a of screen.getAllByRole('link')) {
      expect(a.getAttribute('href') ?? '').not.toMatch(/^[a-z]+:\/\//i);
    }
  });

  it('has no tip jar or donation surface', async () => {
    await open();
    expect(document.body.textContent?.toLowerCase()).not.toMatch(/tip jar|donat/);
  });

  it('has no axe violations', async () => {
    await open();
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
