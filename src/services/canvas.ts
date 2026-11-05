import { createHash } from 'node:crypto';
import {
  CANVAS_LIMITS, canvasSourceKey, cloneCanvasValue, inspectCanvasImage, validateCanvasColor,
  validateCanvasFill, validateCanvasFontBytes, validateCanvasSource,
} from '../domain/canvas.js';
import type {
  CanvasAvatarOptions, CanvasBadgeItem, CanvasBadgesOptions, CanvasCircleOptions, CanvasColor, CanvasConfig, CanvasCreateOptions,
  CanvasConfiguredFont, CanvasFontOptions, CanvasFontSource, CanvasImageOptions, CanvasLineOptions, CanvasOperation, CanvasProgressOptions,
  CanvasFormat, CanvasRectOptions, CanvasRenderOptions, CanvasResult, CanvasScene, CanvasSource, CanvasTextOptions,
} from '../domain/canvas.js';
import type { CanvasRenderer } from '../ports/canvas.js';
import type { MessagesResources } from '../ports/resources/messages.js';
import type { HttpService } from './http.js';
import { YuzuhaError } from '../shared/errors.js';

export interface CanvasBuilder {
  font(family: string, source: CanvasSource, options?: CanvasFontOptions): this;
  rect(options: CanvasRectOptions): this;
  circle(options: CanvasCircleOptions): this;
  line(options: CanvasLineOptions): this;
  image(source: CanvasSource, options: CanvasImageOptions): this;
  avatar(source: CanvasSource, options: CanvasAvatarOptions): this;
  text(value: string, options: CanvasTextOptions): this;
  badges(items: readonly CanvasBadgeItem[], options: CanvasBadgesOptions): this;
  progress(options: CanvasProgressOptions): this;
  render(options?: CanvasRenderOptions): Promise<CanvasResult>;
}

export interface CanvasSendOptions extends CanvasRenderOptions {
  channelID?: string; name?: string; content?: string; description?: string;
}

export interface CanvasRuntimeOptions {
  signal?: AbortSignal;
  http?: HttpService;
  assets?: Record<string, Uint8Array>;
  fonts?: CanvasConfig['fonts'];
  timeoutMs?: number;
}

export interface CanvasHostOptions extends CanvasRuntimeOptions {
  renderer: CanvasRenderer;
  channelID?: string;
  messages?: MessagesResources;
}

export interface CanvasLike {
  width: number;
  height: number;
  encode(format: CanvasFormat, quality?: number): Promise<Uint8Array>;
}

export interface CanvasImageLike {
  width: number;
  height: number;
}

const canvasLike = (value: unknown): value is CanvasLike => {
  if (!obj(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.encode === 'function' && typeof candidate.width === 'number' && typeof candidate.height === 'number';
};

const obj = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const optionsError = (message: string): never => { throw new YuzuhaError('CANVAS_OPTIONS', message); };
const inputError = (message: string): never => { throw new YuzuhaError('CANVAS_INPUT', message); };
const allowed = (value: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(value).every(key => keys.includes(key));
const number = (value: unknown, label: string, min = 0, max = 100_000): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return optionsError(`${label} inválido.`);
  return value;
};
const positiveSize = (value: unknown, label: string, max = 100_000): number => number(value, label, Number.MIN_VALUE, max);
const opacity = (value: unknown): void => { if (value !== undefined) number(value, 'Opacity', 0, 1); };

function validateShadow(value: unknown): void {
  if (!obj(value) || !allowed(value, ['color', 'blur', 'offsetX', 'offsetY']) || !Object.hasOwn(value, 'color')) optionsError('Sombra inválida.');
  const shadow = value as Record<string, unknown>;
  validateCanvasColor(shadow.color, 'Cor da sombra');
  number(shadow.blur, 'Blur da sombra', 0, 128);
  number(shadow.offsetX, 'offsetX da sombra', -100_000); number(shadow.offsetY, 'offsetY da sombra', -100_000);
}

function validatePaint(value: Record<string, unknown>): void {
  opacity(value.opacity);
  if (value.shadow !== undefined) validateShadow(value.shadow);
}

function validateBorder(value: unknown): void {
  if (!obj(value) || !allowed(value, ['color', 'width'])) optionsError('Borda inválida.');
  const border = value as Record<string, unknown>;
  validateCanvasColor(border.color, 'Cor da borda');
  positiveSize(border.width, 'Largura da borda', 128);
}

function validateBox(value: Record<string, unknown>, keys: string[], label: string, includePaint = true): void {
  if (!allowed(value, keys)) optionsError(`${label} contém opções desconhecidas.`);
  for (const key of ['x', 'y']) number(value[key], key, -100_000);
  positiveSize(value.width, 'Largura'); positiveSize(value.height, 'Altura');
  if (includePaint) validatePaint(value);
}

function copySource(source: CanvasSource): CanvasSource {
  return typeof source === 'string' ? source : new Uint8Array(source);
}

function charCount(value: string): number { return Array.from(value).length; }

function cloneConfig(config: CanvasRuntimeOptions): CanvasRuntimeOptions {
  if (config.timeoutMs !== undefined && (!Number.isSafeInteger(config.timeoutMs)
    || config.timeoutMs < CANVAS_LIMITS.minTimeoutMs || config.timeoutMs > CANVAS_LIMITS.maxTimeoutMs)) {
    optionsError(`Prazo deve ser de ${CANVAS_LIMITS.minTimeoutMs} a ${CANVAS_LIMITS.maxTimeoutMs} ms.`);
  }
  let assets: Record<string, Uint8Array> | undefined;
  if (config.assets !== undefined) {
    if (!obj(config.assets)) optionsError('canvas.assets deve ser um objeto de aliases para bytes.');
    assets = {};
    for (const [name, value] of Object.entries(config.assets)) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) optionsError(`Alias de asset inválido: ${name}.`);
      validateCanvasSource(value, `Asset ${name}`);
      if (!(value instanceof Uint8Array)) optionsError(`Asset ${name} deve conter bytes.`);
      assets[name] = new Uint8Array(value);
    }
  }
  let fonts: CanvasConfig['fonts'];
  if (config.fonts !== undefined) {
    if (!obj(config.fonts)) optionsError('canvas.fonts deve ser um objeto de famílias.');
    fonts = {};
    for (const [family, entry] of Object.entries(config.fonts)) {
      if (!/^[\p{L}\p{N} _.-]{1,64}$/u.test(family) || !obj(entry) || !allowed(entry, ['regular', 'bold']) || !Object.hasOwn(entry, 'regular')) {
        optionsError(`Configuração inválida para a fonte ${family}.`);
      }
      validateCanvasSource(entry.regular, `Fonte ${family} regular`);
      if (entry.bold !== undefined) validateCanvasSource(entry.bold, `Fonte ${family} bold`);
      fonts[family] = cloneCanvasValue(entry) as CanvasConfiguredFont;
    }
  }
  return {
    ...(config.signal ? { signal: config.signal } : {}),
    ...(config.http ? { http: config.http } : {}),
    ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
    ...(assets ? { assets } : {}),
    ...(fonts ? { fonts } : {}),
  };
}

function formatOptions(options: CanvasRenderOptions, fallbackTimeout: number): CanvasRenderOptions & { format: NonNullable<CanvasRenderOptions['format']>; timeoutMs: number } {
  if (!obj(options) || !allowed(options, ['format', 'quality', 'matte', 'timeoutMs'])) optionsError('Opções de renderização inválidas.');
  const format = options.format ?? 'png';
  if (!['png', 'jpeg', 'webp'].includes(format)) optionsError('Formato deve ser png, jpeg ou webp.');
  if (options.quality !== undefined && (format === 'png' || !Number.isSafeInteger(options.quality) || options.quality < 1 || options.quality > 100)) {
    optionsError('Quality só pode ser usada em JPEG/WebP e deve ser de 1 a 100.');
  }
  if (options.matte !== undefined) validateCanvasColor(options.matte, 'Matte');
  const timeoutMs = options.timeoutMs ?? fallbackTimeout;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < CANVAS_LIMITS.minTimeoutMs || timeoutMs > CANVAS_LIMITS.maxTimeoutMs) {
    optionsError(`Prazo deve ser de ${CANVAS_LIMITS.minTimeoutMs} a ${CANVAS_LIMITS.maxTimeoutMs} ms.`);
  }
  return { format, ...(format === 'png' ? {} : { quality: options.quality ?? 85 }),
    ...(options.matte ? { matte: options.matte } : {}), timeoutMs };
}

class CanvasBuilderImpl implements CanvasBuilder {
  private readonly operations: CanvasOperation[] = [];
  private readonly fonts = new Map<string, CanvasFontSource>();
  private readonly imageKeys = new Set<string>();
  private textLength = 0;
  private weightedOperations = 0;
  private readonly config: CanvasRuntimeOptions;

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly createOptions: CanvasCreateOptions,
    config: CanvasRuntimeOptions,
    private readonly renderer: CanvasRenderer,
    private readonly owner: object,
  ) { this.config = cloneConfig(config); }

  font(family: string, source: CanvasSource, options: CanvasFontOptions = {}): this {
    if (typeof family !== 'string' || !/^[\p{L}\p{N} _.-]{1,64}$/u.test(family.trim())) optionsError('Família de fonte inválida.');
    if (!obj(options) || !allowed(options, ['weight'])) optionsError('Opções de fonte inválidas.');
    const weight = options.weight ?? 400;
    if (weight !== 400 && weight !== 700) optionsError('Peso de fonte deve ser 400 ou 700.');
    validateCanvasSource(source, 'Fonte');
    const key = `${family.trim()}\u0000${weight}`;
    const font = { family: family.trim(), source: copySource(source), weight };
    const nextFonts = new Map(this.fonts); nextFonts.set(key, font);
    if (new Set([...nextFonts.values()].map(item => canvasSourceKey(item.source))).size > CANVAS_LIMITS.maxFontFiles) {
      throw new YuzuhaError('EXECUTION_LIMIT', 'Cena excede 8 arquivos de fonte próprios.');
    }
    this.fonts.set(key, font);
    return this;
  }

  rect(options: CanvasRectOptions): this {
    if (!obj(options)) optionsError('Retângulo inválido.');
    validateBox(options as unknown as Record<string, unknown>, ['x', 'y', 'width', 'height', 'fill', 'stroke', 'strokeWidth', 'radius', 'opacity', 'shadow'], 'Retângulo');
    if (options.fill === undefined && options.stroke === undefined) optionsError('Retângulo exige fill ou stroke.');
    if (options.fill !== undefined) validateCanvasFill(options.fill);
    if (options.stroke !== undefined) validateCanvasColor(options.stroke, 'Borda');
    if (options.strokeWidth !== undefined) positiveSize(options.strokeWidth, 'Espessura da borda', 128);
    if (options.radius !== undefined) number(options.radius, 'Raio', 0, 100_000);
    this.push({ type: 'rect', options: cloneCanvasValue(options) }); return this;
  }

  circle(options: import('../domain/canvas.js').CanvasCircleOptions): this {
    if (!obj(options) || !allowed(options, ['x', 'y', 'radius', 'fill', 'stroke', 'strokeWidth', 'opacity', 'shadow'])) optionsError('Círculo inválido.');
    number(options.x, 'x', -100_000); number(options.y, 'y', -100_000); positiveSize(options.radius, 'Raio'); validatePaint(options as unknown as Record<string, unknown>);
    if (options.fill === undefined && options.stroke === undefined) optionsError('Círculo exige fill ou stroke.');
    if (options.fill !== undefined) validateCanvasFill(options.fill);
    if (options.stroke !== undefined) validateCanvasColor(options.stroke, 'Borda');
    if (options.strokeWidth !== undefined) positiveSize(options.strokeWidth, 'Espessura da borda', 128);
    this.push({ type: 'circle', options: cloneCanvasValue(options) }); return this;
  }

  line(options: CanvasLineOptions): this {
    if (!obj(options) || !allowed(options, ['x1', 'y1', 'x2', 'y2', 'width', 'color', 'cap', 'opacity', 'shadow'])) optionsError('Linha inválida.');
    for (const key of ['x1', 'y1', 'x2', 'y2']) number(options[key as keyof CanvasLineOptions], key, -100_000);
    validatePaint(options as unknown as Record<string, unknown>);
    if (options.width !== undefined) positiveSize(options.width, 'Espessura da linha', 128);
    if (options.color !== undefined) validateCanvasColor(options.color, 'Cor da linha');
    if (options.cap !== undefined && !['butt', 'round', 'square'].includes(options.cap)) optionsError('Acabamento da linha inválido.');
    this.push({ type: 'line', options: cloneCanvasValue(options) }); return this;
  }

  image(source: CanvasSource, options: CanvasImageOptions): this {
    validateCanvasSource(source, 'Imagem');
    if (!obj(options)) optionsError('Opções de imagem inválidas.');
    validateBox(options as unknown as Record<string, unknown>, ['x', 'y', 'width', 'height', 'fit', 'cropX', 'cropY', 'clip', 'radius', 'border', 'opacity', 'shadow'], 'Imagem');
    if (options.fit !== undefined && !['cover', 'contain', 'stretch'].includes(options.fit)) optionsError('fit deve ser cover, contain ou stretch.');
    for (const key of ['cropX', 'cropY'] as const) if (options[key] !== undefined) number(options[key], key, 0, 1);
    if (options.clip !== undefined && !['rect', 'rounded', 'circle'].includes(options.clip)) optionsError('Recorte de imagem inválido.');
    if (options.radius !== undefined) number(options.radius, 'Raio', 0, 100_000);
    if (options.border !== undefined) validateBorder(options.border);
    const key = this.checkImages([source])[0]!;
    this.push({ type: 'image', source: copySource(source), options: cloneCanvasValue(options) }); this.imageKeys.add(key); return this;
  }

  avatar(source: CanvasSource, options: CanvasAvatarOptions): this {
    validateCanvasSource(source, 'Avatar');
    if (!obj(options) || !allowed(options, ['x', 'y', 'size', 'border', 'opacity', 'shadow'])) optionsError('Opções de avatar inválidas.');
    number(options.x, 'x', -100_000); number(options.y, 'y', -100_000); positiveSize(options.size, 'Tamanho do avatar'); validatePaint(options as unknown as Record<string, unknown>);
    if (options.border !== undefined) validateBorder(options.border);
    const key = this.checkImages([source])[0]!;
    this.push({ type: 'avatar', source: copySource(source), options: cloneCanvasValue(options) }); this.imageKeys.add(key); return this;
  }

  text(value: string, options: CanvasTextOptions): this {
    if (typeof value !== 'string') inputError('Texto deve ser uma string.');
    if (charCount(value) > CANVAS_LIMITS.maxTextLength) optionsError('Texto excede 4096 caracteres.');
    if (!obj(options) || !allowed(options, ['x', 'y', 'maxWidth', 'fontSize', 'minFontSize', 'family', 'weight', 'color', 'align', 'wrap', 'maxLines', 'lineHeight', 'overflow', 'opacity', 'shadow'])) {
      optionsError('Opções de texto inválidas.');
    }
    number(options.x, 'x', -100_000); number(options.y, 'y', -100_000);
    const maxWidth = options.maxWidth ?? Math.max(1, this.width - options.x);
    positiveSize(maxWidth, 'maxWidth');
    if (options.fontSize !== undefined) positiveSize(options.fontSize, 'fontSize', 512);
    if (options.minFontSize !== undefined) positiveSize(options.minFontSize, 'minFontSize', 512);
    if (options.minFontSize !== undefined && options.minFontSize > (options.fontSize ?? 24)) optionsError('minFontSize não pode exceder fontSize.');
    if (options.family !== undefined && (typeof options.family !== 'string' || !/^[\p{L}\p{N} _.-]{1,64}$/u.test(options.family.trim()))) optionsError('Família de fonte inválida.');
    if (options.weight !== undefined && options.weight !== 400 && options.weight !== 700) optionsError('Peso de texto deve ser 400 ou 700.');
    if (options.color !== undefined) validateCanvasColor(options.color, 'Cor do texto');
    if (options.align !== undefined && !['left', 'center', 'right'].includes(options.align)) optionsError('Alinhamento de texto inválido.');
    if (options.wrap !== undefined && !['none', 'word'].includes(options.wrap)) optionsError('wrap deve ser none ou word.');
    if (options.maxLines !== undefined && (!Number.isSafeInteger(options.maxLines) || options.maxLines < 1 || options.maxLines > 100)) optionsError('maxLines deve ser inteiro de 1 a 100.');
    if (options.lineHeight !== undefined) number(options.lineHeight, 'lineHeight', 0.5, 4);
    if (options.overflow !== undefined && !['ellipsis', 'clip', 'error'].includes(options.overflow)) optionsError('overflow inválido.');
    validatePaint(options as unknown as Record<string, unknown>);
    const stored = { ...cloneCanvasValue(options), maxWidth };
    const textLength = charCount(value);
    this.checkTextLength(textLength);
    this.push({ type: 'text', value, options: stored });
    this.textLength += textLength;
    return this;
  }

  badges(items: readonly CanvasBadgeItem[], options: CanvasBadgesOptions): this {
    if (!Array.isArray(items) || items.length > CANVAS_LIMITS.maxBadges) optionsError('Badges devem conter até 32 itens.');
    if (!obj(options) || !allowed(options, ['x', 'y', 'maxWidth', 'height', 'gap', 'paddingX', 'radius', 'fill', 'selectedFill', 'color', 'selectedColor', 'fontSize', 'weight', 'opacity', 'shadow'])) {
      optionsError('Opções de badges inválidas.');
    }
    number(options.x, 'x', -100_000); number(options.y, 'y', -100_000); positiveSize(options.maxWidth, 'maxWidth'); validatePaint(options as unknown as Record<string, unknown>);
    if (options.height !== undefined) positiveSize(options.height, 'Altura de badge', 512);
    for (const key of ['gap', 'paddingX', 'radius'] as const) if (options[key] !== undefined) number(options[key], key, 0, 512);
    for (const key of ['fill', 'selectedFill', 'color', 'selectedColor'] as const) if (options[key] !== undefined) validateCanvasColor(options[key], key);
    if (options.fontSize !== undefined) positiveSize(options.fontSize, 'fontSize', 128);
    if (options.weight !== undefined && options.weight !== 400 && options.weight !== 700) optionsError('Peso de badge deve ser 400 ou 700.');
    let textLength = 0;
    const copied: CanvasBadgeItem[] = items.map(item => {
      if (!obj(item) || !allowed(item, ['text', 'icon', 'selected']) || typeof item.text !== 'string' || !item.text
        || (item.selected !== undefined && typeof item.selected !== 'boolean')) optionsError('Badge inválido.');
      if (charCount(item.text) > CANVAS_LIMITS.maxTextLength) optionsError('Texto do badge excede 4096 caracteres.');
      if (item.icon !== undefined) validateCanvasSource(item.icon, 'Ícone de badge');
      textLength += charCount(item.text);
      return cloneCanvasValue(item);
    });
    this.checkTextLength(textLength);
    const imageKeys = this.checkImages(copied.flatMap(item => item.icon ? [item.icon] : []));
    this.push({ type: 'badges', items: copied, options: cloneCanvasValue(options) }, items.length + 1);
    for (const key of imageKeys) this.imageKeys.add(key);
    this.textLength += textLength;
    return this;
  }

  progress(options: CanvasProgressOptions): this {
    if (!obj(options) || !allowed(options, ['x', 'y', 'width', 'height', 'value', 'max', 'fill', 'background', 'radius', 'opacity', 'shadow'])) optionsError('Opções de progresso inválidas.');
    number(options.x, 'x', -100_000); number(options.y, 'y', -100_000); positiveSize(options.width, 'Largura'); positiveSize(options.height, 'Altura');
    number(options.value, 'value', -Number.MAX_VALUE, Number.MAX_VALUE); positiveSize(options.max, 'max'); validatePaint(options as unknown as Record<string, unknown>);
    if (options.fill !== undefined) validateCanvasFill(options.fill);
    if (options.background !== undefined) validateCanvasFill(options.background);
    if (options.radius !== undefined) number(options.radius, 'Raio', 0, 100_000);
    this.push({ type: 'progress', options: cloneCanvasValue(options) }); return this;
  }

  async render(options: CanvasRenderOptions = {}): Promise<CanvasResult> {
    const scene = this.snapshot();
    return renderScene(scene, cloneCanvasValue(options), this.config, this.renderer);
  }

  belongsTo(owner: object): boolean { return this.owner === owner; }

  private push(operation: CanvasOperation, weight = 1): void {
    if (this.weightedOperations + weight > CANVAS_LIMITS.maxOperations) throw new YuzuhaError('EXECUTION_LIMIT', 'Cena excede 512 operações.');
    this.operations.push(operation); this.weightedOperations += weight;
  }

  private checkTextLength(additional: number): void {
    if (this.textLength + additional > CANVAS_LIMITS.maxSceneTextLength) throw new YuzuhaError('EXECUTION_LIMIT', 'Texto total excede 32768 caracteres.');
  }

  private checkImages(sources: readonly CanvasSource[]): string[] {
    const keys = sources.map(canvasSourceKey);
    if (new Set([...this.imageKeys, ...keys]).size > CANVAS_LIMITS.maxImages) {
      throw new YuzuhaError('EXECUTION_LIMIT', 'Cena excede 64 imagens distintas.');
    }
    return keys;
  }

  private snapshot(): CanvasScene {
    const scale = this.createOptions.scale ?? 1;
    const scene: CanvasScene = { width: this.width, height: this.height, scale,
      ...(this.createOptions.background ? { background: this.createOptions.background } : {}),
      operations: cloneCanvasValue(this.operations), fonts: cloneCanvasValue([...this.fonts.values()]) };
    return scene;
  }
}

function signalFailure(signal?: AbortSignal): Error | undefined {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  return reason instanceof YuzuhaError ? reason : new YuzuhaError('EXECUTION_ABORTED', 'Renderização cancelada.');
}

async function renderScene(scene: CanvasScene, requested: CanvasRenderOptions, config: CanvasRuntimeOptions, renderer: CanvasRenderer): Promise<CanvasResult> {
  const external = config.signal;
  const timeoutMs = requested.timeoutMs ?? config.timeoutMs ?? CANVAS_LIMITS.defaultTimeoutMs;
  const renderOptions = formatOptions({ ...requested, timeoutMs }, timeoutMs);
  if (signalFailure(external)) throw signalFailure(external);
  const controller = new AbortController();
  const onAbort = () => controller.abort(external?.reason instanceof YuzuhaError ? external.reason : new YuzuhaError('EXECUTION_ABORTED', 'Renderização cancelada.'));
  external?.addEventListener('abort', onAbort, { once: true });
  if (external?.aborted) onAbort();
  const timer = setTimeout(() => controller.abort(new YuzuhaError('EXECUTION_LIMIT', 'Renderização excedeu o prazo configurado.')), timeoutMs);
  const started = Date.now();
  try {
    const sourceCache = new Map<string, Uint8Array>();
    const resolveSource = async (source: CanvasSource, kind: 'image' | 'font'): Promise<Uint8Array> => {
      const key = canvasSourceKey(source);
      const existing = sourceCache.get(key);
      if (existing) return existing;
      let data: Uint8Array;
      if (source instanceof Uint8Array) data = new Uint8Array(source);
      else if (source.startsWith('asset:')) {
        const name = source.slice('asset:'.length), asset = config.assets && Object.hasOwn(config.assets, name) ? config.assets[name] : undefined;
        if (!asset) throw new YuzuhaError('CANVAS_ASSET', `Asset não encontrado: ${name}.`);
        data = new Uint8Array(asset);
      } else {
        if (!config.http) throw new YuzuhaError('CANVAS_ASSET', 'Fontes remotas exigem um serviço HTTP configurado.');
        let response;
        try { response = await config.http.requestBytes({ method: 'GET', url: source, signal: controller.signal }); }
        catch (cause) {
          if (controller.signal.aborted) throw controller.signal.reason;
          throw new YuzuhaError('CANVAS_ASSET', `Não foi possível resolver ${kind} remoto.`, { cause });
        }
        if (!response.ok) throw new YuzuhaError('CANVAS_ASSET', `Download de ${kind} retornou HTTP ${response.status}.`);
        data = new Uint8Array(response.body);
      }
      if (data.byteLength > CANVAS_LIMITS.maxItemBytes) throw new YuzuhaError('EXECUTION_LIMIT', `${kind === 'image' ? 'Imagem' : 'Fonte'} excede 10 MB.`);
      sourceCache.set(key, data);
      return data;
    };

    const imageCache = new Map<string, Uint8Array>();
    const fontsCache = new Map<string, Uint8Array>();
    const operations: CanvasOperation[] = [];
    for (const operation of scene.operations) {
      if (operation.type === 'image' || operation.type === 'avatar') {
        const bytes = await resolveSource(operation.source, 'image');
        inspectCanvasImage(bytes);
        imageCache.set(canvasSourceKey(operation.source), bytes);
        operations.push({ ...operation, source: bytes });
      } else if (operation.type === 'badges') {
        const items = [];
        for (const item of operation.items) {
          if (!item.icon) { items.push(item); continue; }
          const bytes = await resolveSource(item.icon, 'image');
          inspectCanvasImage(bytes);
          imageCache.set(canvasSourceKey(item.icon), bytes);
          items.push({ ...item, icon: bytes });
        }
        operations.push({ ...operation, items });
      } else operations.push(operation);
    }

    const requestedFamilies = new Map<string, Set<400 | 700>>();
    for (const operation of scene.operations) if (operation.type === 'text') {
      const family = operation.options.family ?? 'Inter', weight = operation.options.weight ?? 400;
      const weights = requestedFamilies.get(family) ?? new Set<400 | 700>(); weights.add(weight); requestedFamilies.set(family, weights);
    }
    const sceneFonts = new Map(scene.fonts.map(font => [`${font.family}\u0000${font.weight}`, font]));
    for (const [family, weights] of requestedFamilies) {
      if (family === 'Inter') continue;
      const configured = config.fonts && Object.hasOwn(config.fonts, family) ? config.fonts[family] : undefined;
      if (!configured && ![...sceneFonts.keys()].some(key => key.startsWith(`${family}\u0000`))) {
        throw new YuzuhaError('CANVAS_INPUT', `Família de fonte desconhecida: ${family}.`);
      }
      for (const weight of weights) {
        if ([...sceneFonts.keys()].some(key => key === `${family}\u0000${weight}`)) continue;
        const source = configured ? (weight === 700 ? configured.bold ?? configured.regular : configured.regular) : undefined;
        const existing = sceneFonts.get(`${family}\u0000400`) ?? sceneFonts.get(`${family}\u0000700`);
        const selected = source ?? existing?.source;
        if (!selected) throw new YuzuhaError('CANVAS_INPUT', `Família de fonte desconhecida: ${family}.`);
        const bytes = await resolveSource(selected, 'font');
        validateCanvasFontBytes(bytes);
        fontsCache.set(`${family}\u0000${weight}`, bytes);
        sceneFonts.set(`${family}\u0000${weight}`, { family, weight, source: bytes });
      }
    }
    for (const [key, font] of sceneFonts) {
      if (font.source instanceof Uint8Array) {
        validateCanvasFontBytes(font.source);
        fontsCache.set(key, new Uint8Array(font.source));
      } else {
        const bytes = await resolveSource(font.source, 'font');
        validateCanvasFontBytes(bytes); fontsCache.set(key, bytes); sceneFonts.set(key, { ...font, source: bytes });
      }
    }
    const distinctFonts = new Set([...fontsCache.values()].map(bytes => createHash('sha256').update(bytes).digest('hex')));
    if (distinctFonts.size > CANVAS_LIMITS.maxFontFiles) throw new YuzuhaError('EXECUTION_LIMIT', 'Cena excede 8 arquivos de fonte próprios.');
    let totalBytes = 0;
    const uniqueBytes = new Set<string>();
    for (const data of [...imageCache.values(), ...fontsCache.values()]) {
      const key = createHash('sha256').update(data).digest('hex');
      if (uniqueBytes.has(key)) continue;
      uniqueBytes.add(key); totalBytes += data.byteLength;
    }
    if (totalBytes > CANVAS_LIMITS.maxSceneAssetBytes) throw new YuzuhaError('EXECUTION_LIMIT', 'Assets e fontes excedem 20 MB por cena.');
    const distinctImages = new Set([...imageCache.values()].map(bytes => createHash('sha256').update(bytes).digest('hex')));
    if (distinctImages.size > CANVAS_LIMITS.maxImages) throw new YuzuhaError('EXECUTION_LIMIT', 'Cena excede 64 imagens distintas.');
    const finalScene: CanvasScene = { ...cloneCanvasValue(scene), operations,
      fonts: [...sceneFonts.values()].map(font => ({ ...font, source: new Uint8Array(fontsCache.get(`${font.family}\u0000${font.weight}`) ?? font.source as Uint8Array) })) };
    const remaining = timeoutMs - (Date.now() - started);
    if (remaining <= 0) throw new YuzuhaError('EXECUTION_LIMIT', 'Renderização excedeu o prazo configurado.');
    const abortError = signalFailure(controller.signal);
    if (abortError) throw abortError;
    return await renderer.render(finalScene, { ...renderOptions, timeoutMs: remaining, signal: controller.signal });
  } finally {
    clearTimeout(timer); external?.removeEventListener('abort', onAbort);
  }
}

export class CanvasService {
  private readonly config: CanvasRuntimeOptions;
  private readonly owner = {};
  constructor(private readonly host: CanvasHostOptions) { this.config = cloneConfig(host); }

  create(width: number, height: number, options: CanvasCreateOptions = {}): CanvasBuilder {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) optionsError('Largura e altura devem ser inteiros positivos.');
    if (!obj(options) || !allowed(options, ['scale', 'background'])) optionsError('Opções de criação inválidas.');
    const scale = options.scale ?? 1;
    if (!Number.isSafeInteger(scale) || scale < 1 || scale > 4) optionsError('scale deve ser inteiro de 1 a 4.');
    const physicalWidth = width * scale, physicalHeight = height * scale;
    if (physicalWidth > 4096 || physicalHeight > 4096 || physicalWidth * physicalHeight > 16_777_216) optionsError('Dimensões físicas excedem os limites do Canvas.');
    if (options.background !== undefined) validateCanvasColor(options.background, 'Background');
    return new CanvasBuilderImpl(width, height, cloneCanvasValue(options), this.config, this.host.renderer, this.owner);
  }

  async send(builder: CanvasBuilder | CanvasLike, options: CanvasSendOptions = {}): Promise<string> {
    if (!this.host.messages) throw new YuzuhaError('CANVAS_STATE', 'Este canvas não tem transporte de mensagens para envio.');
    const builderOwn = builder instanceof CanvasBuilderImpl && builder.belongsTo(this.owner);
    if (!builderOwn && !canvasLike(builder)) throw new YuzuhaError('CANVAS_STATE', 'Builder de Canvas inválido para este contexto.');
    if (!obj(options) || !allowed(options, ['channelID', 'name', 'content', 'description', 'format', 'quality', 'matte', 'timeoutMs'])) optionsError('Opções de envio inválidas.');
    const channelID = options.channelID ?? this.host.channelID;
    if (typeof channelID !== 'string' || !channelID.trim()) throw new YuzuhaError('CANVAS_STATE', 'Informe channelID para enviar a imagem.');
    if (options.content !== undefined && (typeof options.content !== 'string' || options.content.length > 2000)) optionsError('content deve ter até 2000 caracteres.');
    if (options.description !== undefined && (typeof options.description !== 'string' || options.description.length > 1024)) optionsError('description deve ter até 1024 caracteres.');
    const renderOptions = formatOptions({ format: options.format, quality: options.quality, matte: options.matte, timeoutMs: options.timeoutMs },
      this.config.timeoutMs ?? CANVAS_LIMITS.defaultTimeoutMs);
    const name = attachmentName(options.name, renderOptions.format);
    let data: Uint8Array;
    if (builderOwn) {
      const result = await (builder as CanvasBuilderImpl).render(renderOptions);
      if (result.format !== renderOptions.format) throw new YuzuhaError('CANVAS_PROCESS', 'Formato renderizado não corresponde ao solicitado.');
      data = new Uint8Array(result.data);
    } else {
      const canvas = builder as CanvasLike;
      if (!Number.isSafeInteger(canvas.width) || !Number.isSafeInteger(canvas.height) || canvas.width < 1 || canvas.height < 1
        || canvas.width > CANVAS_LIMITS.maxPhysicalDimension || canvas.height > CANVAS_LIMITS.maxPhysicalDimension
        || canvas.width * canvas.height > CANVAS_LIMITS.maxPixels) optionsError('Dimensões físicas excedem os limites do Canvas.');
      const before = signalFailure(this.config.signal);
      if (before) throw before;
      const encoded = await canvas.encode(renderOptions.format, renderOptions.quality);
      data = new Uint8Array(encoded);
      if (data.byteLength > CANVAS_LIMITS.maxOutputBytes) throw new YuzuhaError('EXECUTION_LIMIT', 'Imagem codificada excede 10 MB.');
    }
    if (signalFailure(this.config.signal)) throw signalFailure(this.config.signal);
    return this.host.messages.sendBytes(channelID, [{ data, name, ...(options.description ? { description: options.description } : {}) }], options.content);
  }

  async loadImage(source: unknown): Promise<CanvasImageLike> {
    const module = await import('../canvas.js');
    return module.loadImage(source as Parameters<typeof module.loadImage>[0], { http: this.config.http, signal: this.config.signal });
  }
}

function attachmentName(name: string | undefined, format: CanvasResult['format']): string {
  const extension = format === 'jpeg' ? 'jpg' : format;
  if (name === undefined) return `canvas.${extension}`;
  if (typeof name !== 'string' || !name.trim() || name.length > 255 || /[\r\n/\\]/.test(name)) optionsError('Nome de anexo inválido.');
  const match = /\.([^.]+)$/.exec(name);
  if (!match) return `${name}.${extension}`;
  const supplied = match[1]!.toLowerCase();
  if (supplied !== extension && !(format === 'jpeg' && supplied === 'jpeg')) optionsError('Extensão do nome não corresponde ao formato da imagem.');
  return name;
}
