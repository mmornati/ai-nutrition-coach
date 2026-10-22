// One calm line per way a backup can fail to open, shared by the two places that restore (Your
// data and the create-passphrase screen). Every line says nothing was changed.

import type { Strings } from '../../i18n';
import type { OpenFailure } from './open-file';

export function openFailureText(failure: OpenFailure, s: Strings['restore']): string {
  switch (failure) {
    case 'wrongPassphraseOrDamaged':
      return s.wrongOrDamaged;
    case 'notABackup':
      return s.notABackup;
    case 'tooLarge':
      return s.tooLarge;
    case 'schemaTooNew':
      return s.newerVersion;
    case 'invalidContent':
      return s.invalidContent;
    case 'unreadable':
      return s.unreadable;
    case 'unavailable':
      return s.unavailable;
  }
}
