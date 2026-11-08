import { CANVAS_LIMITS } from '../domain/canvas.js';
import type { CanvasConfig, CanvasCreateOptions } from '../domain/canvas.js';
import { canvasRenderer } from '../infrastructure/canvas/render.js';
import { CanvasService } from '../services/canvas.js';
import type { CanvasBuilder, CanvasRuntimeOptions } from '../services/canvas.js';

export function createCard(
  width: number,
  height: number,
  options: CanvasCreateOptions & CanvasRuntimeOptions = {},
): CanvasBuilder {
  const { scale, background, signal, http, assets, fonts, timeoutMs } = options;
  const service = new CanvasService({ renderer: canvasRenderer, signal, http, assets, fonts, timeoutMs });
  return service.create(width, height, { scale, background });
}

export { CanvasService };
export type { CanvasBuilder, CanvasRuntimeOptions, CanvasHostOptions, CanvasSendOptions } from '../services/canvas.js';
export type * from '../domain/canvas.js';
export { CANVAS_LIMITS };
