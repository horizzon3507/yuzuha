import { createCard } from 'yuzuha/canvas/card';
import type { CanvasBuilder, CanvasCreateOptions, CanvasSource } from 'yuzuha/canvas/card';
import type { EventContext } from 'yuzuha';

type CanvasCreate = (width: number, height: number, options?: CanvasCreateOptions) => CanvasBuilder;

function composeWelcome(create: CanvasCreate, name: string, avatar: CanvasSource): CanvasBuilder {
  return create(980, 300, { background: '#111923' })
    .rect({ x: 0, y: 0, width: 12, height: 300, fill: '#d8a36b' })
    .avatar(avatar, { x: 42, y: 74, size: 152, border: { color: '#f0c38c', width: 3 } })
    .text('A NEW VOICE IN THE ROOM', { x: 232, y: 42, maxWidth: 700, fontSize: 13, weight: 700, color: '#e9b87e' })
    .text(name, { x: 232, y: 72, maxWidth: 700, fontSize: 42, minFontSize: 28, weight: 700, color: '#f4f2ed' })
    .text('Bem-vindo à comunidade.\nSua próxima conversa começa aqui.', {
      x: 232, y: 136, maxWidth: 650, fontSize: 22, color: '#c1c8cd', wrap: 'word', maxLines: 2,
    })
    .line({ x1: 232, y1: 230, x2: 920, y2: 230, color: '#34414b' })
    .text('Os dados deste cartão são demonstrativos.', { x: 232, y: 250, maxWidth: 650, fontSize: 13, color: '#8997a1' });
}

export function buildWelcome(name: string, avatar: CanvasSource): CanvasBuilder {
  return composeWelcome(createCard, name, avatar);
}

export async function welcomeEvent(ctx: EventContext, avatar: CanvasSource = 'asset:avatar'): Promise<string> {
  const card = composeWelcome((width, height, options) => ctx.canvas.create(width, height, options), ctx.authorName || 'Uma pessoa nova', avatar);
  return ctx.canvas.send(card, { name: 'welcome.png' });
}
