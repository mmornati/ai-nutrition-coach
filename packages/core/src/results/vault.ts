export type VaultFailureReason =
  'locked' | 'invalid' | 'schemaTooNew' | 'clockAhead' | 'storeOperation';

/** The outcome of reading or applying a vault snapshot: a value, or a typed reason (never a throw). */
export type VaultResult<T> =
  | { readonly kind: 'vault'; readonly value: T }
  | { readonly kind: 'vaultFailed'; readonly reason: VaultFailureReason };

export const vaultOk = <T>(value: T): VaultResult<T> => ({ kind: 'vault', value });
export const vaultFailed = (reason: VaultFailureReason): VaultResult<never> => ({
  kind: 'vaultFailed',
  reason,
});
