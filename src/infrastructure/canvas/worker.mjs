import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const limit = 16_777_216;
const fontDirectory = new URL('../../../assets/canvas/', import.meta.url);
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const roundedPath = (ctx, x, y, width, height, radius) => {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y); ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r); ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
};
const fontString = (weight, size, family) => `${weight} ${size}px "${family.replaceAll('"', '')}"`;
const hash = data => createHash('sha256').update(data).digest('hex');

function fillStyle(ctx, fill) {
  if (typeof fill === 'string') return fill;
  const gradient = fill.type === 'linear'
    ? ctx.createLinearGradient(fill.x0, fill.y0, fill.x1, fill.y1)
    : ctx.createRadialGradient(fill.x0, fill.y0, fill.r0, fill.x1, fill.y1, fill.r1);
  for (const stop of fill.stops) gradient.addColorStop(stop.offset, stop.color);
  return gradient;
}

function paint(ctx, options) {
  ctx.globalAlpha = options.opacity ?? 1;
  if (options.shadow) {
    ctx.shadowColor = options.shadow.color;
    ctx.shadowBlur = options.shadow.blur;
    ctx.shadowOffsetX = options.shadow.offsetX;
    ctx.shadowOffsetY = options.shadow.offsetY;
  }
}

function graphemes(value) {
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].map(item => item.segment);
}

function fitLines(ctx, value, options, initialSize) {
  const family = options.family ?? 'Inter', weight = options.weight ?? 400;
  const maxLines = options.maxLines ?? 1, lineHeight = options.lineHeight ?? 1.2;
  const wrap = options.wrap ?? 'none', overflow = options.overflow ?? 'ellipsis';
  const minSize = options.minFontSize ?? initialSize;
  let size = initialSize, lines;
  const measure = line => ctx.measureText(line).width;
  const fit = candidate => {
    ctx.font = fontString(weight, candidate, family);
    const out = [];
    for (const raw of value.split('\n')) {
      if (wrap === 'word') {
        const words = raw.split(/(\s+)/u).filter(Boolean);
        let line = '';
        for (const word of words) {
          const combined = line + word;
          if (measure(combined) <= options.maxWidth || !line) line = combined;
          else { out.push(line.trimEnd()); line = word.trimStart(); }
          if (measure(line) > options.maxWidth) {
            const parts = graphemes(line); let part = '';
            for (const unit of parts) {
              if (part && measure(part + unit) > options.maxWidth) { out.push(part); part = unit; }
              else part += unit;
            }
            line = part;
          }
        }
        out.push(line.trimEnd());
      } else out.push(raw);
    }
    return out.length <= maxLines && out.every(line => measure(line) <= options.maxWidth);
  };
  while (size > minSize && !fit(size)) size = Math.max(minSize, size - 1);
  lines = (() => { fit(size); return value.split('\n'); })();
  ctx.font = fontString(weight, size, family);
  if (wrap === 'word') {
    lines = [];
    for (const raw of value.split('\n')) {
      const words = raw.split(/(\s+)/u).filter(Boolean); let line = '';
      for (const word of words) {
        const candidate = line + word;
        if (measure(candidate) <= options.maxWidth || !line) line = candidate;
        else { lines.push(line.trimEnd()); line = word.trimStart(); }
        if (measure(line) > options.maxWidth) {
          let part = '';
          for (const unit of graphemes(line)) {
            if (part && measure(part + unit) > options.maxWidth) { lines.push(part); part = unit; }
            else part += unit;
          }
          line = part;
        }
      }
      lines.push(line.trimEnd());
    }
  }
  const overflowed = lines.length > maxLines || lines.some(line => measure(line) > options.maxWidth);
  if (overflowed && overflow === 'error') fail('CANVAS_OPTIONS', 'Texto excede a caixa configurada.');
  if (lines.length > maxLines) lines = lines.slice(0, maxLines);
  if (overflowed && overflow === 'ellipsis') {
    const index = lines.length - 1;
    let units = graphemes(lines[index] ?? '');
    const suffix = '…';
    while (units.length && measure(units.join('') + suffix) > options.maxWidth) units.pop();
    lines[index] = units.join('') + suffix;
  } else if (overflow === 'clip') {
    lines = lines.map(line => {
      const units = graphemes(line); let value = '';
      for (const unit of units) { if (measure(value + unit) > options.maxWidth) break; value += unit; }
      return value;
    });
  }
  return { lines, size, lineHeight };
}

function imageSource(operation) {
  if (operation.type === 'image' || operation.type === 'avatar') return operation.source;
  return null;
}

async function renderScene(scene, canvasModule, renderOptions) {
  const { createCanvas, loadImage, GlobalFonts } = canvasModule;
  GlobalFonts.removeAll();
  for (const [file, family] of [['Inter-Regular.ttf', 'Inter'], ['Inter-Bold.ttf', 'Inter']]) {
    const bytes = await readFile(fileURLToPath(new URL(file, fontDirectory)));
    if (!GlobalFonts.register(bytes, family)) fail('CANVAS_INPUT', `Fonte padrão ${file} inválida.`);
  }
  for (const font of scene.fonts) {
    if (!GlobalFonts.register(Buffer.from(font.source), font.family)) fail('CANVAS_INPUT', `Não foi possível registrar a fonte ${font.family}.`);
  }

  const images = new Map();
  for (const operation of scene.operations) {
    const values = imageSource(operation) ? [imageSource(operation)] : operation.type === 'badges'
      ? operation.items.flatMap(item => item.icon ? [item.icon] : []) : [];
    for (const source of values) {
      const key = hash(source);
      if (!images.has(key)) {
        const image = await loadImage(Buffer.from(source));
        if (!image.width || !image.height || image.width > 8192 || image.height > 8192 || image.width * image.height > limit) {
          fail('CANVAS_INPUT', 'Dimensões da imagem de entrada excedem os limites.');
        }
        images.set(key, image);
      }
    }
  }

  const canvas = createCanvas(scene.width * scene.scale, scene.height * scene.scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scene.scale, scene.scale);
  if (renderOptions.format === 'jpeg') { ctx.fillStyle = renderOptions.matte ?? '#ffffff'; ctx.fillRect(0, 0, scene.width, scene.height); }
  if (scene.background) { ctx.fillStyle = scene.background; ctx.fillRect(0, 0, scene.width, scene.height); }

  const drawImage = (source, options, circle = false) => {
    const image = images.get(hash(source));
    const x = options.x, y = options.y;
    const width = circle ? options.size : options.width, height = circle ? options.size : options.height;
    ctx.save();
    paint(ctx, options);
    if (circle || options.clip === 'circle') {
      ctx.beginPath(); ctx.arc(x + width / 2, y + height / 2, Math.min(width, height) / 2, 0, Math.PI * 2); ctx.clip();
    } else if (options.clip === 'rounded') { roundedPath(ctx, x, y, width, height, options.radius ?? 12); ctx.clip(); }
    const fit = circle ? 'cover' : options.fit ?? 'cover';
    if (fit === 'stretch') ctx.drawImage(image, x, y, width, height);
    else if (fit === 'contain') {
      const ratio = Math.min(width / image.width, height / image.height);
      const drawWidth = image.width * ratio, drawHeight = image.height * ratio;
      ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
    } else {
      const targetRatio = width / height, sourceRatio = image.width / image.height;
      let sourceWidth = image.width, sourceHeight = image.height;
      if (sourceRatio > targetRatio) sourceWidth = image.height * targetRatio;
      else sourceHeight = image.width / targetRatio;
      const cropX = options.cropX ?? 0.5, cropY = options.cropY ?? 0.5;
      const sx = (image.width - sourceWidth) * cropX, sy = (image.height - sourceHeight) * cropY;
      ctx.drawImage(image, sx, sy, sourceWidth, sourceHeight, x, y, width, height);
    }
    if (options.border) {
      ctx.globalAlpha = options.opacity ?? 1; ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.lineWidth = options.border.width;
      ctx.strokeStyle = options.border.color;
      if (circle || options.clip === 'circle') { ctx.beginPath(); ctx.arc(x + width / 2, y + height / 2, Math.max(0, Math.min(width, height) / 2 - options.border.width / 2), 0, Math.PI * 2); ctx.stroke(); }
      else { roundedPath(ctx, x + options.border.width / 2, y + options.border.width / 2, width - options.border.width, height - options.border.width,
        options.clip === 'rounded' ? Math.max(0, (options.radius ?? 12) - options.border.width / 2) : 0); ctx.stroke(); }
    }
    ctx.restore();
  };

  for (const operation of scene.operations) {
    ctx.save();
    const o = operation.options;
    try {
      switch (operation.type) {
        case 'rect': {
          paint(ctx, o);
          if (o.fill !== undefined) { ctx.fillStyle = fillStyle(ctx, o.fill); roundedPath(ctx, o.x, o.y, o.width, o.height, o.radius ?? 0); ctx.fill(); }
          if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.strokeWidth ?? 1; roundedPath(ctx, o.x, o.y, o.width, o.height, o.radius ?? 0); ctx.stroke(); }
          break;
        }
        case 'circle': {
          paint(ctx, o); ctx.beginPath(); ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2);
          if (o.fill !== undefined) { ctx.fillStyle = fillStyle(ctx, o.fill); ctx.fill(); }
          if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.strokeWidth ?? 1; ctx.stroke(); }
          break;
        }
        case 'line': {
          paint(ctx, o); ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2);
          ctx.strokeStyle = o.color ?? '#ffffff'; ctx.lineWidth = o.width ?? 1; ctx.lineCap = o.cap ?? 'butt'; ctx.stroke();
          break;
        }
        case 'image': drawImage(operation.source, o); break;
        case 'avatar': drawImage(operation.source, o, true); break;
        case 'text': {
          paint(ctx, o);
          const layout = fitLines(ctx, operation.value, o, o.fontSize ?? 24);
          ctx.font = fontString(o.weight ?? 400, layout.size, o.family ?? 'Inter');
          ctx.fillStyle = o.color ?? '#ffffff'; ctx.textAlign = o.align ?? 'left'; ctx.textBaseline = 'top';
          const x = o.align === 'center' ? o.x + o.maxWidth / 2 : o.align === 'right' ? o.x + o.maxWidth : o.x;
          layout.lines.forEach((line, index) => ctx.fillText(line, x, o.y + index * layout.size * layout.lineHeight));
          break;
        }
        case 'badges': {
          paint(ctx, o);
          const fontSize = o.fontSize ?? 14, weight = o.weight ?? 700, padding = o.paddingX ?? 12, gap = o.gap ?? 8;
          ctx.font = fontString(weight, fontSize, 'Inter');
          const widths = operation.items.map(item => padding * 2 + (item.icon ? 18 + 6 : 0) + ctx.measureText(item.text).width);
          let shown = operation.items.length;
          const moreWidth = count => {
            ctx.font = fontString(700, fontSize, 'Inter');
            return Math.min(o.maxWidth, padding * 2 + ctx.measureText(`+${count}`).width);
          };
          while (shown > 0) {
            const count = operation.items.length - shown;
            const used = widths.slice(0, shown).reduce((sum, width) => sum + width, 0) + Math.max(0, shown - 1) * gap
              + (count ? gap + moreWidth(count) : 0);
            if (used <= o.maxWidth) break;
            shown--;
          }
          const overflow = operation.items.length - shown;
          const drawBadge = (label, width, selected, icon) => {
            const height = o.height ?? 30, radius = o.radius ?? height / 2;
            ctx.fillStyle = selected ? o.selectedFill ?? '#334155' : o.fill ?? '#202938';
            roundedPath(ctx, o.x + cursor, o.y, width, height, radius); ctx.fill();
            let textX = o.x + cursor + padding;
            if (icon) { ctx.save(); ctx.beginPath(); ctx.arc(textX + 8, o.y + height / 2, 8, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(images.get(hash(icon)), textX, o.y + (height - 16) / 2, 16, 16); ctx.restore(); textX += 22; }
            ctx.font = fontString(weight, fontSize, 'Inter'); ctx.fillStyle = selected ? o.selectedColor ?? '#ffffff' : o.color ?? '#d3d9e4';
            ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(label, textX, o.y + height / 2, Math.max(0, width - (textX - (o.x + cursor)) - padding));
            cursor += width + gap;
          };
          let cursor = 0;
          for (let index = 0; index < shown; index++) drawBadge(operation.items[index].text, widths[index], operation.items[index].selected ?? false, operation.items[index].icon);
          if (overflow) drawBadge(`+${overflow}`, moreWidth(overflow), false);
          break;
        }
        case 'progress': {
          paint(ctx, o);
          const radius = o.radius ?? o.height / 2;
          ctx.fillStyle = fillStyle(ctx, o.background ?? '#202938'); roundedPath(ctx, o.x, o.y, o.width, o.height, radius); ctx.fill();
          const amount = o.width * Math.min(1, Math.max(0, o.value / o.max));
          if (amount > 0) { ctx.fillStyle = fillStyle(ctx, o.fill ?? '#70d8bc'); roundedPath(ctx, o.x, o.y, amount, o.height, Math.min(radius, amount / 2)); ctx.fill(); }
          break;
        }
      }
    } finally { ctx.restore(); }
  }
  return canvas;
}

process.once('message', async ({ scene, renderOptions = {} }) => {
  try {
    let canvasModule;
    try { canvasModule = await import('@napi-rs/canvas'); }
    catch (cause) { fail('CANVAS_DEPENDENCY', 'Instale @napi-rs/canvas@^1.0.13 para renderizar imagens com yuzuha/canvas.'); }
    if (!canvasModule?.createCanvas || !canvasModule?.loadImage || !canvasModule?.GlobalFonts?.register || !canvasModule?.GlobalFonts?.removeAll) {
      fail('CANVAS_DEPENDENCY', 'Instale @napi-rs/canvas@^1.0.13 para renderizar imagens com yuzuha/canvas.');
    }
    const canvas = await renderScene(scene, canvasModule, renderOptions);
    const format = renderOptions.format ?? 'png';
    const quality = renderOptions.quality ?? 85;
    const data = format === 'png' ? await canvas.encode('png') : await canvas.encode(format, quality);
    if (data.byteLength > 10_000_000) fail('EXECUTION_LIMIT', 'Saída codificada excede 10 MB.');
    const result = { data: new Uint8Array(data), format, width: scene.width * scene.scale, height: scene.height * scene.scale };
    process.send?.({ result }, () => process.disconnect());
  } catch (error) {
    process.send?.({ error: { code: error?.code ?? 'CANVAS_PROCESS', message: error?.message ?? 'Falha de renderização.' } }, () => process.disconnect());
  }
});
