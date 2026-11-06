import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas as createNativeCanvas, loadImage } from '@napi-rs/canvas';
import { createCard } from '../src/canvas/card.js';

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

test('renders scale, transparent pixels, alpha, operation order, gradients and formats', async () => {
  const result = await createCard(12, 6, { scale: 2 })
    .rect({ x: 0, y: 0, width: 4, height: 6, fill: '#ff0000', opacity: 0.5 })
    .rect({ x: 2, y: 0, width: 2, height: 6, fill: '#0000ff' })
    .rect({ x: 4, y: 0, width: 4, height: 6, fill: {
      type: 'linear', x0: 4, y0: 0, x1: 8, y1: 0,
      stops: [{ offset: 0, color: '#00ff00' }, { offset: 1, color: '#000000' }],
    } })
    .render();
  assert.equal(result.format, 'png'); assert.equal(result.width, 24); assert.equal(result.height, 12);
  const alpha = await pixel(result.data, 1, 1);
  assert.deepEqual(alpha, [255, 0, 0, 128]);
  assert.deepEqual(await pixel(result.data, 5, 1), [0, 0, 255, 255]);
  assert.equal((await pixel(result.data, 22, 10))[3], 0);

  const jpg = await createCard(8, 4).render({ format: 'jpeg', quality: 90 });
  assert.equal(jpg.format, 'jpeg'); assert.equal(jpg.width, 8); assert.ok(jpg.data.length > 0);
  const jpgPixel = await pixel(jpg.data, 4, 2);
  assert.ok(jpgPixel[0]! > 240 && jpgPixel[1]! > 240 && jpgPixel[2]! > 240);
  const webp = await createCard(8, 4).render({ format: 'webp', quality: 75 });
  assert.equal(webp.format, 'webp'); assert.equal((await loadImage(webp.data)).height, 4);
  await assert.rejects(createCard(4, 4).render({ quality: 85 }), { code: 'CANVAS_OPTIONS' });
});

test('copies operation options and image bytes when they enter the builder', async () => {
  const input = await solid(4, 4, '#e02030');
  const options = { x: 0, y: 0, width: 4, height: 4, fill: '#20d060' };
  const builder = createCard(8, 4).image(input, { x: 4, y: 0, width: 4, height: 4 }).rect(options);
  input.fill(0); options.fill = '#0000ff';
  const result = await builder.render();
  assert.deepEqual(await pixel(result.data, 1, 1), [32, 208, 96, 255]);
  assert.deepEqual(await pixel(result.data, 5, 1), [224, 32, 48, 255]);
});

test('circular avatar crops a rectangular source without stretching and keeps corners transparent', async () => {
  const sourceCanvas = createNativeCanvas(4, 2), sourceContext = sourceCanvas.getContext('2d');
  sourceContext.fillStyle = '#ff0000'; sourceContext.fillRect(0, 0, 2, 2);
  sourceContext.fillStyle = '#0000ff'; sourceContext.fillRect(2, 0, 2, 2);
  const source = new Uint8Array(await sourceCanvas.encode('png'));
  const result = await createCard(24, 24).avatar(source, { x: 2, y: 2, size: 20, border: { color: '#ffffff', width: 1 } }).render();
  assert.equal((await pixel(result.data, 2, 2))[3], 0);
  const left = await pixel(result.data, 7, 12), right = await pixel(result.data, 17, 12);
  assert.ok(left[0]! > left[2]!); assert.ok(right[2]! > right[0]!);
});

test('rounded clipping, shadows and badges respect boxes without leaking paint state', async () => {
  const source = await solid(8, 8, '#f2b441');
  const result = await createCard(80, 40)
    .image(source, { x: 4, y: 6, width: 20, height: 16, fit: 'stretch', clip: 'rounded', radius: 8,
      border: { color: '#ffffff', width: 1 } })
    .rect({ x: 40, y: 6, width: 10, height: 10, fill: '#ff0000', shadow: { color: '#000000', blur: 0, offsetX: 12, offsetY: 0 } })
    .rect({ x: 66, y: 6, width: 5, height: 10, fill: '#0000ff' })
    .badges([{ text: 'First badge' }, { text: 'Second badge' }], { x: 4, y: 27, maxWidth: 28, height: 6, fontSize: 5, paddingX: 4 })
    .render();
  assert.equal((await pixel(result.data, 4, 6))[3], 0);
  assert.deepEqual(await pixel(result.data, 12, 12), [242, 180, 65, 255]);
  const shadow = await pixel(result.data, 60, 10);
  assert.ok(shadow[3]! > 0 && shadow[0]! < 80 && shadow[1]! < 80 && shadow[2]! < 80);
  assert.deepEqual(await pixel(result.data, 68, 8), [0, 0, 255, 255]);
  assert.equal((await pixel(result.data, 75, 8))[3], 0);
  assert.equal((await pixel(result.data, 33, 30))[3], 0);
});

test('text, configured fonts, badges and progress render using real Skia', async () => {
  const regular = new Uint8Array(await (await import('node:fs/promises')).readFile(new URL('../assets/canvas/Inter-Regular.ttf', import.meta.url)));
  const result = await createCard(360, 120)
    .font('Local Inter', regular)
    .text('Árvore e São João: um nome de comunidade que pode ser muito comprido', {
      x: 12, y: 10, maxWidth: 210, fontSize: 28, minFontSize: 16, weight: 700, family: 'Local Inter',
      wrap: 'word', maxLines: 2, overflow: 'ellipsis',
    })
    .badges([{ text: 'Membro' }, { text: 'Construtor', selected: true }, { text: 'Veterano' }, { text: 'Apoiador' }], {
      x: 12, y: 68, maxWidth: 180, height: 22, fontSize: 11,
    })
    .progress({ x: 220, y: 82, width: 120, height: 12, value: 130, max: 100, fill: '#4bd6ad' })
    .render();
  assert.equal(result.width, 360); assert.equal((await loadImage(result.data)).height, 120);
  assert.ok((await pixel(result.data, 330, 87))[3]! > 0);
  const belowZero = await createCard(20, 8).progress({ x: 0, y: 0, width: 20, height: 8, value: -10, max: 100, fill: '#ff0000', background: '#0000ff' }).render();
  assert.deepEqual(await pixel(belowZero.data, 5, 4), [0, 0, 255, 255]);
  await assert.rejects(createCard(10, 10).text('texto', { x: 0, y: 0, maxWidth: 9, fontSize: 9, family: 'Ausente' }).render(), { code: 'CANVAS_INPUT' });
});

test('builder validation rejects colors, gradient stops, ratios, image signatures and invalid progress', async () => {
  assert.throws(() => createCard(4, 4).rect({ x: 0, y: 0, width: 2, height: 2, fill: 'red' }), { code: 'CANVAS_OPTIONS' });
  assert.throws(() => createCard(4, 4).rect({ x: 0, y: 0, width: 2, height: 2, fill: {
    type: 'linear', x0: 0, y0: 0, x1: 1, y1: 1,
    stops: [{ offset: 0.7, color: '#fff' }, { offset: 0.6, color: '#000' }],
  } }), { code: 'CANVAS_OPTIONS' });
  assert.throws(() => createCard(4, 4).image(new Uint8Array([1]), { x: 0, y: 0, width: 1, height: 1, cropX: 1.1 }), { code: 'CANVAS_OPTIONS' });
  assert.throws(() => createCard(4, 4).progress({ x: 0, y: 0, width: 2, height: 1, value: 1, max: 0 }), { code: 'CANVAS_OPTIONS' });
  assert.throws(() => createCard(4, 4).image(new Uint8Array(10_000_001), { x: 0, y: 0, width: 4, height: 4 }), { code: 'EXECUTION_LIMIT' });
  await assert.rejects(createCard(4, 4).image(new Uint8Array([1, 2, 3]), { x: 0, y: 0, width: 4, height: 4 }).render(), { code: 'CANVAS_INPUT' });
});
