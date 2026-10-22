/** The HKDF `info` that separates the backup-file key from any other key made from the same master. */
export const BACKUP_KDF_INFO = 'anc/vault/backup-file';

/** The file extension of an encrypted backup. */
export const BACKUP_EXTENSION = 'ancvault';

/** Not a registered type: a browser must not guess a text type and rename or open the file. */
export const BACKUP_MIME_TYPE = 'application/octet-stream';
