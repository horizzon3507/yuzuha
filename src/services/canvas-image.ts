import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CANVAS_LIMITS, inspectCanvasImage } from '../domain/canvas.js';
import { YuzuhaError } from '../shared/errors.js';
import { HttpService } from './http.js';

type Napi = typeof import('@napi-rs/canvas');
export type CanvasLoadImageSource = Parameters<Napi['loadImage']>[0];
export interface CanvasLoadImageOptions { http?: HttpService; signal?: AbortSignal; timeoutMs?: number }

const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2']);

function remote(source: CanvasLoadImageSource): string | undefined {
  if (typeof source === 'string' && /^https?:\/\//i.test(source)) return source;
  if (source instanceof URL && (source.protocol === 'http:' || source.protocol === 'https:')) return source.toString();
}

function combinedSignal(options: CanvasLoadImageOptions): AbortSignal | undefined {
  const signals = [options.signal, options.timeoutMs !== undefined ? AbortSignal.timeout(options.timeoutMs) : undefined]
    .filter((signal): signal is AbortSignal => signal !== undefined);
  return signals.length > 1 ? AbortSignal.any(signals) : signals[0];
}

export async function loadCanvasImage(napi: Napi, source: CanvasLoadImageSource, options: CanvasLoadImageOptions = {}) {
  const url = remote(source);
  if (!url) return napi.loadImage(source);
  const http = options.http ?? new HttpService();
  const response = await http.requestBytes({ method: 'GET', url, signal: combinedSignal(options) });
  if (!response.ok) throw new YuzuhaError('CANVAS_ASSET', `Download de imagem retornou HTTP ${response.status}.`);
  const data = new Uint8Array(response.body);
  if (data.byteLength > CANVAS_LIMITS.maxItemBytes) throw new YuzuhaError('EXECUTION_LIMIT', 'Imagem excede 10 MB.');
  inspectCanvasImage(data);
  return napi.loadImage(Buffer.from(data));
}

export function registerCanvasFonts(napi: Napi, dir: string): number {
  let entries;
  try {
    const info = statSync(dir);
    if (!info.isDirectory()) throw new YuzuhaError('CANVAS_OPTIONS', 'registerFonts exige um diretório.');
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException)?.code === 'ENOENT') return 0;
    throw cause;
  }
  let count = 0;
  for (const entry of entries) {
    const extension = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
    if (!entry.isFile() || !FONT_EXTENSIONS.has(extension)) continue;
    const alias = entry.name.slice(0, entry.name.lastIndexOf('.'));
    if (napi.GlobalFonts.registerFromPath(join(dir, entry.name), alias)) count++;
  }
  return count;
}
