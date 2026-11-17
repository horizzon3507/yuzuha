export const CLONE_TARGET = Symbol('yuzuha.cloneTarget');

/** Avoids the structured-clone machinery for immutable primitive values and supports COW snapshots. */
export function cloneValue<T>(value: T): T {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function' && typeof value !== 'symbol')) {
    return value;
  }
  const cloneTarget = (value as { [CLONE_TARGET]?: () => T })[CLONE_TARGET];
  if (typeof cloneTarget === 'function') return cloneTarget();
  return structuredClone(value);
}
