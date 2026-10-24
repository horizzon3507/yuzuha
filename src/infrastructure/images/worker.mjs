process.once('message', async ({ data, transform }) => {
  try {
    let sharp;
    try { ({ default: sharp } = await import('sharp')); }
    catch { throw Object.assign(new Error('Instale sharp para usar yuzuha/images.'), { code: 'IMAGE_DEPENDENCY' }); }
    sharp.cache(false);
    sharp.concurrency(1);
    const bytes = Buffer.from(data);
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!png && !jpeg && !webp) throw Object.assign(new Error('Entrada deve ser PNG, JPEG ou WebP.'), { code: 'IMAGE_INPUT' });
    let image = sharp(bytes, { limitInputPixels: 16_777_216, limitInputChannels: 4, sequentialRead: true, pages: 1, failOn: 'warning' });
    const metadata = await image.metadata();
    if ((metadata.pages ?? 1) > 1) throw Object.assign(new Error('Imagens animadas não são aceitas.'), { code: 'IMAGE_INPUT' });
    if (transform.rotate !== undefined) image = image.rotate(transform.rotate);
    if (transform.width !== undefined || transform.height !== undefined) image = image.resize({ width: transform.width, height: transform.height,
      fit: transform.fit ?? 'inside', withoutEnlargement: true });
    if (transform.grayscale) image = image.grayscale();
    const format = transform.format ?? 'png';
    const { data: output, info } = await image.toFormat(format, format === 'png' ? {} : { quality: transform.quality ?? 80 }).toBuffer({ resolveWithObject: true });
    if (output.byteLength > 10_000_000) throw Object.assign(new Error('Saída excede 10 MB.'), { code: 'EXECUTION_LIMIT' });
    process.send?.({ result: { data: new Uint8Array(output), format, width: info.width, height: info.height } });
  } catch (error) {
    process.send?.({ error: { code: ['IMAGE_DEPENDENCY', 'IMAGE_INPUT', 'EXECUTION_LIMIT'].includes(error.code) ? error.code : 'IMAGE_PROCESS',
      message: error.message } });
  }
});
