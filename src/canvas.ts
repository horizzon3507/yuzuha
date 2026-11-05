import { CANVAS_LIMITS } from './domain/canvas.js';
import { canvasDependency, napi } from './infrastructure/canvas/napi.js';
import { loadCanvasImage, registerCanvasFonts } from './services/canvas-image.js';
import type { CanvasLoadImageOptions, CanvasLoadImageSource } from './services/canvas-image.js';
import { YuzuhaError } from './shared/errors.js';

export type { CanvasLoadImageOptions };
export type * from '@napi-rs/canvas';

const missing = () => new Proxy(function () { throw canvasDependency(); }, {
  get(target, property) {
    if (property === 'prototype') return target.prototype;
    throw canvasDependency();
  },
  construct() { throw canvasDependency(); },
});

export const Canvas = (napi?.Canvas ?? missing()) as typeof import('@napi-rs/canvas').Canvas;
export const Image = (napi?.Image ?? missing()) as typeof import('@napi-rs/canvas').Image;
export const Path2D = (napi?.Path2D ?? missing()) as typeof import('@napi-rs/canvas').Path2D;
export const ImageData = (napi?.ImageData ?? missing()) as typeof import('@napi-rs/canvas').ImageData;
export const DOMMatrix = (napi?.DOMMatrix ?? missing()) as typeof import('@napi-rs/canvas').DOMMatrix;
export const DOMRect = (napi?.DOMRect ?? missing()) as typeof import('@napi-rs/canvas').DOMRect;
export const DOMPoint = (napi?.DOMPoint ?? missing()) as typeof import('@napi-rs/canvas').DOMPoint;
export const FontKey = (napi?.FontKey ?? missing()) as typeof import('@napi-rs/canvas').FontKey;
export const PDFDocument = (napi?.PDFDocument ?? missing()) as typeof import('@napi-rs/canvas').PDFDocument;
export const GifEncoder = (napi?.GifEncoder ?? missing()) as typeof import('@napi-rs/canvas').GifEncoder;
export const LottieAnimation = (napi?.LottieAnimation ?? missing()) as typeof import('@napi-rs/canvas').LottieAnimation;
export const GlobalFonts = (napi?.GlobalFonts ?? missing()) as typeof import('@napi-rs/canvas').GlobalFonts;
export const PathOp = (napi?.PathOp ?? missing()) as typeof import('@napi-rs/canvas').PathOp;
export const FillType = (napi?.FillType ?? missing()) as typeof import('@napi-rs/canvas').FillType;
export const StrokeCap = (napi?.StrokeCap ?? missing()) as typeof import('@napi-rs/canvas').StrokeCap;
export const StrokeJoin = (napi?.StrokeJoin ?? missing()) as typeof import('@napi-rs/canvas').StrokeJoin;
export const SvgExportFlag = (napi?.SvgExportFlag ?? missing()) as typeof import('@napi-rs/canvas').SvgExportFlag;
export const GifDisposal = (napi?.GifDisposal ?? missing()) as typeof import('@napi-rs/canvas').GifDisposal;
export const ChromaSubsampling = (napi?.ChromaSubsampling ?? missing()) as typeof import('@napi-rs/canvas').ChromaSubsampling;
export const SVGCanvas: any = (napi as any)?.SVGCanvas ?? missing();
export const CanvasElement: any = (napi as any)?.CanvasElement ?? missing();

export function createCanvas(width: number, height: number): import('@napi-rs/canvas').Canvas;
export function createCanvas(width: number, height: number, svgExportFlag: import('@napi-rs/canvas').SvgExportFlag): import('@napi-rs/canvas').SvgCanvas;
export function createCanvas(width: number, height: number, svgExportFlag?: import('@napi-rs/canvas').SvgExportFlag) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new YuzuhaError('CANVAS_OPTIONS', 'Largura e altura devem ser inteiros positivos.');
  }
  if (width > CANVAS_LIMITS.maxPhysicalDimension || height > CANVAS_LIMITS.maxPhysicalDimension
    || width * height > CANVAS_LIMITS.maxPixels) {
    throw new YuzuhaError('CANVAS_OPTIONS', 'Dimensões físicas excedem os limites do Canvas.');
  }
  if (!napi) throw canvasDependency();
  return svgExportFlag === undefined ? napi.createCanvas(width, height) : napi.createCanvas(width, height, svgExportFlag);
}

export async function loadImage(source: CanvasLoadImageSource, options: CanvasLoadImageOptions = {}): Promise<import('@napi-rs/canvas').Image> {
  if (!napi) throw canvasDependency();
  return loadCanvasImage(napi, source, options);
}

export function clearAllCache(): void {
  if (!napi) throw canvasDependency();
  napi.clearAllCache();
}

export function convertSVGTextToPath(svg: Buffer | string): Buffer {
  if (!napi) throw canvasDependency();
  return napi.convertSVGTextToPath(svg);
}

export function registerFonts(dir: string): number {
  if (!napi) throw canvasDependency();
  return registerCanvasFonts(napi, dir);
}
