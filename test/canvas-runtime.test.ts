import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas as createNativeCanvas, loadImage } from '@napi-rs/canvas';
import { createCard } from '../src/canvas/card.js';
import type { CanvasResult, CanvasScene } from '../src/domain/canvas.js';
import { canvasRenderer } from '../src/infrastructure/canvas/render.js';
import { activeImageProcesses } from '../src/infrastructure/process-budget.js';
import { transformImage } from '../src/images.js';
import { CommandContext, EventContext, HttpService, MemoryStore, Yuzuha } from '../src/index.js';
import { Runtime } from '../src/functions.js';
import { registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';

async function solid(width: number, height: number, color: string): Promise<Uint8Array> {
  const canvas = createNativeCanvas(width, height), context = canvas.getContext('2d');
  context.fillStyle = color; context.fillRect(0, 0, width, height);
  return new Uint8Array(await canvas.encode('png'));
}

async function pixel(data: Uint8Array, x: number, y: number): Promise<number[]> {
  const image = await loadImage(data), canvas = createNativeCanvas(image.width, image.height), context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return [...context.getImageData(x, y, 1, 1).data];
}

function fakeRenderer() {
  return { async render(scene: CanvasScene): Promise<CanvasResult> {
    const data = await solid(scene.width * scene.scale, scene.height * scene.scale, '#f00');
    return { data, format: 'png', width: scene.width * scene.scale, height: scene.height * scene.scale };
  } };
}

function context(options: { renderer?: typeof canvasRenderer; signal?: AbortSignal; assets?: Record<string, Uint8Array>;
  http?: HttpService;
  messages?: (files: { data: Uint8Array; name: string; description?: string }[], content?: string) => Promise<string> } = {}) {
  const uploads: { channelID: string; files: { data: Uint8Array; name: string; description?: string }[]; content?: string }[] = [];
  const ctx = new CommandContext({ message: mockMessage('!canvas', { authorName: 'Ada $stop[]' }), command: { name: 'canvas' },
    store: new MemoryStore(), transport: new MockTransport(), cooldown: () => 0, signal: options.signal, http: options.http,
    canvas: { renderer: options.renderer ?? canvasRenderer, config: { assets: options.assets } },
    resources: mockResources({ messages: { async sendBytes(channelID, files, content) {
      uploads.push({ channelID, files, content });
      return options.messages ? options.messages(files, content) : `message-${uploads.length}`;
    } } }) });
  return { ctx, uploads };
}

function scriptRuntime(): Runtime { return registerBuiltins(new Runtime()); }

test('remote assets use context HTTP once per render and failed statuses do not upload', async () => {
  const bytes = await solid(8, 4, '#26a9e0');
  let requests = 0;
  const http = new HttpService({ fetch: async () => { requests++; return new Response(Buffer.from(bytes)); } });
  const f = context({ http });
  const url = 'https://93.184.216.34/avatar.png';
  const result = await f.ctx.canvas.create(24, 8)
    .image(url, { x: 0, y: 0, width: 8, height: 8 })
    .image(url, { x: 12, y: 0, width: 8, height: 8 })
    .render();
  assert.equal(requests, 1);
  assert.deepEqual(await pixel(result.data, 3, 3), [38, 169, 224, 255]);

  const missing = context({ http: new HttpService({ fetch: async () => new Response('missing', { status: 404 }) }) });
  const card = missing.ctx.canvas.create(8, 8).image(url, { x: 0, y: 0, width: 8, height: 8 });
  await assert.rejects(missing.ctx.canvas.send(card), { code: 'CANVAS_ASSET' });
  assert.equal(missing.uploads.length, 0);
});

test('native context sends a complete image directly without reading a message', async () => {
  const sent: unknown[] = [];
  const ctx = new EventContext({ event: { name: 'guildMemberAdd', guildID: '100', channelID: null, userID: '2', userName: 'Pessoa nova',
    userBot: false, messageID: null, content: null, oldContent: null, emoji: null }, channelID: 'welcome-channel',
    transport: new MockTransport(), store: new MemoryStore(), cooldown: () => 0, resources: mockResources({ messages: {
      async sendBytes(channelID, files, content) { sent.push({ channelID, files, content }); return 'welcome-message'; },
    } }), canvas: { renderer: canvasRenderer } });
  const builder = ctx.canvas.create(80, 40, { background: '#10202c' }).text(ctx.authorName, { x: 8, y: 8, maxWidth: 64, fontSize: 12 });
  assert.equal(await ctx.canvas.send(builder, { name: 'welcome.png' }), 'welcome-message');
  assert.equal(sent.length, 1);
  const payload = sent[0] as { channelID: string; files: { data: Uint8Array; name: string }[] };
  assert.equal(payload.channelID, 'welcome-channel'); assert.equal(payload.files[0]!.name, 'welcome.png');
  assert.equal((await loadImage(payload.files[0]!.data)).width, 80);
  assert.throws(() => ctx.message, /não fornece uma mensagem/i);
});

test('native command and contextEvent upload real images through mocked resources without login', async () => {
  const uploads: { channelID: string; files: { data: Uint8Array; name: string }[] }[] = [];
  const errors: unknown[] = [];
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false, http: false,
    resources: mockResources({ messages: { async sendBytes(channelID, files) {
      uploads.push({ channelID, files }); return `image-${uploads.length}`;
    } } }), onError: error => { errors.push(error); } });
  try {
    bot.command({ name: 'card', async run(ctx) {
      await ctx.canvas.send(ctx.canvas.create(32, 20, { background: '#10202c' })
        .text(ctx.authorName, { x: 2, y: 2, maxWidth: 28, fontSize: 8 }));
    } });
    bot.contextEvent({ event: 'guildMemberAdd', channelID: '300', async run(ctx, member) {
      await ctx.canvas.send(ctx.canvas.create(32, 20, { background: '#10202c' })
        .text(member.user.username, { x: 2, y: 2, maxWidth: 28, fontSize: 8 }), { name: 'welcome.png' });
    } });
    assert.equal(await bot.handle(mockMessage('!card')), 'success');
    bot.client.emit('guildMemberAdd', { id: '2', user: { username: 'Mina', bot: false }, guild: { id: '100' } } as never);
    for (let attempt = 0; attempt < 500 && uploads.length < 2; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(uploads.length, 2);
    assert.deepEqual(uploads.map(upload => upload.channelID), ['200', '300']);
    assert.equal(uploads[1]!.files[0]!.name, 'welcome.png');
    for (const upload of uploads) assert.equal((await loadImage(upload.files[0]!.data)).width, 32);
    assert.deepEqual(errors, []);
  } finally { await bot.destroy(); }
});

test('function mode produces only its canvas upload and treats returned user text literally', async () => {
  const f = context({ renderer: fakeRenderer() });
  f.ctx.vars.set('name', '$stop[]');
  const runtime = scriptRuntime();
  const source = '$canvasCreate[profile;16;16;$object[scale;2;background;#090b10]]'
    + '$canvasText[profile;$get[name];1;1;$object[maxWidth;14;fontSize;9;weight;700]]'
    + '$canvasSend[profile;$object[name;profile.png;content;demo]]';
  assert.equal(await runtime.execute(runtime.compile(source), f.ctx), '');
  assert.equal(f.uploads.length, 1); assert.equal(f.uploads[0]!.channelID, '200');
  assert.equal(f.uploads[0]!.files[0]!.name, 'profile.png'); assert.equal(f.uploads[0]!.content, 'demo');
  assert.equal(f.ctx.vars.has('$stop[]'), false);
});

test('function canvas state is private per Evaluator, dispose allows reuse, and finally clears it', async () => {
  const f = context({ renderer: fakeRenderer() }), runtime = scriptRuntime();
  const source = '$canvasCreate[same;4;4]$canvasDispose[same]$canvasCreate[same;4;4]$canvasSend[same]';
  const results = await Promise.all([runtime.execute(runtime.compile(source), f.ctx), runtime.execute(runtime.compile(source), f.ctx)]);
  assert.deepEqual(results, ['', '']); assert.equal(f.uploads.length, 2);
  await assert.rejects(runtime.execute(runtime.compile('$canvasText[same;oi;0;0]'), f.ctx), { code: 'CANVAS_STATE' });
  assert.equal(f.ctx.vars.has('same'), false);
});

test('canvas function quotas and cancellation pass through $try', async () => {
  const f = context({ renderer: fakeRenderer() }), runtime = scriptRuntime();
  const source = '$canvasCreate[c;1;1]' + '$canvasSend[c]'.repeat(4) + '$try[$canvasSend[c];fallback]';
  await assert.rejects(runtime.execute(runtime.compile(source), f.ctx), { code: 'EXECUTION_LIMIT' });
  assert.equal(f.uploads.length, 4);

  const abort = new AbortController(), cancelled = context({ renderer: fakeRenderer(), signal: abort.signal });
  abort.abort();
  await assert.rejects(scriptRuntime().execute(scriptRuntime().compile('$try[$canvasCreate[c;1;1];fallback]'), cancelled.ctx), { code: 'EXECUTION_ABORTED' });
});

test('image and canvas operations share the two-process budget and cancellation releases a slot', async () => {
  const data = await solid(8, 8, '#26a9e0');
  const first = transformImage(data), second = createCard(120, 80).render();
  await assert.rejects(transformImage(data), { code: 'EXECUTION_LIMIT' });
  assert.equal(activeImageProcesses(), 2);
  await Promise.all([first, second]);
  assert.equal(activeImageProcesses(), 0);

  const controller = new AbortController();
  const pending = createCard(100, 80, { signal: controller.signal }).render();
  const cancelled = assert.rejects(pending, { code: 'EXECUTION_ABORTED' });
  setTimeout(() => controller.abort(), 25);
  await cancelled;
  for (let attempt = 0; attempt < 50 && activeImageProcesses(); attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(activeImageProcesses(), 0);
  assert.equal((await transformImage(data)).width, 8);
});
