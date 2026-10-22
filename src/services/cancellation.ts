import { YuzuhaError } from '../shared/errors.js';

export function cancellationError(): YuzuhaError {
  return new YuzuhaError('EXECUTION_ABORTED', 'Execução cancelada.');
}

export function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => { signal.removeEventListener('abort', abort); reject(cancellationError()); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    operation.then(value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
