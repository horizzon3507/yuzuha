import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { transformImage } from '../src/images.js';

async function sample() {
  return sharp({ create: { width: 40, height: 20, channels: 3, background: '#eacb1a' } }).png().toBuffer();
}

test('optional image module transforms real pixels offline and returns isolated bytes', async () => {
  const data = await sample(), original = Buffer.from(data);
  const result = await transformImage(data, { width: 10, height: 10, format: 'webp', grayscale: true });
  assert.equal(result.width, 10); assert.equal(result.height, 5); assert.equal(result.format, 'webp');
  assert.deepEqual(data, original);
  const decoded = await sharp(result.data).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < decoded.data.length; i += decoded.info.channels) {
    assert.equal(decoded.data[i], decoded.data[i + 1]); assert.equal(decoded.data[i], decoded.data[i + 2]);
  }
  const rotated = await transformImage(data, { rotate: 90 });
  assert.equal(rotated.width, 20); assert.equal(rotated.height, 40);
  const metadata = await sharp(rotated.data).metadata();
  assert.equal(metadata.format, 'png'); assert.equal(metadata.exif, undefined);
});

test('image input/options reject unsupported data, oversize dimensions and invalid formats', async () => {
  await assert.rejects(transformImage(new Uint8Array()), { code: 'IMAGE_INPUT' });
  await assert.rejects(transformImage(new Uint8Array(10_000_001)), { code: 'IMAGE_INPUT' });
  await assert.rejects(transformImage(new TextEncoder().encode('<svg/>')), { code: 'IMAGE_INPUT' });
  const image = await sample();
  for (const options of [{ width: 4097 }, { height: 0 }, { quality: 101 }, { rotate: 45 }, { format: 'gif' }]) {
    await assert.rejects(transformImage(image, options as never), { code: 'IMAGE_OPTIONS' });
  }
  const huge = await sharp({ create: { width: 4097, height: 4097, channels: 3, background: '#eacb1a' } }).png().toBuffer();
  await assert.rejects(transformImage(huge), { code: 'IMAGE_PROCESS' });
});

test('image cancellation and process budget release capacity for subsequent work', async () => {
  const image = await sample();
  const pre = new AbortController(); pre.abort();
  await assert.rejects(transformImage(image, {}, { signal: pre.signal }), { code: 'EXECUTION_ABORTED' });
  const first = new AbortController(), second = new AbortController();
  const a = transformImage(image, {}, { signal: first.signal });
  const b = transformImage(image, {}, { signal: second.signal });
  const rejectedA = assert.rejects(a, { code: 'EXECUTION_ABORTED' });
  const rejectedB = assert.rejects(b, { code: 'EXECUTION_ABORTED' });
  await assert.rejects(transformImage(image), { code: 'EXECUTION_LIMIT' });
  first.abort(); second.abort(); await Promise.all([rejectedA, rejectedB]);
  assert.equal((await transformImage(image)).width, 40);
  await assert.rejects(transformImage(image, {}, { timeoutMs: 10 }), { code: 'EXECUTION_LIMIT' });
  assert.equal((await transformImage(image)).height, 20);
});
