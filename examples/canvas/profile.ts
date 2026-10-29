import { createCanvas } from 'yuzuha/canvas';
import type { CanvasBuilder, CanvasCreateOptions, CanvasSource } from 'yuzuha/canvas';
import type { CommandContext } from 'yuzuha';

type CanvasCreate = (width: number, height: number, options?: CanvasCreateOptions) => CanvasBuilder;

function composeProfile(create: CanvasCreate, name: string, avatar: CanvasSource): CanvasBuilder {
  return create(1000, 340, { scale: 2, background: '#101722' })
    .rect({ x: 0, y: 0, width: 8, height: 340, fill: '#70d8bc' })
    .avatar(avatar, { x: 44, y: 92, size: 156, border: { color: '#8ce5c9', width: 3 } })
    .text('COMMUNITY MEMBER', { x: 230, y: 38, maxWidth: 600, fontSize: 14, weight: 700, color: '#70d8bc' })
    .text(name, { x: 230, y: 68, maxWidth: 710, fontSize: 52, minFontSize: 34, weight: 700, color: '#f2f4f5' })
    .text('A place to learn, build, and share.', { x: 230, y: 132, maxWidth: 710, fontSize: 22, color: '#aebac6' })
    .badges([
      { text: 'Contributor', selected: true }, { text: 'TypeScript' }, { text: '3 year member' }, { text: 'Community helper' },
    ], { x: 230, y: 178, maxWidth: 710, height: 34, fontSize: 14, fill: '#202b38', selectedFill: '#21584f', color: '#c6d0d9' })
    .line({ x1: 230, y1: 234, x2: 940, y2: 234, width: 1, color: '#31404d' })
    .text('MESSAGES', { x: 230, y: 256, maxWidth: 180, fontSize: 12, weight: 700, color: '#8795a3' })
    .text('1,284', { x: 230, y: 278, maxWidth: 180, fontSize: 24, weight: 700, color: '#f2f4f5' })
    .text('RANK', { x: 470, y: 256, maxWidth: 180, fontSize: 12, weight: 700, color: '#8795a3' })
    .text('#08', { x: 470, y: 278, maxWidth: 180, fontSize: 24, weight: 700, color: '#f2f4f5' })
    .text('REPUTATION', { x: 710, y: 256, maxWidth: 200, fontSize: 12, weight: 700, color: '#8795a3' })
    .text('4,920', { x: 710, y: 278, maxWidth: 200, fontSize: 24, weight: 700, color: '#f2f4f5' });
}

export function buildProfile(name: string, avatar: CanvasSource): CanvasBuilder {
  return composeProfile(createCanvas, name, avatar);
}

export async function sendProfile(ctx: CommandContext, avatar: CanvasSource = 'asset:avatar'): Promise<string> {
  return ctx.canvas.send(composeProfile((width, height, options) => ctx.canvas.create(width, height, options), ctx.authorName, avatar), {
    name: 'profile.png',
  });
}
