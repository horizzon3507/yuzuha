import type { CanvasRenderRequestOptions, CanvasResult, CanvasScene } from '../domain/canvas.js';

export interface CanvasRenderer {
  render(scene: CanvasScene, options: CanvasRenderRequestOptions): Promise<CanvasResult>;
}
