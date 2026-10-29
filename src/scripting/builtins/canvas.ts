import { CANVAS_LIMITS } from '../../domain/canvas.js';
import type { CanvasAvatarOptions, CanvasBadgeItem, CanvasBadgesOptions, CanvasCreateOptions, CanvasFontOptions,
  CanvasImageOptions, CanvasLineOptions, CanvasProgressOptions, CanvasRectOptions, CanvasTextOptions } from '../../domain/canvas.js';
import type { CanvasBuilder, CanvasSendOptions } from '../../services/canvas.js';
import { YuzuhaError } from '../../shared/errors.js';
import { canvasExecution } from '../canvas-execution.js';
import type { FunctionCall } from '../types.js';
import { defineFunctions } from './definition.js';

function requiredId(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw new YuzuhaError('CANVAS_STATE', 'ID deve ter de 1 a 64 caracteres: letras, números, _ ou -.');
  return value;
}

function number(value: string, label: string, integer = false): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (integer && !Number.isSafeInteger(parsed))) throw new YuzuhaError('CANVAS_OPTIONS', `${label} deve ser ${integer ? 'inteiro' : 'número'} válido.`);
  return parsed;
}

async function options<T extends object>(call: FunctionCall, index: number): Promise<T> {
  if (index >= call.count) return {} as T;
  const value = await call.arg(index);
  if (value === null || typeof value !== 'object' || Array.isArray(value) || value instanceof Uint8Array) {
    throw new YuzuhaError('CANVAS_OPTIONS', 'Opções devem ser um objeto criado com $object.');
  }
  return value as T;
}

function getCanvas(call: FunctionCall, rawID: string): CanvasBuilder {
  const id = requiredId(rawID), canvas = canvasExecution(call).canvases.get(id);
  if (!canvas) throw new YuzuhaError('CANVAS_STATE', `Canvas inexistente: ${id}.`);
  return canvas;
}

async function addCanvas(call: FunctionCall, operation: (canvas: CanvasBuilder) => void): Promise<string> {
  operation(getCanvas(call, await call.text(0)));
  return '';
}

export const canvasFunctions = defineFunctions(fn => {
  fn('canvasCreate', 'canvas', 3, 4, '[id;largura;altura;opções?]', 'Cria um canvas de composição privado à execução atual.', async call => {
    const id = requiredId(await call.text(0)), state = canvasExecution(call);
    if (state.canvases.has(id)) throw new YuzuhaError('CANVAS_STATE', `ID de canvas já existe: ${id}.`);
    if (state.canvases.size >= CANVAS_LIMITS.maxScriptCanvases) throw new YuzuhaError('EXECUTION_LIMIT', 'Execução excedeu 4 canvases ativos.');
    const width = number(await call.text(1), 'Largura', true), height = number(await call.text(2), 'Altura', true);
    const createOptions = await options<CanvasCreateOptions>(call, 3);
    state.canvases.set(id, call.ctx.canvas.create(width, height, createOptions));
    return '';
  });
  fn('canvasFont', 'canvas', 3, 4, '[id;família;fonte;opções?]', 'Registra uma fonte TTF/OTF na cena sem expor seus bytes às variáveis.', async call => {
    const family = await call.text(1), source = await call.text(2), input = await options<CanvasFontOptions>(call, 3);
    return addCanvas(call, canvas => { canvas.font(family, source, input); });
  });
  fn('canvasRect', 'canvas', 5, 6, '[id;x;y;largura;altura;opções?]', 'Desenha um retângulo preenchido ou com borda.', async call => {
    const x = number(await call.text(1), 'x'), y = number(await call.text(2), 'y');
    const width = number(await call.text(3), 'Largura'), height = number(await call.text(4), 'Altura');
    const input = await options<Omit<CanvasRectOptions, 'x' | 'y' | 'width' | 'height'>>(call, 5);
    return addCanvas(call, canvas => { canvas.rect({ ...input, x, y, width, height }); });
  });
  fn('canvasCircle', 'canvas', 4, 5, '[id;x;y;raio;opções?]', 'Desenha um círculo pelo centro e raio.', async call => {
    const x = number(await call.text(1), 'x'), y = number(await call.text(2), 'y'), radius = number(await call.text(3), 'Raio');
    const input = await options<Omit<import('../../domain/canvas.js').CanvasCircleOptions, 'x' | 'y' | 'radius'>>(call, 4);
    return addCanvas(call, canvas => { canvas.circle({ ...input, x, y, radius }); });
  });
  fn('canvasLine', 'canvas', 5, 6, '[id;x1;y1;x2;y2;opções?]', 'Desenha uma linha com largura e acabamento opcionais.', async call => {
    const x1 = number(await call.text(1), 'x1'), y1 = number(await call.text(2), 'y1');
    const x2 = number(await call.text(3), 'x2'), y2 = number(await call.text(4), 'y2');
    const input = await options<Omit<CanvasLineOptions, 'x1' | 'y1' | 'x2' | 'y2'>>(call, 5);
    return addCanvas(call, canvas => { canvas.line({ ...input, x1, y1, x2, y2 }); });
  });
  fn('canvasImage', 'canvas', 6, 7, '[id;fonte;x;y;largura;altura;opções?]', 'Desenha imagem local configurada, bytes ou URL permitida pelo serviço HTTP.', async call => {
    const source = await call.text(1), x = number(await call.text(2), 'x'), y = number(await call.text(3), 'y');
    const width = number(await call.text(4), 'Largura'), height = number(await call.text(5), 'Altura');
    const input = await options<Omit<CanvasImageOptions, 'x' | 'y' | 'width' | 'height'>>(call, 6);
    return addCanvas(call, canvas => { canvas.image(source, { ...input, x, y, width, height }); });
  });
  fn('canvasAvatar', 'canvas', 5, 6, '[id;fonte;x;y;tamanho;opções?]', 'Desenha uma imagem quadrada com recorte circular e borda opcional.', async call => {
    const source = await call.text(1), x = number(await call.text(2), 'x'), y = number(await call.text(3), 'y');
    const size = number(await call.text(4), 'Tamanho');
    const input = await options<Omit<CanvasAvatarOptions, 'x' | 'y' | 'size'>>(call, 5);
    return addCanvas(call, canvas => { canvas.avatar(source, { ...input, x, y, size }); });
  });
  fn('canvasText', 'canvas', 4, 5, '[id;texto;x;y;opções?]', 'Desenha texto com ajuste, quebra e overflow por grafemas.', async call => {
    const value = await call.text(1), x = number(await call.text(2), 'x'), y = number(await call.text(3), 'y');
    const input = await options<Omit<CanvasTextOptions, 'x' | 'y'>>(call, 4);
    return addCanvas(call, canvas => { canvas.text(value, { ...input, x, y }); });
  });
  fn('canvasBadges', 'canvas', 5, 6, '[id;itens;x;y;larguraMáxima;opções?]', 'Compõe badges medidos e reserva espaço para o contador +N.', async call => {
    const items = await call.arg(1);
    if (!Array.isArray(items)) throw new YuzuhaError('CANVAS_OPTIONS', 'itens deve ser um array criado com $array.');
    const x = number(await call.text(2), 'x'), y = number(await call.text(3), 'y'), maxWidth = number(await call.text(4), 'maxWidth');
    const input = await options<Omit<CanvasBadgesOptions, 'x' | 'y' | 'maxWidth'>>(call, 5);
    return addCanvas(call, canvas => { canvas.badges(items as CanvasBadgeItem[], { ...input, x, y, maxWidth }); });
  });
  fn('canvasProgress', 'canvas', 7, 8, '[id;x;y;largura;altura;valor;máximo;opções?]', 'Desenha progresso limitado a zero e ao máximo informado.', async call => {
    const x = number(await call.text(1), 'x'), y = number(await call.text(2), 'y');
    const width = number(await call.text(3), 'Largura'), height = number(await call.text(4), 'Altura');
    const value = number(await call.text(5), 'Valor'), max = number(await call.text(6), 'Máximo');
    const input = await options<Omit<CanvasProgressOptions, 'x' | 'y' | 'width' | 'height' | 'value' | 'max'>>(call, 7);
    return addCanvas(call, canvas => { canvas.progress({ ...input, x, y, width, height, value, max }); });
  });
  fn('canvasSend', 'canvas', 1, 2, '[id;opções?]', 'Renderiza e envia uma imagem sem produzir uma resposta automática adicional.', async call => {
    const id = requiredId(await call.text(0)), state = canvasExecution(call), builder = state.canvases.get(id);
    if (!builder) throw new YuzuhaError('CANVAS_STATE', `Canvas inexistente: ${id}.`);
    if (state.renderAttempts >= CANVAS_LIMITS.maxScriptRenders) throw new YuzuhaError('EXECUTION_LIMIT', 'Execução excedeu 4 tentativas de renderização.');
    const sendOptions = await options<CanvasSendOptions>(call, 1);
    state.renderAttempts++;
    await call.wait(call.ctx.canvas.send(builder, sendOptions));
    return '';
  });
  fn('canvasDispose', 'canvas', 1, 1, '[id]', 'Descarta o canvas da execução para liberar sua vaga e reutilizar o ID.', async call => {
    const id = requiredId(await call.text(0)), state = canvasExecution(call);
    if (!state.canvases.delete(id)) throw new YuzuhaError('CANVAS_STATE', `Canvas inexistente: ${id}.`);
    return '';
  });
});
