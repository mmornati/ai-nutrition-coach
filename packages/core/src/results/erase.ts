export const ERASE_STEPS = ['closeStore', 'databaseFiles', 'secureStorage', 'exportFiles'] as const;
export type EraseStep = (typeof ERASE_STEPS)[number];

export type EraseLocalDataResult =
  | { readonly kind: 'eraseLocalDataSuccess' }
  | { readonly kind: 'eraseLocalDataFailure'; readonly failedSteps: readonly EraseStep[] };

export const ERASE_SUCCESS: EraseLocalDataResult = Object.freeze({ kind: 'eraseLocalDataSuccess' });

export function eraseLocalDataFailure(failedSteps: Iterable<EraseStep>): EraseLocalDataResult {
  return { kind: 'eraseLocalDataFailure', failedSteps: Object.freeze([...failedSteps]) };
}

/** Failure equality ignores step order and duplicates. */
export function eraseResultEquals(a: EraseLocalDataResult, b: EraseLocalDataResult): boolean {
  if (a.kind === 'eraseLocalDataSuccess' || b.kind === 'eraseLocalDataSuccess') {
    return a.kind === b.kind;
  }
  const x = new Set(a.failedSteps);
  const y = new Set(b.failedSteps);
  return x.size === y.size && [...x].every((s) => y.has(s));
}
