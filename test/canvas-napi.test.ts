import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import * as napi from '@napi-rs/canvas';
import * as canvas from '../src/canvas.js';
import { HttpService, MemoryStore } from '../src/index.js';
import { CommandContext } from '../src/index.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';

const exec = promisify(execFile);
const source = fileURLToPath(new URL('../src/', import.meta.url));
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

async function solidPNG(width: number, height: number, color: string): Promise<Uint8Array> {
  const image = napi.createCanvas(width, height), context = image.getContext('2d');
  context.fillStyle = color; context.fillRect(0, 0, width, height);
  return new Uint8Array(await image.encode('png'));
}

function host(options: { signal?: AbortSignal; messages?: (files: { data: Uint8Array; name: string }[], content?: string) => Promise<string> } = {}) {
  const uploads: { channelID: string; files: { data: Uint8Array; name: string; description?: string }[]; content?: string }[] = [];
  const ctx = new CommandContext({ message: mockMessage('!img', {}), command: { name: 'img' },
    store: new MemoryStore(), transport: new MockTransport(), cooldown: () => 0, signal: options.signal,
    canvas: { renderer: { async render() { throw new Error('builder não deve renderizar neste teste'); } } },
    resources: mockResources({ messages: { async sendBytes(channelID, files, content) {
      uploads.push({ channelID, files, content });
      return options.messages ? options.messages(files, content) : `message-${uploads.length}`;
    } } }) });
  return { ctx, uploads };
}

test('createCanvas desenha e codifica; limites de dimensão viram CANVAS_OPTIONS', async () => {
  const image = canvas.createCanvas(24, 16);
  assert.equal(image.width, 24); assert.equal(image.height, 16);
  const context = image.getContext('2d');
  context.fillStyle = '#e63946'; context.fillRect(0, 0, 24, 16);
  const data = new Uint8Array(await image.encode('png'));
  assert.deepEqual([...data.subarray(0, 8)], PNG_SIGNATURE);
  const decoded = await napi.loadImage(data);
  assert.equal(decoded.width, 24); assert.equal(decoded.height, 16);
  assert.throws(() => canvas.createCanvas(0, 4), { code: 'CANVAS_OPTIONS' });
  assert.throws(() => canvas.createCanvas(5000, 4), { code: 'CANVAS_OPTIONS' });
  assert.throws(() => canvas.createCanvas(4096, 4097), { code: 'CANVAS_OPTIONS' });
});

test('yuzuha/canvas cobre todos os exports de valor de @napi-rs/canvas', () => {
  for (const name of Object.keys(napi)) {
    if (name === 'default' || name === 'module.exports') continue;
    assert.equal(name in canvas, true, `export ${name} ausente em yuzuha/canvas`);
  }
});

test('ctx.canvas.send(canvas) envia PNG nomeado e retorna o id da mensagem', async () => {
  const { ctx, uploads } = host();
  const image = canvas.createCanvas(10, 8);
  image.getContext('2d').fillStyle = '#00ff00';
  image.getContext('2d').fillRect(0, 0, 10, 8);
  const id = await ctx.canvas.send(image, { name: 'pixel', channelID: '300', content: 'arte' });
  assert.equal(id, 'message-1');
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0]!.channelID, '300');
  assert.equal(uploads[0]!.content, 'arte');
  assert.equal(uploads[0]!.files[0]!.name, 'pixel.png');
  assert.deepEqual([...uploads[0]!.files[0]!.data.subarray(0, 8)], PNG_SIGNATURE);
});

test('ctx.canvas.send respeita sinal, dimensões e saída máxima sem enviar', async () => {
  const aborted = new AbortController();
  aborted.abort();
  const first = host({ signal: aborted.signal });
  const image = canvas.createCanvas(4, 4);
  await assert.rejects(first.ctx.canvas.send(image, { channelID: '300' }));
  assert.equal(first.uploads.length, 0);

  const second = host();
  const oversize = { width: 2, height: 2, encode: async () => new Uint8Array(10_000_001) };
  await assert.rejects(second.ctx.canvas.send(oversize as never, { channelID: '300' }), { code: 'EXECUTION_LIMIT' });
  assert.equal(second.uploads.length, 0);

  const third = host();
  const huge = { width: 4097, height: 2, encode: async () => new Uint8Array(0) };
  await assert.rejects(third.ctx.canvas.send(huge as never, { channelID: '300' }), { code: 'CANVAS_OPTIONS' });
});

test('loadImage resolve URLs HTTP via HttpService com guarda de rede privada', async t => {
  const png = await solidPNG(6, 4, '#224466');
  const server = createServer((request, response) => {
    if (request.url === '/falha') { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': 'image/png' });
    response.end(Buffer.from(png));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/imagem.png`;
  const http = new HttpService({ allowPrivate: true });

  await assert.rejects(canvas.loadImage(url), { code: 'HTTP_PRIVATE' });

  const image = await canvas.loadImage(url, { http });
  assert.equal(image.width, 6); assert.equal(image.height, 4);
  await assert.rejects(canvas.loadImage(`${url.replace('imagem.png', 'falha')}`, { http }), { code: 'CANVAS_ASSET' });
  await assert.rejects(canvas.loadImage(url, { http: new HttpService({ allowPrivate: true, maxBytes: 10 }) }), { code: 'HTTP_BODY_TOO_LARGE' });

  const fromBuffer = await canvas.loadImage(Buffer.from(png));
  assert.equal(fromBuffer.width, 6); assert.equal(fromBuffer.height, 4);
});

test('registerFonts registra extensões de fonte e tolera diretório ausente', async () => {
  assert.equal(canvas.registerFonts(join(source, 'inexistente')), 0);
  assert.throws(() => canvas.registerFonts(join(source, 'canvas.ts')), { code: 'CANVAS_OPTIONS' });
  const fonts = fileURLToPath(new URL('../assets/canvas', import.meta.url));
  assert.ok(canvas.registerFonts(fonts) >= 1);
  assert.equal(napi.GlobalFonts.has('Inter'), true);
});

test('sem o peer, createCanvas falha com CANVAS_DEPENDENCY e card segue resolvendo', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yuzuha-napi-block-'));
  const loaderPath = join(dir, 'loader.mjs');
  await writeFile(loaderPath, `export async function resolve(specifier, context, next) {
    if (specifier === '@napi-rs/canvas') {
      const error = new Error("Cannot find package '@napi-rs/canvas'");
      error.code = 'ERR_MODULE_NOT_FOUND';
      throw error;
    }
    return next(specifier, context);
  }`);
  const script = `
import assert from 'node:assert/strict';
const canvas = await import(${JSON.stringify(pathToFileURL(join(source, 'canvas.ts')).href)});
await import(${JSON.stringify(pathToFileURL(join(source, 'index.ts')).href)});
const card = await import(${JSON.stringify(pathToFileURL(join(source, 'canvas/card.ts')).href)});
assert.throws(() => canvas.createCanvas(1, 1), { code: 'CANVAS_DEPENDENCY' });
assert.throws(() => { new canvas.Canvas(1, 1); }, { code: 'CANVAS_DEPENDENCY' });
await assert.rejects(canvas.loadImage(new Uint8Array([1])), { code: 'CANVAS_DEPENDENCY' });
const builder = card.createCard(4, 4).rect({ x: 0, y: 0, width: 4, height: 4, fill: '#fff' });
assert.ok(builder);
`;
  try {
    await exec(process.execPath, ['--import', 'tsx', '--experimental-loader', pathToFileURL(loaderPath).href,
      '--input-type=module', '-e', script]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('ctx.canvas.send aplica timeoutMs e matte sem mutar o canvas', async () => {
  const { ctx, uploads } = host();
  const slow = { width: 2, height: 2,
    encode: () => new Promise<Uint8Array>(resolve => setTimeout(() => resolve(new Uint8Array(8)), 500)) };
  await assert.rejects(ctx.canvas.send(slow as never, { channelID: '300', timeoutMs: 50 }), { code: 'EXECUTION_LIMIT' });
  assert.equal(uploads.length, 0);
  await new Promise(resolve => setTimeout(resolve, 550));

  const matte = host();
  const transparent = canvas.createCanvas(4, 4);
  const id = await matte.ctx.canvas.send(transparent, { channelID: '300', format: 'jpeg', matte: '#ff0000' });
  assert.equal(id, 'message-1');
  const pixel = transparent.getContext('2d').getImageData(0, 0, 1, 1).data;
  assert.equal(pixel[3], 0);
});
