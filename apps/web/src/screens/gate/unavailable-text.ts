import type { Strings } from '../../i18n';
import type { UnavailableReason } from '../../storage';

/**
 * The calm line for "this browser cannot use its protected storage right now". Plain http:// is
 * the one reason with its own explanation (the page needs https:// or localhost); the rest share
 * the general line. It is never "wrong passphrase" and never offers the erase.
 */
export function unavailableText(
  reason: UnavailableReason | null,
  s: Pick<Strings['session'], 'unavailable' | 'unavailableInsecure' | 'inOtherTab'>,
): string {
  if (reason === 'insecureContext') return s.unavailableInsecure;
  if (reason === 'inUse') return s.inOtherTab;
  return s.unavailable;
}
