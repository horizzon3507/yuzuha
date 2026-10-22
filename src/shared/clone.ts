/** Avoids the structured-clone machinery for immutable primitive values. */
export function cloneValue<T>(value: T): T {
  return value === null || (typeof value !== 'object' && typeof value !== 'function' && typeof value !== 'symbol')
    ? value : structuredClone(value);
}
