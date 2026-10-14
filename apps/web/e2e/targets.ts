// Real-browser measurement helpers shared by the e2e specs.
import { type Page } from '@playwright/test';

/**
 * Every interactive element that is rendered must have a hit area of at least 48 x 48 CSS px.
 * Exemptions (WCAG 2.5.8 "inline"): a text link inside a sentence of running text, and the
 * visually-hidden native input of a label/switch whose visible control is measured instead.
 * Returns one line per offender.
 */
export async function undersizedTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const MIN = 47.5;
    const selector =
      'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [tabindex]:not([tabindex="-1"])';
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (el.closest('[aria-hidden="true"], [inert]')) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type)) {
        // Native input kept for semantics; its label (or the control around it) is the target.
        const label = el.closest('label');
        if (label) {
          const l = label.getBoundingClientRect();
          if (l.width >= MIN && l.height >= MIN) continue;
        }
      }
      if (el.tagName === 'A' && el.closest('p, li')) {
        // Inline link in running text: exempt only when it shares its block with other text.
        const block = el.closest('p, li') as HTMLElement;
        if ((block.textContent ?? '').trim().length > (el.textContent ?? '').trim().length + 3) {
          continue;
        }
      }
      if (rect.width < MIN || rect.height < MIN) {
        const name =
          el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 40) ?? '';
        out.push(
          `${el.tagName.toLowerCase()} "${name}" ${Math.round(rect.width * 10) / 10}x${Math.round(rect.height * 10) / 10}`,
        );
      }
    }
    return out;
  });
}
