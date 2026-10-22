export type SavedFailureReason = 'locked' | 'invalid' | 'storeOperation';

/** The outcome of a saved-meal or recipe operation: a value, or a typed reason (never a throw). */
export type SavedResult<T> =
  | { readonly kind: 'saved'; readonly value: T }
  | { readonly kind: 'savedFailed'; readonly reason: SavedFailureReason };

export const savedOk = <T>(value: T): SavedResult<T> => ({ kind: 'saved', value });
export const savedFailed = (reason: SavedFailureReason): SavedResult<never> => ({
  kind: 'savedFailed',
  reason,
});
