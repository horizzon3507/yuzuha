import { GuardError } from '../../shared/errors.js';
import { defineFunctions } from './definition.js';
import { isIndex, parsePath } from './language/objects.js';

function readPath(value: unknown, segments: readonly string[]): { found: boolean; value: unknown } {
  let current = value;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = isIndex(segment) ? Number(segment) : -1;
      if (!Number.isSafeInteger(index) || index < 0 || index >= current.length) return { found: false, value: undefined };
      current = current[index];
    } else if (current !== null && typeof current === 'object' && Object.hasOwn(current, segment)) {
      current = (current as Record<string, unknown>)[segment];
    } else return { found: false, value: undefined };
  }
  return { found: true, value: current };
}

export const eventFunctions = defineFunctions(fn => {
  for (const [name, key] of [['eventName', 'name'], ['eventUserID', 'userID'], ['eventGuildID', 'guildID'],
    ['eventChannelID', 'channelID'], ['eventMessageID', 'messageID'], ['eventContent', 'content'],
    ['eventOldContent', 'oldContent'], ['eventEmoji', 'emoji']] as const) {
    fn(name, 'events', 0, 0, '', 'Consulta o campo do evento; requer contexto de evento e preserva ausências como null.', c => {
      if (!c.ctx.event) throw new GuardError('Esta função exige um contexto de evento.');
      return c.ctx.event[key];
    });
  }
  fn('eventData', 'events', 0, 2, '[caminho?;padrão?]',
    'Lê o payload normalizado e redigido do evento por caminho com pontos e índices, ex. "old.name"; sem caminho retorna o objeto inteiro e ausências retornam o padrão ou null.', async c => {
      const event = c.ctx.event;
      if (!event) throw new GuardError('Esta função exige um contexto de evento.');
      const result = readPath(event.data ?? {}, parsePath(c.count > 0 ? await c.text(0) : ''));
      if (!result.found) return c.count > 1 ? await c.arg(1) : null;
      return result.value !== null && typeof result.value === 'object' ? structuredClone(result.value) : result.value;
    });
});
