import { createHash } from 'node:crypto';
import { YuzuhaError } from '../shared/errors.js';

export type CanvasFormat = 'png' | 'jpeg' | 'webp';
export type CanvasSource = Uint8Array | string;
export type CanvasColor = string;

export interface CanvasGradientStop { offset: number; color: CanvasColor }
export interface CanvasLinearGradient {
  type: 'linear'; x0: number; y0: number; x1: number; y1: number; stops: CanvasGradientStop[];
}
export interface CanvasRadialGradient {
  type: 'radial'; x0: number; y0: number; r0: number; x1: number; y1: number; r1: number; stops: CanvasGradientStop[];
}
export type CanvasGradient = CanvasLinearGradient | CanvasRadialGradient;
export type CanvasFill = CanvasColor | CanvasGradient;

export interface CanvasShadow { color: CanvasColor; blur: number; offsetX: number; offsetY: number }
export interface CanvasPaintOptions { opacity?: number; shadow?: CanvasShadow }
export interface CanvasCreateOptions { scale?: number; background?: CanvasColor }
export interface CanvasFontOptions { weight?: 400 | 700 }

export interface CanvasRectOptions extends CanvasPaintOptions {
  x: number; y: number; width: number; height: number;
  fill?: CanvasFill; stroke?: CanvasColor; strokeWidth?: number; radius?: number;
}
export interface CanvasCircleOptions extends CanvasPaintOptions {
  x: number; y: number; radius: number; fill?: CanvasFill; stroke?: CanvasColor; strokeWidth?: number;
}
export interface CanvasLineOptions extends CanvasPaintOptions {
  x1: number; y1: number; x2: number; y2: number; width?: number; color?: CanvasColor; cap?: 'butt' | 'round' | 'square';
}
export interface CanvasImageOptions extends CanvasPaintOptions {
  x: number; y: number; width: number; height: number;
  fit?: 'cover' | 'contain' | 'stretch'; cropX?: number; cropY?: number;
  clip?: 'rect' | 'rounded' | 'circle'; radius?: number; border?: { color: CanvasColor; width: number };
}
export interface CanvasAvatarOptions extends CanvasPaintOptions {
  x: number; y: number; size: number; border?: { color: CanvasColor; width: number };
}
export interface CanvasTextOptions extends CanvasPaintOptions {
  x: number; y: number; maxWidth?: number; fontSize?: number; minFontSize?: number; family?: string;
  weight?: 400 | 700; color?: CanvasColor; align?: 'left' | 'center' | 'right';
  wrap?: 'none' | 'word'; maxLines?: number; lineHeight?: number; overflow?: 'ellipsis' | 'clip' | 'error';
}
export interface CanvasBadgeItem { text: string; icon?: CanvasSource; selected?: boolean }
export interface CanvasBadgesOptions extends CanvasPaintOptions {
  x: number; y: number; maxWidth: number; height?: number; gap?: number; paddingX?: number;
  radius?: number; fill?: CanvasColor; selectedFill?: CanvasColor; color?: CanvasColor;
  selectedColor?: CanvasColor; fontSize?: number; weight?: 400 | 700;
}
export interface CanvasProgressOptions extends CanvasPaintOptions {
  x: number; y: number; width: number; height: number; value: number; max: number;
  fill?: CanvasFill; background?: CanvasFill; radius?: number;
}

export type CanvasOperation =
  | { type: 'rect'; options: CanvasRectOptions }
  | { type: 'circle'; options: CanvasCircleOptions }
  | { type: 'line'; options: CanvasLineOptions }
  | { type: 'image'; source: CanvasSource; options: CanvasImageOptions }
  | { type: 'avatar'; source: CanvasSource; options: CanvasAvatarOptions }
  | { type: 'text'; value: string; options: CanvasTextOptions }
  | { type: 'badges'; items: CanvasBadgeItem[]; options: CanvasBadgesOptions }
  | { type: 'progress'; options: CanvasProgressOptions };

export interface CanvasFontSource { family: string; source: CanvasSource; weight: 400 | 700 }
export interface CanvasConfiguredFont { regular: CanvasSource; bold?: CanvasSource }
export interface CanvasConfig {
  assets?: Record<string, Uint8Array>;
  fonts?: Record<string, CanvasConfiguredFont>;
  timeoutMs?: number;
}
export interface CanvasScene {
  width: number; height: number; scale: number; background?: CanvasColor;
  operations: CanvasOperation[]; fonts: CanvasFontSource[];
}
export interface CanvasRenderOptions {
  format?: CanvasFormat; quality?: number; matte?: CanvasColor; timeoutMs?: number;
}
export interface CanvasResult { data: Uint8Array; format: CanvasFormat; width: number; height: number }
export interface CanvasRenderRequestOptions extends CanvasRenderOptions { signal?: AbortSignal; timeoutMs: number }

export const CANVAS_LIMITS = Object.freeze({
  maxPhysicalDimension: 4096,
  maxPixels: 16_777_216,
  maxInputDimension: 8192,
  maxOperations: 512,
  maxImages: 64,
  maxFontFiles: 8,
  maxItemBytes: 10_000_000,
  maxSceneAssetBytes: 20_000_000,
  maxTextLength: 4096,
  maxSceneTextLength: 32_768,
  maxBadges: 32,
  maxOutputBytes: 10_000_000,
  defaultTimeoutMs: 5000,
  minTimeoutMs: 10,
  maxTimeoutMs: 30_000,
  maxScriptCanvases: 4,
  maxScriptRenders: 4,
});

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (message: string): never => { throw new YuzuhaError('CANVAS_OPTIONS', message); };
const inputFail = (message: string): never => { throw new YuzuhaError('CANVAS_INPUT', message); };
const ownKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean => Object.keys(value).every(key => allowed.includes(key));
const finite = (value: unknown, label: string, min = -100_000, max = 100_000): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return fail(`${label} inválido.`);
  return value;
};

export function cloneCanvasValue<T>(value: T): T {
  if (value instanceof Uint8Array) return new Uint8Array(value) as T;
  if (Array.isArray(value)) return value.map(item => cloneCanvasValue(item)) as T;
  if (object(value)) {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) copy[key] = cloneCanvasValue(entry);
    return copy as T;
  }
  return value;
}

export function validateCanvasColor(value: unknown, label = 'Cor'): asserts value is CanvasColor {
  if (typeof value !== 'string') return fail(`${label} deve ser uma cor hexadecimal, rgb() ou rgba().`);
  const color = value.trim();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)) return;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.exec(color);
  if (rgb && Number(rgb[1]) <= 255 && Number(rgb[2]) <= 255 && Number(rgb[3]) <= 255
    && (rgb[4] === undefined || Number(rgb[4]) <= 1)) return;
  return fail(`${label} inválida: use hexadecimal, rgb() ou rgba().`);
}

export function validateCanvasFill(value: unknown): asserts value is CanvasFill {
  if (typeof value === 'string') return validateCanvasColor(value, 'Preenchimento');
  if (!object(value) || (value.type !== 'linear' && value.type !== 'radial')) return fail('Preenchimento inválido.');
  const linear = value.type === 'linear';
  const keys = linear ? ['type', 'x0', 'y0', 'x1', 'y1', 'stops'] : ['type', 'x0', 'y0', 'r0', 'x1', 'y1', 'r1', 'stops'];
  if (!ownKeys(value, keys)) return fail('Descritor de gradiente inválido.');
  for (const key of (linear ? ['x0', 'y0', 'x1', 'y1'] : ['x0', 'y0', 'r0', 'x1', 'y1', 'r1'])) {
    finite(value[key], `Coordenada de gradiente ${key}`, key === 'r0' || key === 'r1' ? 0 : -100_000, 100_000);
  }
  if (!Array.isArray(value.stops) || value.stops.length < 2 || value.stops.length > 16) return fail('Gradiente exige de 2 a 16 stops.');
  let previous = -1;
  for (const stop of value.stops) {
    if (!object(stop) || !ownKeys(stop, ['offset', 'color'])) return fail('Stop de gradiente inválido.');
    const offset = finite(stop.offset, 'Offset de gradiente', 0, 1);
    if (offset < previous) return fail('Stops de gradiente devem estar em ordem crescente.');
    previous = offset;
    validateCanvasColor(stop.color, 'Cor do gradiente');
  }
}

export function canvasSourceKey(source: CanvasSource): string {
  if (typeof source === 'string') return `s:${source}`;
  return `b:${createHash('sha256').update(source).digest('hex')}`;
}

export function validateCanvasSource(source: unknown, label = 'Fonte'): asserts source is CanvasSource {
  if (source instanceof Uint8Array) {
    if (!source.byteLength) inputFail(`${label} deve conter bytes.`);
    if (source.byteLength > CANVAS_LIMITS.maxItemBytes) throw new YuzuhaError('EXECUTION_LIMIT', `${label} excede 10 MB.`);
    return;
  }
  if (typeof source !== 'string' || !source || source.length > 4096) return inputFail(`${label} inválida.`);
  const text = source as string;
  if (text.startsWith('asset:')) {
    if (!/^asset:[A-Za-z0-9_-]{1,64}$/.test(text)) inputFail('Alias de asset inválido.');
    return;
  }
  let url: URL;
  try { url = new URL(text); } catch { return inputFail(`${label} deve ser bytes, asset:nome ou URL HTTP/HTTPS.`); }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    inputFail(`${label} deve usar uma URL HTTP/HTTPS sem credenciais.`);
  }
}

export function validateCanvasFontBytes(bytes: Uint8Array): void {
  if (bytes.byteLength > CANVAS_LIMITS.maxItemBytes) throw new YuzuhaError('EXECUTION_LIMIT', 'Fonte excede 10 MB.');
  if (bytes.byteLength < 12) inputFail('Fonte deve ter ao menos 12 bytes.');
  const signature = Buffer.from(bytes.subarray(0, 4)).toString('latin1');
  const numeric = Buffer.from(bytes.subarray(0, 4)).readUInt32BE(0);
  if (!['OTTO', 'true', 'typ1'].includes(signature) && numeric !== 0x00010000) inputFail('Fonte deve ser um arquivo TTF ou OTF válido.');
}

export interface CanvasImageDimensions { width: number; height: number; format: CanvasFormat }
function dimensions(width: number, height: number): CanvasImageDimensions {
  if (!width || !height || width > CANVAS_LIMITS.maxInputDimension || height > CANVAS_LIMITS.maxInputDimension
    || width * height > CANVAS_LIMITS.maxPixels) inputFail('Dimensões da imagem de entrada excedem os limites.');
  return { width, height, format: 'png' };
}

export function inspectCanvasImage(bytes: Uint8Array): CanvasImageDimensions {
  if (!bytes.byteLength) inputFail('Imagem não pode estar vazia.');
  if (bytes.byteLength > CANVAS_LIMITS.maxItemBytes) throw new YuzuhaError('EXECUTION_LIMIT', 'Imagem excede 10 MB.');
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (data.length >= 8 && data.subarray(0, 8).equals(png)) {
    if (data.length < 45) return inputFail('PNG truncado.');
    let offset = 8, width = 0, height = 0, ended = false;
    while (offset + 12 <= data.length) {
      const length = data.readUInt32BE(offset), type = data.toString('ascii', offset + 4, offset + 8);
      if (length > data.length - offset - 12) return inputFail('PNG truncado.');
      if (type === 'IHDR') {
        if (width || length !== 13) return inputFail('Cabeçalho PNG inválido.');
        width = data.readUInt32BE(offset + 8); height = data.readUInt32BE(offset + 12);
      }
      if (type === 'acTL') return inputFail('Imagens animadas não são aceitas.');
      offset += length + 12;
      if (type === 'IEND') { ended = length === 0 && offset === data.length; break; }
    }
    if (!width || !height || !ended) return inputFail('Estrutura PNG incompleta.');
    return { ...dimensions(width, height), format: 'png' };
  }
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2, width = 0, height = 0, scan = false;
    while (offset + 4 <= data.length) {
      if (data[offset] !== 0xff) return inputFail('Estrutura JPEG inválida.');
      while (data[offset] === 0xff) offset++;
      const marker = data[offset++]!;
      if (marker === 0xd9) break;
      if (marker === 0xda) { scan = true; break; }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > data.length) return inputFail('JPEG truncado.');
      const length = data.readUInt16BE(offset);
      if (length < 2 || offset + length > data.length) return inputFail('JPEG truncado.');
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 7) return inputFail('Cabeçalho JPEG inválido.');
        height = data.readUInt16BE(offset + 3); width = data.readUInt16BE(offset + 5);
      }
      offset += length;
    }
    if (!scan || !width || !height || data.length < 4 || data[data.length - 2] !== 0xff || data[data.length - 1] !== 0xd9) {
      return inputFail('Estrutura JPEG incompleta.');
    }
    return { ...dimensions(width, height), format: 'jpeg' };
  }
  if (data.length >= 20 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    if (data.readUInt32LE(4) + 8 !== data.length) return inputFail('Estrutura WebP truncada.');
    let offset = 12, width = 0, height = 0;
    while (offset + 8 <= data.length) {
      const type = data.toString('ascii', offset, offset + 4), length = data.readUInt32LE(offset + 4), body = offset + 8;
      if (length > data.length - body) return inputFail('WebP truncado.');
      if (type === 'VP8X') {
        if (length < 10 || (data[body]! & 0x02) !== 0) return inputFail('WebP animado ou inválido.');
        width = 1 + data.readUIntLE(body + 4, 3); height = 1 + data.readUIntLE(body + 7, 3);
      } else if (type === 'VP8 ' && length >= 10 && data[body + 3] === 0x9d && data[body + 4] === 0x01 && data[body + 5] === 0x2a) {
        width = data.readUInt16LE(body + 6) & 0x3fff; height = data.readUInt16LE(body + 8) & 0x3fff;
      } else if (type === 'VP8L' && length >= 5 && data[body] === 0x2f) {
        width = 1 + data[body + 1]! + ((data[body + 2]! & 0x3f) << 8);
        height = 1 + (data[body + 2]! >> 6) + (data[body + 3]! << 2) + ((data[body + 4]! & 0x0f) << 10);
      }
      offset = body + length + (length & 1);
    }
    if (!width || !height || offset !== data.length) return inputFail('Estrutura WebP incompleta.');
    return { ...dimensions(width, height), format: 'webp' };
  }
  return inputFail('Entrada deve ser PNG, JPEG ou WebP estático.');
}
