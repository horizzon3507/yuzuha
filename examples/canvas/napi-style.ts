import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createCanvas, loadImage, registerFonts } from 'yuzuha/canvas';

const output = new URL('./output/', import.meta.url);
await mkdir(output, { recursive: true });

registerFonts(new URL('../../assets/canvas/', import.meta.url).pathname);

const avatar = await loadImage(new URL('./fixtures/avatar.png', import.meta.url).pathname);
const canvas = createCanvas(640, 240);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#101722';
ctx.fillRect(0, 0, 640, 240);
ctx.drawImage(avatar, 24, 56, 128, 128);
ctx.font = '700 48px Inter';
ctx.fillStyle = '#f2f4f5';
ctx.fillText('Ada Monteiro', 184, 110);
ctx.font = '24px Inter';
ctx.fillStyle = '#aebac6';
ctx.fillText('Desenho direto com a API napi.', 184, 152);

const png = new Uint8Array(await canvas.encode('png'));
await writeFile(new URL('napi-style.png', output), png);
console.log(`PNG gravado em ${new URL('napi-style.png', output).pathname}`);
