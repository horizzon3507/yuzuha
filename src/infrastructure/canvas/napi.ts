import { YuzuhaError } from '../../shared/errors.js';

export function canvasDependency(): YuzuhaError {
  return new YuzuhaError('CANVAS_DEPENDENCY', 'Instale @napi-rs/canvas@^1.0.13 para renderizar imagens com yuzuha/canvas.');
}

let loaded: typeof import('@napi-rs/canvas') | undefined;
try {
  const module = await import('@napi-rs/canvas') as unknown as Record<string, unknown>;
  loaded = (module.createCanvas ? module : module.default) as typeof import('@napi-rs/canvas');
} catch (cause) {
  const code = (cause as NodeJS.ErrnoException)?.code;
  const message = cause instanceof Error ? cause.message : String(cause);
  if (code !== 'ERR_MODULE_NOT_FOUND' || !message.includes('@napi-rs/canvas')) throw cause;
}

export const napi = loaded;
